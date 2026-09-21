export function createLoaderUi() {
  const root = document.createElement("div");
  root.className = "loader";
  root.innerHTML = `
    <h1>Investigapunk</h1>
    <p data-status>BOOTING SCENE</p>
    <div class="loader-bar"><span data-bar></span></div>
  `;
  document.body.appendChild(root);
  const status = root.querySelector("[data-status]");
  const bar = root.querySelector("[data-bar]");

  return {
    setStatus(text) {
      status.textContent = text;
    },
    setProgress(value) {
      bar.style.width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
    },
    async finish() {
      root.classList.add("is-hidden");
      await new Promise((resolve) => setTimeout(resolve, 650));
      root.remove();
    },
  };
}
