import * as THREE from "three";
import { texture as tslTexture } from "three/tsl";
import { BILLBOARDS, CITY_Y } from "../config.js";
import { ASSETS } from "../assets.js";
import { getGltfLoader } from "../core/gltf.js";
import { setBloomOutput } from "../materials/toNodeMaterial.js";

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function materialsOf(mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function setMaterial(mesh, index, material) {
  if (Array.isArray(mesh.material)) {
    mesh.material[index] = material;
    return;
  }
  mesh.material = material;
}

function worldCenter(mesh) {
  const geometry = mesh.geometry;
  if (geometry && !geometry.boundingBox) geometry.computeBoundingBox();
  mesh.updateWorldMatrix(true, false);
  const center = new THREE.Vector3();
  if (geometry?.boundingBox) geometry.boundingBox.getCenter(center);
  return center.applyMatrix4(mesh.matrixWorld);
}

function createVideoTexture(src) {
  const video = document.createElement("video");
  video.src = src;
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return { video, texture };
}

function findScreens(root) {
  const hits = [];
  root.traverse((child) => {
    if (!child.isMesh) return;
    materialsOf(child).forEach((material, materialIndex) => {
      if (material && BILLBOARDS.materialNames.includes(material.name)) {
        hits.push({ mesh: child, material, materialIndex });
      }
    });
  });
  return hits;
}

export async function loadBillboards(renderer) {
  const root = (await getGltfLoader(renderer).loadAsync(ASSETS.billboards)).scene;
  root.name = "Billboards";
  root.position.y = CITY_Y;
  root.updateWorldMatrix(true, true);
  root.traverse((child) => {
    child.castShadow = false;
    child.receiveShadow = false;
  });

  const urls = shuffle(ASSETS.videos);
  const screens = [];

  findScreens(root).forEach((hit, index) => {
    const { video, texture } = createVideoTexture(urls[index % urls.length]);
    const videoNode = tslTexture(texture);
    const material = new THREE.MeshStandardNodeMaterial({
      name: hit.material.name,
      roughness: 0.35,
      metalness: 0,
      toneMapped: false,
      side: hit.material.side ?? THREE.FrontSide,
    });
    material.colorNode = videoNode;
    material.emissiveNode = videoNode;
    setBloomOutput(material, true);
    setMaterial(hit.mesh, hit.materialIndex, material);
    screens.push({
      mesh: hit.mesh,
      video,
      texture,
      playing: false,
      worldPosition: worldCenter(hit.mesh),
    });
  });

  function setPlaying(screen, playing) {
    if (screen.playing === playing) return;
    screen.playing = playing;
    if (playing) {
      const play = screen.video.play();
      if (play?.catch) play.catch(() => {});
    } else {
      screen.video.pause();
    }
  }

  function update(camera) {
    if (!camera) return;
    for (const screen of screens) {
      const dx = camera.position.x - screen.worldPosition.x;
      const dz = camera.position.z - screen.worldPosition.z;
      const distance = Math.hypot(dx, dz);
      if (!screen.playing && distance < BILLBOARDS.playDistance) setPlaying(screen, true);
      else if (screen.playing && distance > BILLBOARDS.pauseDistance) setPlaying(screen, false);
    }
  }

  function prime(camera) {
    for (const screen of screens) {
      if (!camera) {
        setPlaying(screen, true);
        continue;
      }
      const dx = camera.position.x - screen.worldPosition.x;
      const dz = camera.position.z - screen.worldPosition.z;
      if (Math.hypot(dx, dz) < BILLBOARDS.pauseDistance) setPlaying(screen, true);
    }
  }

  return {
    root,
    screens,
    update,
    prime,
  };
}
