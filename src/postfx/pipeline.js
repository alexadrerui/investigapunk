import * as THREE from "three";
import {
  float,
  mix,
  mrt,
  output,
  pass,
  uniform,
  vec3,
  vec4,
} from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { smaa } from "three/addons/tsl/display/SMAANode.js";
import { PERF } from "../config.js";
import { DEFAULT_LOOK_ID, LOOK_PRESETS } from "../look/presets.js";
import { applyGrade, createGradeUniforms } from "./gradeTsl.js";
import { applyLensflare } from "./lensflareTsl.js";
import { createRainGlass } from "./rainGlassTsl.js";
import { createVolumetricFog } from "./volumetricFogTsl.js";

const BLOOM_SCALE = 0.38;
const BLOOM_THRESHOLD = 0.16;

export function createComposer(renderer, scene, camera) {
  const pipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({
    output,
    bloom: vec3(0),
  }));

  const sceneColor = scenePass.getTextureNode("output");
  const bloomBuffer = scenePass.getTextureNode("bloom");
  const depthBuffer = scenePass.getTextureNode("depth");

  const bloomState = {
    enabled: true,
    tightStrength: 0.85,
    tightRadius: 0.55,
    wideStrength: 2.2,
    wideRadius: 0.85,
    extractThreshold: BLOOM_THRESHOLD,
  };

  const tightBloom = bloom(bloomBuffer, 0.85 * BLOOM_SCALE, 0.55, BLOOM_THRESHOLD);
  const wideBloom = bloom(bloomBuffer, 2.2 * BLOOM_SCALE * 0.35, Math.min(1, 0.85 * 0.55), BLOOM_THRESHOLD);
  tightBloom.smoothWidth.value = 0.12;
  wideBloom.smoothWidth.value = 0.12;

  function syncBloom() {
    const on = bloomState.enabled;
    tightBloom.strength.value = on ? bloomState.tightStrength * BLOOM_SCALE : 0;
    tightBloom.radius.value = THREE.MathUtils.clamp(bloomState.tightRadius, 0, 1);
    wideBloom.strength.value = on ? bloomState.wideStrength * BLOOM_SCALE * 0.35 : 0;
    wideBloom.radius.value = THREE.MathUtils.clamp(bloomState.wideRadius * 0.55, 0, 1);
    tightBloom.threshold.value = bloomState.extractThreshold;
    wideBloom.threshold.value = bloomState.extractThreshold;
  }

  const aoPass = ao(depthBuffer, null, camera);
  aoPass.resolutionScale = PERF.aoResolutionScale ?? 0.5;
  aoPass.radius.value = PERF.aoRadius ?? 0.4;
  aoPass.samples.value = PERF.aoSamples ?? 6;
  aoPass.scale.value = PERF.aoScale ?? 1.7;
  aoPass.thickness.value = PERF.aoThickness ?? 1;
  const uAoBlend = uniform(0.75);
  const uAoEnabled = uniform(1);

  const aoState = {
    get enabled() {
      return uAoEnabled.value > 0.5;
    },
    set enabled(value) {
      uAoEnabled.value = value ? 1 : 0;
    },
    get blendIntensity() {
      return uAoBlend.value;
    },
    set blendIntensity(value) {
      uAoBlend.value = value;
    },
  };

  const uFlareEnabled = uniform(0);
  const uFlareStrength = uniform(0.35);
  const uFlareThreshold = uniform(0.9);
  const uFlareSpacing = uniform(0.22);
  const uFlareAttenuation = uniform(50);

  const aoFactor = mix(float(1), aoPass.getTextureNode().r, uAoBlend.mul(uAoEnabled));
  const beauty = sceneColor.rgb.mul(aoFactor);
  const bloomRgb = tightBloom.rgb.add(wideBloom.rgb);
  const flaredBloom = applyLensflare(vec4(bloomRgb, 1), {
    uEnabled: uFlareEnabled,
    uStrength: uFlareStrength,
    uThreshold: uFlareThreshold,
    uGhostSpacing: uFlareSpacing,
    uGhostAttenuation: uFlareAttenuation,
  });

  const volumetricFog = createVolumetricFog(vec4(beauty, 1), depthBuffer);
  const gradeUniforms = createGradeUniforms();
  const viewZ = scenePass.getViewZNode();
  const linearDepth = scenePass.getLinearDepthNode();
  const graded = applyGrade(volumetricFog.node, gradeUniforms, {
    viewZ,
    linearDepth,
    bloomNode: flaredBloom,
  });
  const uSmaaEnabled = uniform(1);
  const antiAliased = mix(graded, smaa(graded), uSmaaEnabled);
  const rainGlass = createRainGlass(antiAliased);

  function syncRainOutput() {
    const next = rainGlass.uniforms.uAmount.value > 0.001 ? rainGlass.node : antiAliased;
    if (pipeline.outputNode !== next) {
      pipeline.outputNode = next;
      pipeline.needsUpdate = true;
    }
  }

  pipeline.outputNode = rainGlass.node;

  let currentId = DEFAULT_LOOK_ID;
  let lensflareEnabled = false;

  function applyLook(id) {
    const preset = LOOK_PRESETS[id];
    if (!preset) return currentId;
    currentId = id;
    bloomState.tightStrength = preset.bloom?.strength ?? 0;
    bloomState.tightRadius = preset.bloom?.radius ?? 0;
    bloomState.wideStrength = preset.bloomWide?.strength ?? 0;
    bloomState.wideRadius = preset.bloomWide?.radius ?? 0;
    syncBloom();
    if (lensflareEnabled) uFlareStrength.value = preset.lensflare.strength;
    uFlareThreshold.value = preset.lensflare.threshold;
    uFlareSpacing.value = preset.lensflare.ghostSpacing;
    uFlareAttenuation.value = preset.lensflare.ghostAttenuation;
    const look = preset.uniforms;
    gradeUniforms.uTint.value.set(...look.gradeTint);
    gradeUniforms.uOffset.value.set(...look.gradeOffset);
    gradeUniforms.uSaturation.value = look.saturation;
    gradeUniforms.uContrast.value = look.contrast;
    gradeUniforms.uGreenSuppress.value = look.greenSuppress;
    gradeUniforms.uGradeMix.value = look.gradeMix;
    gradeUniforms.uChromatic.value = look.chromaticStrength;
    gradeUniforms.uChromaticFalloff.value = look.chromaticEdgeFalloff;
    gradeUniforms.uVignette.value = look.vignetteIntensity;
    gradeUniforms.uVignetteSmooth.value = look.vignetteSmoothness;
    gradeUniforms.uGrain.value = look.grainIntensity;
    gradeUniforms.uFogColor.value.setRGB(...look.fogColorSrgb);
    gradeUniforms.uFogAmount.value = look.fogAmount;
    gradeUniforms.uFogEnabled.value = look.fogEnabled;
    gradeUniforms.uFogNear.value = look.fogNear;
    gradeUniforms.uFogFar.value = look.fogFar;
    volumetricFog.setFogColor(...look.fogColorSrgb);
    return currentId;
  }

  function setIntroPresentation(active) {
    applyLook(currentId);
    volumetricFog.setAmount(1);
    if (!active) return currentId;
    const look = LOOK_PRESETS[currentId]?.uniforms;
    gradeUniforms.uChromatic.value = (look?.chromaticStrength ?? 0) * 0.18;
    gradeUniforms.uFogEnabled.value = Math.max(look?.fogEnabled ?? 0.35, 0.55);
    bloomState.tightStrength *= 0.55;
    bloomState.wideStrength *= 0.4;
    syncBloom();
    return currentId;
  }

  function applyAo() {
    aoPass.radius.value = PERF.aoRadius ?? 0.4;
    aoPass.samples.value = PERF.aoSamples ?? 6;
    aoPass.scale.value = PERF.aoScale ?? 1.7;
    aoPass.thickness.value = PERF.aoThickness ?? 1;
  }

  applyLook(DEFAULT_LOOK_ID);

  const bloomApi = {
    get enabled() {
      return bloomState.enabled;
    },
    set enabled(value) {
      bloomState.enabled = !!value;
      syncBloom();
    },
    get tightStrength() {
      return bloomState.tightStrength;
    },
    set tightStrength(value) {
      bloomState.tightStrength = value;
      syncBloom();
    },
    get tightRadius() {
      return bloomState.tightRadius;
    },
    set tightRadius(value) {
      bloomState.tightRadius = value;
      syncBloom();
    },
    get wideStrength() {
      return bloomState.wideStrength;
    },
    set wideStrength(value) {
      bloomState.wideStrength = value;
      syncBloom();
    },
    get wideRadius() {
      return bloomState.wideRadius;
    },
    set wideRadius(value) {
      bloomState.wideRadius = value;
      syncBloom();
    },
    get extractThreshold() {
      return bloomState.extractThreshold;
    },
    set extractThreshold(value) {
      bloomState.extractThreshold = value;
      syncBloom();
    },
  };

  return {
    composer: pipeline,
    bloom: bloomApi,
    grade: { uniforms: gradeUniforms },
    flare: {
      get enabled() {
        return lensflareEnabled;
      },
      set enabled(value) {
        lensflareEnabled = !!value;
        uFlareEnabled.value = lensflareEnabled ? 1 : 0;
      },
      uniforms: {
        uStrength: uFlareStrength,
        uThreshold: uFlareThreshold,
        uGhostSpacing: uFlareSpacing,
        uGhostAttenuation: uFlareAttenuation,
      },
    },
    ao: aoState,
    smaa: {
      get enabled() {
        return uSmaaEnabled.value > 0.5;
      },
      set enabled(value) {
        uSmaaEnabled.value = value ? 1 : 0;
      },
    },
    volumetricFog: {
      setAmount: volumetricFog.setAmount,
      getAmount: volumetricFog.getAmount,
      setFogColor: volumetricFog.setFogColor,
      marchUniforms: volumetricFog.marchUniforms,
      compositeUniforms: volumetricFog.compositeUniforms,
    },
    smoke: volumetricFog.smoke,
    getLookId: () => currentId,
    applyLook,
    applyAo,
    setIntroPresentation,
    rainGlass: {
      uniforms: rainGlass.uniforms,
      setAmount(value) {
        rainGlass.uniforms.uAmount.value = value;
        syncRainOutput();
      },
      getAmount() {
        return rainGlass.uniforms.uAmount.value;
      },
      setActive() {
        syncRainOutput();
      },
      dispose() {
        rainGlass.uniforms.uAmount.value = 0;
        syncRainOutput();
      },
    },
    setLensflareEnabled(enabled) {
      lensflareEnabled = !!enabled;
      uFlareEnabled.value = lensflareEnabled ? 1 : 0;
      if (lensflareEnabled && uFlareStrength.value < 0.001) {
        const preset = LOOK_PRESETS[currentId];
        uFlareStrength.value = preset?.lensflare.strength || 0.35;
      }
    },
    setSize() {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      rainGlass.uniforms.uResolution.value.set(Math.max(1, size.x), Math.max(1, size.y));
    },
    render(elapsed) {
      gradeUniforms.uTime.value = elapsed;
      rainGlass.uniforms.uTime.value = elapsed;
      volumetricFog.marchUniforms.uTime.value = elapsed;
      try {
        pipeline.render();
      } catch (error) {
        window.__pipelineError = String(error?.stack || error);
        console.error("RenderPipeline", error);
        renderer.setAnimationLoop(null);
      }
    },
  };
}
