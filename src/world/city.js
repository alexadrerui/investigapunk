import * as THREE from "three";
import { CITY_Y, LIGHTING } from "../config.js";
import { ASSETS } from "../assets.js";
import { enableShadows, getGltfLoader } from "../core/gltf.js";
import { computeObjectBoundsTrees } from "../core/bvh.js";
import { replaceMeshMaterials, setBloomOutput, toStandardNode } from "../materials/toNodeMaterial.js";
import { applyBloomMrt } from "../postfx/bloomSources.js";

const INTERIOR_LIGHTS = {
  window: { emissive: 0xffd089, intensity: 3.2 },
  "old window": { emissive: 0xffb45a, intensity: 2.4, color: 0x2a1c10 },
  light: { emissive: 0xffe2a8, intensity: 3.6 },
  room: { emissive: 0xfff4dc, intensity: 4.2 },
  Meshpart26Mtl: { emissive: 0xffe8c8, intensity: 1.8 },
};

const NAMED_NEON = {
  Blue_Neon: { intensity: 4.4 },
  "Blue_Neon.001": { intensity: 3.8 },
  Green_Neon: { intensity: 4.2 },
  Pink_Neon: { intensity: 4.6 },
  Meshpart8Mtl: { intensity: 4.0 },
  Meshpart13Mtl: { emissive: 0xff8c1a, intensity: 1.25, force: true },
  Meshpart14Mtl: { intensity: 4.0 },
  Meshpart16Mtl: { intensity: 4.4 },
  Meshpart17Mtl: { intensity: 4.0 },
  Meshpart22Mtl: { intensity: 3.6 },
  "Pic Stop": { emissive: 0xffffff, intensity: 2.6 },
  "truck lights": { intensity: 3.4 },
  "Material.003": { emissive: 0xff0d87, intensity: 3.8 },
  Meshpart11Mtl: { emissive: 0xff8c1a, intensity: 1.35, force: true },
  sign2: { emissive: 0xff0100, intensity: 3.6 },
};

const GLOW_NAME = /neon|sign|text\d|light|window|room/i;

function emissiveHex(material) {
  return material.emissive?.getHex?.() ?? 0;
}

function applyGlowMaterial(material, boost = {}) {
  if (boost.color != null) material.color.setHex(boost.color);
  if (boost.emissive != null) material.emissive.setHex(boost.emissive);
  else if (emissiveHex(material) === 0 && material.color) {
    material.emissive.copy(material.color);
  }
  if (boost.force && boost.intensity != null) {
    material.emissiveIntensity = boost.intensity;
  } else {
    const next = boost.intensity ?? Math.max(material.emissiveIntensity ?? 1, 3.4);
    material.emissiveIntensity = Math.max(material.emissiveIntensity ?? 1, next);
  }
  material.metalness = 0;
  material.side = THREE.FrontSide;
  if ("envMapIntensity" in material) material.envMapIntensity = 0;
  material.toneMapped = boost.toneMapped ?? true;
}

function applyStreetlightMaterial(material) {
  const cfg = LIGHTING.streetlight;
  material.color.setHex(0xffffff);
  material.emissive.setHex(cfg.color);
  material.emissiveIntensity = cfg.emissiveIntensity;
  material.metalness = 0;
  material.roughness = 0.42;
  material.side = THREE.DoubleSide;
  material.toneMapped = true;
  if ("envMapIntensity" in material) material.envMapIntensity = 0.12;
}

function applyInteriorLights(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) continue;
      if (material.name === "streetlight") {
        applyStreetlightMaterial(material);
        continue;
      }
      const named = INTERIOR_LIGHTS[material.name] ?? NAMED_NEON[material.name];
      if (named) {
        applyGlowMaterial(material, named);
        continue;
      }
      const glowing = emissiveHex(material) > 0 || !!material.emissiveMap;
      if (material.emissiveMap) {
        if (emissiveHex(material) === 0) material.emissive.setHex(0xffffff);
        material.emissiveIntensity = Math.max(material.emissiveIntensity ?? 1, 2.4);
        material.metalness = Math.min(material.metalness ?? 0, 0.15);
        if ("envMapIntensity" in material) material.envMapIntensity = 0;
        continue;
      }
      if (glowing && (material.emissiveIntensity ?? 1) < 3 && GLOW_NAME.test(material.name ?? "")) {
        applyGlowMaterial(material, { intensity: 3.6 });
      }
    }
  });
}

function createStreetLights(city) {
  const cfg = LIGHTING.streetlight;
  const group = new THREE.Group();
  group.name = "StreetLights";
  city.add(group);

  const color = new THREE.Color(cfg.color);
  const box = new THREE.Box3();
  const center = new THREE.Vector3();

  city.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    if (!materials.some((material) => material?.name === "streetlight")) return;

    box.setFromObject(child);
    box.getCenter(center);
    city.worldToLocal(center);

    const spot = new THREE.SpotLight(
      color,
      cfg.spotIntensity,
      cfg.spotDistance,
      cfg.spotAngle,
      cfg.spotPenumbra,
      cfg.spotDecay,
    );
    spot.name = `StreetSpot_${child.name}`;
    spot.position.copy(center);
    spot.position.y -= cfg.drop;
    spot.target.position.set(center.x, center.y - 10, center.z);
    spot.castShadow = false;
    spot.userData.bloomIgnore = true;
    group.add(spot);
    group.add(spot.target);

    const point = new THREE.PointLight(color, cfg.pointIntensity, cfg.pointDistance, cfg.pointDecay);
    point.name = `StreetPoint_${child.name}`;
    point.position.copy(spot.position);
    point.castShadow = false;
    point.userData.bloomIgnore = true;
    group.add(point);
  });

  return group;
}

export function applyStreetLightConfig(root) {
  const cfg = LIGHTING.streetlight;
  if (!root) return;
  root.traverse((object) => {
    if (object.isSpotLight) {
      object.intensity = cfg.spotIntensity;
      object.distance = cfg.spotDistance;
      object.angle = cfg.spotAngle;
      object.penumbra = cfg.spotPenumbra;
      object.decay = cfg.spotDecay;
      object.color.setHex(cfg.color);
      return;
    }
    if (object.isPointLight) {
      object.intensity = cfg.pointIntensity;
      object.distance = cfg.pointDistance;
      object.decay = cfg.pointDecay;
      object.color.setHex(cfg.color);
      return;
    }
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material?.name !== "streetlight") continue;
      material.emissiveIntensity = cfg.emissiveIntensity;
      material.emissive.setHex(cfg.color);
    }
  });
}

export async function loadCity(renderer) {
  const loader = getGltfLoader(renderer);
  const [cityGltf, colliderGltf] = await Promise.all([
    loader.loadAsync(ASSETS.city),
    loader.loadAsync(ASSETS.collider),
  ]);

  const city = cityGltf.scene;
  city.name = "City";
  city.position.y = CITY_Y;
  city.updateWorldMatrix(true, true);
  enableShadows(city);
  applyInteriorLights(city);
  replaceMeshMaterials(city, toStandardNode);
  applyBloomMrt(city, setBloomOutput);
  createStreetLights(city);
  computeObjectBoundsTrees(city);

  const boundsCollider = colliderGltf.scene;
  boundsCollider.name = "city-bounds-collider";
  boundsCollider.position.y = CITY_Y;
  boundsCollider.visible = false;
  boundsCollider.traverse((child) => {
    child.castShadow = false;
    child.receiveShadow = false;
    if (child.isMesh) child.visible = false;
  });
  boundsCollider.updateWorldMatrix(true, true);
  computeObjectBoundsTrees(boundsCollider);

  return { city, boundsCollider };
}
