import * as THREE from "three";
import { createAdaptiveDpr } from "./core/dpr.js";
import { createRenderer, resizeRenderer } from "./core/renderer.js";
import { createCamera, createScene } from "./core/scene.js";
import { createComposer } from "./postfx/pipeline.js";
import { createCameraRig } from "./camera/controls.js";
import { loadCity } from "./world/city.js";
import { loadCar } from "./world/car.js";
import { loadBillboards } from "./world/billboards.js";
import { createGround } from "./world/ground.js";
import { createRain } from "./world/rain.js";
import { createSky } from "./world/sky.js";
import { createPlanes } from "./world/planes.js";
import { createCollisionHeight } from "./world/collisionHeight.js";
import { applyCarRain } from "./world/carRain.js";
import { createLoaderUi } from "./ui/loader.js";
import { createLookBar } from "./ui/lookBar.js";
import { createDevInspector } from "./ui/inspector.js";
import { createTransformTools } from "./dev/transformTools.js";
import { createAudio } from "./ui/audio.js";
import { runIntro } from "./ui/intro.js";
import { createWalkHud } from "./ui/walkHud.js";
import { createChrome, readStoredLook } from "./ui/chrome.js";
import { createFootIkCharacter } from "./player/footIkCharacter.js";
export async function boot() {
  document.body.classList.add("is-intro");
  const loader = createLoaderUi();
  loader.setProgress(0.05);
  loader.setStatus("BOOTING SCENE");

  const renderer = await createRenderer();
  const camera = createCamera();
  const { scene, sun, fill } = createScene();
  const post = createComposer(renderer, scene, camera);
  post.setSize();

  loader.setProgress(0.15);
  loader.setStatus("STREAMING MESHES");

  const [cityPack, carPack, billboards] = await Promise.all([
    loadCity(renderer),
    loadCar(renderer),
    loadBillboards(renderer),
  ]);

  const { car, collider: carCollider } = carPack;
  scene.add(cityPack.city);
  scene.add(cityPack.boundsCollider);
  scene.add(car);
  scene.add(carCollider);
  scene.add(billboards.root);
  const carRain = applyCarRain(car);

  loader.setProgress(0.55);
  loader.setStatus("WIRING WORLD");

  const ground = createGround(scene, renderer);
  const rig = createCameraRig(camera, renderer, {
    model: cityPack.city,
    colliders: [cityPack.city, cityPack.boundsCollider, carCollider],
    ground: ground.mesh,
  });
  const collision = createCollisionHeight({ scene, renderer });
  const smoke = post.smoke;
  const [sky, rain, planes, player] = await Promise.all([
    createSky(scene),
    createRain(scene, camera, { renderer, collisionHeight: collision }),
    createPlanes(scene, renderer),
    createFootIkCharacter({
      scene,
      renderer,
      camera,
      rig,
      colliders: [cityPack.city, cityPack.boundsCollider, carCollider, ground.mesh, car],
    }).catch((error) => {
      console.warn("Foot IK character failed to load:", error);
      return null;
    }),
  ]);

  loader.setProgress(0.8);
  loader.setStatus("LOADING AUDIO");
  const audio = await createAudio({
    camera,
    car,
    planes: planes.meshes,
  });

  sun.shadow.needsUpdate = true;
  renderer.shadowMap.needsUpdate = true;

  window.__scene = scene;
  window.__camera = camera;
  window.__renderer = renderer;
  window.__rig = rig;
  window.__post = post;

  const clock = new THREE.Clock();
  let chrome;
  let inspector;
  const lookBar = createLookBar((id) => {
    post.applyLook(id);
    chrome?.persistLook(id);
    inspector?.syncLook?.(id);
  }, () => post.getLookId());
  lookBar.setVisible(false);
  lookBar.setLook(readStoredLook());
  const transformTools = createTransformTools({
    camera,
    canvas: renderer.domElement,
    scene,
    rig,
    onSelect(mesh) {
      inspector?.inspectObject?.(mesh);
    },
  });
  inspector = createDevInspector({
    post,
    rain,
    ground,
    sky,
    smoke,
    carRain,
    lighting: { scene, sun, fill, renderer },
    transformTools,
    player,
    onLookChange: (id) => lookBar.setLook(id),
  });
  function applyDevelopmentMode(enabled) {
    lookBar.setVisible(false);
    inspector.setEnabled(enabled);
    rig.setOrbitOnly(enabled);
    if (!enabled) {
      transformTools.setEnabled(false);
      if (!document.body.classList.contains("is-intro")) rig.enterWalk();
    }
  }
  window.__transform = transformTools;
  const dpr = createAdaptiveDpr(renderer, () => {
    resizeRenderer(renderer);
    post.setSize();
  });
  chrome = createChrome({
    applyLook: (id) => lookBar.setLook(id),
    getLookId: () => post.getLookId(),
    applyDevelopmentMode,
  });
  chrome.attachAudio(audio);
  chrome.persistLook(post.getLookId());
  window.__player = player;
  window.__sky = sky;
  window.__look = { apply: (id) => lookBar.setLook(id), get: () => post.getLookId() };
  window.__audio = audio;
  window.__chrome = chrome;
  chrome.hud.bindWalkControls(rig);
  const walkHud = createWalkHud(rig, renderer.domElement, chrome.state);
  window.__walkHud = walkHud;
  chrome.state.subscribe(() => walkHud.render(rig.getWalkState()));

  window.addEventListener("resize", () => {
    rig.onResize();
    resizeRenderer(renderer);
    post.setSize();
  });

  loader.setProgress(1);
  rig.setInputLocked(true);
  post.setLensflareEnabled(false);
  post.rainGlass.setAmount(1);
  post.setIntroPresentation(true);
  smoke.setVisible(false);

  await loader.finish();
  renderer.domElement.style.opacity = "1";

  renderer.setAnimationLoop(async () => {
    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.getElapsedTime();
    rig.update(delta);
    player?.update(delta);
    audio.update(delta, {
      walking: rig.isWalking(),
      speed: rig.getHorizontalSpeed(),
    });
    dpr.update(delta);
    chrome.hud.update(delta);
    collision.update({
      camera,
      hideObjects: [rain.group, sky.mesh, planes.group, player?.group].filter(Boolean),
    });
    rain.update(delta, camera);
    carRain.update(delta, camera);
    ground.update(delta);
    sky.update(camera, elapsed);
    smoke.update(car);
    planes.update(delta);
    billboards.update(camera);
    post.render(elapsed);
  });

  const overlay = await runIntro({
    renderer,
    rainGlass: post.rainGlass,
    setSmokeVisible: (visible) => {
      smoke.setVisible(visible);
    },
    setIntroPresentation: (active) => {
      post.setIntroPresentation(active);
    },
    onReveal() {
      rig.setInputLocked(false);
      chrome.show();
      billboards.prime(camera);
      player?.setVisible(true);
      rig.enterWalk();
    },
  });

  window.__intro = overlay;
}
