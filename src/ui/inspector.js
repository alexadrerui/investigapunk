import GUI from "three/addons/libs/lil-gui.module.min.js";
import TSLGraphEditor from "three/addons/inspector/extensions/tsl-graph/TSLGraphEditor.js";
import { LOOK_PRESET_ORDER, LOOK_PRESETS } from "../look/presets.js";
import { LIGHTING, PERF, RAIN } from "../config.js";
import { applyStreetLightConfig } from "../world/city.js";

export function createDevInspector({
  post,
  rain,
  ground,
  sky,
  smoke,
  carRain,
  lighting,
  transformTools,
  player,
  onLookChange,
} = {}) {
  let gui = null;
  let tslGraphEditor = null;
  let tslGraphPanel = null;
  const lookState = { preset: post?.getLookId?.() ?? "neonNoir" };

  function ensureTslGraph() {
    if (tslGraphEditor) return tslGraphEditor;
    tslGraphEditor = new TSLGraphEditor();
    tslGraphPanel = document.createElement("div");
    tslGraphPanel.className = "tsl-graph-panel";
    tslGraphPanel.hidden = true;
    tslGraphPanel.appendChild(tslGraphEditor.content);
    document.body.appendChild(tslGraphPanel);
    return tslGraphEditor;
  }

  function refreshFolder(folder) {
    folder.controllers.forEach((controller) => controller.updateDisplay());
    folder.folders.forEach(refreshFolder);
  }

  function refresh() {
    if (!gui) return;
    refreshFolder(gui);
  }

  function bindUniform(folder, object, key, min, max, step, name, onChange) {
    const uniform = object?.[key];
    if (!uniform || typeof uniform !== "object" || !("value" in uniform)) return null;
    const controller = folder.add(uniform, "value", min, max, step).name(name);
    if (onChange) controller.onChange(onChange);
    return controller;
  }

  function addToggle(folder, get, set, name = "enabled") {
    const state = {
      get enabled() {
        return !!get();
      },
      set enabled(value) {
        set(!!value);
      },
    };
    return folder.add(state, "enabled").name(name);
  }

  function build() {
    if (gui) return gui;
    gui = new GUI({ title: "Development", width: 300 });
    gui.domElement.classList.add("dev-inspector");

    const tsl = gui.addFolder("TSL Graph");
    addToggle(
      tsl,
      () => !!tslGraphPanel && !tslGraphPanel.hidden,
      (value) => {
        ensureTslGraph();
        tslGraphPanel.hidden = !value;
        if (value) transformTools?.setEnabled(true);
      },
      "editor",
    );
    if (transformTools) {
      addToggle(tsl, () => transformTools.isEnabled(), (value) => {
        transformTools.setEnabled(value);
      }, "transform");
    }
    tsl.close();

    if (post?.grade) {
      const look = gui.addFolder("Look");
      const labels = Object.fromEntries(LOOK_PRESET_ORDER.map((id) => [LOOK_PRESETS[id].label, id]));
      look.add(lookState, "preset", labels).name("preset").onChange((id) => {
        post.applyLook(id);
        onLookChange?.(id);
        refresh();
      });

      const grade = post.grade.uniforms;
      const fog = look.addFolder("Fog / Haze");
      bindUniform(fog, grade, "uFogEnabled", 0, 1, 0.01, "grade fog");
      bindUniform(fog, grade, "uFogAmount", 0, 1, 0.01, "grade amount");
      bindUniform(fog, grade, "uFogNear", -40, 80, 0.5, "fog near");
      bindUniform(fog, grade, "uFogFar", 1, 200, 0.5, "fog far");
      bindUniform(fog, grade, "uFogBloomSuppress", 0, 1, 0.01, "bloom suppress");
      if (grade.uFogColor?.value) {
        fog.addColor(grade.uFogColor, "value").name("fog color").onChange(() => {
          const color = grade.uFogColor.value;
          post.volumetricFog?.setFogColor(color.r, color.g, color.b);
        });
      }
      if (post.volumetricFog) {
        const vol = post.volumetricFog;
        const volState = {
          get amount() {
            return vol.getAmount();
          },
          set amount(value) {
            vol.setAmount(value);
          },
        };
        fog.add(volState, "amount", 0, 2, 0.01).name("volumetric");
        const march = vol.marchUniforms;
        bindUniform(fog, march, "uFogDensity", 0, 2, 0.01, "density");
        bindUniform(fog, march, "uFogHeight", 0.5, 20, 0.1, "height");
        bindUniform(fog, march, "uHeightFalloff", 0.1, 4, 0.01, "falloff");
        bindUniform(fog, march, "uCloudScale", 0.001, 0.12, 0.001, "noise scale");
        bindUniform(fog, march, "uCloudThreshold", 0, 1, 0.01, "noise cut");
        bindUniform(fog, march, "uCloudSpeed", 0, 0.2, 0.001, "noise speed");
        bindUniform(fog, march, "uMaxRayDist", 4, 120, 1, "ray distance");
        bindUniform(fog, march, "uRangeFogNear", 0, 80, 1, "range near");
        bindUniform(fog, march, "uRangeFogFar", 10, 200, 1, "range far");
      }

      const color = look.addFolder("Color Grade");
      bindUniform(color, grade, "uGradeMix", 0, 1, 0.01, "grade mix");
      bindUniform(color, grade, "uSaturation", 0, 2, 0.01, "saturation");
      bindUniform(color, grade, "uContrast", 0.5, 2, 0.01, "contrast");
      bindUniform(color, grade, "uGreenSuppress", 0, 1, 0.01, "green suppress");
      if (grade.uTint?.value) {
        color.add(grade.uTint.value, "x", 0.4, 1.6, 0.01).name("tint r");
        color.add(grade.uTint.value, "y", 0.4, 1.6, 0.01).name("tint g");
        color.add(grade.uTint.value, "z", 0.4, 1.6, 0.01).name("tint b");
      }
      if (grade.uOffset?.value) {
        color.add(grade.uOffset.value, "x", -0.08, 0.08, 0.001).name("offset r");
        color.add(grade.uOffset.value, "y", -0.08, 0.08, 0.001).name("offset g");
        color.add(grade.uOffset.value, "z", -0.08, 0.08, 0.001).name("offset b");
      }

      const chroma = look.addFolder("Chromatic");
      bindUniform(chroma, grade, "uChromatic", 0, 2, 0.01, "strength");
      bindUniform(chroma, grade, "uChromaticFalloff", 0.5, 12, 0.01, "edge falloff");

      const vig = look.addFolder("Vignette");
      bindUniform(vig, grade, "uVignette", 0, 1, 0.01, "intensity");
      bindUniform(vig, grade, "uVignetteSmooth", 0, 1, 0.01, "smoothness");

      const grain = look.addFolder("Grain");
      bindUniform(grain, grade, "uGrain", 0, 1, 0.01, "intensity");

      const bloom = gui.addFolder("Bloom");
      addToggle(bloom, () => post.bloom.enabled, (value) => {
        post.bloom.enabled = value;
      });
      bloom.add(post.bloom, "tightStrength", 0, 8, 0.01).name("tight");
      bloom.add(post.bloom, "tightRadius", 0, 1, 0.01).name("tight radius");
      bloom.add(post.bloom, "wideStrength", 0, 8, 0.01).name("wide");
      bloom.add(post.bloom, "wideRadius", 0, 1, 0.01).name("wide radius");
      bloom.add(post.bloom, "extractThreshold", 0, 1, 0.01).name("threshold");

      const ao = gui.addFolder("AO (GTAO)");
      addToggle(ao, () => post.ao.enabled, (value) => {
        post.ao.enabled = value;
      });
      ao.add(post.ao, "blendIntensity", 0, 1, 0.01).name("blend");
      const applyAo = () => post.applyAo?.();
      ao.add(PERF, "aoSamples", 4, 32, 1).name("samples").onChange(applyAo);
      ao.add(PERF, "aoRadius", 0.1, 4, 0.01).name("radius").onChange(applyAo);
      ao.add(PERF, "aoScale", 0.2, 4, 0.01).name("scale").onChange(applyAo);
      ao.add(PERF, "aoThickness", 0.1, 4, 0.01).name("thickness").onChange(applyAo);
      ao.add(PERF, "aoDistanceExponent", 0.2, 4, 0.01).name("distance exp").onChange(applyAo);
      ao.add(PERF, "aoDistanceFallOff", 0.2, 4, 0.01).name("distance falloff").onChange(applyAo);
      ao.close();

      const flare = gui.addFolder("Lensflare");
      addToggle(flare, () => post.flare.enabled, (value) => {
        post.setLensflareEnabled(value);
      });
      bindUniform(flare, post.flare.uniforms, "uStrength", 0, 2, 0.01, "strength");
      bindUniform(flare, post.flare.uniforms, "uThreshold", 0, 1, 0.01, "threshold");
      bindUniform(flare, post.flare.uniforms, "uGhostSpacing", 0.02, 0.8, 0.01, "spacing");
      bindUniform(flare, post.flare.uniforms, "uGhostAttenuation", 1, 80, 0.5, "attenuation");
      flare.close();

      const smaa = gui.addFolder("SMAA");
      addToggle(smaa, () => post.smaa.enabled, (value) => {
        post.smaa.enabled = value;
      });
      smaa.close();

      if (post.rainGlass?.uniforms) {
        const glass = gui.addFolder("Rain Glass");
        const amount = {
          get value() {
            return post.rainGlass.getAmount();
          },
          set value(next) {
            post.rainGlass.setAmount(next);
          },
        };
        glass.add(amount, "value", 0, 1, 0.01).name("amount");
        bindUniform(glass, post.rainGlass.uniforms, "uIntensity", 0, 2, 0.01, "intensity");
        bindUniform(glass, post.rainGlass.uniforms, "uSpeed", 0.2, 12, 0.05, "speed");
        bindUniform(glass, post.rainGlass.uniforms, "uBlurRadius", 0, 4, 0.01, "blur");
        bindUniform(glass, post.rainGlass.uniforms, "uDistortion", 0, 1, 0.01, "distortion");
        bindUniform(glass, post.rainGlass.uniforms, "uDropSize", 0.2, 2.5, 0.01, "drop size");
        glass.close();
      }
    }

    if (ground?.uniforms) {
      const folder = gui.addFolder("Ground");
      bindUniform(folder, ground.uniforms, "uReflectStrength", 0, 1, 0.01, "reflection");
      bindUniform(folder, ground.uniforms, "uRoughnessScale", 0, 1, 0.01, "roughness");
      bindUniform(folder, ground.uniforms, "uRippleAmount", 0, 1, 0.01, "ripple amount");
      bindUniform(folder, ground.uniforms, "uRippleScale", 0.5, 120, 0.1, "ripple scale");
      bindUniform(folder, ground.uniforms, "uRippleSpeed", 0.5, 8, 0.1, "ripple speed");
      bindUniform(folder, ground.uniforms, "uRippleStrength", 0, 0.25, 0.005, "ripple reflection");
      bindUniform(folder, ground.uniforms, "uRippleNormalStrength", 0, 0.08, 0.001, "ripple normal");
      bindUniform(folder, ground.uniforms, "uNormalWarp", 0, 0.1, 0.001, "normal warp");
      bindUniform(folder, ground.uniforms, "uFogNear", 0, 80, 0.5, "fog near");
      bindUniform(folder, ground.uniforms, "uFogFar", 1, 200, 0.5, "fog far");
      folder.close();
    }

    if (sky?.params && sky.apply) {
      const folder = gui.addFolder("Sky");
      const p = sky.params;
      const apply = () => sky.apply();
      folder.add(p, "elevation", -40, 90, 0.1).onChange(apply);
      folder.add(p, "azimuth", -180, 180, 0.1).onChange(apply);
      folder.add(p, "intensity", 0, 2, 0.001).onChange(apply);
      folder.add(p, "turbidity", 0, 20, 0.1).onChange(apply);
      folder.add(p, "rayleigh", 0, 4, 0.001).onChange(apply);
      folder.add(p, "mieCoefficient", 0, 0.1, 0.001).name("mie").onChange(apply);
      folder.add(p, "mieDirectionalG", 0, 1, 0.001).name("mie G").onChange(apply);
      folder.add(p, "cloudCoverage", 0, 1, 0.01).name("coverage").onChange(apply);
      folder.add(p, "cloudDensity", 0, 1, 0.01).name("density").onChange(apply);
      folder.add(p, "cloudElevation", 0, 1, 0.01).name("cloud height").onChange(apply);
      folder.add(p, "cloudScale", 0.00001, 0.002, 0.00001).name("cloud scale").onChange(apply);
      folder.add(p, "cloudSpeed", 0, 0.0002, 0.000001).name("cloud speed").onChange(apply);
      folder.add(p, "nightLift", 0, 0.15, 0.001).name("night lift").onChange(apply);
      folder.add(p, "nightCloud", 0, 1, 0.01).name("night cloud").onChange(apply);
      folder.add(p, "radius", 20, 200, 1).onChange(apply);
      folder.add(p, "showSunDisc").name("sun disc").onChange(apply);
    }

    if (rain) {
      const folder = gui.addFolder("Rain");
      addToggle(folder, () => rain.group.visible, (value) => rain.setEnabled(value));
      bindUniform(folder, rain.dropUniforms, "uOpacity", 0.02, 1, 0.01, "opacity");
      bindUniform(folder, rain.dropUniforms, "uIntensity", 0.1, 2.5, 0.05, "intensity");
      bindUniform(folder, rain.splashUniforms, "uOpacity", 0.02, 1, 0.01, "splash opacity");
      folder.add(RAIN, "splashSpeed", 1, 12, 0.25).name("splash speed").onChange((value) => {
        rain.splashUniforms.uSpeed.value = value;
      });
      folder.add(RAIN, "splashSize", 0.1, 4, 0.05).name("splash size");
      folder.add(RAIN, "splashStartScale", 0.02, 1, 0.01).name("splash start");
      folder.add(RAIN, "splashEndScale", 0.5, 5, 0.05).name("splash end");
      folder.add(RAIN, "fallSpeed", 0.1, 1.2, 0.01).name("fall speed");
      folder.add(RAIN, "areaWidth", 10, 120, 1).name("area width");
      folder.add(RAIN, "areaHeight", 10, 120, 1).name("area depth");
      if (rain.dropUniforms.uColor?.value) {
        folder.addColor(rain.dropUniforms.uColor, "value").name("color").onChange(() => {
          rain.splashUniforms.uColor.value.copy(rain.dropUniforms.uColor.value);
        });
      }
    }

    if (carRain?.uniforms) {
      const folder = gui.addFolder("Car Rain");
      folder.add(carRain.params, "intensity", 0, 2, 0.01).name("intensity");
      bindUniform(folder, carRain.uniforms, "uRainSpeed", 0.1, 4, 0.01, "speed");
      bindUniform(folder, carRain.uniforms, "uRainScale", 4, 60, 0.1, "scale");
      bindUniform(folder, carRain.uniforms, "uDropSize", 0.1, 2, 0.01, "drop size");
      bindUniform(folder, carRain.uniforms, "uDropletMix", 0, 1, 0.01, "droplets");
      folder.close();
    }

    if (smoke?.params) {
      const folder = gui.addFolder("Smoke");
      addToggle(folder, () => smoke.params.visible, (value) => smoke.setVisible(value));
      folder.add(smoke.params, "opacity", 0, 1, 0.01).name("exhaust opacity");
      folder.add(smoke.params, "speed", 0.05, 2, 0.01).name("exhaust speed");
      folder.add(smoke.params, "scale", 0.5, 10, 0.05).name("exhaust scale");
      if (smoke.ambientParams) {
        folder.add(smoke.ambientParams, "opacity", 0, 1, 0.01).name("ambient opacity");
        folder.add(smoke.ambientParams, "speed", 0.01, 0.5, 0.001).name("ambient speed");
      }
      smoke.ambient?.forEach((point, index) => {
        folder.add(point, "scale", 1, 25, 0.1).name(`ambient ${index + 1}`);
      });
      folder.close();
    }

    if (player?.footIK) {
      const footIK = player.footIK;
      const options = footIK.getOptions();
      const params = {
        enabled: options.enabled,
        debug: options.debug,
        predictivePlacement: options.predictivePlacement,
        straightPoleEnabled: options.straightPoleEnabled,
        firstPersonBody: player.isFirstPersonBody(),
        capsuleDebug: false,
      };
      const folder = gui.addFolder("Foot IK");
      folder.add(params, "enabled").name("enabled").onChange((value) => {
        footIK.setEnabled(value);
        footIK.setDebugEnabled(value && params.debug);
      });
      folder.add(params, "debug").name("debug").onChange((value) => {
        footIK.setDebugEnabled(value && params.enabled);
      });
      folder.add(params, "predictivePlacement").name("predictive").onChange((value) => {
        footIK.configure({ predictivePlacement: value });
      });
      folder.add(params, "straightPoleEnabled").name("straight pole").onChange((value) => {
        footIK.configure({ straightPoleEnabled: value });
      });
      folder.add(params, "firstPersonBody").name("1st person body").onChange((value) => {
        player.setFirstPersonBody(value);
      });
      folder.add(params, "capsuleDebug").name("capsule").onChange((value) => {
        player.setCapsuleDebug(value);
      });
      folder.close();
    }

    if (lighting) {
      const { scene, sun, fill, renderer } = lighting;
      const folder = gui.addFolder("Lighting");
      if (renderer) {
        folder.add(renderer, "toneMappingExposure", 0.1, 3, 0.01).name("exposure");
      }
      if (sun) {
        folder.add(sun, "intensity", 0, 30, 0.1).name("sun");
        folder.add(sun.shadow, "intensity", 0, 3, 0.01).name("shadow").onChange(() => {
          sun.shadow.needsUpdate = true;
          if (renderer) renderer.shadowMap.needsUpdate = true;
        });
        folder.addColor(sun, "color").name("sun color");
      }
      if (fill) {
        folder.add(fill, "intensity", 0, 8, 0.05).name("fill");
        folder.addColor(fill, "color").name("fill color");
      }
      const lamps = LIGHTING.streetlight;
      const applyLamps = () => applyStreetLightConfig(scene);
      folder.add(lamps, "spotIntensity", 0, 600, 1).name("spot").onChange(applyLamps);
      folder.add(lamps, "pointIntensity", 0, 200, 1).name("point").onChange(applyLamps);
      folder.add(lamps, "emissiveIntensity", 0, 20, 0.1).name("lamp glow").onChange(applyLamps);
      folder.close();
    }

    return gui;
  }

  return {
    setEnabled(enabled) {
      if (enabled) {
        build();
        lookState.preset = post?.getLookId?.() ?? lookState.preset;
        refresh();
        gui.show();
        document.body.classList.add("dev-mode");
        return;
      }
      document.body.classList.remove("dev-mode");
      if (tslGraphPanel) tslGraphPanel.hidden = true;
      if (!gui) return;
      gui.hide();
    },
    get tslGraph() {
      return tslGraphEditor;
    },
    inspectObject(object) {
      if (!object) return;
      const editor = ensureTslGraph();
      tslGraphPanel.hidden = false;
      const materials = Array.isArray(object?.material) ? object.material : [object?.material];
      const nodeMaterial = materials.find((material) => material?.isNodeMaterial);
      if (nodeMaterial) editor.setMaterial(nodeMaterial);
      refresh();
    },
    syncLook(id) {
      lookState.preset = id;
      refresh();
    },
    destroy() {
      document.body.classList.remove("dev-mode");
      tslGraphPanel?.remove();
      gui?.destroy();
      gui = null;
    },
  };
}
