import * as THREE from "three";
import { materialEmissive, mrt } from "three/tsl";

function copyCommon(source, target) {
  target.name = source.name;
  target.side = source.side;
  target.transparent = source.transparent;
  target.opacity = source.opacity;
  target.depthWrite = source.depthWrite;
  target.depthTest = source.depthTest;
  target.alphaTest = source.alphaTest ?? 0;
  target.toneMapped = source.toneMapped ?? true;
  target.fog = source.fog ?? true;
  if (source.color) target.color.copy(source.color);
  if (source.map) target.map = source.map;
  if (source.alphaMap) target.alphaMap = source.alphaMap;
  if (source.normalMap) target.normalMap = source.normalMap;
  if (source.normalScale) target.normalScale.copy(source.normalScale);
  if ("envMapIntensity" in source && "envMapIntensity" in target) {
    target.envMapIntensity = source.envMapIntensity;
  }
}

function copyStandard(source, target) {
  copyCommon(source, target);
  if ("roughness" in source) target.roughness = source.roughness;
  if ("metalness" in source) target.metalness = source.metalness;
  if (source.roughnessMap) target.roughnessMap = source.roughnessMap;
  if (source.metalnessMap) target.metalnessMap = source.metalnessMap;
  if (source.emissive) target.emissive.copy(source.emissive);
  if (source.emissiveMap) target.emissiveMap = source.emissiveMap;
  target.emissiveIntensity = source.emissiveIntensity ?? 1;
}

function applyEmissiveNode(target) {
  const intensity = target.emissiveIntensity ?? 1;
  const glowing = (target.emissive?.getHex?.() ?? 0) > 0 || !!target.emissiveMap;
  if (glowing && intensity > 0) {
    target.emissiveNode = materialEmissive;
  }
}

export function toStandardNode(source) {
  if (!source || source.isMeshStandardNodeMaterial || source.isMeshPhysicalNodeMaterial) {
    return source;
  }
  const target = new THREE.MeshStandardNodeMaterial();
  copyStandard(source, target);
  applyEmissiveNode(target);
  return target;
}

export function toPhysicalNode(source) {
  if (!source) return source;
  if (source.isMeshPhysicalNodeMaterial) return source;
  const target = new THREE.MeshPhysicalNodeMaterial();
  copyStandard(source, target);
  if ("clearcoat" in source) target.clearcoat = source.clearcoat;
  if ("clearcoatRoughness" in source) target.clearcoatRoughness = source.clearcoatRoughness;
  if ("transmission" in source) target.transmission = source.transmission;
  if ("thickness" in source) target.thickness = source.thickness;
  if ("ior" in source) target.ior = source.ior;
  if ("specularIntensity" in source) target.specularIntensity = source.specularIntensity;
  applyEmissiveNode(target);
  return target;
}

export function setBloomOutput(material, enabled, scale = 1) {
  if (!material?.isNodeMaterial) return;
  material.mrtNode = enabled
    ? mrt({ bloom: scale === 1 ? materialEmissive : materialEmissive.mul(scale) })
    : null;
}

export function replaceMeshMaterials(root, convert = toStandardNode) {
  root.traverse((child) => {
    if (!child.isMesh && !child.isSprite) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    const next = list.map((material) => convert(material));
    child.material = Array.isArray(child.material) ? next : next[0];
  });
}
