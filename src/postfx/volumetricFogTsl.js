import * as THREE from "three";
import {
  Break,
  Fn,
  If,
  Loop,
  cameraPosition,
  cameraProjectionMatrixInverse,
  cameraWorldMatrix,
  exp,
  float,
  fract,
  getViewPosition,
  luminance,
  mix,
  screenCoordinate,
  screenUV,
  select,
  texture3D,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { GROUND, SMOKE, isMobile } from "../config.js";

function tri(x) {
  return Math.abs((((x % 1) + 1) % 1) - 0.5);
}

function tri3(x, y, z) {
  return [tri(z + tri(y)), tri(z + tri(x)), tri(y + tri(x))];
}

function triNoise(x, y, z) {
  let px = x;
  let py = y;
  let pz = z;
  let bpx = x;
  let bpy = y;
  let bpz = z;
  let zFactor = 1.4;
  let rz = 0;
  for (let i = 0; i < 4; i += 1) {
    const [dgx, dgy, dgz] = tri3(bpx * 2, bpy * 2, bpz * 2);
    px += dgx;
    py += dgy;
    pz += dgz;
    bpx = bpx * 1.8 + 0.14;
    bpy = bpy * 1.8 + 0.14;
    bpz = bpz * 1.8 + 0.14;
    zFactor *= 1.5;
    px *= 1.2;
    py *= 1.2;
    pz *= 1.2;
    rz += tri(pz + tri(px + tri(py))) / zFactor;
  }
  return rz;
}

function createNoise3DTexture(size = 64) {
  const data = new Uint8Array(size * size * size);
  let idx = 0;
  for (let z = 0; z < size; z += 1) {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const u = x / size;
        const v = y / size;
        const w = z / size;
        const n1 = triNoise(u * 4, v * 4, w * 4);
        const n2 = triNoise(u * 8 + 1.7, v * 8 + 0.9, w * 8 + 2.5) * 0.45;
        data[idx] = Math.floor(Math.min(Math.max((n1 + n2) * 1.15 * 255, 0), 255));
        idx += 1;
      }
    }
  }
  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RedFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.wrapR = THREE.RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

// Fumaça localizada (escapamento do carro, fumarolas ambiente): em vez dos
// sprites aditivos antigos, cada ponto vira um "puff" raymarcheado dentro do
// mesmo pass de névoa volumétrica, reaproveitando o campo de ruído 3D — a
// técnica do exemplo three.js webgpu_postprocessing_fog, só que os pontos
// definidos em SMOKE viram fontes de densidade locais em vez de uma camada
// única por altura.
const EXHAUST_RADIUS_K = 0.14;
const EXHAUST_HEIGHT_K = 0.32;
const AMBIENT_RADIUS_K = 0.5;
const AMBIENT_HEIGHT_K = 0.32;
const AMBIENT_HEIGHT_MIN = 1.4;
const AMBIENT_HEIGHT_MAX = 5.2;
const SMOKE_MAX_HEIGHT = 6.5;

// Soma a contribuição de densidade de um puff (esfera suave que sobe e
// desvanece em ciclo) no ponto atual do raymarch. `turbulence` reaproveita a
// amostra de ruído 3D já tirada nesse passo, então não custa textura extra.
function addPuffDensity(accumVar, positionRay, turbulence, stepSize, timeUniform, point, radiusNode, speedNode, phase) {
  const life = fract(timeUniform.mul(speedNode).add(point.phase).add(phase));
  const centerY = point.posUniform.y.add(life.mul(point.heightConst));
  const dx = positionRay.x.sub(point.posUniform.x);
  const dz = positionRay.z.sub(point.posUniform.z);
  const dy = positionRay.y.sub(centerY);
  const radius = radiusNode.mul(mix(0.55, 1, life));
  const horizFalloff = exp(dx.mul(dx).add(dz.mul(dz)).div(radius.mul(radius).mul(-2)));
  const vertFalloff = exp(dy.mul(dy).div(radiusNode.mul(radiusNode).mul(-1.6)));
  const fadeOut = life.oneMinus().pow(0.6);
  const wisp = turbulence.mul(0.6).add(0.4);
  accumVar.addAssign(horizFalloff.mul(vertFalloff).mul(fadeOut).mul(wisp).mul(stepSize));
}

export function createVolumetricFog(inputNode, depthNode) {
  const noiseTexture = createNoise3DTexture(64);
  const mobile = isMobile();
  const steps = mobile ? 8 : 12;
  const puffPhases = mobile ? [0] : [0, 0.5];
  const marchUniforms = {
    uTime: uniform(0),
    uSteps: uniform(steps),
    uFogDensity: uniform(0.4),
    uHeightFalloff: uniform(1.55),
    uFogHeight: uniform(5.8),
    uCloudScale: uniform(0.021),
    uCloudThreshold: uniform(0.64),
    uMaxRayDist: uniform(42),
    uCloudSpeed: uniform(0.04),
    uRangeFogNear: uniform(38),
    uRangeFogFar: uniform(95),
    uGroundY: uniform(GROUND.y),
  };
  const uFogColor = uniform(new THREE.Color(0.38, 0.4, 0.46));
  const uAmount = uniform(0);

  const exhaustParams = { opacity: SMOKE.exhaustOpacity, speed: SMOKE.exhaustSpeed, scale: SMOKE.exhaustScale, visible: true };
  const ambientParams = { opacity: SMOKE.ambientOpacity, speed: SMOKE.ambientSpeed };
  const ambient = SMOKE.ambient.map((point) => ({ ...point }));

  const uSmokeVisible = uniform(1);
  const uExhaustColor = uniform(new THREE.Color(0x6e6169));
  const uExhaustOpacity = uniform(exhaustParams.opacity);
  const uExhaustSpeed = uniform(exhaustParams.speed);
  const uExhaustRadius = uniform(exhaustParams.scale * EXHAUST_RADIUS_K);
  const uAmbientColor = uniform(new THREE.Color(0x66655f));
  const uAmbientOpacity = uniform(ambientParams.opacity);
  const uAmbientSpeed = uniform(ambientParams.speed);
  const uSmokeMaxHeight = uniform(SMOKE_MAX_HEIGHT);

  // Pontos de exhaust ficam em espaço local do carro (posUniform é
  // sincronizado para mundo em smoke.update(car), a cada frame).
  const exhaustPoints = SMOKE.exhaust.map((point, index) => ({
    localOffset: new THREE.Vector3(point.x, point.y, point.z),
    posUniform: uniform(new THREE.Vector3(point.x, point.y, point.z)),
    heightConst: exhaustParams.scale * EXHAUST_HEIGHT_K,
    phase: index * 0.5,
  }));

  const ambientPoints = ambient.map((point, index) => ({
    posUniform: uniform(new THREE.Vector3(point.x, point.y, point.z)),
    radiusUniform: uniform(point.scale * AMBIENT_RADIUS_K),
    heightConst: THREE.MathUtils.clamp(point.scale * AMBIENT_HEIGHT_K, AMBIENT_HEIGHT_MIN, AMBIENT_HEIGHT_MAX),
    phase: index * 0.37,
  }));

  const fogMask = Fn(() => {
    const depth = depthNode.sample(screenUV).x;
    const viewPos = getViewPosition(screenUV, depth, cameraProjectionMatrixInverse);
    const targetWorld = cameraWorldMatrix.mul(vec4(viewPos, 1)).xyz;
    const rayVector = targetWorld.sub(cameraPosition);
    const surfaceDist = rayVector.length();
    const rayDir = rayVector.div(surfaceDist.max(0.0001));
    const dirY = select(rayDir.y.greaterThanEqual(0), rayDir.y.max(0.00001), rayDir.y.min(-0.00001));
    const fogTop = marchUniforms.uFogHeight.max(uSmokeMaxHeight);
    const t0 = marchUniforms.uGroundY.sub(cameraPosition.y).div(dirY);
    const t1 = marchUniforms.uGroundY.add(fogTop).sub(cameraPosition.y).div(dirY);
    const tStart = t0.min(t1).max(0.0);
    const tEnd = t0.max(t1).min(surfaceDist).min(tStart.add(marchUniforms.uMaxRayDist));
    const marchDist = tEnd.sub(tStart).max(0.0);
    const stepCount = marchUniforms.uSteps.max(1);
    const stepSize = marchDist.div(stepCount);
    const dither = fract(screenCoordinate.xy.dot(vec2(0.06711056, 0.00583715)).mul(52.9829189)).mul(0.2);
    const positionRay = cameraPosition.add(rayDir.mul(tStart)).add(rayDir.mul(stepSize).mul(dither)).toVar();
    const accumulation = float(0).toVar();
    const exhaustAccum = float(0).toVar();
    const ambientAccum = float(0).toVar();
    Loop({ start: 0, end: 12 }, ({ i }) => {
      If(float(i).greaterThanEqual(stepCount), () => Break());
      const t = marchUniforms.uTime.mul(marchUniforms.uCloudSpeed);
      const p = positionRay.mul(marchUniforms.uCloudScale);
      const n1 = texture3D(noiseTexture, p.add(vec3(t.mul(0.3), t.mul(0.05), t.mul(0.2))).fract()).r;
      const n2 = texture3D(
        noiseTexture,
        p.mul(2.2).add(vec3(1.7, 0.9, 2.5)).add(vec3(t.mul(-0.15), t.mul(0.1), t.mul(0.08))).add(n1.mul(0.5)).fract(),
      ).r.mul(0.5);
      const relHeight = positionRay.y.sub(marchUniforms.uGroundY).div(marchUniforms.uFogHeight.max(0.01));
      const heightFactor = float(1).sub(relHeight).clamp(0, 1).pow(marchUniforms.uHeightFalloff);
      const density = n1.add(n2).sub(marchUniforms.uCloudThreshold).max(0.0).mul(heightFactor);
      accumulation.addAssign(density.mul(stepSize).mul(marchUniforms.uFogDensity));

      for (const phase of puffPhases) {
        for (const point of exhaustPoints) {
          addPuffDensity(exhaustAccum, positionRay, n1, stepSize, marchUniforms.uTime, point, uExhaustRadius, uExhaustSpeed, phase);
        }
        for (const point of ambientPoints) {
          addPuffDensity(ambientAccum, positionRay, n1, stepSize, marchUniforms.uTime, point, point.radiusUniform, uAmbientSpeed, phase);
        }
      }

      positionRay.addAssign(rayDir.mul(stepSize));
    });
    const cloudFog = float(1).sub(exp(accumulation.negate()));
    const rangeFog = surfaceDist
      .sub(marchUniforms.uRangeFogNear)
      .div(marchUniforms.uRangeFogFar.sub(marchUniforms.uRangeFogNear).max(0.001))
      .clamp(0, 1);
    const exhaustFog = float(1).sub(exp(exhaustAccum.mul(uExhaustOpacity).negate()));
    const ambientFog = float(1).sub(exp(ambientAccum.mul(uAmbientOpacity).negate()));
    return vec3(cloudFog.max(rangeFog.mul(0.16)), exhaustFog, ambientFog);
  })();

  const node = Fn(() => {
    const fog = fogMask.x.mul(uAmount).clamp(0.0, 0.58);
    const exhaustSmoke = fogMask.y.mul(uSmokeVisible).clamp(0.0, 0.92);
    const ambientSmoke = fogMask.z.mul(uSmokeVisible).clamp(0.0, 0.92);
    const scene = inputNode.rgb;
    const protect = luminance(scene).smoothstep(0.08, 0.72).oneMinus();
    const withFog = mix(scene, uFogColor, fog.mul(protect));
    const withExhaust = mix(withFog, uExhaustColor, exhaustSmoke.mul(protect));
    const withAmbient = mix(withExhaust, uAmbientColor, ambientSmoke.mul(protect));
    return vec4(withAmbient, 1);
  })();

  return {
    node,
    marchUniforms,
    compositeUniforms: {
      uFogColor,
      uAmount,
    },
    setAmount(value) {
      uAmount.value = value;
    },
    getAmount() {
      return uAmount.value;
    },
    setFogColor(r, g, b) {
      uFogColor.value.setRGB(r, g, b);
    },
    smoke: {
      params: exhaustParams,
      ambientParams,
      ambient,
      meshes: [],
      setVisible(visible) {
        exhaustParams.visible = !!visible;
        uSmokeVisible.value = exhaustParams.visible ? 1 : 0;
      },
      update(car) {
        uExhaustOpacity.value = exhaustParams.opacity;
        uExhaustSpeed.value = exhaustParams.speed;
        uExhaustRadius.value = exhaustParams.scale * EXHAUST_RADIUS_K;
        uAmbientOpacity.value = ambientParams.opacity;
        uAmbientSpeed.value = ambientParams.speed;
        if (car) {
          car.updateMatrixWorld();
          for (const point of exhaustPoints) {
            point.posUniform.value.copy(point.localOffset);
            car.localToWorld(point.posUniform.value);
          }
        }
        for (let i = 0; i < ambientPoints.length; i += 1) {
          ambientPoints[i].radiusUniform.value = ambient[i].scale * AMBIENT_RADIUS_K;
          ambientPoints[i].posUniform.value.set(ambient[i].x, ambient[i].y, ambient[i].z);
        }
      },
    },
  };
}
