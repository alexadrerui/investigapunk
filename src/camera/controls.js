import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CAMERA, getFov, isCoarsePointer } from "../config.js";

const MOVE_EPS = 0.01;
const FOV_MOVE_EPS = 0.5;
const JOYSTICK_DEADZONE = 0.12;
const KEY_MAP = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "backward",
  ArrowDown: "backward",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

function expLerp(delta, speed) {
  return 1 - Math.exp(-delta * speed);
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function blocksLook(target) {
  return target instanceof Element && !!target.closest("[data-ui-block-look]");
}

export function createCameraRig(camera, renderer, { colliders = [], ground = null, model = null } = {}) {
  const settings = {
    moveSpeed: CAMERA.moveSpeed,
    sprintMultiplier: CAMERA.sprintMultiplier,
    mouseSensitivity: CAMERA.mouseSensitivity,
    eyeHeight: CAMERA.walkEyeHeight,
    crouchMultiplier: CAMERA.crouchMultiplier,
    acceleration: CAMERA.walkAcceleration,
    deceleration: CAMERA.walkDeceleration,
    sprintRampUp: CAMERA.sprintRampUp,
    sprintRampDown: CAMERA.sprintRampDown,
    walkFovBoost: CAMERA.walkFovBoost,
    sprintFovBoost: CAMERA.sprintFovBoost,
    walkFovBlendSpeed: CAMERA.walkFovBlendSpeed,
    sprintFovBlendSpeed: CAMERA.sprintFovBlendSpeed,
    playerRadius: CAMERA.playerRadius,
    maxStepUp: CAMERA.maxStepUp,
    maxStepDown: CAMERA.maxStepDown,
    groundProbeHeight: CAMERA.groundProbeHeight,
    groundProbeDistance: CAMERA.groundProbeDistance,
    wallProbeDistance: CAMERA.wallProbeDistance,
    thirdPersonDistance: CAMERA.thirdPersonDistance,
    thirdPersonHeight: CAMERA.thirdPersonHeight,
    thirdPersonMinDistance: CAMERA.thirdPersonMinDistance,
    thirdPersonCollisionMargin: CAMERA.thirdPersonCollisionMargin,
  };

  const wallColliders = colliders.filter(Boolean);
  const groundTargets = [];
  if (model) groundTargets.push(model);
  if (ground) groundTargets.push(ground);

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(...CAMERA.target);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.06;
  orbit.minPolarAngle = 0.12;
  orbit.maxPolarAngle = Math.PI * 0.85;
  orbit.minDistance = 0.6;
  orbit.maxDistance = 80;
  camera.position.set(...CAMERA.position);
  orbit.update();
  const walkPos = new THREE.Vector3().copy(camera.position);

  function restoreWalkCamera() {
    camera.position.copy(walkPos);
  }

  function commitWalkCamera() {
    walkPos.copy(camera.position);
  }

  let transformPicking = false;
  let orbitOnly = false;
  const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  };
  const lookEuler = new THREE.Euler(0, 0, 0, "YXZ");
  const wish = new THREE.Vector2();
  const wishDir = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const nextPos = new THREE.Vector3();
  const slidePos = new THREE.Vector3();
  const probeOrigin = new THREE.Vector3();
  const probeDir = new THREE.Vector3();
  const lateral = new THREE.Vector3();
  const moveDelta = new THREE.Vector3();
  const moveAxes = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const thirdPersonForward = new THREE.Vector3();
  const thirdPersonDesired = new THREE.Vector3();
  const sideOffsets = [0, -0.85, 0.85];
  const lookPointers = new Map();
  const listeners = new Set();

  let walking = false;
  let thirdPerson = false;
  let pointerLocked = false;
  let crouched = false;
  let inputLocked = false;
  let hasTouchLooked = false;
  let moving = false;
  let standingEye = settings.eyeHeight;
  let currentSpeed = settings.moveSpeed;
  let baseFov = getFov();

  function syncLookFromCamera() {
    lookEuler.setFromQuaternion(camera.quaternion, "YXZ");
  }

  function applyLook() {
    camera.quaternion.setFromEuler(lookEuler);
  }

  function applyBaseFov() {
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  }

  function probeGround(x, z, cameraY) {
    if (groundTargets.length === 0) return [];
    probeOrigin.set(x, cameraY + settings.groundProbeHeight, z);
    probeDir.set(0, -1, 0);
    raycaster.set(probeOrigin, probeDir);
    raycaster.far = settings.groundProbeDistance;
    raycaster.firstHitOnly = false;
    return raycaster.intersectObjects(groundTargets, true);
  }

  function pickGroundY(hits, feetY, { allowLongDrop = false } = {}) {
    if (hits.length === 0) return feetY;
    const maxUp = settings.maxStepUp;
    const maxDown = allowLongDrop ? settings.groundProbeDistance : settings.maxStepDown;
    let best = null;
    let bestDist = Infinity;
    for (const hit of hits) {
      const y = hit.point.y;
      if (y > feetY + maxUp || y < feetY - maxDown) continue;
      const dist = Math.abs(y - feetY);
      if (dist < bestDist) {
        bestDist = dist;
        best = y;
      }
    }
    if (best !== null) return best;
    if (allowLongDrop) {
      let highest = null;
      for (const hit of hits) {
        const y = hit.point.y;
        if (y > feetY + maxUp) continue;
        if (highest === null || y > highest) highest = y;
      }
      if (highest !== null) return highest;
    }
    return feetY;
  }

  function groundYAt(x, z, cameraY, options) {
    const feetY = cameraY - settings.eyeHeight;
    return pickGroundY(probeGround(x, z, cameraY), feetY, options);
  }

  function snapToGround({ allowLongDrop = false } = {}) {
    const feetY = groundYAt(camera.position.x, camera.position.z, camera.position.y, {
      allowLongDrop,
    });
    camera.position.y = feetY + settings.eyeHeight;
  }

  function applyThirdPersonCamera() {
    thirdPersonForward.set(0, 0, -1).applyEuler(lookEuler);
    thirdPersonDesired.copy(walkPos)
      .addScaledVector(thirdPersonForward, -settings.thirdPersonDistance);
    thirdPersonDesired.y += settings.thirdPersonHeight;

    if (wallColliders.length > 0) {
      probeDir.subVectors(thirdPersonDesired, walkPos);
      const dist = probeDir.length();
      if (dist > 1e-5) {
        probeDir.multiplyScalar(1 / dist);
        raycaster.set(walkPos, probeDir);
        raycaster.far = dist;
        raycaster.firstHitOnly = true;
        const hits = raycaster.intersectObjects(wallColliders, true);
        if (hits.length > 0) {
          const safeDist = Math.max(
            hits[0].distance - settings.thirdPersonCollisionMargin,
            settings.thirdPersonMinDistance,
          );
          thirdPersonDesired.copy(walkPos).addScaledVector(probeDir, safeDist);
        }
      }
    }
    camera.position.copy(thirdPersonDesired);
  }

  function hitsWall(from, direction, travel) {
    const radius = settings.playerRadius;
    const blockDist = travel + radius;
    const far = blockDist + settings.wallProbeDistance;
    const chestY = from.y - settings.eyeHeight * 0.35;
    lateral.set(-direction.z, 0, direction.x);
    if (lateral.lengthSq() < 1e-8) lateral.set(1, 0, 0);
    else lateral.normalize();
    raycaster.firstHitOnly = true;
    for (let i = 0; i < sideOffsets.length; i += 1) {
      probeOrigin.copy(from);
      probeOrigin.y = chestY;
      probeOrigin.addScaledVector(lateral, sideOffsets[i] * radius);
      raycaster.set(probeOrigin, direction);
      raycaster.far = far;
      const hits = raycaster.intersectObjects(wallColliders, true);
      if (hits.length > 0 && hits[0].distance < blockDist) return true;
    }
    return false;
  }

  function canMove(from, to) {
    if (wallColliders.length === 0) return true;
    moveDelta.subVectors(to, from);
    const travel = moveDelta.length();
    if (travel < 1e-5) return true;
    moveDelta.multiplyScalar(1 / travel);
    if (hitsWall(from, moveDelta, travel)) return false;
    const currentFeet = from.y - settings.eyeHeight;
    const nextFeet = groundYAt(to.x, to.z, from.y);
    return nextFeet <= currentFeet + settings.maxStepUp;
  }

  function moveWithCollision(delta) {
    if (velocity.lengthSq() <= MOVE_EPS * MOVE_EPS) return;
    nextPos.copy(camera.position).addScaledVector(velocity, delta);
    if (canMove(camera.position, nextPos)) {
      camera.position.x = nextPos.x;
      camera.position.z = nextPos.z;
      return;
    }
    slidePos.copy(camera.position);
    if (Math.abs(velocity.x) > MOVE_EPS) {
      nextPos.copy(camera.position);
      nextPos.x += velocity.x * delta;
      if (canMove(camera.position, nextPos)) {
        camera.position.x = nextPos.x;
        slidePos.x = camera.position.x;
      } else {
        velocity.x = 0;
      }
    }
    if (Math.abs(velocity.z) > MOVE_EPS) {
      nextPos.copy(slidePos);
      nextPos.z += velocity.z * delta;
      if (canMove(slidePos, nextPos)) camera.position.z = nextPos.z;
      else velocity.z = 0;
    }
  }

  function updateFov(delta) {
    const moving = velocity.length() > FOV_MOVE_EPS;
    const walkSpeed = settings.moveSpeed;
    const sprintSpeed = settings.moveSpeed * settings.sprintMultiplier;
    const sprintT = THREE.MathUtils.clamp(
      (currentSpeed - walkSpeed) / Math.max(sprintSpeed - walkSpeed, 1e-6),
      0,
      1,
    );
    let target = baseFov;
    let blend = settings.walkFovBlendSpeed;
    if (moving) {
      target = baseFov + THREE.MathUtils.lerp(settings.walkFovBoost, settings.sprintFovBoost, sprintT);
      blend = THREE.MathUtils.lerp(settings.walkFovBlendSpeed, settings.sprintFovBlendSpeed, sprintT);
    }
    const next = camera.fov + (target - camera.fov) * expLerp(delta, blend);
    if (Math.abs(next - camera.fov) > 0.001) {
      camera.fov = next;
      camera.updateProjectionMatrix();
    }
  }

  function applyEyeHeight(nextEye) {
    const delta = nextEye - settings.eyeHeight;
    settings.eyeHeight = nextEye;
    if (walking && Math.abs(delta) > 1e-6) {
      camera.position.y += delta;
      walkPos.y += delta;
    }
  }

  function setCrouched(value) {
    const next = !!value;
    if (crouched === next) return;
    crouched = next;
    applyEyeHeight(crouched ? standingEye * settings.crouchMultiplier : standingEye);
  }

  function setThirdPerson(value) {
    thirdPerson = !!value;
    if (!thirdPerson) restoreWalkCamera();
    notify();
  }

  function getWalkState() {
    return {
      walking,
      pointerLocked,
      moving,
      hasTouchLooked,
      thirdPerson,
    };
  }

  function notify() {
    const state = getWalkState();
    for (const listener of listeners) listener(state);
  }

  function canSteer() {
    if (!walking) return false;
    if (isCoarsePointer()) {
      return hasTouchLooked || moveAxes.lengthSq() > JOYSTICK_DEADZONE * JOYSTICK_DEADZONE || moving;
    }
    return pointerLocked;
  }

  function collectWish() {
    wish.set(0, 0);
    if (moveAxes.lengthSq() > JOYSTICK_DEADZONE * JOYSTICK_DEADZONE) {
      wish.copy(moveAxes);
      if (wish.lengthSq() > 1) wish.normalize();
      return;
    }
    if (keys.forward) wish.y -= 1;
    if (keys.backward) wish.y += 1;
    if (keys.left) wish.x -= 1;
    if (keys.right) wish.x += 1;
    if (wish.lengthSq() > 0) wish.normalize();
  }

  function look(dx, dy) {
    if (!walking) return;
    lookEuler.y -= dx * settings.mouseSensitivity;
    lookEuler.x -= dy * settings.mouseSensitivity;
    lookEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, lookEuler.x));
    applyLook();
  }

  function enterWalk() {
    if (walking || inputLocked || orbitOnly) return;
    walking = true;
    orbit.enabled = false;
    syncLookFromCamera();
    velocity.set(0, 0, 0);
    currentSpeed = settings.moveSpeed;
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
    snapToGround({ allowLongDrop: true });
    commitWalkCamera();
    if (!isCoarsePointer()) renderer.domElement.requestPointerLock?.();
    notify();
  }

  function exitWalk() {
    if (!walking) return;
    walking = false;
    thirdPerson = false;
    crouched = false;
    settings.eyeHeight = standingEye;
    for (const key of Object.keys(keys)) keys[key] = false;
    velocity.set(0, 0, 0);
    currentSpeed = settings.moveSpeed;
    moveAxes.set(0, 0);
    lookPointers.clear();
    hasTouchLooked = false;
    moving = false;
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
    restoreWalkCamera();
    camera.getWorldDirection(forward);
    orbit.target.copy(camera.position).addScaledVector(forward, CAMERA.orbitResumeDistance);
    orbit.enabled = true;
    orbit.update();
    applyBaseFov();
    notify();
  }

  function onKeyDown(event) {
    if (inputLocked || isTypingTarget(event.target)) return;
    if (event.key === "Shift" || event.code === "ShiftLeft" || event.code === "ShiftRight") {
      keys.sprint = true;
      return;
    }
    if (event.code === "Escape" && walking) {
      if (document.body.classList.contains("panel-open")) return;
      exitWalk();
      return;
    }
    if (event.code === "KeyC" && walking && !event.repeat) {
      setCrouched(!crouched);
      event.preventDefault();
      return;
    }
    if (event.code === "KeyV" && walking && !event.repeat) {
      setThirdPerson(!thirdPerson);
      event.preventDefault();
      return;
    }
    if (transformPicking && (event.key === "g" || event.key === "r" || event.key === "s")) return;
    const mapped = KEY_MAP[event.code];
    if (mapped) {
      keys[mapped] = true;
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    if (event.key === "Shift" || event.code === "ShiftLeft" || event.code === "ShiftRight") {
      keys.sprint = false;
      return;
    }
    const mapped = KEY_MAP[event.code];
    if (mapped) keys[mapped] = false;
  }

  function onMouseMove(event) {
    if (!walking || !pointerLocked || isCoarsePointer()) return;
    look(event.movementX, event.movementY);
  }

  function onPointerLockChange() {
    pointerLocked = document.pointerLockElement === renderer.domElement;
    notify();
  }

  function onCanvasClick(event) {
    if (inputLocked || transformPicking) return;
    if (event.target !== renderer.domElement) return;
    if (!walking) enterWalk();
    else if (!pointerLocked && !isCoarsePointer()) renderer.domElement.requestPointerLock?.();
  }

  function onLookPointerDown(event) {
    if (inputLocked || !walking || !isCoarsePointer()) return;
    if (event.pointerType === "mouse") return;
    if (event.target !== renderer.domElement || blocksLook(event.target)) return;
    lookPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    renderer.domElement.setPointerCapture?.(event.pointerId);
  }

  function onLookPointerMove(event) {
    if (inputLocked || !walking || !isCoarsePointer()) return;
    const prev = lookPointers.get(event.pointerId);
    if (!prev) return;
    const dx = event.clientX - prev.x;
    const dy = event.clientY - prev.y;
    prev.x = event.clientX;
    prev.y = event.clientY;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;
    look(dx, dy);
    if (!hasTouchLooked) {
      hasTouchLooked = true;
      notify();
    }
  }

  function onLookPointerUp(event) {
    lookPointers.delete(event.pointerId);
    if (renderer.domElement.hasPointerCapture?.(event.pointerId)) {
      renderer.domElement.releasePointerCapture?.(event.pointerId);
    }
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouseMove);
  document.addEventListener("pointerlockchange", onPointerLockChange);
  renderer.domElement.addEventListener("click", onCanvasClick);
  renderer.domElement.addEventListener("pointerdown", onLookPointerDown);
  renderer.domElement.addEventListener("pointermove", onLookPointerMove);
  renderer.domElement.addEventListener("pointerup", onLookPointerUp);
  renderer.domElement.addEventListener("pointercancel", onLookPointerUp);

  return {
    orbit,
    isWalking: () => walking,
    isActive: () => walking,
    isMoving: () => moving,
    isPointerLocked: () => pointerLocked,
    getWalkState,
    subscribe(listener) {
      listeners.add(listener);
      listener(getWalkState());
      return () => listeners.delete(listener);
    },
    setMoveAxes(x, y) {
      moveAxes.set(x, y);
    },
    setInputLocked(locked) {
      inputLocked = !!locked;
      if (inputLocked) {
        orbit.enabled = false;
        for (const key of Object.keys(keys)) keys[key] = false;
        velocity.set(0, 0, 0);
        moveAxes.set(0, 0);
      } else if (!walking) {
        orbit.enabled = true;
      }
    },
    setTransformPicking(value) {
      transformPicking = !!value;
      if (transformPicking && walking) exitWalk();
    },
    setOrbitOnly(value) {
      orbitOnly = !!value;
      if (orbitOnly) {
        if (walking) exitWalk();
        else if (!inputLocked) orbit.enabled = true;
      }
    },
    isOrbitOnly: () => orbitOnly,
    isThirdPerson: () => thirdPerson,
    setThirdPerson,
    toggleThirdPerson: () => setThirdPerson(!thirdPerson),
    enterWalk,
    exitWalk,
    snapToGround,
    getHorizontalSpeed: () => velocity.length(),
    getVelocity: () => velocity,
    getLookEuler: () => lookEuler,
    getEyeHeight: () => settings.eyeHeight,
    getFeetPosition(target = new THREE.Vector3()) {
      return target.set(
        walkPos.x,
        walkPos.y - settings.eyeHeight,
        walkPos.z,
      );
    },
    setColliders(nextColliders, nextGround, nextModel = model) {
      wallColliders.length = 0;
      groundTargets.length = 0;
      for (const object of nextColliders ?? []) {
        if (!object) continue;
        wallColliders.push(object);
      }
      if (nextModel) groundTargets.push(nextModel);
      if (nextGround) groundTargets.push(nextGround);
    },
    update(delta) {
      if (inputLocked) return;
      if (!walking) {
        orbit.update();
        return;
      }

      restoreWalkCamera();
      if (!canSteer()) {
        velocity.set(0, 0, 0);
        currentSpeed = settings.moveSpeed;
        commitWalkCamera();
        if (moving) {
          moving = false;
          notify();
        }
        if (thirdPerson) applyThirdPersonCamera();
        return;
      }

      collectWish();
      const steering = wish.lengthSq() > 0;
      if (steering) {
        camera.getWorldDirection(forward);
        forward.y = 0;
        if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
        else forward.normalize();
        right.crossVectors(forward, camera.up).normalize();
        wishDir.set(0, 0, 0);
        wishDir.addScaledVector(forward, -wish.y);
        wishDir.addScaledVector(right, wish.x);
        if (wishDir.lengthSq() > 0) wishDir.normalize();
      }

      const targetSpeed = steering && keys.sprint
        ? settings.moveSpeed * settings.sprintMultiplier
        : settings.moveSpeed;
      const ramp = targetSpeed > currentSpeed ? settings.sprintRampUp : settings.sprintRampDown;
      currentSpeed += (targetSpeed - currentSpeed) * expLerp(delta, ramp);
      if (steering) desired.copy(wishDir).multiplyScalar(currentSpeed);
      else desired.set(0, 0, 0);
      velocity.lerp(desired, expLerp(delta, steering ? settings.acceleration : settings.deceleration));
      moveWithCollision(delta);
      snapToGround();
      commitWalkCamera();
      updateFov(delta);
      if (thirdPerson) applyThirdPersonCamera();
      const nowMoving = velocity.lengthSq() > MOVE_EPS * MOVE_EPS;
      if (nowMoving !== moving) {
        moving = nowMoving;
        notify();
      }
    },
    onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      baseFov = getFov();
      if (!walking) applyBaseFov();
      else camera.updateProjectionMatrix();
    },
  };
}
