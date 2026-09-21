import * as THREE from "three";
import { PERF } from "../config.js";

export async function createRenderer() {
  const options = {
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    forceWebGL: false,
  };

  let renderer = new THREE.WebGPURenderer(options);
  try {
    await renderer.init();
  } catch (error) {
    console.warn("WebGPU indisponível, usando backend WebGL.", error);
    renderer.dispose?.();
    renderer = new THREE.WebGPURenderer({ ...options, forceWebGL: true });
    await renderer.init();
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, PERF.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x080610, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.style.opacity = "1";
  renderer.domElement.style.zIndex = "1";
  document.body.appendChild(renderer.domElement);

  return renderer;
}

export function resizeRenderer(renderer) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const max = Math.min(window.devicePixelRatio, PERF.maxPixelRatio);
  const current = renderer.getPixelRatio();
  const ratio = PERF.adaptiveDpr ? Math.min(Math.max(current || max, 1), max) : max;
  renderer.setPixelRatio(ratio);
  renderer.setSize(width, height);
}
