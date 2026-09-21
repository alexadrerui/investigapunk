import * as THREE from "three";
import {
  Fn,
  convertToTexture,
  dFdx,
  dFdy,
  float,
  mix,
  screenUV,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { gaussianBlur } from "three/addons/tsl/display/GaussianBlurNode.js";

const rainN = Fn(([t]) => t.mul(12345.564).sin().mul(7658.76).fract());

const rainN13 = Fn(([p]) => {
  const p3 = vec3(p).mul(vec3(0.1031, 0.11369, 0.13787)).fract().toVar();
  p3.addAssign(p3.dot(p3.yzx.add(19.19)));
  return vec3(
    p3.x.add(p3.y).mul(p3.z),
    p3.x.add(p3.z).mul(p3.y),
    p3.y.add(p3.z).mul(p3.x),
  ).fract();
});

const rainSaw = Fn(([b, t]) => smoothstep(0.0, b, t).mul(smoothstep(1.0, b, t)));

const dropLayer = Fn(([uvIn, t, dropSize]) => {
  const UV = uvIn;
  const uvVar = uvIn.toVar();
  uvVar.assign(vec2(uvVar.x, uvVar.y.add(t.mul(0.75))));
  const a = vec2(6.0, 1.0);
  const grid = a.mul(2.0);
  const id = uvVar.mul(grid).floor().toVar();
  uvVar.y.addAssign(rainN(id.x));
  id.assign(uvVar.mul(grid).floor());
  const n = rainN13(id.x.mul(35.2).add(id.y.mul(2376.1)));
  const st = uvVar.mul(grid).fract().sub(vec2(0.5, 0.0));
  const x = n.x.sub(0.5).toVar();
  const yW = UV.y.mul(20.0);
  const wiggle = yW.add(yW.sin()).sin();
  x.addAssign(wiggle.mul(float(0.5).sub(x.abs())).mul(n.z.sub(0.5)));
  x.mulAssign(0.7);
  const ti = t.add(n.z).fract();
  const y = rainSaw(0.85, ti).sub(0.5).mul(0.9).add(0.5);
  const mainDrop = smoothstep(float(0.4).mul(dropSize), 0.0, st.sub(vec2(x, y)).mul(a.yx).length());
  const r = smoothstep(1.0, y, st.y).sqrt();
  const trail = smoothstep(r.mul(0.23), r.mul(r).mul(0.15), st.x.sub(x).abs()).toVar();
  const trailFront = smoothstep(-0.02, 0.02, st.y.sub(y));
  trail.mulAssign(trailFront.mul(r).mul(r));
  const y2 = UV.y.mul(10.0).fract().add(st.y.sub(0.5));
  const droplets = smoothstep(float(0.3).mul(dropSize), 0.0, st.sub(vec2(x, y2)).length());
  return vec2(mainDrop.add(droplets.mul(r).mul(trailFront)), trail);
});

const staticDrops = Fn(([uvIn, t]) => {
  const scaled = uvIn.mul(40.0);
  const id = scaled.floor();
  const local = scaled.fract().sub(0.5);
  const n = rainN13(id.x.mul(107.45).add(id.y.mul(3543.654)));
  const p = n.xy.sub(0.5).mul(0.7);
  const fade = rainSaw(0.025, t.add(n.z).fract());
  return smoothstep(0.3, 0.0, local.sub(p).length()).mul(n.z.mul(10.0).fract()).mul(fade);
});

const rainMask = Fn(([uvIn, t, l0, l1, l2, dropSize]) => {
  const s = staticDrops(uvIn, t).mul(l0);
  const m1 = dropLayer(uvIn, t, dropSize).mul(l1);
  const m2 = dropLayer(uvIn.mul(1.85), t, dropSize).mul(l2);
  return vec2(
    smoothstep(0.3, 1.0, s.add(m1.x).add(m2.x)),
    m1.y.mul(l0).max(m2.y.mul(l1)),
  );
});

export function createRainGlass(inputNode) {
  const uTime = uniform(0);
  const uAmount = uniform(1);
  const uIntensity = uniform(0.85);
  const uSpeed = uniform(4);
  const uBlurRadius = uniform(1.4);
  const uDistortion = uniform(0.28);
  const uDropSize = uniform(1);
  const uResolution = uniform(new THREE.Vector2(1, 1));
  const inputTex = convertToTexture(inputNode);
  const wetTex = convertToTexture(gaussianBlur(inputTex, uBlurRadius, 4, { resolutionScale: 0.5 }));

  const node = Fn(() => {
    const uv0 = screenUV;
    const base = inputTex.sample(uv0);
    const aspect = uResolution.x.div(uResolution.y.max(1));
    const n = vec2(uv0.x.sub(0.5).mul(aspect), uv0.y.oneMinus().sub(0.5));
    const t = uTime.mul(0.2).mul(uSpeed);
    const l0 = smoothstep(-0.5, 1.0, uIntensity).mul(2.0);
    const l1 = smoothstep(0.25, 0.75, uIntensity);
    const l2 = smoothstep(0.0, 0.5, uIntensity);
    const d = rainMask(n, t, l0, l1, l2, uDropSize);
    const g = vec2(dFdx(d.x), dFdy(d.x)).mul(3.5);
    const refractUv = uv0.add(g.mul(uDistortion).mul(uDropSize).mul(float(1).add(d.x.mul(0.5))));
    const sharp = inputTex.sample(refractUv).rgb;
    const fog = wetTex.sample(refractUv).rgb;
    const fogAmt = mix(float(1), 0.2, d.y.mul(1.4).clamp(0.0, 1.0));
    const y = mix(sharp, fog, mix(fogAmt, 0.15, smoothstep(0.1, 0.35, d.x)).clamp(0.0, 1.0)).toVar();
    y.r.addAssign(g.x.mul(d.x).mul(0.1).mul(uDistortion).mul(uDropSize));
    y.g.addAssign(g.y.mul(d.x).mul(0.1).mul(uDistortion).mul(uDropSize));
    y.mulAssign(mix(vec3(1.0), vec3(1).add(d.x.mul(0.2)), d.x));
    y.addAssign(vec3(d.y.max(0.0).pow(2.0).mul(0.25)).mul(float(1).sub(d.x)));
    y.mulAssign(mix(vec3(1.0), vec3(0.85, 0.92, 1.12), 0.45));
    const fromCenter = uv0.sub(0.5);
    y.mulAssign(float(1).sub(fromCenter.dot(fromCenter).mul(0.75)));
    const wet = wetTex.sample(uv0).rgb;
    y.assign(mix(wet, y, d.x.mul(0.85)).mul(0.85));
    return vec4(mix(base.rgb, y, uAmount), 1);
  })();

  return {
    node,
    uniforms: {
      uTime,
      uAmount,
      uIntensity,
      uSpeed,
      uBlurRadius,
      uDistortion,
      uDropSize,
      uResolution,
    },
  };
}
