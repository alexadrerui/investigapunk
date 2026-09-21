import * as THREE from "three";
import { ASSETS } from "../assets.js";

const ENGINE_GAIN = 2.5;
const PLANE_GAIN = 1.4;
const STEP_GAIN = 0.7;
const STEP_POOL = 3;
const STEP_MIN_INTERVAL = 0.38;
const STEP_SPEED_REF = 2.5;
const STEP_STRIDE_WALK = 1.7;
const STEP_STRIDE_SPRINT = 3.8;
const AMBIENT_GAIN = 0.45;

function createPositionalSound(listener, { refDistance, rolloff, volume, loop = true }) {
  const sound = new THREE.PositionalAudio(listener);
  sound.setRefDistance(refDistance);
  sound.setRolloffFactor(rolloff);
  sound.setDistanceModel("inverse");
  sound.setLoop(loop);
  sound.setVolume(volume);
  return sound;
}

const WAVE_SVG = `
  <svg
    id="wave"
    class="audio-btn-wave"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 30 30"
    aria-hidden="true"
  >
    <path id="Line_1" fill="white" d="M0.91,15L0.78,15A1,1,0,0,0,0,16v6a1,1,0,1,0,2,0s0,0,0,0V16a1,1,0,0,0-1-1H0.91Z"/>
    <path id="Line_2" fill="white" d="M6.91,9L6.78,9A1,1,0,0,0,6,10V28a1,1,0,1,0,2,0s0,0,0,0V10A1,1,0,0,0,7,9H6.91Z"/>
    <path id="Line_3" fill="white" d="M12.91,0L12.78,0A1,1,0,0,0,12,1V37a1,1,0,1,0,2,0s0,0,0,0V1a1,1,0,0,0-1-1H12.91Z"/>
    <path id="Line_4" fill="white" d="M18.91,10l-0.12,0A1,1,0,0,0,18,11V27a1,1,0,1,0,2,0s0,0,0,0V11a1,1,0,0,0-1-1H18.91Z"/>
    <path id="Line_5" fill="white" d="M24.91,15l-0.12,0A1,1,0,0,0,24,16v6a1,1,0,1,0,2,0s0,0,0,0V16a1,1,0,0,0-1-1H24.91Z"/>
  </svg>
`;

export async function createAudio({ camera, car, planes = [] } = {}) {
  const root = document.createElement("div");
  root.className = "audio-btn-root audio-btn-root--hidden";
  root.setAttribute("data-ui-block-look", "true");
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <button type="button" id="buttonAudio" class="audio-btn" aria-label="Som">
      ${WAVE_SVG}
    </button>
  `;
  document.body.appendChild(root);
  const button = root.querySelector(".audio-btn");
  const wave = root.querySelector(".audio-btn-wave");

  function setWave(on) {
    wave.classList.toggle("animated", on);
  }

  function setVisible(visible) {
    root.classList.toggle("audio-btn-root--hidden", !visible);
    root.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function setForceHidden(hidden) {
    root.classList.toggle("audio-btn-root--force-hidden", hidden);
  }

  const listener = new THREE.AudioListener();
  camera.add(listener);

  const loader = new THREE.AudioLoader();
  const [rainBuf, nightBuf, thunderBuf, engineBuf, planeBuf, ...stepBufs] = await Promise.all([
    loader.loadAsync(ASSETS.audio.rain),
    loader.loadAsync(ASSETS.audio.night),
    loader.loadAsync(ASSETS.audio.thunder),
    loader.loadAsync(ASSETS.audio.engine),
    loader.loadAsync(ASSETS.audio.plane),
    ...ASSETS.audio.footsteps.map((url) => loader.loadAsync(url)),
  ]);

  const ambient = [rainBuf, nightBuf, thunderBuf].map((buffer) => {
    const sound = new THREE.Audio(listener);
    sound.setBuffer(buffer);
    sound.setLoop(true);
    sound.setVolume(AMBIENT_GAIN);
    return sound;
  });

  const engine = createPositionalSound(listener, {
    refDistance: 3,
    rolloff: 3.4,
    volume: AMBIENT_GAIN * ENGINE_GAIN,
  });
  engine.name = "quadra-engine";
  engine.position.set(0, 0.55, 0.4);
  if (car) {
    car.add(engine);
    car.updateMatrixWorld(true);
  }
  engine.setBuffer(engineBuf);

  const planeList = (Array.isArray(planes) ? planes : [planes]).filter(Boolean);
  const planeSounds = planeList.map((mesh, index) => {
    const sound = createPositionalSound(listener, {
      refDistance: 35,
      rolloff: 1.2,
      volume: AMBIENT_GAIN * PLANE_GAIN,
    });
    sound.name = index === 0 ? "plane-engine" : `plane-engine-${index}`;
    mesh.add(sound);
    mesh.updateMatrixWorld(true);
    sound.setBuffer(planeBuf);
    return { mesh, sound };
  });

  const steps = Array.from({ length: STEP_POOL }, () => new THREE.Audio(listener));
  let stepVoice = 0;
  let stepClip = 0;
  let strideAcc = 0;
  let stepWait = STEP_MIN_INTERVAL;

  let playing = false;

  async function resumeContext() {
    const context = listener.context;
    if (context.state !== "running") await context.resume();
  }

  async function playSound(sound) {
    if (!sound?.buffer || sound.isPlaying) return;
    await resumeContext();
    sound.play();
  }

  function stopSound(sound) {
    if (sound?.isPlaying) sound.stop();
  }

  async function play() {
    await resumeContext();
    await Promise.all([
      ...ambient.map((sound) => playSound(sound)),
      playSound(engine),
      ...planeSounds.map(({ mesh, sound }) => (mesh.visible ? playSound(sound) : Promise.resolve())),
    ]);
    playing = ambient.some((sound) => sound.isPlaying) || engine.isPlaying;
    setWave(playing);
  }

  function pause() {
    ambient.forEach(stopSound);
    stopSound(engine);
    for (const { sound } of planeSounds) stopSound(sound);
    for (const step of steps) stopSound(step);
    strideAcc = 0;
    stepWait = STEP_MIN_INTERVAL;
    playing = false;
    setWave(false);
  }

  function strideForSpeed(speed) {
    const t = Math.min(1, Math.max(0, (speed - STEP_SPEED_REF) / (STEP_SPEED_REF * 2)));
    return STEP_STRIDE_WALK + (STEP_STRIDE_SPRINT - STEP_STRIDE_WALK) * t;
  }

  async function playStep() {
    if (!playing || stepBufs.length === 0) return;
    const voice = steps[stepVoice++ % STEP_POOL];
    const buffer = stepBufs[stepClip++ % stepBufs.length];
    voice.setBuffer(buffer);
    voice.setPlaybackRate(1);
    voice.setVolume(AMBIENT_GAIN * STEP_GAIN);
    if (voice.isPlaying) voice.stop();
    await resumeContext();
    voice.play();
    stepWait = 0;
  }

  function update(delta, { walking = false, speed = 0 } = {}) {
    if (playing) {
      for (const { mesh, sound } of planeSounds) {
        if (mesh.visible) playSound(sound).catch(() => {});
        else stopSound(sound);
      }
    }

    if (!playing || !walking || speed <= 0) {
      strideAcc = 0;
      stepWait = STEP_MIN_INTERVAL;
      return;
    }

    stepWait += delta;
    strideAcc += speed * delta;
    const stride = strideForSpeed(speed);
    if (strideAcc >= stride && stepWait >= STEP_MIN_INTERVAL) {
      strideAcc %= stride;
      playStep().catch(() => {});
    }
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (playing) pause();
    else play();
  });

  window.addEventListener(
    "pointerdown",
    () => {
      play();
    },
    { once: true },
  );

  return {
    listener,
    play,
    pause,
    update,
    isPlaying: () => playing,
    setVisible,
    setForceHidden,
    getState: () => ({
      playing,
      engine: engine.isPlaying,
      planes: planeSounds.map(({ mesh, sound }) => ({
        name: sound.name,
        visible: mesh.visible,
        playing: sound.isPlaying,
      })),
      steps: steps.filter((sound) => sound.isPlaying).length,
    }),
    button,
    root,
  };
}
