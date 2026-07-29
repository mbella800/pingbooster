const api = window.pingOptimizer;
const gameName = document.querySelector("#game-name");
const gameLabel = document.querySelector("#game-label");
const gameIcon = document.querySelector(".game-icon");
const gameSelect = document.querySelector("#game-select");
const modeSelect = document.querySelector("#mode-select");
const detectionState = document.querySelector("#detection-state");
const optimizeButton = document.querySelector("#optimize");
const optimizeLabel = document.querySelector("#optimize-label");
const badge = document.querySelector("#evidence-badge");
const sidebarState = document.querySelector("#sidebar-state");
const toast = document.querySelector("#toast");
const sectionTitle = document.querySelector("#section-title");
const sectionKicker = document.querySelector("#section-kicker");

let detectedGame = null;
let supportedGames = [];
let lastReport = null;
let diagnosticRunning = false;

const viewLabels = {
  home: ["ONE-CLICK SESSION CONTROL", "Optimize your session"],
  games: ["PROFILE LIBRARY", "Games"],
  network: ["CONNECTION EVIDENCE", "Network diagnostics"],
  performance: ["REVERSIBLE WINDOWS TUNING", "Performance"],
  tools: ["SAFE RECOVERY", "Repair tools"],
  history: ["LOCAL SESSION RECORDS", "History"],
  settings: ["YOUR DEFAULTS", "Settings"],
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 4300);
}

function setBusy(button, busy, label) {
  if (!button) return;
  button.disabled = busy;
  if (label) button.textContent = label;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setMetric(id, value, status) {
  const metric = document.querySelector(`#metric-${id}`);
  if (metric?.firstChild) metric.firstChild.nodeValue = value ?? "-";
  document.querySelector(`#${id}-status`).textContent = status;
}

function updateGame(name, detected = false) {
  gameName.textContent = name;
  gameIcon.textContent = name.slice(0, 1).toUpperCase();
  gameLabel.textContent = detected ? "RUNNING GAME DETECTED" : "SELECTED GAME";
  gameSelect.value = [...gameSelect.options].some((option) => option.value === name)
    ? name
    : "Other game";
  detectionState.textContent = detected ? "DETECTED" : "MANUAL";
  document.querySelector("#pipeline-game").textContent = detected
    ? `${name} is running`
    : `${name} selected`;
  document.querySelector("#pipeline-game-state").textContent = detected ? "DETECTED" : "READY";
  document.querySelector("#pipeline-game-state").classList.toggle("done", detected);
  if (detectedGame?.recommendedMode && detected) {
    const modeMap = {
      Competitive: "Lowest latency",
      Stable: "Maximum stability",
      Automatic: "Automatic",
    };
    modeSelect.value = modeMap[detectedGame.recommendedMode] ?? "Automatic";
  }
}

function populateGameSelect() {
  gameSelect.innerHTML = "";
  supportedGames.forEach((game) => {
    const option = document.createElement("option");
    option.value = game.name;
    option.textContent = game.name;
    gameSelect.appendChild(option);
  });
  const other = document.createElement("option");
  other.value = "Other game";
  other.textContent = "Other game";
  gameSelect.appendChild(other);
  updateGame("Other game", false);
}

function updateModeDisplay() {
  document.querySelector("#pipeline-mode").textContent = modeSelect.value.toUpperCase();
}

function switchView(name) {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === name);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.dataset.viewPanel === name);
  });
  const labels = viewLabels[name] ?? viewLabels.home;
  sectionKicker.textContent = labels[0];
  sectionTitle.textContent = labels[1];
  if (name === "history") refreshHistory();
}

async function scanGame({ notify = false } = {}) {
  try {
    detectedGame = await api.detectGame();
    if (detectedGame) {
      updateGame(detectedGame.name, true);
      sidebarState.textContent = `${detectedGame.name} detected`;
      if (notify) showToast(`${detectedGame.name} was detected and matched to a profile.`);
    } else {
      detectionState.textContent = "READY";
      sidebarState.textContent = "Ready";
      if (notify) showToast("No supported running game was found. Manual selection remains available.");
    }
    renderGames();
    return detectedGame;
  } catch {
    detectionState.textContent = "MANUAL";
    sidebarState.textContent = "Manual mode";
    return null;
  }
}

function renderGames() {
  const grid = document.querySelector("#games-grid");
  if (!grid) return;
  grid.innerHTML = "";
  supportedGames.forEach((game) => {
    const running = detectedGame?.process?.toLowerCase() === game.process.toLowerCase();
    const card = document.createElement("article");
    card.className = "game-profile";
    card.innerHTML = `
      <div class="game-profile-top">
        <span class="profile-icon">${escapeHtml(game.name.slice(0, 1).toUpperCase())}</span>
        <span class="profile-state ${running ? "running" : ""}">${running ? "RUNNING" : "READY"}</span>
      </div>
      <h3>${escapeHtml(game.name)}</h3>
      <p>${escapeHtml(game.recommendedMode)} profile &middot; Automatic process matching</p>
      <button type="button">USE THIS PROFILE &rarr;</button>
    `;
    card.querySelector("button").addEventListener("click", () => {
      updateGame(game.name, running);
      const modeMap = {
        Competitive: "Lowest latency",
        Stable: "Maximum stability",
        Automatic: "Automatic",
      };
      modeSelect.value = modeMap[game.recommendedMode] ?? "Automatic";
      updateModeDisplay();
      switchView("home");
      showToast(`${game.name} profile selected.`);
    });
    grid.appendChild(card);
  });
}

function renderEdgeResults(results = []) {
  const container = document.querySelector("#edge-results");
  if (!container) return;
  container.innerHTML = "";
  results.forEach((result) => {
    const row = document.createElement("div");
    if (result.latency === null) row.classList.add("failed");
    const failureRate = result.failureRate ?? result.loss ?? 0;
    row.innerHTML = `
      <span>${escapeHtml(result.name)}</span>
      <strong>${result.latency === null ? "Failed" : `${result.latency} ms`}</strong>
      <small>${result.latency === null ? "Unreachable" : `${result.jitter} ms jitter &middot; ${failureRate}% failed`}</small>
    `;
    container.appendChild(row);
  });
}

function applyReport(report) {
  if (!report?.best) throw new Error("No reachable measurement target");
  lastReport = report;
  const failureRate = report.best.failureRate ?? report.best.loss ?? 0;
  setMetric("latency", report.best.latency, report.best.name);
  setMetric("jitter", report.best.jitter, report.best.jitter <= 8 ? "Stable" : "Variable");
  setMetric("loss", failureRate, failureRate === 0 ? "No failed connects" : "Check connection");
  document.querySelector("#route-detail").textContent = `Best public test edge: ${report.best.name}`;
  document.querySelector("#jitter-detail").textContent = `${report.best.jitter} ms response variation`;
  document.querySelector("#loss-detail").textContent = `${failureRate}% of TCP test connections failed`;
  document.querySelector("#best-path").textContent = "Relay unavailable in preview";
  document.querySelector("#pipeline-network").textContent = `${report.results.length} edges measured`;
  document.querySelector("#pipeline-network-state").textContent = "MEASURED";
  document.querySelector("#pipeline-network-state").classList.add("done");
  badge.textContent = "MEASURED";
  badge.classList.add("good");
  document.querySelectorAll(".evidence-item i b").forEach((bar, index) => {
    bar.style.width = index < 3 ? `${78 - index * 7}%` : "18%";
  });
  renderEdgeResults(report.results);
}

async function runDiagnostics({ oneClick = false, button = null } = {}) {
  if (diagnosticRunning) {
    showToast("A connection test is already running.");
    return null;
  }
  diagnosticRunning = true;
  const networkButton = document.querySelector("#run-network-test");
  setBusy(networkButton, true, "Testing 3 edges...");
  optimizeButton.disabled = true;
  if (oneClick) optimizeLabel.textContent = "MEASURING CONNECTION";
  badge.textContent = "TESTING";
  badge.classList.remove("good");
  sidebarState.textContent = "Measuring";
  document.querySelector("#pipeline-network-state").textContent = "TESTING";
  document.querySelector("#pipeline-network-state").classList.remove("done");

  try {
    if (oneClick) {
      await scanGame();
      sidebarState.textContent = "Measuring";
    }
    const report = await api.runDiagnostics({
      gameName: gameName.textContent,
      mode: modeSelect.value,
    });
    applyReport(report);
    let performanceMessage = "";

    if (oneClick && detectedGame && modeSelect.value !== "Quick check") {
      const profile = await api.applyPerformance({ powerPlan: true, processPriority: true });
      if (profile.applied.length) {
        performanceMessage = ` ${profile.applied.join(" and ")} applied for this session.`;
        optimizeLabel.textContent = "SESSION PROFILE ACTIVE";
        sidebarState.textContent = "Optimized";
        document.querySelector("#pipeline-profile").textContent = profile.applied.join(" + ");
        document.querySelector("#pipeline-profile-state").textContent = "ACTIVE";
        document.querySelector("#pipeline-profile-state").classList.add("done");
      } else {
        optimizeLabel.textContent = "DIAGNOSIS COMPLETE";
        sidebarState.textContent = "Measured";
        document.querySelector("#pipeline-profile-state").textContent = "NOT APPLIED";
      }
    } else if (oneClick) {
      optimizeLabel.textContent = "DIAGNOSIS COMPLETE";
      sidebarState.textContent = "Measured";
      document.querySelector("#pipeline-profile-state").textContent =
        modeSelect.value === "Quick check" ? "SKIPPED" : "NO GAME";
    }

    showToast(
      `Diagnosis complete in ${report.mode} mode. Relay routing is unavailable in this preview.${performanceMessage}`,
    );
    await refreshHistory();
    return report;
  } catch {
    if (oneClick) optimizeLabel.textContent = "TRY DIAGNOSIS AGAIN";
    badge.textContent = "UNAVAILABLE";
    sidebarState.textContent = "Ready";
    document.querySelector("#pipeline-network-state").textContent = "FAILED";
    showToast("The connection test could not complete. Your settings were not changed.");
    return null;
  } finally {
    diagnosticRunning = false;
    optimizeButton.disabled = false;
    setBusy(networkButton, false, "Run 3-edge test");
  }
}

async function applyPerformance() {
  const button = document.querySelector("#apply-performance");
  const result = document.querySelector("#performance-result");
  setBusy(button, true, "Applying...");
  try {
    const response = await api.applyPerformance({
      powerPlan: document.querySelector("#perf-power").checked,
      processPriority: document.querySelector("#perf-priority").checked,
    });
    const messages = [];
    if (response.applied.length) messages.push(`Applied: ${response.applied.join(", ")}.`);
    if (response.skipped.length) messages.push(`Not applied: ${response.skipped.join(", ")}.`);
    result.textContent = messages.join(" ") || "No changes were selected.";
    result.classList.toggle("success", response.applied.length > 0);
    sidebarState.textContent = response.active ? "Performance active" : "Ready";
    document.querySelector("#pipeline-profile").textContent = response.active
      ? response.applied.join(" + ") || "Temporary profile active"
      : "Only with a running game";
    document.querySelector("#pipeline-profile-state").textContent = response.active ? "ACTIVE" : "NOT APPLIED";
    document.querySelector("#pipeline-profile-state").classList.toggle("done", response.active);
    showToast(result.textContent);
  } catch {
    result.textContent = "Windows did not allow this session profile. No unsupported workaround was attempted.";
    result.classList.remove("success");
  } finally {
    setBusy(button, false, "Apply session profile");
  }
}

async function restorePerformance() {
  const result = document.querySelector("#performance-result");
  const response = await api.restorePerformance();
  const messages = [];
  if (response.restored.length) messages.push(`Restored: ${response.restored.join(", ")}.`);
  if (response.failed?.length) messages.push(`Attention: ${response.failed.join(", ")}.`);
  result.textContent = messages.join(" ") || "No temporary performance changes were active.";
  result.classList.toggle("success", response.restored.length > 0 && !response.active);
  sidebarState.textContent = response.active ? "Restore needs attention" : "Ready";
  document.querySelector("#pipeline-profile").textContent = response.active
    ? "Power plan restore pending"
    : "Only with a running game";
  document.querySelector("#pipeline-profile-state").textContent = response.active ? "ATTENTION" : "OPTIONAL";
  document.querySelector("#pipeline-profile-state").classList.remove("done");
  showToast(result.textContent);
}

async function runRepair() {
  const button = document.querySelector("#run-repair");
  setBusy(button, true, "Checking...");
  try {
    const report = await api.runSafeRepair();
    const container = document.querySelector("#repair-results");
    container.innerHTML = "";
    report.checks.forEach((check) => {
      const item = document.createElement("div");
      item.className = check.status;
      item.innerHTML = `<i></i><span><strong>${escapeHtml(check.name)}</strong><small>${escapeHtml(check.detail)}</small></span>`;
      container.appendChild(item);
    });
    showToast("Safe network checks are complete.");
  } catch {
    showToast("The repair check could not complete. No settings were changed.");
  } finally {
    setBusy(button, false, "Run safe repair");
  }
}

async function refreshHistory() {
  const history = await api.getHistory();
  const container = document.querySelector("#history-list");
  if (!history.length) {
    container.innerHTML = `<div class="empty-state"><strong>No sessions yet</strong><span>Run a connection diagnosis to create your first report.</span></div>`;
    return;
  }
  container.innerHTML = "";
  history.forEach((item) => {
    const row = document.createElement("article");
    row.className = "history-item";
    row.innerHTML = `
      <div><strong>${escapeHtml(item.gameName ?? "Manual selection")}</strong><small>${escapeHtml(new Date(item.testedAt).toLocaleString())}</small></div>
      <div class="history-metric"><b>${item.best?.latency ?? "-"} ms</b>response</div>
      <div class="history-metric"><b>${item.best?.jitter ?? "-"} ms</b>jitter</div>
      <div class="history-metric"><b>${escapeHtml(item.best?.name ?? "No result")}</b>${escapeHtml(item.mode ?? "Automatic")} mode</div>
    `;
    container.appendChild(row);
  });
}

async function loadSettings() {
  const settings = await api.getSettings();
  if (settings.preferredMode === "Data saver") settings.preferredMode = "Quick check";
  document.querySelector("#setting-auto-detect").checked = settings.autoDetect;
  document.querySelector("#setting-diagnose").checked = settings.diagnosticsOnLaunch;
  document.querySelector("#setting-mode").value = settings.preferredMode;
  modeSelect.value = settings.preferredMode;
  updateModeDisplay();
  return settings;
}

async function saveSettings() {
  const settings = {
    autoDetect: document.querySelector("#setting-auto-detect").checked,
    diagnosticsOnLaunch: document.querySelector("#setting-diagnose").checked,
    minimizeToTray: false,
    preferredMode: document.querySelector("#setting-mode").value,
  };
  await api.saveSettings(settings);
  modeSelect.value = settings.preferredMode;
  updateModeDisplay();
  showToast("Preferences saved on this PC.");
}

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => switchView(item.dataset.view));
});
gameSelect.addEventListener("change", () => {
  detectedGame = null;
  updateGame(gameSelect.value, false);
  const profile = supportedGames.find((game) => game.name === gameSelect.value);
  const modeMap = {
    Competitive: "Lowest latency",
    Stable: "Maximum stability",
    Automatic: "Automatic",
  };
  if (profile) modeSelect.value = modeMap[profile.recommendedMode] ?? "Automatic";
  detectionState.textContent = "MANUAL";
  updateModeDisplay();
  renderGames();
});
modeSelect.addEventListener("change", updateModeDisplay);
optimizeButton.addEventListener("click", () => runDiagnostics({ oneClick: true }));
document.querySelector("#scan-games").addEventListener("click", () => scanGame({ notify: true }));
document.querySelector("#run-network-test").addEventListener("click", (event) =>
  runDiagnostics({ button: event.currentTarget }),
);
document.querySelector("#apply-performance").addEventListener("click", applyPerformance);
document.querySelector("#restore-performance").addEventListener("click", restorePerformance);
document.querySelector("#run-repair").addEventListener("click", runRepair);
document.querySelector("#save-settings").addEventListener("click", saveSettings);
document.querySelector("#minimize").addEventListener("click", () => api.minimize());
document.querySelector("#close").addEventListener("click", () => api.close());

async function initialize() {
  supportedGames = await api.listGames();
  populateGameSelect();
  renderGames();
  const settings = await loadSettings();
  if (settings.autoDetect) await scanGame();
  if (settings.diagnosticsOnLaunch) runDiagnostics();
}

initialize();
