import { isMobile } from "../config.js";
import { DEFAULT_LOOK_ID, LOOK_PRESET_ORDER, LOOK_PRESETS } from "../look/presets.js";
import { createCyberHud, syncLayoutMobile } from "./cyberHud.js";

const LOOK_KEY = "investigapunk.look";
const DEV_KEY = "investigapunk.dev";

const ICONS = {
  close: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 10.5V17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="7.5" r="1" fill="currentColor"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M18 6l-1.6 1.6M7.6 16.4L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  reset: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4.5 5.5v4h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

const LOOK_ICONS = {
  neutral: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="1.8"/></svg>`,
  neonNoir: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 16h4l4-10 4 10h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  magentaRain: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v3M8 6v2M16 6v2M7 14a5 5 0 0 0 10 0c0-3-5-7-5-7s-5 4-5 7z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  tealDusk: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  silentHill: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 18h16M6 18 12 6l6 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  sinCity: `<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="5" width="14" height="14" stroke="currentColor" stroke-width="1.8"/><path d="M5 12h14M12 5v14" stroke="currentColor" stroke-width="1.6"/></svg>`,
};

function readStore(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

function createUiState() {
  let openedPanel = null;
  const listeners = new Set();

  function notify() {
    document.body.classList.toggle("panel-open", !!openedPanel);
    const snapshot = { openedPanel };
    for (const listener of listeners) listener(snapshot);
  }

  return {
    get openedPanel() {
      return openedPanel;
    },
    openPanel(id) {
      openedPanel = id;
      notify();
    },
    closePanel() {
      openedPanel = null;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener({ openedPanel });
      return () => listeners.delete(listener);
    },
  };
}

function createHeader(state, { onOpenAbout, onOpenSettings }) {
  const root = document.createElement("div");
  root.className = "app-header app-header--force-hidden";
  root.setAttribute("data-ui-block-look", "true");
  root.innerHTML = `
    <div class="app-header-brand"></div>
    <div class="app-header-actions">
      <button type="button" class="app-header-about-btn" aria-label="Sobre">
        <span class="app-header-action-icon">${ICONS.info}</span>
        <span class="app-header-about-label">SOBRE</span>
      </button>
      <button type="button" class="app-header-action-btn app-header-icon-btn" aria-label="Configurações">
        <span class="app-header-action-icon">${ICONS.gear}</span>
      </button>
    </div>
  `;
  const hud = createCyberHud();
  root.querySelector(".app-header-brand").appendChild(hud.root);
  const aboutBtn = root.querySelector(".app-header-about-btn");
  const settingsBtn = root.querySelector(".app-header-icon-btn");
  aboutBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    state.openPanel("about");
    onOpenAbout?.();
  });
  settingsBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    state.openPanel("settings");
    onOpenSettings?.();
  });
  document.body.appendChild(root);
  return {
    root,
    hud,
    actions: root.querySelector(".app-header-actions"),
    show() {
      root.classList.add("show");
      root.classList.remove("app-header--force-hidden");
    },
    hide() {
      root.classList.remove("show");
    },
  };
}

function createAbout(state) {
  const root = document.createElement("div");
  root.className = "about-overlay";
  root.hidden = true;
  root.setAttribute("data-ui-block-look", "true");
  root.innerHTML = `
    <button type="button" class="close-button-panel" aria-label="Fechar">${ICONS.close}</button>
    <div class="about-content">
      <div class="about-body">
        <div class="about-brand">
          <p class="about-brand-title">INVESTIGAPUNK</p>
          <small class="about-brand-subtitle">Recriação WebGL de Threejs-Punk</small>
        </div>
        <div class="about-copy">
          <div class="about-copy-col">
            <p class="about-lead">
              Investigapunk te joga num beco encharcado entre um fundo de Blade Runner
              e um boot sequence — neon, asfalto molhado e uma cidade que nunca
              desliga as luzes.
            </p>
            <p class="about-lead">
              Esta versão recria a cena original em WebGL “legacy”: reflexos, chuva,
              vidro molhado e o look neon-noir, sem depender de WebGPU.
            </p>
          </div>
          <div class="about-copy-col">
            <p class="about-lead">
              Esta recriação WebGL é de Alexandre Lima — Donstark. O convite é o
              mesmo: andar, olhar para cima e deixar a chuva contar a história.
            </p>
            <p class="about-lead">
              WASD para andar, Shift para correr, clique para olhar. No toque, use
              o joystick. Looks e qualidade ficam em Configurações.
            </p>
          </div>
        </div>
      </div>
      <div class="about-footer">
        <div class="about-buttons">
          <button type="button" class="refresh-button-panel" data-link="donstark">Alexandre Lima — Donstark</button>
        </div>
        <p class="about-model-credits">Por Alexandre Lima — Donstark</p>
        <p class="about-recommended about-recommended--desktop">
          <span class="about-recommended-title">Setup recomendado</span>
          GPU dedicada e 16 GB de RAM. Chrome ou Edge (latest) · WebGL 2 · 1080p em tela cheia.
          WASD + Shift · clique para olhar · fones recomendados.
        </p>
        <p class="about-recommended about-recommended--mobile">
          <span class="about-recommended-title">Setup recomendado</span>
          iPhone 15 ou Android flagship 2023+ · Chrome (latest) · WebGL 2 · paisagem.
          Joystick na tela · fones recomendados.
        </p>
      </div>
    </div>
  `;
  const desktop = root.querySelector(".about-recommended--desktop");
  const mobile = root.querySelector(".about-recommended--mobile");

  function syncLayout() {
    const mobileLayout = isMobile();
    desktop.hidden = mobileLayout;
    mobile.hidden = !mobileLayout;
  }

  function open() {
    syncLayout();
    root.hidden = false;
  }

  function hide() {
    root.hidden = true;
  }

  function close() {
    hide();
    if (state.openedPanel === "about") state.closePanel();
  }

  root.querySelector(".close-button-panel").addEventListener("click", close);
  root.querySelector("[data-link=donstark]").addEventListener("click", () => {
    window.open("https://x.com/Donstark", "_blank", "noopener,noreferrer");
  });
  window.addEventListener("resize", () => {
    if (!root.hidden) syncLayout();
  });
  document.body.appendChild(root);
  return { root, open, close, hide };
}

function createSettings(state, { getLookId, onLookChange, getDevMode, onDevModeChange, onReset }) {
  const root = document.createElement("div");
  root.className = "settings-overlay";
  root.setAttribute("data-ui-block-look", "true");
  root.hidden = true;
  root.innerHTML = `
    <div class="settings-glass" role="dialog" aria-modal="true" aria-label="Configurações">
      <button type="button" class="settings-close" aria-label="Fechar">${ICONS.close}</button>
      <div class="settings-options">
        <div class="settings-section">
          <p class="settings-section-title">Look</p>
          <div class="settings-look-grid" role="group" aria-label="Look de cor">
            ${LOOK_PRESET_ORDER.map((id) => {
              const preset = LOOK_PRESETS[id];
              return `<button type="button" class="settings-look-btn" data-look-preset="${id}" aria-pressed="false">
                <span class="settings-look-icon">${LOOK_ICONS[id] ?? LOOK_ICONS.neutral}</span>
                <span class="settings-look-label">${preset.label}</span>
              </button>`;
            }).join("")}
          </div>
        </div>
        <div class="settings-divider" role="separator"></div>
        <label class="settings-option">
          <span class="settings-option-text">
            <span class="settings-option-title">Modo desenvolvimento</span>
          </span>
          <input type="checkbox" class="settings-toggle-input" data-development-mode aria-label="Modo desenvolvimento" />
          <span class="settings-toggle" aria-hidden="true"></span>
        </label>
        <div class="settings-divider" role="separator"></div>
        <button type="button" class="settings-restart-btn" data-restart>
          <span class="settings-restart-icon">${ICONS.reset}</span>
          <span>Resetar configs</span>
        </button>
        <p class="settings-restart-hint">Volta o look ao padrão e desliga o modo desenvolvimento</p>
      </div>
    </div>
  `;
  const glass = root.querySelector(".settings-glass");
  const devInput = root.querySelector("[data-development-mode]");
  const lookButtons = [...root.querySelectorAll("[data-look-preset]")];

  function syncLook(id = getLookId()) {
    const current = LOOK_PRESETS[id] ? id : DEFAULT_LOOK_ID;
    for (const button of lookButtons) {
      const active = button.dataset.lookPreset === current;
      button.classList.toggle("settings-look-btn--active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function open() {
    devInput.checked = getDevMode();
    syncLook();
    root.hidden = false;
  }

  function hide() {
    root.hidden = true;
  }

  function close() {
    hide();
    if (state.openedPanel === "settings") state.closePanel();
  }

  root.addEventListener("click", (event) => {
    if (event.target === root) close();
  });
  glass.addEventListener("click", (event) => event.stopPropagation());
  root.querySelector(".settings-close").addEventListener("click", close);
  for (const button of lookButtons) {
    button.addEventListener("click", () => {
      const id = button.dataset.lookPreset;
      onLookChange?.(id);
      syncLook(id);
    });
  }
  devInput.addEventListener("change", () => onDevModeChange?.(devInput.checked));
  root.querySelector("[data-restart]").addEventListener("click", () => {
    if (window.confirm("Resetar configs? O look volta ao padrão e o modo desenvolvimento desliga.")) {
      onReset?.();
      close();
    }
  });
  document.body.appendChild(root);
  return { root, open, close, hide, syncLook, syncDev: (value) => { devInput.checked = !!value; } };
}

export function readStoredLook() {
  const stored = readStore(LOOK_KEY, DEFAULT_LOOK_ID);
  return LOOK_PRESETS[stored] ? stored : DEFAULT_LOOK_ID;
}

export function readStoredDevMode() {
  return readStore(DEV_KEY, "0") === "1";
}

export function createChrome({
  applyLook,
  getLookId,
  applyDevelopmentMode,
} = {}) {
  const state = createUiState();
  let devMode = readStoredDevMode();

  const about = createAbout(state);
  const settings = createSettings(state, {
    getLookId,
    onLookChange(id) {
      applyLook?.(id);
      writeStore(LOOK_KEY, id);
      settings.syncLook(id);
    },
    getDevMode: () => devMode,
    onDevModeChange(value) {
      devMode = !!value;
      writeStore(DEV_KEY, devMode ? "1" : "0");
      applyDevelopmentMode?.(devMode);
    },
    onReset() {
      devMode = false;
      writeStore(LOOK_KEY, DEFAULT_LOOK_ID);
      writeStore(DEV_KEY, "0");
      applyLook?.(DEFAULT_LOOK_ID);
      applyDevelopmentMode?.(false);
      settings.syncLook(DEFAULT_LOOK_ID);
      settings.syncDev(false);
    },
  });
  const header = createHeader(state, {
    onOpenAbout: () => about.open(),
    onOpenSettings: () => settings.open(),
  });
  syncLayoutMobile();
  window.addEventListener("resize", syncLayoutMobile);

  let audioUi = null;

  state.subscribe(({ openedPanel }) => {
    if (openedPanel === "about") about.open();
    else about.hide();
    if (openedPanel === "settings") settings.open();
    else settings.hide();
    const hideAudio = openedPanel === "about" || openedPanel === "settings";
    audioUi?.setForceHidden(hideAudio);
  });

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !state.openedPanel) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      about.close();
      settings.close();
      state.closePanel();
    },
    true,
  );

  return {
    state,
    header,
    hud: header.hud,
    about,
    settings,
    isDevMode: () => devMode,
    persistLook(id) {
      writeStore(LOOK_KEY, id);
      settings.syncLook(id);
    },
    attachAudio(audio) {
      audioUi = audio;
    },
    show() {
      header.show();
      audioUi?.setVisible(true);
      applyDevelopmentMode?.(devMode);
    },
  };
}
