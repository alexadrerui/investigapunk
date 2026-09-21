import * as THREE from "three";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { GROUND, isMobile } from "../config.js";

// Porta WebGL do volumetric fog da demo r186:
// https://github.com/mrdoob/three.js/blob/master/examples/webgpu_postprocessing_fog.html

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

const marchVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const marchFragment = /* glsl */ `
  precision highp sampler2D;
  precision highp sampler3D;
  uniform sampler2D tDepth;
  uniform sampler3D tNoise;
  uniform mat4 uProjectionMatrixInverse;
  uniform mat4 uCameraWorldMatrix;
  uniform vec3 uCameraPosition;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uTime;
  uniform float uSteps;
  uniform float uFogDensity;
  uniform float uHeightFalloff;
  uniform float uFogHeight;
  uniform float uCloudScale;
  uniform float uCloudThreshold;
  uniform float uMaxRayDist;
  uniform float uCloudSpeed;
  uniform float uRangeFogNear;
  uniform float uRangeFogFar;
  uniform float uGroundY;
  varying vec2 vUv;

  float interleavedGradientNoise(vec2 n) {
    return fract(52.9829189 * fract(dot(n, vec2(0.06711056, 0.00583715))));
  }

  vec3 getViewPosition(vec2 uv, float depth) {
    #ifdef USE_REVERSED_DEPTH_BUFFER
      vec4 clip = vec4(uv * 2.0 - 1.0, depth, 1.0);
    #else
      vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    #endif
    vec4 view = uProjectionMatrixInverse * clip;
    return view.xyz / view.w;
  }

  float sampleCloudDensity(vec3 pos) {
    float t = uTime * uCloudSpeed;
    vec3 p = pos * uCloudScale;
    vec3 wind1 = vec3(t * 0.3, t * 0.05, t * 0.2);
    float n1 = texture(tNoise, p + wind1).r;
    vec3 wind2 = vec3(-t * 0.15, t * 0.1, t * 0.08);
    vec3 p2 = p * 2.2 + vec3(1.7, 0.9, 2.5) + wind2 + n1 * 0.5;
    float n2 = texture(tNoise, p2).r * 0.5;
    float noise3D = n1 + n2;
    float relHeight = (pos.y - uGroundY) / max(uFogHeight, 0.01);
    float heightFactor = pow(clamp(1.0 - relHeight, 0.0, 1.0), uHeightFalloff);
    return max(noise3D - uCloudThreshold, 0.0) * heightFactor;
  }

  void main() {
    float depth = texture2D(tDepth, vUv).x;
    vec3 viewPos = getViewPosition(vUv, depth);
    vec3 targetWorldPos = (uCameraWorldMatrix * vec4(viewPos, 1.0)).xyz;
    vec3 rayVector = targetWorldPos - uCameraPosition;
    float surfaceDist = length(rayVector);
    vec3 rayDir = rayVector / max(surfaceDist, 0.0001);

    float fogBottomY = uGroundY;
    float fogTopY = uGroundY + uFogHeight;
    float dirY = rayDir.y >= 0.0 ? max(rayDir.y, 0.00001) : min(rayDir.y, -0.00001);
    float t0 = (fogBottomY - uCameraPosition.y) / dirY;
    float t1 = (fogTopY - uCameraPosition.y) / dirY;
    float tNearSlab = min(t0, t1);
    float tFarSlab = max(t0, t1);
    float tStart = max(tNearSlab, 0.0);
    float tEnd = min(min(tFarSlab, surfaceDist), tStart + uMaxRayDist);
    float marchDist = max(tEnd - tStart, 0.0);

    float steps = max(uSteps, 1.0);
    float stepSize = marchDist / steps;
    vec3 stepVector = rayDir * stepSize;
    float dither = interleavedGradientNoise(gl_FragCoord.xy) * 0.2;
    vec3 positionRay = uCameraPosition + rayDir * tStart + stepVector * dither;
    float accumulation = 0.0;
    for (int i = 0; i < 16; i++) {
      if (float(i) >= steps) break;
      accumulation += sampleCloudDensity(positionRay) * stepSize * uFogDensity;
      positionRay += stepVector;
    }

    float cloudFog = 1.0 - exp(-accumulation);
    float rangeFog = clamp(
      (surfaceDist - uRangeFogNear) / max(uRangeFogFar - uRangeFogNear, 0.001),
      0.0,
      1.0
    );
    gl_FragColor = vec4(max(cloudFog, rangeFog * 0.16), 0.0, 0.0, 1.0);
  }
`;

const compositeFragment = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tFog;
  uniform sampler2D tDepth;
  uniform vec3 uFogColor;
  uniform float uAmount;
  uniform vec2 uTexel;
  varying vec2 vUv;

  void main() {
    vec3 scene = texture2D(tDiffuse, vUv).rgb;
    float fog = 0.0;
    float wsum = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        float spatialW = (x == 0 && y == 0) ? 4.0 : (x == 0 || y == 0) ? 2.0 : 1.0;
        fog += texture2D(tFog, vUv + vec2(float(x), float(y)) * uTexel).r * spatialW;
        wsum += spatialW;
      }
    }
    fog = (fog / max(wsum, 0.0001)) * uAmount;
    vec3 color = mix(scene, uFogColor, clamp(fog, 0.0, 0.58));
    gl_FragColor = vec4(color, 1.0);
  }
`;

export class VolumetricFogPass extends Pass {
  constructor(camera, { getDepthTexture } = {}) {
    super();
    this.camera = camera;
    this.getDepthTexture = getDepthTexture;
    this.resolutionScale = 0.6;
    this.needsSwap = true;
    this.noiseTexture = createNoise3DTexture(64);

    const steps = isMobile() ? 8 : 12;
    this.marchUniforms = {
      tDepth: { value: null },
      tNoise: { value: this.noiseTexture },
      uProjectionMatrixInverse: { value: new THREE.Matrix4() },
      uCameraWorldMatrix: { value: new THREE.Matrix4() },
      uCameraPosition: { value: new THREE.Vector3() },
      uCameraNear: { value: camera.near },
      uCameraFar: { value: camera.far },
      uTime: { value: 0 },
      uSteps: { value: steps },
      uFogDensity: { value: 0.4 },
      uHeightFalloff: { value: 1.55 },
      uFogHeight: { value: 5.8 },
      uCloudScale: { value: 0.021 },
      uCloudThreshold: { value: 0.64 },
      uMaxRayDist: { value: 42 },
      uCloudSpeed: { value: 0.04 },
      uRangeFogNear: { value: 38 },
      uRangeFogFar: { value: 95 },
      uGroundY: { value: GROUND.y },
    };

    this.compositeUniforms = {
      tDiffuse: { value: null },
      tFog: { value: null },
      tDepth: { value: null },
      uFogColor: { value: new THREE.Color(0.38, 0.4, 0.46) },
      uAmount: { value: 0 },
      uTexel: { value: new THREE.Vector2(1, 1) },
    };

    this.marchMaterial = new THREE.ShaderMaterial({
      uniforms: this.marchUniforms,
      vertexShader: marchVertex,
      fragmentShader: marchFragment,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: this.compositeUniforms,
      vertexShader: marchVertex,
      fragmentShader: compositeFragment,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    this.fogTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    this.fogTarget.texture.generateMipmaps = false;
    this.fsQuad = new FullScreenQuad(this.marchMaterial);
  }

  setAmount(value) {
    this.compositeUniforms.uAmount.value = value;
    this.enabled = value > 0.001;
  }

  getAmount() {
    return this.compositeUniforms.uAmount.value;
  }

  setFogColor(r, g, b) {
    this.compositeUniforms.uFogColor.value.setRGB(r, g, b);
  }

  setSize(width, height) {
    const w = Math.max(1, Math.round(width * this.resolutionScale));
    const h = Math.max(1, Math.round(height * this.resolutionScale));
    this.fogTarget.setSize(w, h);
    this.compositeUniforms.uTexel.value.set(1 / w, 1 / h);
  }

  render(renderer, writeBuffer, readBuffer) {
    const depth = this.getDepthTexture?.() ?? null;
    if (!depth || this.compositeUniforms.uAmount.value < 0.001) {
      this.compositeUniforms.tDiffuse.value = readBuffer.texture;
      this.compositeUniforms.tFog.value = this.fogTarget.texture;
      this.compositeUniforms.tDepth.value = depth;
      this.fsQuad.material = this.compositeMaterial;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      this.fsQuad.render(renderer);
      return;
    }

    this.camera.updateMatrixWorld();
    this.marchUniforms.tDepth.value = depth;
    this.marchUniforms.uProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse);
    this.marchUniforms.uCameraWorldMatrix.value.copy(this.camera.matrixWorld);
    this.marchUniforms.uCameraPosition.value.setFromMatrixPosition(this.camera.matrixWorld);
    this.marchUniforms.uCameraNear.value = this.camera.near;
    this.marchUniforms.uCameraFar.value = this.camera.far;

    this.fsQuad.material = this.marchMaterial;
    renderer.setRenderTarget(this.fogTarget);
    this.fsQuad.render(renderer);

    this.compositeUniforms.tDiffuse.value = readBuffer.texture;
    this.compositeUniforms.tFog.value = this.fogTarget.texture;
    this.compositeUniforms.tDepth.value = depth;
    this.fsQuad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.fogTarget.dispose();
    this.marchMaterial.dispose();
    this.compositeMaterial.dispose();
    this.noiseTexture.dispose();
    this.fsQuad.dispose();
  }
}
