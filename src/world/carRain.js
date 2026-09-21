import * as THREE from "three";
import {
  Fn,
  float,
  materialColor,
  materialNormal,
  materialRoughness,
  mix,
  pow,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import { toPhysicalNode } from "../materials/toNodeMaterial.js";

const GLASS = new Set(["77_5"]);
const SKIP = new Set(["mat_0.001"]);
const FADE_START = 20;
const FADE_END = 32;
const FADE_EPS = 0.01;

const carRainN = Fn(([t]) => t.mul(12345.564).sin().mul(7658.76).fract());

const carRainN13 = Fn(([p]) => {
  const p3 = vec3(p).mul(vec3(0.1031, 0.11369, 0.13787)).fract().toVar();
  p3.addAssign(p3.dot(p3.yzx.add(19.19)));
  return vec3(
    p3.x.add(p3.y).mul(p3.z),
    p3.x.add(p3.z).mul(p3.y),
    p3.y.add(p3.z).mul(p3.x),
  ).fract();
});

const carRainSaw = Fn(([b, t]) => smoothstep(0.0, b, t).mul(smoothstep(1.0, b, t)));

const carRainLayer = Fn(([uvIn, t, dropSize, dropletMix]) => {
  const UV = uvIn;
  const t15 = t.mul(0.15);
  const uvVar = uvIn.toVar();
  uvVar.assign(vec2(uvVar.x, uvVar.y.add(t15.mul(0.75))));
  const a = vec2(4.0, 2.0);
  const grid = a.mul(2.0);
  const id = uvVar.mul(grid).floor().toVar();
  uvVar.y.addAssign(carRainN(id.x));
  id.assign(uvVar.mul(grid).floor());
  const n = carRainN13(id.x.mul(35.2).add(id.y.mul(2376.1)));
  const st = uvVar.mul(grid).fract().sub(vec2(0.5, 0.0));
  const x = n.x.sub(0.5).toVar();
  const yW = UV.y.mul(10.0);
  const wiggle = yW.add(yW.sin()).sin();
  x.addAssign(wiggle.mul(float(0.5).sub(x.abs())).mul(n.z.sub(0.5)));
  x.mulAssign(0.7);
  const ti = t15.add(n.z).fract();
  const y = carRainSaw(0.85, ti).sub(0.5).mul(0.9).add(0.5);
  const d = st.sub(vec2(x, y)).mul(a.yx).length();
  const mainDrop = pow(smoothstep(float(0.9).mul(dropSize), 0.0, d), 2.0);
  const r = smoothstep(1.0, y, st.y).sqrt();
  const cd = st.x.sub(x).abs();
  const trail = smoothstep(r.mul(0.23).mul(dropSize), r.mul(r).mul(0.15).mul(dropSize), cd).toVar();
  const trailFront = smoothstep(float(-0.02).mul(dropSize), float(0.02).mul(dropSize), st.y.sub(y));
  trail.mulAssign(trailFront.mul(r).mul(r));
  const y2 = UV.y.mul(10.0).fract().add(st.y.sub(0.5));
  const droplets = smoothstep(float(0.4).mul(dropSize), 0.0, st.sub(vec2(x, y2)).length());
  const mask = mainDrop.add(droplets.mul(r).mul(trailFront).mul(dropletMix)).add(trail.mul(0.35));
  return vec2(mask, float(1).sub(d).mul(0.5));
});

const carRainPx = Fn(([uvIn, t, layer1, layer2, dropSize, dropletMix]) => {
  const layerA = carRainLayer(uvIn, t, dropSize, dropletMix);
  const layerB = carRainLayer(uvIn.mul(1.85), t, dropSize, dropletMix);
  return vec2(
    smoothstep(0.3, 1.0, layerA.x.add(layerB.x)),
    layerA.y.mul(layer1).max(layerB.y.mul(layer2)),
  );
});

function materialsOf(mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function isGlass(material) {
  return GLASS.has(material?.name);
}

function isPaintCandidate(material) {
  if (!material || material.isMeshBasicMaterial || material.isMeshBasicNodeMaterial) return false;
  if (SKIP.has(material.name) || isGlass(material)) return false;
  if (material.transparent && (material.opacity ?? 1) < 0.6) return false;
  const metalness = material.metalness ?? 0;
  const emissiveHex = material.emissive?.getHex?.() ?? 0;
  if ((material.emissiveIntensity ?? 0) > 0.5 && (material.emissiveMap || emissiveHex > 0) && metalness < 0.15) {
    return false;
  }
  return metalness >= 0.15 || !!(material.roughnessMap || material.metalnessMap || material.normalMap);
}

function patchMaterial(material, shared, { glass }) {
  const uRainNormalStrength = uniform(glass ? 0.7 : 0.25);
  const uWetRoughness = uniform(glass ? 0.05 : 0.1);
  const uWetBrighten = uniform(glass ? 1.2 : 0);

  if (glass) {
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    material.side = THREE.FrontSide;
    material.color.setRGB(0.24, 0.25, 0.26);
    material.roughness = 0.12;
    material.metalness = 0;
    material.clearcoat = 1;
    material.clearcoatRoughness = 0.06;
    material.envMapIntensity = 0.85;
    if ("specularIntensity" in material) material.specularIntensity = 1;
  }

  const sampleCarRain = Fn(([uvIn]) => {
    const t = shared.uRainTime.mul(1.2).mul(shared.uRainSpeed);
    const layer1 = mix(0.25, 0.75, shared.uRainIntensity);
    const layer2 = mix(0.0, 0.5, shared.uRainIntensity);
    const scaled = uvIn.mul(shared.uRainScale);
    const sample = carRainPx(scaled, t, layer1, layer2, shared.uDropSize, shared.uDropletMix);
    const e = vec2(0.005, 0.0);
    const cx = carRainPx(scaled.add(e), t, layer1, layer2, shared.uDropSize, shared.uDropletMix).x;
    const cy = carRainPx(scaled.add(e.yx), t, layer1, layer2, shared.uDropSize, shared.uDropletMix).x;
    return vec3(sample.x.mul(shared.uRainIntensity), cx.sub(sample.x), cy.sub(sample.x));
  });

  const rainUv = uv(1);
  const rain = sampleCarRain(rainUv);
  material.normalNode = materialNormal.add(vec3(rain.y.mul(uRainNormalStrength), rain.z.mul(uRainNormalStrength), 0));
  material.roughnessNode = mix(materialRoughness, uWetRoughness, rain.x);
  if (glass) {
    material.colorNode = mix(materialColor, vec3(0.55, 0.6, 0.65), rain.x.mul(uWetBrighten));
  }
}

export function applyCarRain(car) {
  const shared = {
    uRainTime: uniform(0),
    uRainSpeed: uniform(1),
    uRainIntensity: uniform(1),
    uRainScale: uniform(20.5),
    uDropSize: uniform(0.45),
    uDropletMix: uniform(0.15),
  };

  car.traverse((child) => {
    if (!child.isMesh) return;
    const list = materialsOf(child);
    const nextList = list.map((material) => {
      const glass = isGlass(material);
      if (!glass && !isPaintCandidate(material)) return material;
      const target = toPhysicalNode(material);
      patchMaterial(target, shared, { glass });
      return target;
    });
    child.material = Array.isArray(child.material) ? nextList : nextList[0];
  });

  const carPos = new THREE.Vector3();
  const params = { intensity: 1 };

  return {
    uniforms: shared,
    params,
    update(delta, camera) {
      car.getWorldPosition(carPos);
      const distance = camera.position.distanceTo(carPos);
      const span = Math.max(FADE_END, FADE_START + 0.001) - FADE_START;
      const t = THREE.MathUtils.clamp((distance - FADE_START) / span, 0, 1);
      const fade = 1 - THREE.MathUtils.smoothstep(t, 0, 1);
      shared.uRainIntensity.value = fade * params.intensity;
      if (fade > FADE_EPS) shared.uRainTime.value += delta;
    },
  };
}
