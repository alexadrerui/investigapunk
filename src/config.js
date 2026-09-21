/** Valores extraídos do bundle original (Three.js r185 / WebGPU + TSL). Recriação em r186. */

export const CITY_Y = -20;

/** Bloom das janelas/luzes internas relativo ao dos letreiros de neon (1 = igual). */
export const WINDOW_BLOOM_SCALE = 0.4;

export const CAMERA = {
  fovDesktop: 65,
  fovMobile: 100,
  near: 0.1,
  far: 300,
  position: [-138.564, -3.95, 34.181],
  target: [-120, -3, 30],
  walkEyeHeight: 1.55,
  walkAcceleration: 10,
  walkDeceleration: 14,
  moveSpeed: 3,
  sprintMultiplier: 3,
  mouseSensitivity: 0.002,
  crouchMultiplier: 0.55,
  sprintRampUp: 1.6,
  sprintRampDown: 2.2,
  walkFovBoost: 3,
  sprintFovBoost: 8,
  walkFovBlendSpeed: 2,
  sprintFovBlendSpeed: 2.5,
  playerRadius: 0.55,
  maxStepUp: 0.4,
  maxStepDown: 1.75,
  groundProbeHeight: 200,
  groundProbeDistance: 400,
  wallProbeDistance: 0.08,
  orbitResumeDistance: 6,
  thirdPersonDistance: 2.4,
  thirdPersonHeight: 0.35,
  thirdPersonMinDistance: 0.4,
  thirdPersonCollisionMargin: 0.15,
};

/** Personagem ual.glb + FootIK (three-player-controller). Altura-alvo em metros. */
export const PLAYER = {
  scale: 1.68 / 180,
  rotateY: Math.PI,
  idleAnim: "Idle_Loop",
  walkAnim: "Walk_Loop",
  runAnim: "Sprint_Loop",
  headBoneName: "Head",
  walkSpeedThreshold: 0.35,
  runSpeedThreshold: 5.4,
  firstPersonCameraOffset: [0, 0.15, 0.12],
  capsuleHeight: 180,
  capsuleRadius: 30,
  rideHeight: 40,
  soleHalfWidth: 7,
  soleToeExtend: 7,
  soleSkinThickness: 1.6,
  plantedHeightSpeed: 200,
  penetrationLiftSpeed: 200,
};

export const LIGHTING = {
  background: 0x080610,
  sun: {
    color: "#cfefff",
    intensity: 7.4,
    position: [23, 31, 3],
    shadowMap: 4096,
    shadowNear: 1,
    shadowExtent: 200,
    shadowFarExtra: 150,
    bias: -0.001,
    normalBias: 0.009,
    shadowIntensity: 1.4,
  },
  fill: {
    color: "#ffd6c8",
    intensity: 1.15,
    position: [-18, 22, -12],
  },
  streetlight: {
    color: 0xfff2c8,
    emissiveIntensity: 5.4,
    pointIntensity: 52,
    pointDistance: 18,
    pointDecay: 2,
    spotIntensity: 145,
    spotDistance: 26,
    spotAngle: Math.PI / 2.2,
    spotPenumbra: 0.75,
    spotDecay: 2,
    drop: 0.18,
  },
};

export const CAR = {
  position: [-128, -5.47, 33],
  rotationY: Math.PI / 2 + 0.6,
  scale: 1.1,
  /** Bloom das lanternas do carro relativo ao dos letreiros (1 = igual). */
  lightBloom: 0.6,
};

export const GROUND = {
  size: 400,
  y: -5.4,
  uvRepeat: 14.9,
  roughnessScale: 0.55,
  reflectionStrength: 0.14,
  reflectionBloom: 1,
  normalWarp: 0.022,
  rippleAmount: 1,
  rippleScale: 9.4,
  rippleSpeed: 3,
  rippleStrength: 0.028,
  rippleNormalStrength: 0.008,
  fogNear: 0,
  fogFar: 51,
};

export const RAIN = {
  count: 5000,
  opacity: 0.15,
  intensity: 0.45,
  splashOpacity: 0.18,
  splashSpeed: 6,
  fallSpeed: 0.7,
  splashSize: 1,
  splashStartScale: 0.1,
  splashEndScale: 1.4,
  areaWidth: 60,
  areaHeight: 60,
  cameraForwardOffset: 15,
  dropWidth: 0.04,
  dropHeight: 1.1,
  color: 0xdcf7ff,
};

export const SKY = {
  radius: 120,
  intensity: 0.35,
  turbidity: 6,
  rayleigh: 0.16,
  mieCoefficient: 0.001,
  mieDirectionalG: 0.5,
  elevation: -22,
  azimuth: 82.6,
  cloudCoverage: 0.92,
  cloudDensity: 0.78,
  cloudElevation: 0.38,
  cloudScale: 0.0002,
  cloudSpeed: 0.00002,
  nightLift: 0.028,
  nightCloud: 0.45,
  showSunDisc: false,
};

export const SMOKE = {
  // Fumaça volumétrica: puffs raymarcheados nos mesmos pontos do design
  // original, integrados ao pass de post-processing (ver postfx/volumetricFogTsl.js),
  // no estilo do exemplo three.js webgpu_postprocessing_fog.
  exhaustOpacity: 0.4,
  exhaustScale: 4,
  exhaustSpeed: 0.5,
  exhaust: [
    { x: 0.47, y: 0.52, z: -2.45 },
    { x: -0.51, y: 0.55, z: -2.42 },
  ],
  ambientOpacity: 0.4,
  ambientSpeed: 0.065,
  ambient: [
    { x: -138.5, y: -5, z: 36.2, scale: 9.5 },
    { x: -119.5, y: -4.85, z: 16.8, scale: 15 },
    { x: -135.5, y: -5, z: 36, scale: 5 },
    { x: -106.2, y: -5, z: 18, scale: 9.8 },
  ],
};

export const PLANES = [
  {
    curvePoints: [
      [-250, 17, 94.5],
      [-178.5, 17, 37.5],
      [-133.5, 17, 30.5],
      [17.5, 30.5, 25.5],
      [221.5, 40, 94.5],
    ],
    speed: 1,
    startOffset: 0,
    yawOffset: 0.098407346410207,
    loopDelay: 30,
  },
  {
    curvePoints: [
      [204, 60, -25],
      [115.5, 60, 39],
      [-22, 60, -4],
      [-152, 60, 39],
      [11.5, 60, 120],
      [50, 60, -19],
    ],
    speed: 1,
    startOffset: 0.4,
    yawOffset: 0.078407346410207,
    loopDelay: 30,
  },
];

export const BILLBOARDS = {
  materialNames: ["billboard_face", "billboard_fireguy", "billboard_3"],
  playDistance: 20,
  pauseDistance: 50,
};

export const LOOK = {
  bloom: { strength: 0.85, radius: 0.55, threshold: 0.18 },
  fogColor: [0.34, 0.37, 0.47],
  fogNear: 0,
  fogFar: 50,
  fogAmount: 0.8,
  gradeTint: [1.02, 0.9, 1.06],
  gradeOffset: [0.004, -0.006, 0.008],
  saturation: 1.06,
  contrast: 1.1,
  greenSuppress: 0.72,
  gradeMix: 0.7,
  chromaticStrength: 0.8,
  chromaticEdgeFalloff: 3.5,
  vignetteIntensity: 0.8,
  vignetteSmoothness: 0.64,
  grainIntensity: 0.12,
};

export const PERF = {
  maxPixelRatio: 1.5,
  adaptiveDpr: true,
  collisionRainResolution: 512,
  collisionRainFrameSkip: 1,
  groundReflectionScale: 0.5,
  aoResolutionScale: 0.5,
  aoSamples: 6,
  aoRadius: 0.4,
  aoScale: 1.7,
  aoThickness: 1,
  aoDistanceExponent: 1,
  aoDistanceFallOff: 1,
};

export function isMobile() {
  return window.matchMedia("(max-width: 900px)").matches;
}

export function isCoarsePointer() {
  // Só o ponteiro primário. maxTouchPoints > 0 é comum em PCs Windows
  // com tela touch ou driver de digitizer e não deve forçar HUD de celular.
  return typeof window.matchMedia === "function"
    && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

export function isTouchUi() {
  return isCoarsePointer();
}

export function getFov() {
  return isMobile() ? CAMERA.fovMobile : CAMERA.fovDesktop;
}
