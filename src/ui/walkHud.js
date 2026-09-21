import { isCoarsePointer, isTouchUi } from "../config.js";
import { createWalkControls } from "./walkControls.js";

const MOVE_HINT_DELAY = 5000;
const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const JOYSTICK_DEADZONE = 0.12;

function moveHintKeys() {
  return `
    <svg class="move-hint__keys" viewBox="0 0 74 48" aria-hidden="true">
      <rect class="move-hint__key move-hint__key--active" x="26" y="0" width="22" height="22" rx="2" />
      <text class="move-hint__key-label move-hint__key-label--active" x="37" y="11">W</text>
      <rect class="move-hint__key move-hint__key--active" x="0" y="26" width="22" height="22" rx="2" />
      <text class="move-hint__key-label move-hint__key-label--active" x="11" y="37">A</text>
      <rect class="move-hint__key move-hint__key--active" x="26" y="26" width="22" height="22" rx="2" />
      <text class="move-hint__key-label move-hint__key-label--active" x="37" y="37">S</text>
      <rect class="move-hint__key move-hint__key--active" x="52" y="26" width="22" height="22" rx="2" />
      <text class="move-hint__key-label move-hint__key-label--active" x="63" y="37">D</text>
    </svg>
  `;
}

function createWalkPrompt(canvas) {
  const root = document.createElement("button");
  root.type = "button";
  root.className = "walk-prompt";
  root.setAttribute("data-ui-block-look", "true");
  root.hidden = true;
  root.innerHTML = `
    <div class="walk-prompt-frame">
      <div class="walk-prompt-pulse" aria-hidden="true"></div>
      <span class="walk-prompt-corner walk-prompt-corner--tl"></span>
      <span class="walk-prompt-corner walk-prompt-corner--tr"></span>
      <span class="walk-prompt-corner walk-prompt-corner--bl"></span>
      <span class="walk-prompt-corner walk-prompt-corner--br"></span>
      <div class="walk-prompt-inner">
        <span class="walk-prompt-kicker">Modo caminhada</span>
        <span class="walk-prompt-title">Clique para olhar</span>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  const title = root.querySelector(".walk-prompt-title");

  function syncCopy() {
    if (isCoarsePointer()) {
      title.textContent = "Arraste para olhar";
      root.setAttribute("aria-label", "Arraste para olhar");
      root.classList.add("walk-prompt--passive");
    } else {
      title.textContent = "Clique para olhar";
      root.setAttribute("aria-label", "Clique para ativar o olhar");
      root.classList.remove("walk-prompt--passive");
    }
  }

  function render({ walking = false, pointerLocked = false, hasTouchLooked = false } = {}) {
    syncCopy();
    const intro = document.body.classList.contains("is-intro");
    const panel = document.body.classList.contains("panel-open");
    const visible = isCoarsePointer()
      ? walking && !hasTouchLooked && !intro && !panel
      : walking && !pointerLocked && !intro && !panel;
    root.hidden = !visible;
    root.classList.toggle("walk-prompt--visible", visible);
  }

  root.addEventListener("click", (event) => {
    if (isCoarsePointer()) return;
    event.preventDefault();
    event.stopPropagation();
    if (document.pointerLockElement) return;
    canvas.requestPointerLock?.();
  });

  return { root, render };
}

function createMoveHint() {
  const root = document.createElement("div");
  root.className = "move-hint";
  root.setAttribute("data-ui-block-look", "true");
  root.hidden = true;
  root.setAttribute("role", "status");
  root.innerHTML = `
    <div class="move-hint__frame">
      <span class="move-hint__corner move-hint__corner--tl"></span>
      <span class="move-hint__corner move-hint__corner--tr"></span>
      <span class="move-hint__corner move-hint__corner--bl"></span>
      <span class="move-hint__corner move-hint__corner--br"></span>
      <div class="move-hint__inner">
        ${moveHintKeys()}
        <div class="move-hint__copy">
          <span class="move-hint__kicker">Movimento</span>
          <span class="move-hint__title">Use WASD para andar</span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  let walking = false;
  let dismissed = false;
  let timer = 0;

  function clearTimer() {
    if (timer) window.clearTimeout(timer);
    timer = 0;
  }

  function setVisible(visible) {
    root.hidden = !visible;
    root.classList.toggle("move-hint--visible", visible);
  }

  function hide() {
    clearTimer();
    setVisible(false);
  }

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    hide();
  }

  function schedule() {
    clearTimer();
    if (isCoarsePointer() || !walking || dismissed || !document.pointerLockElement) return;
    timer = window.setTimeout(() => {
      timer = 0;
      if (!isCoarsePointer() && walking && !dismissed && document.pointerLockElement) setVisible(true);
    }, MOVE_HINT_DELAY);
  }

  function render(state = {}) {
    walking = !!state.walking;
    if (state.moving) dismiss();
    if (!walking || isCoarsePointer() || document.body.classList.contains("panel-open")) {
      hide();
      return;
    }
    if (document.pointerLockElement) {
      setVisible(false);
      schedule();
      return;
    }
    hide();
  }

  window.addEventListener("keydown", (event) => {
    if (MOVE_KEYS.has(event.code)) dismiss();
  });

  return { root, render, dismiss, destroy: hide };
}

function createJoystick(rig) {
  const root = document.createElement("div");
  root.className = "virtual-joystick";
  root.setAttribute("data-ui-block-look", "true");
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="virtual-joystick__base">
      <div class="virtual-joystick__knob"></div>
    </div>
  `;
  document.body.appendChild(root);
  const base = root.querySelector(".virtual-joystick__base");
  const knob = root.querySelector(".virtual-joystick__knob");

  let walking = false;
  let pointerId = null;
  const center = { x: 0, y: 0 };

  function reset() {
    rig.setMoveAxes?.(0, 0);
    knob.style.transform = "translate(-50%, -50%)";
    pointerId = null;
  }

  function render(state = {}) {
    walking = !!state.walking;
    const intro = document.body.classList.contains("is-intro");
    const visible = walking && !intro && isTouchUi() && !document.body.classList.contains("panel-open");
    root.hidden = !visible;
    root.classList.toggle("virtual-joystick--visible", visible);
    document.body.classList.toggle("has-touch-move", visible);
    if (!visible) reset();
  }

  function travel() {
    const baseBox = base.getBoundingClientRect();
    const knobBox = knob.getBoundingClientRect();
    return Math.max(24, (baseBox.width - knobBox.width) / 2);
  }

  function apply(clientX, clientY) {
    const max = travel();
    const dx = clientX - center.x;
    const dy = clientY - center.y;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, max);
    const angle = Math.atan2(dy, dx);
    const nx = Math.cos(angle) * clamped;
    const ny = Math.sin(angle) * clamped;
    knob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
    const ax = nx / max;
    const ay = ny / max;
    const mag = Math.hypot(ax, ay);
    if (mag <= JOYSTICK_DEADZONE) {
      rig.setMoveAxes?.(0, 0);
      return;
    }
    rig.setMoveAxes?.(ax / mag, ay / mag);
  }

  function captureCenter() {
    const box = base.getBoundingClientRect();
    center.x = box.left + box.width / 2;
    center.y = box.top + box.height / 2;
  }

  root.addEventListener("pointerdown", (event) => {
    if (!walking || !isTouchUi()) return;
    event.preventDefault();
    event.stopPropagation();
    pointerId = event.pointerId;
    captureCenter();
    root.setPointerCapture?.(event.pointerId);
    apply(event.clientX, event.clientY);
  });

  root.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    apply(event.clientX, event.clientY);
  });

  function release(event) {
    if (pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (root.hasPointerCapture?.(event.pointerId)) root.releasePointerCapture?.(event.pointerId);
    reset();
  }

  root.addEventListener("pointerup", release);
  root.addEventListener("pointercancel", release);

  return { root, render, reset };
}

export function createWalkHud(rig, canvas, state) {
  const prompt = createWalkPrompt(canvas);
  const hint = createMoveHint();
  const joystick = createJoystick(rig);
  const controls = createWalkControls({ state, domElement: canvas });

  const unsubscribeState = state?.subscribe?.(({ openedPanel }) => {
    controls.setForceHidden(openedPanel === "settings" || openedPanel === "about");
  });

  function render(walkState) {
    prompt.render(walkState);
    hint.render(walkState);
    joystick.render(walkState);
    const intro = document.body.classList.contains("is-intro");
    controls.setVisible(!!walkState?.walking && !intro);
  }

  const unsubscribe = rig.subscribe?.(render);
  document.addEventListener("pointerlockchange", () => render(rig.getWalkState?.() ?? {}));
  window.addEventListener("resize", () => render(rig.getWalkState?.() ?? {}));

  return {
    prompt: prompt.root,
    hint: hint.root,
    joystick: joystick.root,
    controls: controls.root,
    render,
    destroy() {
      unsubscribe?.();
      unsubscribeState?.();
      prompt.root.remove();
      hint.root.remove();
      joystick.root.remove();
      controls.destroy();
      document.body.classList.remove("has-touch-move");
    },
  };
}
