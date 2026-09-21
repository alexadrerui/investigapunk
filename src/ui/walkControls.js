import { isCoarsePointer, isMobile } from "../config.js";

const CLOSE_ICON = `
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
`;

const CHIP_ICON = `
  <svg class="walk-controls__chip-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect class="walk-controls__chip-key" x="8.5" y="3" width="7" height="5.5" rx="1" />
    <rect class="walk-controls__chip-key" x="3" y="10.5" width="5.5" height="5.5" rx="1" />
    <rect class="walk-controls__chip-key" x="9.25" y="10.5" width="5.5" height="5.5" rx="1" />
    <rect class="walk-controls__chip-key" x="15.5" y="10.5" width="5.5" height="5.5" rx="1" />
    <rect class="walk-controls__chip-key walk-controls__chip-key--shift" x="3" y="18" width="18" height="3" rx="0.75" />
  </svg>
`;

function walkKey(x, y, w, h, label, extraClass = "") {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return `
    <rect class="walk-key walk-key--active${extraClass ? ` ${extraClass}` : ""}" x="${x}" y="${y}" width="${w}" height="${h}" />
    <text class="walk-key-label walk-key-label--active" x="${cx}" y="${cy}">${label}</text>
  `;
}

function walkMouse(x, y, scale) {
  return `
    <g transform="translate(${x}, ${y}) scale(${scale})">
      <path class="walk-mouse walk-mouse--active" d="M12 22C16.13 22 19.5 18.63 19.5 14.5V9.5C19.5 5.37 16.13 2 12 2C7.87 2 4.5 5.37 4.5 9.5V14.5C4.5 18.63 7.87 22 12 22Z" />
      <path class="walk-mouse walk-mouse--active" d="M12 11C11.17 11 10.5 10.33 10.5 9.5V7.5C10.5 6.67 11.17 6 12 6C12.82 6 13.5 6.67 13.5 7.5V9.5C13.5 10.33 12.82 11 12 11Z" />
      <path class="walk-mouse walk-mouse--active" d="M12 6V2" />
    </g>
  `;
}

function callout(x, y, width, title, copy) {
  const cx = x + width / 2;
  return `
    <g class="walk-callout">
      <line class="walk-callout-accent" x1="${cx - 16}" y1="${y}" x2="${cx + 16}" y2="${y}" />
      <text class="walk-callout-title" x="${cx}" y="${y + 22}">${title}</text>
      <text class="walk-callout-copy" x="${cx}" y="${y + 40}">${copy}</text>
    </g>
  `;
}

function diagram() {
  return `
    <svg class="walk-controls__diagram" viewBox="0 0 860 440" role="img" aria-label="Controles do modo caminhada">
      <line class="walk-leader" x1="430" y1="78" x2="314" y2="112" />
      <line class="walk-leader" x1="132" y1="248" x2="256" y2="274" />
      <line class="walk-leader" x1="430" y1="368" x2="408" y2="302" />
      <line class="walk-leader" x1="706" y1="248" x2="620" y2="220" />
      ${callout(318, 18, 224, "Movimento", "WASD para andar")}
      ${callout(38, 220, 188, "Corrida", "Segure Shift")}
      ${callout(318, 348, 224, "Agachar", "Aperte C para alternar")}
      ${callout(634, 220, 188, "Olhar", "Clique para travar o mouse")}
      ${walkKey(314, 118, 56, 56, "W")}
      ${walkKey(250, 182, 56, 56, "A")}
      ${walkKey(314, 182, 56, 56, "S")}
      ${walkKey(378, 182, 56, 56, "D")}
      ${walkKey(232, 262, 148, 40, "Shift", "walk-key--shift")}
      ${walkKey(388, 262, 40, 40, "C")}
      ${walkMouse(560, 140, 3.2)}
    </svg>
  `;
}

function isDesktopHud() {
  return !isCoarsePointer() && !isMobile() && !window.matchMedia("(max-width: 768px)").matches;
}

export function createWalkControls({ state, domElement } = {}) {
  const root = document.createElement("div");
  root.className = "walk-controls walk-controls--hidden";
  root.setAttribute("data-ui-block-look", "true");
  root.innerHTML = `
    <button type="button" class="walk-controls__chip" aria-label="Mostrar controles" aria-expanded="false">
      ${CHIP_ICON}
      <span class="walk-controls__chip-label">Controles</span>
    </button>
    <div class="walk-controls__overlay" hidden>
      <div class="walk-controls__backdrop" data-close="true"></div>
      <button type="button" class="walk-controls__close" aria-label="Fechar controles">
        ${CLOSE_ICON}
      </button>
      <div class="walk-controls__content" role="dialog" aria-modal="true" aria-label="Controles">
        <header class="walk-controls__header">
          <p class="walk-controls__eyebrow">Interface</p>
          <h2 class="walk-controls__title">Navegação</h2>
        </header>
        ${diagram()}
        <p class="walk-controls__footer">Esc para fechar</p>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const chip = root.querySelector(".walk-controls__chip");
  const overlay = root.querySelector(".walk-controls__overlay");
  const backdrop = root.querySelector(".walk-controls__backdrop");
  const closeBtn = root.querySelector(".walk-controls__close");

  let walking = false;
  let forceHidden = false;
  let overlayOpen = false;

  function sync() {
    const visible = walking && !forceHidden && isDesktopHud() && !overlayOpen
      && !document.body.classList.contains("is-intro");
    root.classList.toggle("walk-controls--hidden", !visible);
    root.classList.toggle("walk-controls--force-hidden", forceHidden && !overlayOpen);
    root.classList.toggle("walk-controls--overlay-open", overlayOpen);
  }

  function exitLock() {
    if (domElement && document.pointerLockElement === domElement) {
      document.exitPointerLock?.();
    }
  }

  function open() {
    if (overlayOpen) return;
    exitLock();
    overlayOpen = true;
    overlay.hidden = false;
    chip.setAttribute("aria-expanded", "true");
    state?.openPanel?.("walk-controls");
    sync();
  }

  function close({ skipStateClose = false } = {}) {
    if (!overlayOpen) return;
    overlayOpen = false;
    overlay.hidden = true;
    chip.setAttribute("aria-expanded", "false");
    if (!skipStateClose && state?.openedPanel === "walk-controls") state.closePanel();
    sync();
  }

  const unsubscribe = state?.subscribe?.(({ openedPanel }) => {
    if (overlayOpen && openedPanel !== "walk-controls") close({ skipStateClose: true });
  });

  function onKey(event) {
    if (event.code === "Escape" && overlayOpen) {
      event.preventDefault();
      close();
    }
  }

  chip.addEventListener("click", open);
  backdrop.addEventListener("click", () => close());
  closeBtn.addEventListener("click", () => close());
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", sync);

  return {
    root,
    setVisible(next) {
      walking = !!next;
      if (!walking) close();
      sync();
    },
    setForceHidden(next) {
      forceHidden = !!next;
      sync();
    },
    isOverlayOpen: () => overlayOpen,
    destroy() {
      close();
      unsubscribe?.();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", sync);
      root.remove();
    },
  };
}
