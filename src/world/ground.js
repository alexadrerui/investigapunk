import * as THREE from "three";
import { PhysicalLightingModel } from "three";
import {
  Fn,
  Loop,
  float,
  fwidth,
  materialNormal,
  mix,
  positionView,
  positionWorld,
  reflector,
  smoothstep,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import { GROUND, PERF } from "../config.js";
import { ASSETS } from "../assets.js";
import { computeObjectBoundsTrees } from "../core/bvh.js";

class WetGroundLightingModel extends PhysicalLightingModel {
  direct(inputs, builder) {
    // Luzes direcionais (sol, preenchimento) não recebem especular direto aqui:
    // o brilho "de sol" na poça já vem do reflector, não da BRDF. Sem isso, a
    // fill light (ou qualquer outra direcional) cria um falso reflexo de sol
    // mesmo com o disco do sol do céu desativado. Pontuais/spot (postes) ficam
    // de fora para manter o brilho local realista das luminárias na chuva.
    if (inputs.lightNode?.light?.isDirectionalLight) {
      super.direct({
        ...inputs,
        reflectedLight: {
          ...inputs.reflectedLight,
          directSpecular: { addAssign() {} },
        },
      }, builder);
      return;
    }
    super.direct(inputs, builder);
  }
}

function configureMap(map, { color = false } = {}) {
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  if (color) map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

export function createGround(scene) {
  const loader = new THREE.TextureLoader();
  const albedo = configureMap(loader.load(ASSETS.puddleAlbedo), { color: true });
  const roughnessMap = configureMap(loader.load(ASSETS.puddleRoughness));
  const normalMap = configureMap(loader.load(ASSETS.puddleNormal));

  const uTime = uniform(0);
  const uUvRepeat = uniform(GROUND.uvRepeat);
  const uRoughnessScale = uniform(GROUND.roughnessScale);
  const uRippleScale = uniform(GROUND.rippleScale);
  const uRippleSpeed = uniform(GROUND.rippleSpeed);
  const uRippleAmount = uniform(GROUND.rippleAmount);
  const uRippleStrength = uniform(GROUND.rippleStrength);
  const uRippleNormalStrength = uniform(GROUND.rippleNormalStrength);
  const uNormalWarp = uniform(GROUND.normalWarp);
  const uReflectStrength = uniform(GROUND.reflectionStrength);
  const uFogNear = uniform(GROUND.fogNear);
  const uFogFar = uniform(GROUND.fogFar);

  const uniforms = {
    uTime,
    uUvRepeat,
    uRoughnessScale,
    uRippleScale,
    uRippleSpeed,
    uRippleAmount,
    uRippleStrength,
    uRippleNormalStrength,
    uNormalWarp,
    uReflectStrength,
    uFogNear,
    uFogFar,
  };

  const rainHash12 = Fn(([p]) => {
    const p3 = p.xyx.mul(0.1031).fract().toVar();
    p3.addAssign(p3.dot(p3.yzx.add(19.19)));
    return p3.x.add(p3.y).mul(p3.z).fract();
  });

  const rainHash22 = Fn(([p]) => {
    const p3 = p.xyx.mul(vec3(0.1031, 0.103, 0.0973)).fract().toVar();
    p3.addAssign(p3.dot(p3.yzx.add(19.19)));
    return p3.xx.add(p3.yz).mul(p3.zy).fract();
  });

  const rainRipples = Fn(([pos]) => {
    const p0 = pos.floor();
    const acc = vec2(0).toVar();
    const t = uTime.mul(uRippleSpeed);
    Loop({ start: -1, end: 2 }, { start: -1, end: 2 }, ({ i, j }) => {
      const cell = p0.add(vec2(i.toFloat(), j.toFloat()));
      const center = cell.add(rainHash22(cell));
      const drop = float(0.3).mul(t).add(rainHash12(cell)).fract();
      const delta = center.sub(pos);
      const dist = delta.length().sub(drop.mul(2));
      const g = float(0.001);
      const a = dist.sub(g);
      const b = dist.add(g);
      const wa = a.mul(31).sin().mul(smoothstep(-0.6, -0.3, a)).mul(smoothstep(0.0, -0.3, a));
      const wb = b.mul(31).sin().mul(smoothstep(-0.6, -0.3, b)).mul(smoothstep(0.0, -0.3, b));
      const fade = float(1).sub(drop).mul(float(1).sub(drop));
      const deriv = wb.sub(wa).div(g.mul(2)).mul(fade);
      acc.addAssign(delta.add(1e-5).normalize().mul(deriv).mul(0.5));
    });
    return acc.div(9);
  });

  const rainPos = positionWorld.xz.mul(uRippleScale);
  const rain = rainRipples(rainPos);
  const rainAA = float(1).sub(smoothstep(0.12, 0.55, fwidth(rainPos.x)));
  const rainN = rain.mul(rainAA).mul(uRippleAmount).mul(uRippleNormalStrength);
  const fogVis = float(1).sub(smoothstep(uFogNear, uFogFar, positionView.z.abs()));

  const uvRepeat = uv().mul(uUvRepeat);
  const albedoSample = tslTexture(albedo, uvRepeat);
  const roughnessSample = tslTexture(roughnessMap, uvRepeat).r;
  const normalSample = tslTexture(normalMap, uvRepeat);
  const groundReflector = reflector({
    resolutionScale: PERF.groundReflectionScale ?? 0.5,
    bounces: false,
  });
  const updateReflector = groundReflector.reflector.updateBefore.bind(groundReflector.reflector);
  const suspendedMrt = new Map();
  groundReflector.reflector.updateBefore = (frame) => {
    const rain = scene.getObjectByName("CollisionRain");
    const wasVisible = rain?.visible;
    if (rain) rain.visible = false;
    // O ReflectorNode chama renderer.setMRT(null) antes de renderizar a
    // reflexão; qualquer material com mrtNode próprio (bloom seletivo) quebra
    // nesse contexto sem MRT global (WGSL "OutputType" vazio). Tiramos o
    // mrtNode só durante esse sub-render (a reflexão só usa a cor normal,
    // não precisa do canal de bloom) para o neon continuar refletindo na poça.
    scene.traverse((object) => {
      if (!object.isMesh || !object.visible) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material?.mrtNode) {
          suspendedMrt.set(material, material.mrtNode);
          material.mrtNode = null;
        }
      }
    });
    try {
      return updateReflector(frame);
    } finally {
      for (const [material, mrtNode] of suspendedMrt) material.mrtNode = mrtNode;
      suspendedMrt.clear();
      if (rain) rain.visible = wasVisible;
    }
  };
  const normalWarp = normalSample.xy.mul(2).sub(1).mul(uNormalWarp);
  const rippleWarp = rain.mul(uRippleAmount).mul(uRippleStrength).clamp(-0.008, 0.008);
  const reflectUv = groundReflector.uvNode.add(normalWarp).add(rippleWarp);
  const reflection = mix(groundReflector, groundReflector.sample(reflectUv), 0.4);

  const material = new THREE.MeshPhysicalNodeMaterial({
    normalMap,
    metalness: 0,
    envMapIntensity: 0.28,
    transparent: true,
    depthWrite: true,
    opacity: 1,
    fog: false,
  });
  material.setupLightingModel = () => new WetGroundLightingModel();
  material.colorNode = albedoSample.rgb;
  material.roughnessNode = roughnessSample.mul(uRoughnessScale);
  material.normalNode = materialNormal.add(vec3(rainN.x, rainN.y, 0));
  material.opacityNode = fogVis;
  material.emissiveNode = reflection.rgb
    .mul(roughnessSample.oneMinus())
    .mul(uReflectStrength)
    .mul(fogVis);

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(GROUND.size, GROUND.size), material);
  mesh.name = "ReflectiveGround";
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = GROUND.y;
  mesh.receiveShadow = true;
  mesh.add(groundReflector.target);
  scene.add(mesh);
  computeObjectBoundsTrees(mesh);

  return {
    mesh,
    uniforms,
    update(delta) {
      uTime.value += delta;
    },
    dispose() {
      groundReflector.dispose();
      albedo.dispose();
      roughnessMap.dispose();
      normalMap.dispose();
      material.dispose();
      mesh.geometry.dispose();
    },
  };
}
