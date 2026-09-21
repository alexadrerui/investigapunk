import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";

const SKIP = new Set(["Sky", "CollisionRain", "city-bounds-collider", "StreetLights", "ReflectiveGround"]);

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function isHelper(object, helper) {
  let current = object;
  while (current) {
    if (current === helper) return true;
    current = current.parent;
  }
  return false;
}

export function createTransformTools({ camera, canvas, scene, rig, onSelect } = {}) {
  const transformControls = new TransformControls(camera, canvas);
  const helper = transformControls.getHelper();
  helper.name = "TransformControlsHelper";
  helper.traverse((object) => {
    object.userData.bloomIgnore = true;
    object.castShadow = false;
    object.receiveShadow = false;
  });
  scene.add(helper);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pointerDown = new THREE.Vector2();
  let enabled = false;
  let selected = null;

  transformControls.enabled = false;
  helper.visible = false;

  transformControls.addEventListener("dragging-changed", (event) => {
    if (!rig?.orbit) return;
    rig.orbit.enabled = !event.value && !rig.isWalking();
  });

  function attach(mesh) {
    if (!mesh) {
      transformControls.detach();
      selected = null;
      onSelect?.(null);
      return;
    }
    selected = mesh;
    transformControls.attach(mesh);
    helper.visible = enabled;
    onSelect?.(mesh);
  }

  function pick(event) {
    if (!enabled || transformControls.dragging) return;
    if (event.target !== canvas) return;
    if (pointerDown.distanceTo(pointer.set(event.clientX, event.clientY)) > 4) return;

    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObjects(scene.children, true);
    for (const hit of hits) {
      const object = hit.object;
      if (!object?.isMesh && !object?.isSprite) continue;
      if (isHelper(object, helper)) continue;
      if (SKIP.has(object.name) || SKIP.has(object.parent?.name)) continue;
      if (object.visible === false) continue;
      attach(object);
      return;
    }
    attach(null);
  }

  function onPointerDown(event) {
    pointerDown.set(event.clientX, event.clientY);
  }

  function onKeyDown(event) {
    if (!enabled || isTypingTarget(event.target)) return;
    if (event.key === "g") transformControls.setMode("translate");
    else if (event.key === "r") transformControls.setMode("rotate");
    else if (event.key === "s") transformControls.setMode("scale");
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", pick);
  window.addEventListener("keydown", onKeyDown);

  return {
    controls: transformControls,
    helper,
    attach,
    getSelected: () => selected,
    isEnabled: () => enabled,
    setEnabled(value) {
      enabled = !!value;
      transformControls.enabled = enabled;
      helper.visible = enabled && !!selected;
      rig?.setTransformPicking?.(enabled);
      if (enabled && rig?.isWalking?.()) rig.exitWalk();
      if (!enabled) attach(null);
    },
    dispose() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", pick);
      window.removeEventListener("keydown", onKeyDown);
      transformControls.dispose();
      helper.removeFromParent();
    },
  };
}
