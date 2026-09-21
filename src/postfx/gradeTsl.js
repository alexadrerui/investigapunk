import * as THREE from "three";
import {
  Fn,
  convertToTexture,
  float,
  fract,
  luminance,
  mix,
  screenUV,
  sin,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

export function createGradeUniforms() {
  return {
    uTime: uniform(0),
    uTint: uniform(new THREE.Vector3(1, 1, 1)),
    uOffset: uniform(new THREE.Vector3(0, 0, 0)),
    uSaturation: uniform(1),
    uContrast: uniform(1),
    uGreenSuppress: uniform(1),
    uGradeMix: uniform(0),
    uChromatic: uniform(0),
    uChromaticFalloff: uniform(3),
    uVignette: uniform(0),
    uVignetteSmooth: uniform(0.65),
    uGrain: uniform(0),
    uFogColor: uniform(new THREE.Color()),
    uFogAmount: uniform(0.8),
    uFogEnabled: uniform(0.35),
    uFogNear: uniform(0),
    uFogFar: uniform(50),
    uFogBloomSuppress: uniform(0.22),
  };
}

export function applyGrade(inputNode, u, { viewZ, linearDepth, bloomNode } = {}) {
  const inputTex = convertToTexture(inputNode);
  return Fn(() => {
    const uv0 = screenUV;
    const fromCenter = uv0.sub(0.5);
    const dist = fromCenter.length();
    const edge = float(1).sub(float(1).div(float(1).add(dist.mul(u.uChromaticFalloff).pow(2))));
    const aberration = u.uChromatic.mul(edge);
    const dir = fromCenter;
    const r = inputTex.sample(float(0.5).add(dir.mul(float(1).add(aberration.mul(0.015))))).r;
    const g = inputTex.sample(uv0).g;
    const b = inputTex.sample(float(0.5).add(dir.mul(float(1).sub(aberration.mul(0.015))))).b;
    const color = vec3(r, g, b).toVar();

    const rangeFog = viewZ.negate().smoothstep(u.uFogNear, u.uFogFar);
    const depthFog = linearDepth.smoothstep(0.68, 1);
    const fogFactor = rangeFog.max(depthFog).mul(u.uFogEnabled);
    const protect = luminance(color).smoothstep(0.08, 0.72);
    const veil = fogFactor.mul(u.uFogAmount).mul(float(1).sub(protect));
    color.assign(mix(color, u.uFogColor, veil));

    if (bloomNode) {
      const suppress = float(1).sub(fogFactor.mul(u.uFogBloomSuppress)).max(0.62);
      color.addAssign(bloomNode.rgb.mul(suppress));
    }

    const lum = luminance(color);
    const sat = mix(vec3(lum), color, u.uSaturation).toVar();
    sat.g.assign(mix(sat.g, lum, float(1).sub(u.uGreenSuppress)));
    sat.assign(sat.sub(0.5).mul(u.uContrast).add(0.5));
    const graded = sat.mul(u.uTint).add(u.uOffset);
    color.assign(mix(color, graded, u.uGradeMix));

    const vig = uv0.sub(0.5).length().mul(float(0.65).add(u.uVignette)).smoothstep(u.uVignetteSmooth, 1.2);
    color.mulAssign(mix(float(1), float(1).sub(u.uVignette.mul(0.85)), vig));
    const grain = fract(sin(uv0.add(u.uTime).dot(vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5);
    color.addAssign(color.mul(grain).mul(u.uGrain));
    return vec4(color, 1);
  })();
}
