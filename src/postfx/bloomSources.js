import { WINDOW_BLOOM_SCALE } from "../config.js";

const INTERIOR_NAMES = new Set(["window", "old window", "light", "room", "Meshpart26Mtl"]);
const NEON_NAME = /neon|sign|text\d|billboard|truck lights|streetlight|pic stop|material\.003|material\.009/i;
const NEON_MESHPART = /^Meshpart(8|11|13|14|16|17|22)/i;

export function isGlowing(material) {
  const intensity = material.emissiveIntensity ?? 0;
  const hex = material.emissive?.getHex?.() ?? 0;
  return (hex > 0 && intensity > 0) || !!material.emissiveMap || !!material.emissiveNode;
}

export function isBloomSource(material) {
  if (!material) return false;
  const name = material.name ?? "";
  if (INTERIOR_NAMES.has(name) || /window|room/i.test(name)) return false;
  if (!isGlowing(material)) return false;
  if (material.emissiveMap || material.emissiveNode) {
    return NEON_NAME.test(name) || NEON_MESHPART.test(name) || /billboard/i.test(name);
  }
  return NEON_NAME.test(name) || NEON_MESHPART.test(name);
}

// Fator de bloom por material: neon = 1, janelas/luzes internas = WINDOW_BLOOM_SCALE
// (brilho mais discreto para não competir com os letreiros), sem emissivo = 0.
export function getBloomScale(material) {
  if (!material) return 0;
  if (isBloomSource(material)) return 1;
  return isGlowing(material) ? WINDOW_BLOOM_SCALE : 0;
}

export function applyBloomMrt(root, setBloomOutput) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of list) {
      if (!material) continue;
      const scale = getBloomScale(material);
      setBloomOutput(material, scale > 0, scale);
    }
  });
}
