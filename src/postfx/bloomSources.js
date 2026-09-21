const INTERIOR_NAMES = new Set(["window", "old window", "light", "room", "Meshpart26Mtl"]);
const NEON_NAME = /neon|sign|text\d|billboard|truck lights|streetlight|pic stop|material\.003|material\.009/i;
const NEON_MESHPART = /^Meshpart(8|11|13|14|16|17|22)/i;

export function isBloomSource(material) {
  if (!material) return false;
  const name = material.name ?? "";
  if (INTERIOR_NAMES.has(name) || /window|room/i.test(name)) return false;
  const intensity = material.emissiveIntensity ?? 0;
  const hex = material.emissive?.getHex?.() ?? 0;
  const glowing = (hex > 0 && intensity > 0) || !!material.emissiveMap || !!material.emissiveNode;
  if (!glowing) return false;
  if (material.emissiveMap || material.emissiveNode) {
    return NEON_NAME.test(name) || NEON_MESHPART.test(name) || /billboard/i.test(name);
  }
  return NEON_NAME.test(name) || NEON_MESHPART.test(name);
}

export function applyBloomMrt(root, setBloomOutput) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of list) {
      if (!material) continue;
      setBloomOutput(material, isBloomSource(material));
    }
  });
}
