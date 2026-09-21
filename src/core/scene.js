import * as THREE from "three";
import { CAMERA, LIGHTING, SKY, getFov } from "../config.js";

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(
    getFov(),
    window.innerWidth / window.innerHeight,
    CAMERA.near,
    CAMERA.far,
  );
  camera.position.set(...CAMERA.position);
  camera.lookAt(...CAMERA.target);
  camera.layers.enable(0);
  camera.layers.enable(1);
  camera.layers.enable(3);
  return camera;
}

export function createScene() {
  const scene = new THREE.Scene();
  const background = new THREE.Color(LIGHTING.background);
  background.r += SKY.nightLift * 0.7;
  background.g += SKY.nightLift * 0.78;
  background.b += SKY.nightLift;
  scene.background = background;

  const sun = new THREE.DirectionalLight(LIGHTING.sun.color, LIGHTING.sun.intensity);
  sun.name = "KeySun";
  sun.position.set(...LIGHTING.sun.position);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(LIGHTING.sun.shadowMap, LIGHTING.sun.shadowMap);
  sun.shadow.camera.near = LIGHTING.sun.shadowNear;
  const extent = LIGHTING.sun.shadowExtent;
  sun.shadow.camera.far = LIGHTING.sun.shadowFarExtra + extent * 2;
  sun.shadow.camera.left = -extent;
  sun.shadow.camera.right = extent;
  sun.shadow.camera.top = extent;
  sun.shadow.camera.bottom = -extent;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = LIGHTING.sun.bias;
  sun.shadow.normalBias = LIGHTING.sun.normalBias;
  sun.shadow.intensity = LIGHTING.sun.shadowIntensity;
  sun.shadow.autoUpdate = false;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(LIGHTING.fill.color, LIGHTING.fill.intensity);
  fill.position.set(...LIGHTING.fill.position);
  fill.castShadow = false;
  scene.add(fill);
  scene.add(fill.target);

  return { scene, sun, fill };
}
