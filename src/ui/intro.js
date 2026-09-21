function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function power2Out(t) {
  return 1 - (1 - t) * (1 - t);
}

function tween(from, to, duration, onUpdate, ease = power2Out) {
  return new Promise((resolve) => {
    const start = performance.now();
    const span = duration * 1000;
    function frame(now) {
      const t = Math.min(1, (now - start) / span);
      onUpdate(from + (to - from) * ease(t));
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

function splitLetters(element, className = "intro-letter") {
  const text = element.textContent.trim();
  element.textContent = "";
  element.setAttribute("aria-label", text);
  return [...text].map((char) => {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = char === " " ? "\u00a0" : char;
    span.setAttribute("aria-hidden", "true");
    element.appendChild(span);
    return span;
  });
}

function animate(element, keyframes, options) {
  return element.animate(keyframes, { fill: "forwards", ...options }).finished;
}

function createPerformanceNotice(message = "Ajustando desempenho") {
  const el = document.createElement("p");
  el.className = "performance-notice";
  el.textContent = message;
  el.setAttribute("aria-live", "polite");
  el.hidden = true;
  document.body.appendChild(el);

  return {
    show() {
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add("is-visible"));
    },
    async hide({ delay = 420 } = {}) {
      el.classList.remove("is-visible");
      await wait(delay);
      el.hidden = true;
    },
    destroy() {
      el.remove();
    },
  };
}

export function createIntroOverlay({ onStart } = {}) {
  const root = document.createElement("div");
  root.className = "intro-container";
  root.setAttribute("aria-hidden", "false");
  root.innerHTML = `
    <div class="intro-stack">
      <p class="intro-kicker">through the glass</p>
      <h1 class="intro-brand" aria-label="INVESTIGA-PUNK">
        <span class="intro-brand-line">INVESTIGA</span>
        <span class="intro-brand-line intro-brand-line--accent">PUNK</span>
      </h1>
      <p class="intro-rule" aria-hidden="true"></p>
      <p class="intro-tagline">Um beco encharcado sob neon.</p>
      <div class="intro-actions">
        <button type="button" class="intro-button" disabled>ENTRAR</button>
      </div>
      <p class="intro-credit">Alexandre Lima · Donstark</p>
    </div>
  `;
  document.body.appendChild(root);

  const button = root.querySelector(".intro-button");
  const kicker = root.querySelector(".intro-kicker");
  const lines = [...root.querySelectorAll(".intro-brand-line")];
  const rule = root.querySelector(".intro-rule");
  const tagline = root.querySelector(".intro-tagline");
  const credit = root.querySelector(".intro-credit");
  const letters = lines.flatMap((line) => splitLetters(line));

  let started = false;
  const pending = [];

  function setInitial() {
    kicker.style.opacity = "0";
    kicker.style.transform = "translateY(12px)";
    for (const letter of letters) {
      letter.style.opacity = "0";
      letter.style.transform = "translateY(28px)";
      letter.style.filter = "blur(8px)";
    }
    rule.style.opacity = "0";
    rule.style.transform = "scaleX(0)";
    tagline.style.opacity = "0";
    tagline.style.transform = "translateY(14px)";
    button.style.opacity = "0";
    button.style.transform = "translateY(10px)";
    credit.style.opacity = "0";
    credit.style.transform = "translateY(8px)";
  }

  setInitial();

  async function playEnter() {
    setInitial();
    pending.push(
      animate(kicker, [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }], {
        duration: 700,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      }),
    );
    letters.forEach((letter, index) => {
      pending.push(
        animate(
          letter,
          [
            { opacity: 0, transform: "translateY(28px)", filter: "blur(8px)" },
            { opacity: 1, transform: "translateY(0)", filter: "blur(0px)" },
          ],
          {
            duration: 900,
            delay: 350 + index * 35,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          },
        ),
      );
    });
    pending.push(
      animate(rule, [{ opacity: 0, transform: "scaleX(0)" }, { opacity: 1, transform: "scaleX(1)" }], {
        duration: 750,
        delay: 700,
        easing: "cubic-bezier(0.65, 0, 0.35, 1)",
      }),
    );
    pending.push(
      animate(tagline, [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "translateY(0)" }], {
        duration: 750,
        delay: 1050,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      }),
    );
    pending.push(
      animate(button, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }], {
        duration: 650,
        delay: 1450,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      }).then(() => {
        button.disabled = false;
      }),
    );
    pending.push(
      animate(credit, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], {
        duration: 600,
        delay: 1550,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      }),
    );
    await Promise.all(pending);
  }

  async function playExit({ duration = 0.6 } = {}) {
    button.disabled = true;
    button.style.pointerEvents = "none";
    await animate(root, [{ opacity: 1 }, { opacity: 0 }], {
      duration: duration * 1000,
      easing: "ease-out",
    });
    root.remove();
  }

  async function start() {
    if (started || button.disabled) return;
    started = true;
    button.disabled = true;
    button.style.pointerEvents = "none";
    await playExit();
    await onStart?.();
  }

  button.addEventListener("click", start);

  return {
    root,
    playEnter,
    playExit,
    start,
    destroy() {
      button.removeEventListener("click", start);
      root.remove();
    },
  };
}

export async function runIntro({
  renderer,
  rainGlass,
  onReveal,
  setSmokeVisible,
  setIntroPresentation,
} = {}) {
  document.body.classList.add("is-intro");
  renderer.domElement.style.pointerEvents = "none";
  rainGlass?.setAmount(1);
  rainGlass?.setActive(true);
  setIntroPresentation?.(true);
  setSmokeVisible?.(false);

  const overlay = createIntroOverlay({
    onStart: async () => {
      const notice = createPerformanceNotice();
      notice.show();
      await wait(450);
      await tween(rainGlass?.getAmount?.() ?? 1, 0, 1.2, (value) => rainGlass?.setAmount(value));
      rainGlass?.dispose();
      setIntroPresentation?.(false);
      setSmokeVisible?.(true);
      await wait(1000);
      await notice.hide();
      notice.destroy();
      renderer.domElement.style.pointerEvents = "auto";
      document.body.classList.remove("is-intro");
      onReveal?.();
    },
  });

  await overlay.playEnter();
  return overlay;
}

export { tween, createPerformanceNotice };
