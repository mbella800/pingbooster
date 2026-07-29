const gameName = document.querySelector("#game-name");
const gameLabel = document.querySelector("#game-label");
const gameSelect = document.querySelector("#game-select");
const detectionState = document.querySelector("#detection-state");
const optimizeButton = document.querySelector("#optimize");
const optimizeLabel = document.querySelector("#optimize-label");
const badge = document.querySelector("#evidence-badge");
const toast = document.querySelector("#toast");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 4200);
}

function setMetric(id, value, status) {
  document.querySelector(`#metric-${id}`).firstChild.textContent = value ?? "—";
  document.querySelector(`#${id}-status`).textContent = status;
}

function updateGame(name, detected = false) {
  gameName.textContent = name;
  gameLabel.textContent = detected ? "RUNNING GAME DETECTED" : "SELECTED GAME";
  gameSelect.value = [...gameSelect.options].some((option) => option.value === name)
    ? name
    : "Other game";
  detectionState.textContent = detected ? "DETECTED" : "MANUAL";
}

async function scanGame() {
  try {
    const game = await window.pingOptimizer.detectGame();
    if (game) {
      updateGame(game.name, true);
      showToast(`${game.name} was detected automatically.`);
    } else {
      detectionState.textContent = "READY";
    }
  } catch {
    detectionState.textContent = "MANUAL";
  }
}

async function optimize() {
  optimizeButton.disabled = true;
  optimizeLabel.textContent = "MEASURING CONNECTION";
  badge.textContent = "TESTING";
  badge.classList.remove("good");
  document.querySelectorAll(".evidence-item i b").forEach((bar, index) => {
    bar.style.width = `${20 + index * 12}%`;
  });

  try {
    const report = await window.pingOptimizer.runDiagnostics();
    if (!report.best) throw new Error("No reachable measurement target");

    setMetric("latency", report.best.latency, report.best.name);
    setMetric("jitter", report.best.jitter, report.best.jitter <= 8 ? "Stable" : "Variable");
    setMetric("loss", report.best.loss, report.best.loss === 0 ? "No failed probes" : "Check connection");

    document.querySelector("#route-detail").textContent = `Fastest measured edge: ${report.best.name}`;
    document.querySelector("#jitter-detail").textContent = `${report.best.jitter} ms response variation`;
    document.querySelector("#loss-detail").textContent = `${report.best.loss}% of test connections failed`;
    document.querySelector("#best-path").textContent = "Direct route retained";
    badge.textContent = "MEASURED";
    badge.classList.add("good");

    document.querySelectorAll(".evidence-item i b").forEach((bar, index) => {
      bar.style.width = index < 3 ? `${78 - index * 7}%` : "18%";
    });

    optimizeLabel.textContent = "DIRECT ROUTE IS BEST";
    showToast("Diagnosis complete. This preview measured your connection but did not reroute game traffic.");
  } catch {
    optimizeLabel.textContent = "TRY DIAGNOSIS AGAIN";
    badge.textContent = "UNAVAILABLE";
    showToast("The connection test could not complete. Your settings were not changed.");
  } finally {
    optimizeButton.disabled = false;
  }
}

gameSelect.addEventListener("change", () => updateGame(gameSelect.value, false));
optimizeButton.addEventListener("click", optimize);
document.querySelector("#minimize").addEventListener("click", () => window.pingOptimizer.minimize());
document.querySelector("#close").addEventListener("click", () => window.pingOptimizer.close());

scanGame();
