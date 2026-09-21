import { DEFAULT_LOOK_ID, LOOK_PRESETS } from "../look/presets.js";

export function createPostStub() {
  let currentId = DEFAULT_LOOK_ID;
  return {
    getLookId: () => currentId,
    applyLook(id) {
      if (LOOK_PRESETS[id]) currentId = id;
      return currentId;
    },
    setLensflareEnabled() {},
    setIntroPresentation() {},
    rainGlass: {
      uniforms: {},
      setAmount() {},
      getAmount: () => 0,
      setActive() {},
      dispose() {},
    },
  };
}
