import * as THREE from "three";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { LAYERS } from "../core/layers.js";

const BLOOM_SCALE = 0.58;
const EMISSIVE_CLAMP = 12;
const BLOOM_COMPRESS = 0.32;
const BLOOM_THRESHOLD = 0.06;
const BLOOM_FACTORS = [1.0, 0.8, 0.55, 0.32, 0.16];

const INTERIOR_NAMES = new Set(["window", "old window", "light", "room", "Meshpart26Mtl"]);
const NEON_NAME = /neon|sign|text\d|billboard|truck lights|streetlight|pic stop|material\.003|material\.009/i;
const NEON_MESHPART = /^Meshpart(8|11|13|14|16|17|22)/i;

function isBloomSource(material) {
  if (!material) return false;
  const name = material.name ?? "";
  if (INTERIOR_NAMES.has(name) || /window|room/i.test(name)) return false;
  const intensity = material.emissiveIntensity ?? 0;
  const hex = material.emissive?.getHex?.() ?? 0;
  const glowing = (hex > 0 && intensity > 0) || !!material.emissiveMap;
  if (!glowing) return false;
  if (material.emissiveMap) return true;
  return NEON_NAME.test(name) || NEON_MESHPART.test(name);
}

function snapshotMaterial(material) {
  return {
    color: material.color?.clone?.() ?? null,
    map: material.map ?? null,
    envMapIntensity: material.envMapIntensity,
    metalness: material.metalness,
    lightMap: material.lightMap ?? null,
    lightMapIntensity: material.lightMapIntensity,
    clearcoat: material.clearcoat,
    sheen: material.sheen,
    emissive: material.emissive?.clone?.() ?? null,
    emissiveIntensity: material.emissiveIntensity,
    emissiveMap: material.emissiveMap ?? null,
    alphaMap: material.alphaMap ?? null,
    colorWrite: material.colorWrite,
    depthWrite: material.depthWrite,
    depthTest: material.depthTest,
    transparent: material.transparent,
    opacity: material.opacity,
    blending: material.blending,
    alphaTest: material.alphaTest,
    transmission: material.transmission,
  };
}

function prepareEmissiveMaterial(material, glow) {
  if (material.color) material.color.setScalar(0);
  if ("map" in material) material.map = null;
  if ("envMapIntensity" in material) material.envMapIntensity = 0;
  if ("metalness" in material) material.metalness = 0;
  if ("lightMap" in material) material.lightMap = null;
  if ("clearcoat" in material) material.clearcoat = 0;
  if ("sheen" in material) material.sheen = 0;
  if ("alphaMap" in material) material.alphaMap = null;
  if ("transmission" in material) material.transmission = 0;
  material.transparent = false;
  material.opacity = 1;
  material.alphaTest = 0;
  material.depthTest = true;
  material.depthWrite = true;
  material.colorWrite = true;
  material.blending = THREE.NoBlending;
  if (glow) {
    if ((material.emissiveIntensity ?? 0) > EMISSIVE_CLAMP) material.emissiveIntensity = EMISSIVE_CLAMP;
  } else {
    if (material.emissive) material.emissive.setScalar(0);
    if ("emissiveIntensity" in material) material.emissiveIntensity = 0;
    if ("emissiveMap" in material) material.emissiveMap = null;
  }
  material.needsUpdate = true;
}

function restoreMaterial(material, snap) {
  if (snap.color && material.color) material.color.copy(snap.color);
  if ("map" in material) material.map = snap.map;
  if ("envMapIntensity" in material && snap.envMapIntensity != null) material.envMapIntensity = snap.envMapIntensity;
  if ("metalness" in material && snap.metalness != null) material.metalness = snap.metalness;
  if ("lightMap" in material) material.lightMap = snap.lightMap;
  if ("lightMapIntensity" in material && snap.lightMapIntensity != null) {
    material.lightMapIntensity = snap.lightMapIntensity;
  }
  if ("clearcoat" in material && snap.clearcoat != null) material.clearcoat = snap.clearcoat;
  if ("sheen" in material && snap.sheen != null) material.sheen = snap.sheen;
  if (snap.emissive && material.emissive) material.emissive.copy(snap.emissive);
  if ("emissiveIntensity" in material && snap.emissiveIntensity != null) {
    material.emissiveIntensity = snap.emissiveIntensity;
  }
  if ("emissiveMap" in material) material.emissiveMap = snap.emissiveMap;
  if ("alphaMap" in material) material.alphaMap = snap.alphaMap;
  if (snap.colorWrite != null) material.colorWrite = snap.colorWrite;
  if (snap.depthWrite != null) material.depthWrite = snap.depthWrite;
  if (snap.depthTest != null) material.depthTest = snap.depthTest;
  if (snap.transparent != null) material.transparent = snap.transparent;
  if (snap.opacity != null) material.opacity = snap.opacity;
  if (snap.blending != null) material.blending = snap.blending;
  if (snap.alphaTest != null) material.alphaTest = snap.alphaTest;
  if ("transmission" in material && snap.transmission != null) material.transmission = snap.transmission;
  material.needsUpdate = true;
}

export class DualBloomPass extends UnrealBloomPass {
  constructor(resolution, scene, camera) {
    super(resolution, 2.5, 0.45, 0);
    this.scene = scene;
    this.camera = camera;
    this.tightStrength = 0.85;
    this.tightRadius = 0.55;
    this.wideStrength = 0;
    this.wideRadius = 0;
    this.extractThreshold = BLOOM_THRESHOLD;
    this.highPassUniforms.smoothWidth.value = 0.12;

    this.emissiveTarget = new THREE.WebGLRenderTarget(resolution.x, resolution.y, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
    });
    this.emissiveTarget.texture.name = "DualBloom.emissive";
    this.emissiveTarget.texture.generateMipmaps = false;

    const previous = this.compositeMaterial;
    this.compositeMaterial = this._getLegacyCompositeMaterial(this.nMips);
    this.compositeMaterial.uniforms.blurTexture1.value = this.renderTargetsVertical[0].texture;
    this.compositeMaterial.uniforms.blurTexture2.value = this.renderTargetsVertical[1].texture;
    this.compositeMaterial.uniforms.blurTexture3.value = this.renderTargetsVertical[2].texture;
    this.compositeMaterial.uniforms.blurTexture4.value = this.renderTargetsVertical[3].texture;
    this.compositeMaterial.uniforms.blurTexture5.value = this.renderTargetsVertical[4].texture;
    this.compositeMaterial.uniforms.bloomFactors.value = BLOOM_FACTORS;
    this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors;
    previous.dispose();
  }

  applyLook(preset) {
    const bloom = preset?.bloom ?? {};
    const wide = preset?.bloomWide ?? {};
    this.tightStrength = bloom.strength ?? 0;
    this.tightRadius = bloom.radius ?? 0;
    this.wideStrength = wide.strength ?? 0;
    this.wideRadius = wide.radius ?? 0;
    this.strength = (this.tightStrength + this.wideStrength * 0.35) * BLOOM_SCALE;
    this.radius = Math.max(this.tightRadius, this.wideRadius * 0.55);
    this.threshold = this.extractThreshold;
    this.enabled = this.strength > 0.001;
  }

  setSize(width, height) {
    super.setSize(width, height);
    this.emissiveTarget.setSize(Math.max(1, width), Math.max(1, height));
  }

  dispose() {
    this.emissiveTarget.dispose();
    super.dispose();
  }

  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    this.strength = (this.tightStrength + this.wideStrength * 0.35) * BLOOM_SCALE;
    this.radius = Math.max(this.tightRadius, this.wideRadius * 0.55);
    this.threshold = this.extractThreshold;
    this.enabled = this.strength > 0.001;
    this._renderEmissive(renderer);
    this._renderBloom(renderer, writeBuffer, readBuffer, maskActive);
  }

  _renderEmissive(renderer) {
    const scene = this.scene;
    const camera = this.camera;
    if (!scene || !camera) return;

    const prepared = [];
    const seen = new Set();
    const orders = [];
    const hiddenLights = [];
    scene.traverse((object) => {
      if (object.isLight && object.userData.bloomIgnore) {
        hiddenLights.push({ object, visible: object.visible });
        object.visible = false;
        return;
      }
      if (!object.isMesh || !object.visible) return;
      const list = Array.isArray(object.material) ? object.material : [object.material];
      let glow = false;
      for (const material of list) {
        if (!material || seen.has(material)) {
          if (material && isBloomSource(material)) glow = true;
          continue;
        }
        seen.add(material);
        const source = isBloomSource(material);
        glow = glow || source;
        prepared.push({ material, snap: snapshotMaterial(material) });
        prepareEmissiveMaterial(material, source);
      }
      orders.push({ object, renderOrder: object.renderOrder });
      object.renderOrder = glow ? 8 : -8;
    });

    const prevAutoClear = renderer.autoClear;
    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    const fxOn = camera.layers.isEnabled(LAYERS.fx);
    const smokeOn = camera.layers.isEnabled(LAYERS.smoke);

    renderer.autoClear = true;
    renderer.shadowMap.autoUpdate = false;
    camera.layers.disable(LAYERS.fx);
    camera.layers.disable(LAYERS.smoke);
    renderer.setRenderTarget(this.emissiveTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);

    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;
    renderer.shadowMap.autoUpdate = prevShadow;
    if (fxOn) camera.layers.enable(LAYERS.fx);
    if (smokeOn) camera.layers.enable(LAYERS.smoke);
    for (const { material, snap } of prepared) restoreMaterial(material, snap);
    for (const { object, renderOrder } of orders) object.renderOrder = renderOrder;
    for (const { object, visible } of hiddenLights) object.visible = visible;
  }

  _renderBloom(renderer, writeBuffer, readBuffer, maskActive) {
    renderer.getClearColor(this._oldClearColor);
    this._oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setClearColor(this.clearColor, 0);
    if (maskActive) renderer.state.buffers.stencil.setTest(false);

    this.highPassUniforms.tDiffuse.value = this.emissiveTarget.texture;
    this.highPassUniforms.luminosityThreshold.value = this.threshold;
    this._fsQuad.material = this.materialHighPassFilter;
    renderer.setRenderTarget(this.renderTargetBright);
    renderer.clear();
    this._fsQuad.render(renderer);

    let inputRenderTarget = this.renderTargetBright;
    for (let i = 0; i < this.nMips; i += 1) {
      this._fsQuad.material = this.separableBlurMaterials[i];
      this.separableBlurMaterials[i].uniforms.colorTexture.value = inputRenderTarget.texture;
      this.separableBlurMaterials[i].uniforms.direction.value = UnrealBloomPass.BlurDirectionX;
      renderer.setRenderTarget(this.renderTargetsHorizontal[i]);
      renderer.clear();
      this._fsQuad.render(renderer);

      this.separableBlurMaterials[i].uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture;
      this.separableBlurMaterials[i].uniforms.direction.value = UnrealBloomPass.BlurDirectionY;
      renderer.setRenderTarget(this.renderTargetsVertical[i]);
      renderer.clear();
      this._fsQuad.render(renderer);
      inputRenderTarget = this.renderTargetsVertical[i];
    }

    this._fsQuad.material = this.compositeMaterial;
    this.compositeMaterial.uniforms.bloomStrength.value = this.strength;
    this.compositeMaterial.uniforms.bloomRadius.value = this.radius;
    this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors;
    renderer.setRenderTarget(this.renderTargetsHorizontal[0]);
    renderer.clear();
    this._fsQuad.render(renderer);

    this._fsQuad.material = this.blendMaterial;
    this.copyUniforms.tDiffuse.value = this.renderTargetsHorizontal[0].texture;
    if (maskActive) renderer.state.buffers.stencil.setTest(true);
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this._fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(readBuffer);
      this._fsQuad.render(renderer);
    }

    renderer.setClearColor(this._oldClearColor, this._oldClearAlpha);
    renderer.autoClear = oldAutoClear;
  }

  _getLegacyCompositeMaterial(nMips) {
    return new THREE.ShaderMaterial({
      defines: { NUM_MIPS: nMips },
      uniforms: {
        blurTexture1: { value: null },
        blurTexture2: { value: null },
        blurTexture3: { value: null },
        blurTexture4: { value: null },
        blurTexture5: { value: null },
        bloomStrength: { value: 1 },
        bloomRadius: { value: 0 },
        bloomFactors: { value: null },
        bloomTintColors: { value: null },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D blurTexture1;
        uniform sampler2D blurTexture2;
        uniform sampler2D blurTexture3;
        uniform sampler2D blurTexture4;
        uniform sampler2D blurTexture5;
        uniform float bloomStrength;
        uniform float bloomRadius;
        uniform float bloomFactors[NUM_MIPS];
        uniform vec3 bloomTintColors[NUM_MIPS];

        float lerpBloomFactor(const in float factor) {
          float mirrorFactor = 1.2 - factor;
          return mix(factor, mirrorFactor, bloomRadius);
        }

        void main() {
          vec3 bloom = bloomStrength * (
            lerpBloomFactor(bloomFactors[0]) * bloomTintColors[0] * texture2D(blurTexture1, vUv).rgb +
            lerpBloomFactor(bloomFactors[1]) * bloomTintColors[1] * texture2D(blurTexture2, vUv).rgb +
            lerpBloomFactor(bloomFactors[2]) * bloomTintColors[2] * texture2D(blurTexture3, vUv).rgb +
            lerpBloomFactor(bloomFactors[3]) * bloomTintColors[3] * texture2D(blurTexture4, vUv).rgb +
            lerpBloomFactor(bloomFactors[4]) * bloomTintColors[4] * texture2D(blurTexture5, vUv).rgb
          );
          float peak = max(bloom.r, max(bloom.g, bloom.b));
          bloom *= 1.0 / (1.0 + peak * ${BLOOM_COMPRESS.toFixed(2)});
          float bloomAlpha = max(bloom.r, max(bloom.g, bloom.b));
          gl_FragColor = vec4(bloom, bloomAlpha);
        }
      `,
    });
  }
}

export function bloomFromPreset(preset) {
  const bloom = preset?.bloom ?? {};
  const wide = preset?.bloomWide ?? {};
  return {
    tightStrength: bloom.strength ?? 0,
    tightRadius: bloom.radius ?? 0,
    wideStrength: wide.strength ?? 0,
    wideRadius: wide.radius ?? 0,
    strength: ((bloom.strength ?? 0) + (wide.strength ?? 0) * 0.35) * BLOOM_SCALE,
    radius: Math.max(bloom.radius ?? 0, (wide.radius ?? 0) * 0.55),
  };
}
