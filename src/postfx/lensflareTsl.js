import {
  Fn,
  Loop,
  convertToTexture,
  float,
  fract,
  mix,
  screenUV,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

export function applyLensflare(inputNode, {
  uEnabled,
  uStrength,
  uThreshold,
  uGhostSpacing,
  uGhostAttenuation,
}) {
  const inputTex = convertToTexture(inputNode);
  return Fn(() => {
    const uv0 = screenUV;
    const base = inputTex.sample(uv0);
    const flipped = float(1).sub(uv0);
    const delta = uv0.sub(0.5).mul(uGhostSpacing);
    const ghosts = vec3(0).toVar();
    Loop({ start: 0, end: 4 }, ({ i }) => {
      const sampleUv = fract(flipped.add(delta.mul(float(i))));
      const dist = sampleUv.sub(0.5).length();
      const atten = float(1).sub(dist).max(0).pow(uGhostAttenuation.mul(0.08));
      const sampleColor = inputTex.sample(sampleUv).rgb.sub(uThreshold).max(0);
      ghosts.addAssign(sampleColor.mul(atten));
    });
    const flared = base.rgb.add(ghosts.mul(uStrength).mul(0.3));
    return vec4(mix(base.rgb, flared, uEnabled), 1);
  })();
}
