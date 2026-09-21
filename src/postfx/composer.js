import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { PERF } from "../config.js";
import { LAYERS } from "../core/layers.js";
import { DEFAULT_LOOK_ID, LOOK_PRESETS } from "../look/presets.js";
import { LensflareShader } from "./lensflare.js";
import { RainGlassShader } from "./rainGlass.js";
import { DualBloomPass } from "./dualBloom.js";
import { VolumetricFogPass } from "./volumetricFog.js";

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uTint: { value: new THREE.Vector3() },
    uOffset: { value: new THREE.Vector3() },
    uSaturation: { value: 1 },
    uContrast: { value: 1 },
    uGreenSuppress: { value: 1 },
    uGradeMix: { value: 0 },
    uChromatic: { value: 0 },
    uChromaticFalloff: { value: 3 },
    uVignette: { value: 0 },
    uVignetteSmooth: { value: 0.65 },
    uGrain: { value: 0 },
    uFogColor: { value: new THREE.Color() },
    uFogAmount: { value: 0.8 },
    uFogEnabled: { value: 0.35 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec3 uTint;
    uniform vec3 uOffset;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uGreenSuppress;
    uniform float uGradeMix;
    uniform float uChromatic;
    uniform float uChromaticFalloff;
    uniform float uVignette;
    uniform float uVignetteSmooth;
    uniform float uGrain;
    uniform vec3 uFogColor;
    uniform float uFogAmount;
    uniform float uFogEnabled;
    varying vec2 vUv;

    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

    void main() {
      vec2 uv = vUv;
      vec2 fromCenter = uv - 0.5;
      float dist = length(fromCenter);
      float edge = 1.0 - 1.0 / (1.0 + pow(dist * uChromaticFalloff, 2.0));
      float aberration = uChromatic * edge;
      vec2 dir = fromCenter;
      float r = texture2D(tDiffuse, 0.5 + dir * (1.0 + aberration * 0.015)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, 0.5 + dir * (1.0 - aberration * 0.015)).b;
      vec3 color = vec3(r, g, b);

      float lum = luma(color);
      vec3 sat = mix(vec3(lum), color, uSaturation);
      sat.g = mix(sat.g, lum, 1.0 - uGreenSuppress);
      sat = (sat - 0.5) * uContrast + 0.5;
      vec3 graded = sat * uTint + uOffset;
      color = mix(color, graded, uGradeMix);
      color = mix(color, uFogColor, dist * uFogAmount * uFogEnabled);

      float vig = smoothstep(uVignetteSmooth, 1.2, dist * (0.65 + uVignette));
      color *= mix(1.0, 1.0 - uVignette * 0.85, vig);

      float grain = fract(sin(dot(uv + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      color += color * grain * uGrain;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export function createComposer(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const aoWidth = Math.max(1, Math.round(size.x * (PERF.aoResolutionScale ?? 0.5)));
  const aoHeight = Math.max(1, Math.round(size.y * (PERF.aoResolutionScale ?? 0.5)));
  const ao = new GTAOPass(scene, camera, aoWidth, aoHeight);
  ao.output = GTAOPass.OUTPUT.Default;
  ao.blendIntensity = 0.75;
  ao.pdSamples = 8;
  ao.updateGtaoMaterial({
    radius: PERF.aoRadius ?? 0.4,
    samples: PERF.aoSamples ?? 6,
    scale: PERF.aoScale ?? 1.7,
    thickness: PERF.aoThickness ?? 1,
    distanceExponent: PERF.aoDistanceExponent ?? 1,
    distanceFallOff: PERF.aoDistanceFallOff ?? 1,
  });
  const aoRender = ao.render.bind(ao);
  ao.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
    camera.layers.disable(LAYERS.fx);
    camera.layers.disable(LAYERS.smoke);
    aoRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    camera.layers.enable(LAYERS.fx);
    camera.layers.enable(LAYERS.smoke);
  };
  composer.addPass(ao);

  const bloom = new DualBloomPass(new THREE.Vector2(size.x, size.y), scene, camera);
  composer.addPass(bloom);

  const flare = new ShaderPass(LensflareShader);
  flare.enabled = false;
  composer.addPass(flare);

  const volumetricFog = new VolumetricFogPass(camera, {
    getDepthTexture: () => ao.depthTexture,
  });
  volumetricFog.setSize(Math.max(1, size.x), Math.max(1, size.y));
  volumetricFog.setAmount(0);
  composer.addPass(volumetricFog);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  const smaa = new SMAAPass();
  composer.addPass(smaa);

  const rainGlass = new ShaderPass(RainGlassShader);
  rainGlass.enabled = true;
  rainGlass.material.toneMapped = false;
  rainGlass.material.depthTest = false;
  rainGlass.material.depthWrite = false;
  rainGlass.uniforms.uResolution.value.set(Math.max(1, size.x), Math.max(1, size.y));
  composer.addPass(rainGlass);

  let currentId = DEFAULT_LOOK_ID;
  let lensflareEnabled = false;

  function applyLook(id) {
    const preset = LOOK_PRESETS[id];
    if (!preset) return currentId;
    currentId = id;
    bloom.applyLook(preset);
    if (lensflareEnabled) flare.uniforms.uStrength.value = preset.lensflare.strength;
    flare.uniforms.uThreshold.value = preset.lensflare.threshold;
    flare.uniforms.uGhostSpacing.value = preset.lensflare.ghostSpacing;
    flare.uniforms.uGhostAttenuation.value = preset.lensflare.ghostAttenuation;
    const look = preset.uniforms;
    grade.uniforms.uTint.value.set(...look.gradeTint);
    grade.uniforms.uOffset.value.set(...look.gradeOffset);
    grade.uniforms.uSaturation.value = look.saturation;
    grade.uniforms.uContrast.value = look.contrast;
    grade.uniforms.uGreenSuppress.value = look.greenSuppress;
    grade.uniforms.uGradeMix.value = look.gradeMix;
    grade.uniforms.uChromatic.value = look.chromaticStrength;
    grade.uniforms.uChromaticFalloff.value = look.chromaticEdgeFalloff;
    grade.uniforms.uVignette.value = look.vignetteIntensity;
    grade.uniforms.uVignetteSmooth.value = look.vignetteSmoothness;
    grade.uniforms.uGrain.value = look.grainIntensity;
    grade.uniforms.uFogColor.value.setRGB(...look.fogColorSrgb);
    grade.uniforms.uFogAmount.value = look.fogAmount;
    grade.uniforms.uFogEnabled.value = look.fogEnabled;
    volumetricFog.setFogColor(...look.fogColorSrgb);
    return currentId;
  }

  function setIntroPresentation(active) {
    applyLook(currentId);
    volumetricFog.setAmount(1);
    if (!active) return currentId;
    const look = LOOK_PRESETS[currentId]?.uniforms;
    grade.uniforms.uChromatic.value = (look?.chromaticStrength ?? 0) * 0.18;
    grade.uniforms.uFogEnabled.value = Math.max(look?.fogEnabled ?? 0.35, 0.55);
    bloom.tightStrength *= 0.55;
    bloom.wideStrength *= 0.4;
    return currentId;
  }

  applyLook(DEFAULT_LOOK_ID);

  function syncAoSize() {
    const drawing = renderer.getDrawingBufferSize(new THREE.Vector2());
    const scale = PERF.aoResolutionScale ?? 0.5;
    ao.setSize(
      Math.max(1, Math.round(drawing.x * scale)),
      Math.max(1, Math.round(drawing.y * scale)),
    );
  }

  syncAoSize();

  function applyAo() {
    ao.updateGtaoMaterial({
      radius: PERF.aoRadius ?? 0.4,
      samples: PERF.aoSamples ?? 6,
      scale: PERF.aoScale ?? 1.7,
      thickness: PERF.aoThickness ?? 1,
      distanceExponent: PERF.aoDistanceExponent ?? 1,
      distanceFallOff: PERF.aoDistanceFallOff ?? 1,
    });
  }

  return {
    composer,
    bloom,
    grade,
    flare,
    ao,
    smaa,
    volumetricFog: {
      setAmount(value) {
        volumetricFog.setAmount(value);
      },
      getAmount() {
        return volumetricFog.getAmount();
      },
      setFogColor(r, g, b) {
        volumetricFog.setFogColor(r, g, b);
      },
      marchUniforms: volumetricFog.marchUniforms,
      compositeUniforms: volumetricFog.compositeUniforms,
      pass: volumetricFog,
    },
    getLookId: () => currentId,
    applyLook,
    applyAo,
    setIntroPresentation,
    rainGlass: {
      uniforms: rainGlass.uniforms,
      setAmount(value) {
        rainGlass.uniforms.uAmount.value = value;
        rainGlass.enabled = value > 0.001;
      },
      getAmount() {
        return rainGlass.uniforms.uAmount.value;
      },
      setActive(active) {
        rainGlass.enabled = !!active && rainGlass.uniforms.uAmount.value > 0.001;
      },
      dispose() {
        rainGlass.uniforms.uAmount.value = 0;
        rainGlass.enabled = false;
      },
    },
    setLensflareEnabled(enabled) {
      lensflareEnabled = !!enabled;
      flare.enabled = lensflareEnabled;
      if (lensflareEnabled && flare.uniforms.uStrength.value < 0.001) {
        const preset = LOOK_PRESETS[currentId];
        flare.uniforms.uStrength.value = preset?.lensflare.strength || 0.35;
      }
    },
    setSize(width, height) {
      composer.setSize(width, height);
      rainGlass.uniforms.uResolution.value.set(
        Math.max(1, renderer.domElement.width),
        Math.max(1, renderer.domElement.height),
      );
      const drawing = renderer.getDrawingBufferSize(new THREE.Vector2());
      volumetricFog.setSize(drawing.x, drawing.y);
      syncAoSize();
    },
    render(elapsed) {
      grade.uniforms.uTime.value = elapsed;
      rainGlass.uniforms.uTime.value = elapsed;
      volumetricFog.marchUniforms.uTime.value = elapsed;
      composer.render();
    },
  };
}
