import { DEFAULT_LOOK_ID, LOOK_PRESET_ORDER, LOOK_PRESETS } from "../look/presets.js";

export function createLookBar(applyLook, getLookId = () => DEFAULT_LOOK_ID) {
  const root = document.createElement("div");
  root.className = "look-bar";
  root.setAttribute("data-ui-block-look", "");
  root.innerHTML = LOOK_PRESET_ORDER.map((id, index) => {
    const preset = LOOK_PRESETS[id];
    return `<button type="button" class="look-btn" data-look-preset="${id}" aria-pressed="false">${index + 1} ${preset.label}</button>`;
  }).join("");
  root.classList.add("look-bar--hidden");
  document.body.appendChild(root);

  function sync(id = getLookId()) {
    const current = LOOK_PRESETS[id] ? id : DEFAULT_LOOK_ID;
    for (const button of root.querySelectorAll("[data-look-preset]")) {
      const active = button.dataset.lookPreset === current;
      button.classList.toggle("look-btn--active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function setLook(id) {
    if (!LOOK_PRESETS[id]) return;
    applyLook(id);
    sync(id);
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-look-preset]");
    if (!button) return;
    event.stopPropagation();
    setLook(button.dataset.lookPreset);
  });

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (root.classList.contains("look-bar--hidden")) return;
    if (document.body.classList.contains("is-intro")) return;
    if (document.body.classList.contains("panel-open")) return;
    const index = Number(event.code.replace("Digit", "")) - 1;
    if (index < 0 || index >= LOOK_PRESET_ORDER.length) return;
    if (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(event.target.tagName)) return;
    setLook(LOOK_PRESET_ORDER[index]);
  });

  sync();
  return {
    root,
    setLook,
    sync,
    setVisible(visible) {
      root.classList.toggle("look-bar--hidden", !visible);
    },
  };
}
