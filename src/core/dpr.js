import { PERF } from "../config.js";

export function createAdaptiveDpr(renderer, onChange) {
  let frames = 0;
  let elapsed = 0;

  return {
    update(delta) {
      if (!PERF.adaptiveDpr) return;
      frames += 1;
      elapsed += delta;
      if (elapsed < 1) return;

      const fps = frames / elapsed;
      frames = 0;
      elapsed = 0;
      const max = Math.min(window.devicePixelRatio, PERF.maxPixelRatio);
      const current = renderer.getPixelRatio();
      let next = current;
      if (fps < 38) next = Math.max(1, current - 0.15);
      else if (fps > 56) next = Math.min(max, current + 0.1);
      if (Math.abs(next - current) < 0.04) return;
      renderer.setPixelRatio(next);
      onChange?.(next);
    },
  };
}
