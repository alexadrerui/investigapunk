import * as THREE from "three";
import {
  Fn,
  If,
  billboarding,
  color,
  float,
  floor,
  fract,
  hash,
  instanceIndex,
  instancedArray,
  mix,
  positionGeometry,
  texture,
  time,
  uint,
  uniform,
  uv,
  vec2,
} from "three/tsl";
import { RAIN } from "../config.js";
import { ASSETS } from "../assets.js";
import { LAYERS, setLayer } from "../core/layers.js";

const SPLASH_FRAMES = 5;
const MAX_COUNT = 5000;
const DROP_JITTER = 0.07;
const _forward = new THREE.Vector3();

function randUint() {
  return uint(Math.floor(Math.random() * 16777215));
}

export async function createRain(scene, camera, { renderer, collisionHeight } = {}) {
  const count = Math.min(Math.max(500, RAIN.count), MAX_COUNT);
  const splashMap = await new THREE.TextureLoader().loadAsync(ASSETS.splash);
  splashMap.colorSpace = THREE.SRGBColorSpace;
  splashMap.minFilter = THREE.LinearFilter;
  splashMap.magFilter = THREE.LinearFilter;
  splashMap.wrapS = THREE.ClampToEdgeWrapping;
  splashMap.wrapT = THREE.ClampToEdgeWrapping;
  splashMap.generateMipmaps = false;
  splashMap.needsUpdate = true;

  const group = new THREE.Group();
  group.name = "CollisionRain";
  scene.add(group);

  const params = {
    enabled: true,
    count,
    opacity: RAIN.opacity,
    intensity: RAIN.intensity,
    splashOpacity: RAIN.splashOpacity,
    splashSpeed: RAIN.splashSpeed,
    fallSpeed: RAIN.fallSpeed,
    splashSize: RAIN.splashSize,
    splashStartScale: RAIN.splashStartScale,
    splashEndScale: RAIN.splashEndScale,
    rainAreaWidth: RAIN.areaWidth,
    rainAreaHeight: RAIN.areaHeight,
    cameraForwardOffset: RAIN.cameraForwardOffset,
  };

  const uCameraPos = uniform(new THREE.Vector3());
  const uCameraDir = uniform(new THREE.Vector3());
  const uOpacity = uniform(params.opacity);
  const uIntensity = uniform(params.intensity);
  const uSplashOpacity = uniform(params.splashOpacity);
  const uSplashSpeed = uniform(params.splashSpeed);
  const uFallSpeed = uniform(params.fallSpeed);
  // Fator de frame relativo a 60 Hz: mantém a queda independente da taxa de quadros.
  const uFrameScale = uniform(1);
  const uDropJitter = uniform(DROP_JITTER);
  const uSplashSize = uniform(params.splashSize);
  const uSplashStart = uniform(params.splashStartScale);
  const uSplashEnd = uniform(params.splashEndScale);
  const uAreaWidth = uniform(params.rainAreaWidth);
  const uAreaHeight = uniform(params.rainAreaHeight);
  const uHalfWidth = uniform(params.rainAreaWidth / 2);
  const uHalfHeight = uniform(params.rainAreaHeight / 2);
  const uForwardOffset = uniform(params.cameraForwardOffset);

  const positions = instancedArray(count, "vec3");
  const velocities = instancedArray(count, "vec3");
  const splashPositions = instancedArray(count, "vec3");
  const splashCycles = instancedArray(count, "uint");

  const spawn = Fn(() => {
    const position = positions.element(instanceIndex);
    const velocity = velocities.element(instanceIndex);
    const hx = hash(instanceIndex);
    const hy = hash(instanceIndex.add(randUint()));
    const hz = hash(instanceIndex.add(randUint()));
    const origin = uCameraPos.add(uCameraDir.mul(uForwardOffset));
    position.x.assign(hx.mul(uAreaWidth).sub(uHalfWidth).add(origin.x));
    position.z.assign(hz.mul(uAreaHeight).sub(uHalfHeight).add(origin.z));
    position.y.assign(hy.mul(25));
    velocity.y.assign(hx.mul(uDropJitter).sub(uDropJitter.mul(0.5)).sub(uFallSpeed));
  })().compute(count);

  const simulate = Fn(() => {
    const position = positions.element(instanceIndex);
    const velocity = velocities.element(instanceIndex);
    position.addAssign(velocity.mul(uFrameScale));
    const origin = uCameraPos.add(uCameraDir.mul(uForwardOffset));
    const wrappedX = fract(position.x.sub(origin.x).add(uHalfWidth).div(uAreaWidth)).mul(uAreaWidth).sub(uHalfWidth);
    const wrappedZ = fract(position.z.sub(origin.z).add(uHalfHeight).div(uAreaHeight)).mul(uAreaHeight).sub(uHalfHeight);
    position.x.assign(origin.x.add(wrappedX));
    position.z.assign(origin.z.add(wrappedZ));
    const heightUv = collisionHeight.getUV(position);
    const hitY = texture(collisionHeight.renderTarget.texture, heightUv).y.add(float(0.05));
    If(position.y.lessThan(hitY), () => {
      const seed = float(instanceIndex).add(time.mul(1000));
      position.y.assign(hash(seed.add(77.7)).mul(15).add(20));
      position.x.assign(hash(seed.add(11.1)).mul(uAreaWidth).sub(uHalfWidth).add(origin.x));
      position.z.assign(hash(seed.add(44.4)).mul(uAreaHeight).sub(uHalfHeight).add(origin.z));
      velocity.y.assign(hash(seed.add(99.9)).mul(uDropJitter).sub(uDropJitter.mul(0.5)).sub(uFallSpeed));
    });
  })().compute(count);

  const simulateSplash = Fn(() => {
    const splash = splashPositions.element(instanceIndex);
    const cycle = splashCycles.element(instanceIndex);
    const origin = uCameraPos.add(uCameraDir.mul(uForwardOffset));
    const phase = hash(instanceIndex).mul(6.28);
    const nextCycle = floor(time.mul(uSplashSpeed).add(phase)).toUint();
    If(nextCycle.notEqual(cycle), () => {
      cycle.assign(nextCycle);
      const seed = instanceIndex.add(nextCycle.mul(uint(196613)));
      const sx = hash(seed).mul(uAreaWidth).sub(uHalfWidth);
      const sz = hash(seed.add(uint(77777))).mul(uAreaHeight).sub(uHalfHeight);
      splash.x.assign(origin.x.add(sx));
      splash.z.assign(origin.z.add(sz));
      const heightUv = collisionHeight.getUV(splash);
      splash.y.assign(texture(collisionHeight.renderTarget.texture, heightUv).y.add(float(0.06)));
    });
    const wrappedX = origin.x.add(
      fract(splash.x.sub(origin.x).add(uHalfWidth).div(uAreaWidth)).mul(uAreaWidth).sub(uHalfWidth),
    );
    const wrappedZ = origin.z.add(
      fract(splash.z.sub(origin.z).add(uHalfHeight).div(uAreaHeight)).mul(uAreaHeight).sub(uHalfHeight),
    );
    If(wrappedX.notEqual(splash.x).or(wrappedZ.notEqual(splash.z)), () => {
      splash.x.assign(wrappedX);
      splash.z.assign(wrappedZ);
      const heightUv = collisionHeight.getUV(splash);
      splash.y.assign(texture(collisionHeight.renderTarget.texture, heightUv).y.add(float(0.06)));
    });
  })().compute(count);

  function syncCamera(viewCamera) {
    uCameraPos.value.copy(viewCamera.position);
    viewCamera.getWorldDirection(_forward);
    _forward.y = 0;
    if (_forward.lengthSq() > 0) _forward.normalize();
    uCameraDir.value.copy(_forward);
  }

  syncCamera(camera);
  camera.layers.enable(LAYERS.fx);
  renderer.compute(spawn);
  renderer.compute(simulate);

  const dropMat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  const dropUv = uv();
  const xMask = dropUv.x.sub(0.5).abs().mul(2).oneMinus().pow(2);
  const yMask = dropUv.y.smoothstep(0, 0.08).mul(dropUv.y.oneMinus().smoothstep(0, 0.15));
  dropMat.colorNode = color(RAIN.color);
  dropMat.opacityNode = xMask.mul(yMask).mul(uOpacity).mul(uIntensity);
  dropMat.positionNode = positionGeometry;
  dropMat.vertexNode = billboarding({
    position: positions.toAttribute(),
    horizontal: true,
    horizontalRotation: true,
  });

  const dropGeo = new THREE.PlaneGeometry(RAIN.dropWidth, RAIN.dropHeight);
  dropGeo.translate(0, RAIN.dropHeight * 0.75, 0);
  dropGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const drops = new THREE.Mesh(dropGeo, dropMat);
  drops.count = count;
  drops.frustumCulled = false;
  drops.renderOrder = 12;
  setLayer(drops, LAYERS.fx);
  group.add(drops);

  const phase = hash(instanceIndex).mul(6.28);
  const progress = fract(time.mul(uSplashSpeed).add(phase));
  const frameF = progress.mul(float(SPLASH_FRAMES));
  const frame0 = floor(frameF);
  const frame1 = frame0.add(1).min(float(SPLASH_FRAMES - 1));
  const mixF = fract(frameF);
  const splashUv = uv();
  const coord0 = vec2(splashUv.x.div(SPLASH_FRAMES).add(frame0.div(SPLASH_FRAMES)), splashUv.y);
  const coord1 = vec2(splashUv.x.div(SPLASH_FRAMES).add(frame1.div(SPLASH_FRAMES)), splashUv.y);
  const splat = mix(texture(splashMap, coord0), texture(splashMap, coord1), mixF);
  const size = hash(instanceIndex.add(uint(12345))).mul(0.7).add(0.3).mul(mix(uSplashStart, uSplashEnd, progress)).mul(uSplashSize);
  const fade = progress.oneMinus().smoothstep(0, 0.5);

  const splashMat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  splashMat.colorNode = color(RAIN.color);
  splashMat.opacityNode = splat.r.mul(uSplashOpacity).mul(fade);
  splashMat.positionNode = positionGeometry.mul(size);
  splashMat.vertexNode = billboarding({
    position: splashPositions.toAttribute(),
    horizontal: true,
    vertical: true,
  });

  const splashGeo = new THREE.PlaneGeometry(0.13, 0.13);
  splashGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const splashes = new THREE.Mesh(splashGeo, splashMat);
  splashes.count = count;
  splashes.frustumCulled = false;
  splashes.renderOrder = 11;
  setLayer(splashes, LAYERS.fx);
  group.add(splashes);
  group.frustumCulled = false;

  function syncParams() {
    uSplashSpeed.value = RAIN.splashSpeed;
    uFallSpeed.value = RAIN.fallSpeed;
    uSplashSize.value = RAIN.splashSize;
    uSplashStart.value = RAIN.splashStartScale;
    uSplashEnd.value = RAIN.splashEndScale;
    uAreaWidth.value = RAIN.areaWidth;
    uAreaHeight.value = RAIN.areaHeight;
    uHalfWidth.value = RAIN.areaWidth / 2;
    uHalfHeight.value = RAIN.areaHeight / 2;
  }

  function applyVisible() {
    group.visible = params.enabled;
    drops.visible = params.enabled;
    splashes.visible = params.enabled;
  }

  applyVisible();

  return {
    group,
    params,
    dropUniforms: {
      uOpacity,
      uIntensity,
    },
    splashUniforms: {
      uOpacity: uSplashOpacity,
      uSpeed: uSplashSpeed,
    },
    setEnabled(enabled) {
      params.enabled = !!enabled;
      applyVisible();
    },
    update(delta, viewCamera) {
      if (!params.enabled) {
        group.visible = false;
        return;
      }
      uFrameScale.value = delta * 60;
      applyVisible();
      syncParams();
      syncCamera(viewCamera);
      renderer.compute(simulate);
      renderer.compute(simulateSplash);
    },
  };
}
