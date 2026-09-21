import * as THREE from "three";
import { SkyMesh } from "three/addons/objects/SkyMesh.js";
import { uniform, vec3, vec4 } from "three/tsl";
import { CAMERA, LIGHTING, SKY } from "../config.js";
import { LAYERS, setLayer } from "../core/layers.js";

const sunDir = new THREE.Vector3();

function createParams() {
  return {
    radius: SKY.radius,
    intensity: SKY.intensity,
    turbidity: SKY.turbidity,
    rayleigh: SKY.rayleigh,
    mieCoefficient: SKY.mieCoefficient,
    mieDirectionalG: SKY.mieDirectionalG,
    elevation: SKY.elevation,
    azimuth: SKY.azimuth,
    cloudCoverage: SKY.cloudCoverage,
    cloudDensity: SKY.cloudDensity,
    cloudElevation: SKY.cloudElevation,
    cloudScale: SKY.cloudScale,
    cloudSpeed: SKY.cloudSpeed,
    nightLift: SKY.nightLift,
    nightCloud: SKY.nightCloud,
    showSunDisc: SKY.showSunDisc,
  };
}

function sunFromParams(params) {
  if (params.elevation != null && params.azimuth != null) {
    return { elevation: params.elevation, azimuth: params.azimuth };
  }
  sunDir.set(...LIGHTING.sun.position).normalize();
  return {
    elevation: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(sunDir.y, -1, 1))),
    azimuth: THREE.MathUtils.radToDeg(Math.atan2(sunDir.x, sunDir.z)),
  };
}

export function createSky(scene) {
  const params = createParams();
  const sky = new SkyMesh();
  sky.name = "Sky";
  sky.geometry.dispose();
  sky.geometry = new THREE.SphereGeometry(1, 64, 32);
  sky.frustumCulled = false;
  sky.renderOrder = -20;
  sky.material.fog = false;
  sky.material.depthTest = false;
  sky.material.depthWrite = false;
  sky.material.toneMapped = false;

  const uIntensity = uniform(params.intensity);
  const uNightLift = uniform(params.nightLift);
  const uNightCloud = uniform(params.nightCloud);
  const baseColor = sky.material.colorNode;
  sky.material.colorNode = vec4(
    baseColor.xyz
      .mul(uIntensity)
      .add(vec3(0.045, 0.05, 0.08).mul(uNightCloud).mul(0.15))
      .add(vec3(uNightLift.mul(0.7), uNightLift.mul(0.78), uNightLift)),
    1,
  );

  setLayer(sky, LAYERS.fx);
  scene.add(sky);

  function apply() {
    const { elevation, azimuth } = sunFromParams(params);
    sky.turbidity.value = params.turbidity;
    sky.rayleigh.value = params.rayleigh;
    sky.mieCoefficient.value = params.mieCoefficient;
    sky.mieDirectionalG.value = params.mieDirectionalG;
    sky.cloudCoverage.value = params.cloudCoverage;
    sky.cloudDensity.value = params.cloudDensity;
    sky.cloudElevation.value = params.cloudElevation;
    sky.cloudScale.value = params.cloudScale;
    sky.cloudSpeed.value = params.cloudSpeed;
    sky.showSunDisc.value = params.showSunDisc ? 1 : 0;
    uIntensity.value = params.intensity;
    uNightLift.value = params.nightLift;
    uNightCloud.value = params.nightCloud;

    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    sky.sunPosition.value.setFromSphericalCoords(1, phi, theta);

    const maxRadius = Math.max(40, CAMERA.far * 0.45);
    sky.scale.setScalar(Math.min(params.radius, maxRadius));
  }

  function syncFromConfig() {
    Object.assign(params, createParams());
    apply();
  }

  apply();

  if (import.meta.hot) {
    import.meta.hot.accept("../config.js", () => {
      syncFromConfig();
    });
  }

  return {
    mesh: sky,
    uniforms: {
      turbidity: sky.turbidity,
      rayleigh: sky.rayleigh,
      mieCoefficient: sky.mieCoefficient,
      mieDirectionalG: sky.mieDirectionalG,
      sunPosition: sky.sunPosition,
      cloudScale: sky.cloudScale,
      cloudSpeed: sky.cloudSpeed,
      cloudCoverage: sky.cloudCoverage,
      cloudDensity: sky.cloudDensity,
      cloudElevation: sky.cloudElevation,
      showSunDisc: sky.showSunDisc,
      intensity: uIntensity,
      nightLift: uNightLift,
      nightCloud: uNightCloud,
    },
    params,
    apply,
    syncFromConfig,
    update(camera) {
      sky.position.copy(camera.position);
    },
  };
}
