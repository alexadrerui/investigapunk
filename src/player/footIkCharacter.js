import * as THREE from "three";
import { FootIK } from "three-player-controller/foot-ik";
import { ASSETS } from "../assets.js";
import { CAMERA, PLAYER } from "../config.js";
import { computeObjectBoundsTrees } from "../core/bvh.js";
import { enableShadows, getGltfLoader } from "../core/gltf.js";
import { replaceMeshMaterials, toStandardNode } from "../materials/toNodeMaterial.js";

const SKELETON = {
  hips: "pelvis",
  legs: {
    left: { upper: "thigh_l", lower: "calf_l", foot: "foot_l", toe: "ball_l" },
    right: { upper: "thigh_r", lower: "calf_r", foot: "foot_r", toe: "ball_r" },
  },
};

const FADE = 0.22;
const UP = new THREE.Vector3(0, 1, 0);
const HEAD_SWAY_IDLE_WEIGHT = 0.08;
const HEAD_SWAY_MOVE_WEIGHT = 0.35;
const HEAD_SWAY_SMOOTH_SPEED = 5;

function findClip(clips, name) {
  if (!name) return null;
  const exact = clips.find((clip) => clip.name === name);
  if (exact) return exact;
  const lower = name.toLowerCase();
  return (
    clips.find((clip) => clip.name.toLowerCase() === lower)
    ?? clips.find((clip) => clip.name.toLowerCase().includes(lower))
    ?? null
  );
}

function collectMeshes(roots, skip) {
  const meshes = [];
  for (const root of roots) {
    if (!root) continue;
    root.traverse((object) => {
      if (!object.isMesh || !object.geometry) return;
      if (skip.has(object)) return;
      if (object.name === "capsule") return;
      if (/reflector|helper/i.test(object.name ?? "")) return;
      meshes.push(object);
    });
  }
  return meshes;
}

function createAction(mixer, clip) {
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopRepeat, Infinity);
  action.enabled = true;
  action.setEffectiveWeight(0);
  action.play();
  return action;
}

function playAction(next, current, fade = FADE) {
  if (!next || next === current) return current ?? next ?? null;
  next.reset();
  next.setEffectiveWeight(1);
  if (current) current.crossFadeTo(next, fade, false);
  else next.fadeIn(fade);
  next.play();
  return next;
}

export async function createFootIkCharacter({
  scene,
  renderer,
  camera,
  rig,
  colliders = [],
} = {}) {
  for (const root of colliders) {
    if (root) computeObjectBoundsTrees(root);
  }

  const gltf = await getGltfLoader(renderer).loadAsync(ASSETS.character);
  const playerModel = gltf.scene;
  playerModel.name = "Player";
  enableShadows(playerModel);
  replaceMeshMaterials(playerModel, toStandardNode);
  playerModel.traverse((child) => {
    if (child.isMesh) child.frustumCulled = false;
  });

  const clips = gltf.animations ?? [];
  const mixer = new THREE.AnimationMixer(playerModel);
  const idleClip = findClip(clips, PLAYER.idleAnim) ?? clips[0];
  const walkClip = findClip(clips, PLAYER.walkAnim) ?? idleClip;
  const runClip = findClip(clips, PLAYER.runAnim) ?? walkClip;
  const actions = {
    idle: idleClip ? createAction(mixer, idleClip) : null,
    walk: walkClip ? createAction(mixer, walkClip) : null,
    run: runClip ? createAction(mixer, runClip) : null,
  };
  if (actions.idle) actions.idle.setEffectiveWeight(1);

  const headBone = playerModel.getObjectByName(PLAYER.headBoneName)
    ?? playerModel.getObjectByName("head");
  const firstPersonHideBones = [headBone].filter(Boolean);
  const eyeAnchor = new THREE.Object3D();
  eyeAnchor.name = "fp-eye";
  eyeAnchor.position.fromArray(PLAYER.firstPersonCameraOffset);
  headBone?.add(eyeAnchor);
  // Pose de referência (antes de qualquer clipe rodar) para extrair só o desvio
  // que a animação aplica sobre a cabeça e usá-lo como balanço da câmera.
  const headRestQuat = headBone?.quaternion.clone() ?? new THREE.Quaternion();

  mixer.update(0);
  playerModel.updateMatrixWorld(true);

  const size = new THREE.Box3().setFromObject(playerModel).getSize(new THREE.Vector3());
  const fit = size.y > 1e-5 ? PLAYER.capsuleHeight / size.y : 1;
  const scale = PLAYER.scale;
  playerModel.scale.multiplyScalar(fit * scale);

  const radius = PLAYER.capsuleRadius * scale;
  const height = PLAYER.capsuleHeight * scale;
  const rideHeight = PLAYER.rideHeight * scale;
  const colliderHeight = height - rideHeight;
  const segmentLength = Math.max(colliderHeight - 2 * radius, 1e-6);

  const playerCapsule = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, segmentLength, 4, 8),
    new THREE.MeshBasicMaterial({
      color: 0xc45cff,
      wireframe: true,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
    }),
  );
  playerCapsule.geometry.translate(0, -segmentLength / 2, 0);
  playerCapsule.capsuleInfo = {
    radius,
    segment: new THREE.Line3(new THREE.Vector3(), new THREE.Vector3(0, -segmentLength, 0)),
  };
  playerCapsule.name = "capsule";
  playerCapsule.material.visible = false;
  playerCapsule.castShadow = false;
  playerCapsule.receiveShadow = false;

  const modelBaseY = -segmentLength - radius - rideHeight;
  playerModel.position.set(0, modelBaseY, 0);
  playerCapsule.add(playerModel);
  scene.add(playerCapsule);

  const skip = new Set();
  playerCapsule.traverse((object) => {
    if (object.isMesh) skip.add(object);
  });

  const velocity = new THREE.Vector3();
  const eyeWorld = new THREE.Vector3();
  const aimQuat = new THREE.Quaternion();
  const headSwayQuat = new THREE.Quaternion();
  const targetSwayQuat = new THREE.Quaternion();
  const smoothedSwayQuat = new THREE.Quaternion();
  const groundSupport = {
    point: new THREE.Vector3(),
    normal: UP.clone(),
  };
  const playerModelConfig = {
    scale,
    walkAnim: walkClip?.name ?? PLAYER.walkAnim,
    runAnim: runClip?.name ?? PLAYER.runAnim,
  };
  const animation = {
    clips,
    state: actions.idle,
  };

  let visible = false;
  let firstPersonBody = false;
  let hideHead = false;
  let currentAction = actions.idle;
  const lastFeet = new THREE.Vector3(camera.position.x, camera.position.y - CAMERA.walkEyeHeight, camera.position.z);

  const player = {
    scene,
    playerCapsule,
    playerModel,
    playerIsOnGround: true,
    isFlying: false,
    playerModelConfig,
    animation,
    getColliderMeshes() {
      return collectMeshes(colliders, skip);
    },
    getVelocity() {
      return velocity;
    },
    getGroundSupport() {
      return groundSupport;
    },
    getControllerMode() {
      return 0;
    },
  };

  const footIK = new FootIK({
    skeleton: SKELETON,
    soleHalfWidth: PLAYER.soleHalfWidth,
    soleToeExtend: PLAYER.soleToeExtend,
    soleSkinThickness: PLAYER.soleSkinThickness,
    plantedHeightSpeed: PLAYER.plantedHeightSpeed,
    penetrationLiftSpeed: PLAYER.penetrationLiftSpeed,
    predictivePlacement: true,
    straightPoleEnabled: true,
  });
  footIK.onAttach(player);

  function setModelVisible(show) {
    playerModel.visible = show;
    playerModel.traverse((child) => {
      if (child.isMesh) child.visible = show;
    });
  }

  function syncLocomotion(speed) {
    let next = actions.idle;
    if (speed >= PLAYER.runSpeedThreshold) next = actions.run ?? actions.walk ?? actions.idle;
    else if (speed >= PLAYER.walkSpeedThreshold) next = actions.walk ?? actions.idle;
    if (next === actions.walk && actions.walk) {
      actions.walk.timeScale = THREE.MathUtils.clamp(speed / Math.max(CAMERA.moveSpeed, 0.01), 0.75, 1.45);
    }
    if (next === actions.run && actions.run) {
      const sprint = CAMERA.moveSpeed * CAMERA.sprintMultiplier;
      actions.run.timeScale = THREE.MathUtils.clamp(speed / Math.max(sprint, 0.01), 0.8, 1.25);
    }
    currentAction = playAction(next, currentAction);
    animation.state = currentAction;
  }

  function syncTransform() {
    const walking = !!rig?.isWalking?.();
    const look = rig?.getLookEuler?.();
    const yaw = look?.y ?? playerCapsule.rotation.y - PLAYER.rotateY;
    const sourceVelocity = rig?.getVelocity?.();
    if (sourceVelocity) velocity.copy(sourceVelocity);
    else velocity.set(0, 0, 0);
    velocity.y = 0;

    if (walking && rig.getFeetPosition) {
      rig.getFeetPosition(lastFeet);
    }

    playerCapsule.rotation.y = yaw + PLAYER.rotateY;
    playerCapsule.position.set(
      lastFeet.x,
      lastFeet.y + height - radius,
      lastFeet.z,
    );

    groundSupport.point.set(playerCapsule.position.x, lastFeet.y, playerCapsule.position.z);
    groundSupport.normal.copy(UP);
    player.playerIsOnGround = true;

    setModelVisible(visible);
    hideHead = walking && visible && !firstPersonBody && !rig?.isThirdPerson?.();
  }

  function attachCameraToEyes(delta) {
    if (!headBone || !eyeAnchor.parent || !rig?.isWalking?.() || rig?.isThirdPerson?.()) return;
    headBone.updateWorldMatrix(true, true);
    eyeAnchor.updateWorldMatrix(true, false);
    eyeAnchor.getWorldPosition(eyeWorld);
    camera.position.copy(eyeWorld);

    const look = rig?.getLookEuler?.();
    if (look) {
      // Mira continua 100% do mouse; o osso da cabeça só contribui com um
      // balanço leve e suavizado por cima, sem nunca dominar o olhar manual.
      aimQuat.setFromEuler(look);
      headSwayQuat.copy(headRestQuat).invert().multiply(headBone.quaternion);
      const speed = velocity.length();
      const weight = THREE.MathUtils.clamp(
        THREE.MathUtils.mapLinear(speed, 0, PLAYER.runSpeedThreshold, HEAD_SWAY_IDLE_WEIGHT, HEAD_SWAY_MOVE_WEIGHT),
        HEAD_SWAY_IDLE_WEIGHT,
        HEAD_SWAY_MOVE_WEIGHT,
      );
      targetSwayQuat.identity().slerp(headSwayQuat, weight);
      smoothedSwayQuat.slerp(targetSwayQuat, 1 - Math.exp(-HEAD_SWAY_SMOOTH_SPEED * (delta ?? 0)));
      camera.quaternion.copy(aimQuat).multiply(smoothedSwayQuat);
    }
  }

  function applyFirstPersonHeadHide() {
    for (const bone of firstPersonHideBones) {
      bone.scale.setScalar(hideHead ? 0.001 : 1);
    }
  }

  setModelVisible(false);

  return {
    playerCapsule,
    playerModel,
    footIK,
    group: playerCapsule,
    setVisible(value) {
      visible = !!value;
      if (!visible) setModelVisible(false);
    },
    setFirstPersonBody(value) {
      firstPersonBody = !!value;
    },
    isFirstPersonBody: () => firstPersonBody,
    setCapsuleDebug(value) {
      playerCapsule.material.visible = !!value;
    },
    update(delta) {
      if (!visible) {
        setModelVisible(false);
        return;
      }
      syncTransform();
      syncLocomotion(velocity.length());
      footIK.onBeforeAnimationUpdate(delta);
      mixer.update(delta);
      playerCapsule.updateMatrixWorld(true);
      playerModel.updateMatrixWorld(true);
      footIK.onAfterAnimationUpdate(delta);
      for (const bone of firstPersonHideBones) bone.scale.setScalar(1);
      playerModel.updateMatrixWorld(true);
      attachCameraToEyes(delta);
      applyFirstPersonHeadHide();
    },
    dispose() {
      footIK.dispose();
      mixer.stopAllAction();
      scene.remove(playerCapsule);
    },
  };
}
