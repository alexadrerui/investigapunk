import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { ASSETS } from "../assets.js";

let sharedLoader = null;

export function getGltfLoader(renderer) {
  if (sharedLoader) return sharedLoader;

  const draco = new DRACOLoader();
  draco.setDecoderPath(ASSETS.draco);

  const ktx2 = new KTX2Loader();
  ktx2.setTranscoderPath(ASSETS.basis);
  ktx2.detectSupport(renderer);

  sharedLoader = new GLTFLoader();
  sharedLoader.setDRACOLoader(draco);
  sharedLoader.setKTX2Loader(ktx2);
  return sharedLoader;
}

export function enableShadows(root, { cast = true, receive = true } = {}) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
}
