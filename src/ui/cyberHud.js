import { isMobile } from "../config.js";

const VITALS = 82;
const ENERGY = 64;
const SIGNAL = 98;
const COMPACT_DELAY = 0.6;

function lifeRingSvg() {
  const ticks = Array.from({ length: 24 }, (_, index) => {
    const angle = (index * 360) / 24 * Math.PI / 180;
    const x1 = 32 + Math.cos(angle) * 24;
    const y1 = 32 + Math.sin(angle) * 24;
    const x2 = 32 + Math.cos(angle) * 27;
    const y2 = 32 + Math.sin(angle) * 27;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(34,211,238,0.5)" stroke-width="1" />`;
  }).join("");

  return `
    <svg class="hud-life-ring" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="hudRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#a855f7" />
          <stop offset="50%" stop-color="#22d3ee" />
          <stop offset="100%" stop-color="#a855f7" />
        </linearGradient>
        <filter id="hudRingGlow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(168,85,247,0.15)" stroke-width="2" />
      <circle
        cx="32"
        cy="32"
        r="28"
        fill="none"
        stroke="url(#hudRingGrad)"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-dasharray="132 44"
        stroke-dashoffset="0"
        filter="url(#hudRingGlow)"
        class="hud-life-ring-arc"
      />
      <g class="hud-life-ticks">${ticks}</g>
      <path
        d="M32 38c-4-5-8-8-8-12a4 4 0 0 1 8 0 4 4 0 0 1 8 0c0 4-4 7-8 12z"
        fill="none"
        stroke="#22d3ee"
        stroke-width="1.5"
        stroke-linejoin="round"
        filter="url(#hudRingGlow)"
        class="hud-life-heart"
      />
    </svg>
  `;
}

const SIGNAL_ICON = `
  <svg class="hud-signal-icon" viewBox="0 0 24 12" aria-hidden="true">
    <rect x="0" y="8" width="2" height="4" fill="currentColor" rx="0.5" />
    <rect x="4" y="5" width="2" height="7" fill="currentColor" rx="0.5" />
    <rect x="8" y="2" width="2" height="10" fill="currentColor" rx="0.5" />
    <rect x="12" y="4" width="2" height="8" fill="currentColor" rx="0.5" />
    <rect x="16" y="0" width="2" height="12" fill="currentColor" rx="0.5" />
    <rect x="20" y="6" width="2" height="6" fill="currentColor" rx="0.5" />
  </svg>
`;

export function syncLayoutMobile() {
  document.documentElement.classList.toggle("layout-mobile", isMobile());
}

export function createCyberHud() {
  const root = document.createElement("div");
  root.className = "cyber-hud";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="cyber-hud-frame">
      <span class="cyber-hud-corner cyber-hud-corner--tl"></span>
      <span class="cyber-hud-corner cyber-hud-corner--tr"></span>
      <span class="cyber-hud-corner cyber-hud-corner--bl"></span>
      <span class="cyber-hud-corner cyber-hud-corner--br"></span>
      <div class="cyber-hud-inner">
        <div class="hud-avatar">
          ${lifeRingSvg()}
          <span class="hud-compact-value">${VITALS}%</span>
        </div>
        <div class="hud-stats">
          <div class="hud-vitals">
            <div class="hud-vitals-header">
              <span class="hud-label">VITALS</span>
              <span class="hud-value">${VITALS}%</span>
            </div>
            <div class="hud-gauge">
              <div class="hud-gauge-track">
                <div class="hud-gauge-fill" style="width: ${VITALS}%"></div>
              </div>
            </div>
          </div>
          <div class="hud-substats">
            <div class="hud-stat-chip">
              <span class="hud-stat-dot hud-stat-dot--energy"></span>
              <span class="hud-label">ENERGY</span>
              <span class="hud-value">${ENERGY}%</span>
            </div>
            <div class="hud-stat-chip">
              <span class="hud-stat-icon">${SIGNAL_ICON}</span>
              <span class="hud-label">SIGNAL</span>
              <span class="hud-value">${SIGNAL}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  let walk = null;
  let movingFor = 0;
  let compact = false;

  function setCompact(next) {
    if (compact === next) return;
    compact = next;
    root.classList.toggle("cyber-hud--compact", compact);
    document.body.classList.toggle("ui-moving-compact", compact);
  }

  function update(delta) {
    if (!walk?.isActive?.()) {
      movingFor = 0;
      setCompact(false);
      return;
    }
    if (walk.isMoving?.()) {
      movingFor += delta;
      if (movingFor >= COMPACT_DELAY) setCompact(true);
      return;
    }
    movingFor = 0;
    setCompact(false);
  }

  function bindWalkControls(next) {
    walk = next;
    movingFor = 0;
    setCompact(false);
  }

  syncLayoutMobile();

  return {
    root,
    update,
    bindWalkControls,
  };
}
