const api = window.pingOptimizer;
const gameName = document.querySelector("#game-name");
const gameLabel = document.querySelector("#game-label");
const gameIcon = document.querySelector(".game-icon");
const gameSelect = document.querySelector("#game-select");
const modeSelect = document.querySelector("#mode-select");
const gameHeroArt = document.querySelector("#game-hero-art");
const selectedGameArt = document.querySelector("#selected-game-art");
const openGameLibraryButton = document.querySelector("#open-game-library");
const detectionState = document.querySelector("#detection-state");
const optimizeButton = document.querySelector("#optimize");
const optimizeLabel = document.querySelector("#optimize-label");
const badge = document.querySelector("#evidence-badge");
const sidebarState = document.querySelector("#sidebar-state");
const toast = document.querySelector("#toast");
const sectionTitle = document.querySelector("#section-title");
const sectionKicker = document.querySelector("#section-kicker");
const gameSearchInput = document.querySelector("#game-search-input");

let detectedGame = null;
let supportedGames = [];
let diagnosticRunning = false;
let autoDetectEnabled = true;
let stopGameEvents = null;
let stopSessionEvents = null;
let stopFpsEvents = null;
let stopFpsProgressEvents = null;
let stopEasyLobbyEvents = null;
let telemetryTimer = null;
let clockTimer = null;
let fpsBaselineCaptured = false;
let gameSearchQuery = "";

const viewLabels = {
  home: ["READY FOR YOUR NEXT SESSION", "Your games"],
  "easy-lobby": ["REGION LATENCY GUIDE", "Easy Lobby"],
  fps: ["MEASURED WINDOWS TUNING", "FPS Boost"],
  network: ["CONNECTION EVIDENCE", "Network diagnostics"],
  performance: ["REVERSIBLE WINDOWS TUNING", "Performance"],
  tools: ["SAFE RECOVERY", "Repair tools"],
  history: ["LOCAL SESSION RECORDS", "History"],
  settings: ["YOUR DEFAULTS", "Settings"],
  account: ["PING OPTIMIZER ACCOUNT", "Login or sign up"],
  trial: ["NO CARD REQUIRED", "Start your free trial"],
  redeem: ["ACTIVATE ACCESS", "Redeem a code"],
  support: ["PLAYER SUPPORT", "Customer support"],
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
  const slot = document.querySelector(`#metric-${id} .metric-empty, #metric-${id} .metric-value`);
  if (slot) {
    const empty = value === null || value === undefined;
    slot.textContent = empty ? "\u2013" : String(value);
    slot.className = empty ? "metric-empty" : "metric-value";
  }
  const statusNode = document.querySelector(`#${id}-status`);
  if (statusNode) statusNode.textContent = status;
}

function updateGame(name, detected = false) {
  gameName.textContent = name;
  window.gameArt.applyArt(gameIcon, name);
  gameIcon.innerHTML = window.gameArt.artGlyph(name);
  const artwork = window.PingGameArt?.getArtworkMeta?.(name);
  if (gameHeroArt && artwork) {
    gameHeroArt.hidden = false;
    gameHeroArt.src = artwork.src;
    gameHeroArt.style.objectPosition = artwork.position;
  }
  if (selectedGameArt) {
    if (artwork) {
      selectedGameArt.src = artwork.src;
      selectedGameArt.style.objectPosition = artwork.position;
      selectedGameArt.hidden = false;
    } else {
      selectedGameArt.hidden = true;
      selectedGameArt.removeAttribute("src");
    }
  }
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
  updateGame(supportedGames[0]?.name ?? "Other game", false);
}

function updateModeDisplay() {
  document.querySelector("#pipeline-mode").textContent = modeSelect.value.toUpperCase();
}

function switchView(name) {
  let target = name === "games" ? "home" : name;
  if (
    target === "fps" &&
    !document.querySelector('[data-view-panel="fps"]') &&
    document.querySelector('[data-view-panel="performance"]')
  ) {
    target = "performance";
  }
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === target);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.dataset.viewPanel === target);
  });
  const labels = viewLabels[target] ?? viewLabels.home;
  if (sectionKicker) sectionKicker.textContent = labels[0];
  if (sectionTitle) sectionTitle.textContent = labels[1];
  if (target === "history") refreshHistory();
  if (name === "games") focusGameSearch();
}

function focusGameSearch() {
  switchView("home");
  const input = document.querySelector("#game-search-input");
  if (input) {
    input.focus();
    input.select();
    return;
  }
  gameSelect?.focus();
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

function handleGameChanged(game) {
  if (!autoDetectEnabled) return;
  const previousGame = detectedGame;
  detectedGame = game;
  if (game) {
    updateGame(game.name, true);
    sidebarState.textContent = `${game.name} detected`;
    if (previousGame?.pid !== game.pid) {
      showToast(`${game.name} started and was matched to its session profile.`);
    }
  } else {
    detectionState.textContent = "READY";
    sidebarState.textContent = "Ready";
    document.querySelector("#pipeline-game").textContent = "No supported game running";
    document.querySelector("#pipeline-game-state").textContent = "READY";
    document.querySelector("#pipeline-game-state").classList.remove("done");
    if (previousGame) showToast(`${previousGame.name} closed.`);
  }
  renderGames();
}

function renderPerformanceState(result, { notify = true } = {}) {
  const panel = document.querySelector("#fps-result") ?? document.querySelector("#performance-result");
  if (panel) {
    panel.textContent = result?.message ?? "The game closed. Temporary Windows settings were restored.";
    panel.classList.toggle("success", !result?.active);
  }
  optimizeLabel.textContent = "Diagnose session";
  sidebarState.textContent = result?.active ? "Restore needs attention" : "Ready";
  document.querySelector("#pipeline-profile").textContent = result?.active
    ? "Session restore pending"
    : "Restored when the game closed";
  document.querySelector("#pipeline-profile-state").textContent = result?.active ? "ATTENTION" : "RESTORED";
  document.querySelector("#pipeline-profile-state").classList.remove("done");
  if (notify) showToast(panel.textContent);
}

function handleAutomaticRestore(result) {
  renderPerformanceState(result);
}

function renderGames() {
  const grid = document.querySelector("#games-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const visibleGames = supportedGames.filter((game) =>
    game.name.toLowerCase().includes(gameSearchQuery),
  );
  visibleGames.forEach((game) => {
    const running = detectedGame?.process?.toLowerCase() === game.process.toLowerCase();
    const card = document.createElement("article");
    card.className = "game-profile";
    card.classList.toggle("selected", game.name === gameSelect.value);
    // Per-game colour and genre glyph rather than the first letter of the name.
    // A wall of single letters reads as unfinished, and gives players nothing to
    // recognise their game by.
    window.gameArt.applyArt(card, game.name);
    card.innerHTML = `
      <div class="profile-art" aria-hidden="true">
        <span class="profile-wash"></span>
        ${window.gameArt.artGlyph(game.name)}
      </div>
      <div class="game-profile-top">
        <span class="profile-state ${running ? "running" : ""}">${running ? "RUNNING" : "READY"}</span>
      </div>
      <h3>${escapeHtml(game.name)}</h3>
      <p>${escapeHtml(game.recommendedMode)} profile &middot; Automatic process matching</p>
      <button type="button">Optimize profile &rarr;</button>
    `;
    const profileArt = card.querySelector(".profile-art");
    const profileImage = window.PingGameArt?.createImage?.(game.name, {
      alt: `${game.name} official game cover`,
    });
    if (profileArt && profileImage) {
      profileImage.className = "profile-image";
      profileImage.addEventListener("load", () => profileArt.classList.add("has-image"), { once: true });
      profileImage.addEventListener("error", () => profileImage.remove(), { once: true });
      profileArt.prepend(profileImage);
    }
    card.querySelector("button").addEventListener("click", () => {
      updateGame(game.name, running);
      const modeMap = {
        Competitive: "Lowest latency",
        Stable: "Maximum stability",
        Automatic: "Automatic",
      };
      modeSelect.value = modeMap[game.recommendedMode] ?? "Automatic";
      updateModeDisplay();
      grid.classList.remove("expanded");
      const showAll = document.querySelector("#show-all-games");
      if (showAll) showAll.innerHTML = "View all <span>›</span>";
      switchView("home");
      showToast(`${game.name} profile selected.`);
    });
    grid.appendChild(card);
  });
  if (!visibleGames.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML =
      "<strong>No matching game</strong><span>Try another title or use Other game.</span>";
    grid.appendChild(empty);
  }
}

function setSystemMetric(valueId, barId, value, suffix = "%") {
  const valueNode = document.querySelector(`#${valueId}`);
  const barNode = document.querySelector(`#${barId}`);
  const available = Number.isFinite(value);
  if (valueNode) valueNode.textContent = available ? `${Math.round(value)}${suffix}` : "Unavailable";
  if (barNode) {
    barNode.style.width = available ? `${Math.min(100, Math.max(0, value))}%` : "0%";
    barNode.dataset.available = String(available);
  }
}

function renderSystemTelemetry(telemetry) {
  if (!telemetry) return;
  const assignMetric = (valueId, detailId, barId, value) => {
    const valueNode = document.querySelector(`#${valueId}`);
    const detailNode = document.querySelector(`#${detailId}`);
    const barNode = document.querySelector(`#${barId}`);
    const available = Number.isFinite(value);
    if (valueNode) valueNode.textContent = available ? `${Math.round(value)}%` : "—";
    if (detailNode) detailNode.textContent = available ? `${Math.round(value)}%` : "Unavailable";
    if (barNode) barNode.style.width = available ? `${Math.min(100, Math.max(0, value))}%` : "0%";
  };
  assignMetric("system-cpu", "fps-cpu", "system-cpu-bar", telemetry.cpuBusyPercent);
  assignMetric("system-gpu", "fps-gpu", "system-gpu-bar", telemetry.gpuBusyPercent);
  assignMetric("system-ram", "fps-ram", "system-ram-bar", telemetry.ramUsedPercent);
  const loadValue = Number.isFinite(telemetry.cpuBusyPercent)
    ? Math.round(telemetry.cpuBusyPercent)
    : null;
  const score = document.querySelector("#system-score");
  if (score) score.textContent = loadValue === null ? "—" : String(loadValue);
  const ring = document.querySelector(".system-ring");
  if (ring) ring.style.setProperty("--value", String(loadValue ?? 0));
  const gpuNote = document.querySelector("#fps-gpu-note");
  if (gpuNote) {
    gpuNote.textContent = Number.isFinite(telemetry.gpuBusyPercent)
      ? "Windows GPU counter"
      : telemetry.gpu?.reason ?? "Unavailable on this PC";
  }
}

async function refreshSystemTelemetry() {
  if (!api.getSystemTelemetry) return null;
  try {
    const telemetry = await api.getSystemTelemetry({ sampleMs: 600 });
    renderSystemTelemetry(telemetry);
    return telemetry;
  } catch {
    renderSystemTelemetry({
      cpuBusyPercent: null,
      gpuBusyPercent: null,
      ramUsedPercent: null,
      fps: { available: false },
    });
    return null;
  }
}

function renderFpsStatus(message, success = false) {
  const result = document.querySelector("#fps-result") ?? document.querySelector("#performance-result");
  if (!result) return;
  result.textContent = message;
  result.classList.toggle("success", success);
}

async function scanFpsBoost() {
  const button = document.querySelector("#fps-scan");
  setBusy(button, true, "Scanning Windows...");
  try {
    const scan = await api.scanFpsBoost();
    renderSystemTelemetry(scan.system?.telemetry);
    const powerAction = scan.actions?.find((action) => action.id === "session-power-plan");
    const powerMessage = {
      ready: "Performance power plan is ready for the detected game.",
      "already-active": "Windows High Performance is already active.",
      "requires-running-game": "Start a supported game before applying the session power plan.",
      unavailable: "The Windows High Performance plan is unavailable on this PC.",
    }[powerAction?.status];
    renderFpsStatus(
      `${powerMessage ?? "Windows scan complete"} No in-game FPS value was invented.`,
      powerAction?.status === "ready" || powerAction?.status === "already-active",
    );
  } catch {
    renderFpsStatus("The Windows performance scan could not complete. No setting was changed.");
  } finally {
    setBusy(button, false, "Scan this PC");
  }
}

function renderFpsProgress(progress) {
  const node = document.querySelector("#fps-progress");
  if (!node || !progress) return;
  const percent = Math.min(100, Math.max(0, progress.percent ?? 0));
  node.style.width = `${percent}%`;
  node.dataset.progress = String(percent);
  const status = document.querySelector("#fps-status");
  if (status) status.textContent = progress.stage === "complete" ? "MEASURED" : "SAMPLING";
}

async function benchmarkFpsBoost(requestedPhase = null) {
  const phase = requestedPhase ?? (fpsBaselineCaptured ? "after" : "baseline");
  const button =
    phase === "after"
      ? document.querySelector("#fps-after")
      : document.querySelector("#fps-baseline") ?? document.querySelector("#fps-benchmark");
  setBusy(button, true, phase === "baseline" ? "Capturing baseline..." : "Capturing after sample...");
  try {
    const report = await api.benchmarkFpsBoost({ phase, sampleMs: 1500 });
    if (phase === "baseline") {
      fpsBaselineCaptured = true;
      renderFpsStatus(
        `Baseline saved: ${report.measurement.cpuBusyPercent ?? "unavailable"}% CPU load. Apply the session profile, use the same game scene, then capture the after sample.`,
      );
    } else {
      const comparison = report.comparison;
      const cpuDelta = Number.isFinite(comparison?.cpuBusyDeltaPercent)
        ? `${comparison.cpuBusyDeltaPercent > 0 ? "+" : ""}${comparison.cpuBusyDeltaPercent}% CPU load`
        : "CPU comparison unavailable";
      const memoryDelta = Number.isFinite(comparison?.availableMemoryDeltaMiB)
        ? `${comparison.availableMemoryDeltaMiB > 0 ? "+" : ""}${comparison.availableMemoryDeltaMiB} MB available RAM`
        : "RAM comparison unavailable";
      renderFpsStatus(
        `${cpuDelta}; ${memoryDelta}. This compares Windows load, not in-game FPS.`,
        true,
      );
      fpsBaselineCaptured = false;
    }
  } catch {
    renderFpsStatus("The load sample could not complete. No FPS result was estimated.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = phase === "baseline" ? "Capture baseline" : "Measure after";
    }
  }
}

function renderEasyLobbyResults(report) {
  const state = document.querySelector("#easy-lobby-state");
  const container = document.querySelector("#easy-lobby-results");
  if (state) {
    state.textContent = report?.recommended
      ? `${report.recommended.city.toUpperCase()} · ${report.recommended.latency} MS`
      : "UNAVAILABLE";
    state.classList.toggle("good", Boolean(report?.recommended));
  }
  if (!container) return;
  container.innerHTML = "";
  (report?.results ?? []).forEach((region) => {
    const row = document.createElement("div");
    row.className = `region-row${region.id === report.recommended?.id ? " recommended" : ""}`;
    row.innerHTML = `
      <span><strong>${escapeHtml(region.name)}</strong><small>${escapeHtml(region.city)}</small></span>
      <span><small>Response</small><strong>${region.reachable ? `${region.latency} ms` : "Unavailable"}</strong></span>
      <span><small>Variation</small><strong>${region.reachable ? `${region.jitter} ms` : "—"}</strong></span>
      <span><small>Failed</small><strong>${region.reachable ? `${region.failureRate}%` : "—"}</strong></span>
    `;
    container.appendChild(row);
  });
}

async function initializeEasyLobby() {
  const gameInput = document.querySelector("#easy-lobby-game");
  const regionInput = document.querySelector("#easy-lobby-region");
  if (gameInput?.tagName === "SELECT") {
    gameInput.innerHTML = "";
    supportedGames.forEach((game) => {
      const option = document.createElement("option");
      option.value = game.name;
      option.textContent = game.name;
      gameInput.appendChild(option);
    });
  }
  if (regionInput?.tagName === "SELECT" && api.listEasyLobbyRegions) {
    const regions = await api.listEasyLobbyRegions();
    regionInput.innerHTML = '<option value="">Compare all regions</option>';
    regions.forEach((region) => {
      const option = document.createElement("option");
      option.value = region.id;
      option.textContent = `${region.name} · ${region.city}`;
      regionInput.appendChild(option);
    });
  }
}

async function compareEasyLobby() {
  const button = document.querySelector("#easy-lobby-compare");
  const state = document.querySelector("#easy-lobby-state");
  const gameInput = document.querySelector("#easy-lobby-game");
  const regionInput = document.querySelector("#easy-lobby-region");
  setBusy(button, true, "Comparing regions...");
  if (state) state.textContent = "Measuring direct regional latency...";
  try {
    const report = await api.compareEasyLobby({
      gameName: gameInput?.value || gameName.textContent,
      regionIds: regionInput?.value ? [regionInput.value] : undefined,
    });
    renderEasyLobbyResults(report);
    showToast(
      report.recommended
        ? `${report.recommended.city} is the best measured network region. Matchmaking was not changed.`
        : "No region recommendation is available. Matchmaking was not changed.",
    );
  } catch {
    if (state) state.textContent = "The region comparison could not complete.";
  } finally {
    setBusy(button, false, "Compare regions");
  }
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

async function runDiagnostics({ oneClick = false } = {}) {
  if (diagnosticRunning) {
    showToast("A connection test is already running.");
    return null;
  }
  diagnosticRunning = true;
  const networkButton = document.querySelector("#run-network-test");
  setBusy(networkButton, true, "Testing 3 edges…");
  optimizeButton.disabled = true;
  if (oneClick) optimizeLabel.textContent = "Measuring connection…";
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
      const profile = await api.applyPerformance({ powerPlan: true });
      if (profile.applied.length) {
        performanceMessage = ` ${profile.applied.join(" and ")} applied for this session.`;
        optimizeLabel.textContent = "Session profile active";
        sidebarState.textContent = "Session profile active";
        document.querySelector("#pipeline-profile").textContent = profile.applied.join(" + ");
        document.querySelector("#pipeline-profile-state").textContent = "ACTIVE";
        document.querySelector("#pipeline-profile-state").classList.add("done");
      } else {
        optimizeLabel.textContent = "Diagnosis complete";
        sidebarState.textContent = "Measured";
        document.querySelector("#pipeline-profile-state").textContent = "NOT APPLIED";
      }
    } else if (oneClick) {
      optimizeLabel.textContent = "Diagnosis complete";
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
    if (oneClick) optimizeLabel.textContent = "Try diagnosis again";
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
  const button = document.querySelector("#fps-apply") ?? document.querySelector("#apply-performance");
  const result = document.querySelector("#fps-result") ?? document.querySelector("#performance-result");
  setBusy(button, true, "Applying...");
  try {
    const applyProfile = api.applyFpsBoost ?? api.applyPerformance;
    const response = await applyProfile({
      powerPlan: document.querySelector("#perf-power")?.checked !== false,
    });
    const messages = [];
    if (response.applied.length) messages.push(`Applied: ${response.applied.join(", ")}.`);
    if (response.skipped.length) messages.push(`Not applied: ${response.skipped.join(", ")}.`);
    if (result) {
      result.textContent = messages.join(" ") || "No changes were selected.";
      result.classList.toggle("success", response.applied.length > 0);
    }
    sidebarState.textContent = response.active ? "Performance active" : "Ready";
    document.querySelector("#pipeline-profile").textContent = response.active
      ? response.applied.join(" + ") || "Temporary profile active"
      : "Only with a running game";
    document.querySelector("#pipeline-profile-state").textContent = response.active ? "ACTIVE" : "NOT APPLIED";
    document.querySelector("#pipeline-profile-state").classList.toggle("done", response.active);
    showToast(result?.textContent ?? "Performance action complete.");
  } catch {
    if (result) {
      result.textContent = "Windows did not allow this session profile. No unsupported workaround was attempted.";
      result.classList.remove("success");
    }
  } finally {
    setBusy(button, false, "Apply session boost");
  }
}

async function restorePerformance() {
  const button = document.querySelector("#fps-rollback") ?? document.querySelector("#restore-performance");
  const result = document.querySelector("#fps-result") ?? document.querySelector("#performance-result");
  setBusy(button, true, "Restoring...");
  const rollbackProfile = api.rollbackFpsBoost ?? api.restorePerformance;
  try {
    const response = await rollbackProfile();
    const messages = [];
    if (response.restored.length) messages.push(`Restored: ${response.restored.join(", ")}.`);
    if (response.failed?.length) messages.push(`Attention: ${response.failed.join(", ")}.`);
    if (result) {
      result.textContent = messages.join(" ") || "No temporary performance changes were active.";
      result.classList.toggle("success", response.restored.length > 0 && !response.active);
    }
    sidebarState.textContent = response.active ? "Restore needs attention" : "Ready";
    document.querySelector("#pipeline-profile").textContent = response.active
      ? "Session restore pending"
      : "Only with a running game";
    document.querySelector("#pipeline-profile-state").textContent = response.active ? "ATTENTION" : "OPTIONAL";
    document.querySelector("#pipeline-profile-state").classList.remove("done");
    showToast(result?.textContent ?? "Restore complete.");
  } finally {
    setBusy(button, false, "Restore");
  }
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
  autoDetectEnabled = settings.autoDetect;
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
  autoDetectEnabled = settings.autoDetect;
  modeSelect.value = settings.preferredMode;
  updateModeDisplay();
  showToast("Preferences saved on this PC.");
}

function updateClock() {
  const clock = document.querySelector("#home-clock");
  if (!clock) return;
  clock.textContent = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function toggleGameLibrary(forceExpanded = null) {
  const grid = document.querySelector("#games-grid");
  const button = document.querySelector("#show-all-games");
  if (!grid) return;
  const expand =
    typeof forceExpanded === "boolean" ? forceExpanded : !grid.classList.contains("expanded");
  grid.classList.toggle("expanded", expand);
  if (button) {
    button.innerHTML = expand ? 'Close <span>×</span>' : 'View all <span>›</span>';
  }
}

function handleSearchCommand() {
  const query = gameSearchInput?.value.trim().toLowerCase() ?? "";
  const destination = [
    [["fps", "performance", "frames"], "fps"],
    [["lobby", "region"], "easy-lobby"],
    [["network", "ping", "route"], "network"],
    [["repair", "dns", "tools"], "tools"],
    [["support", "help"], "support"],
    [["login", "account", "signup"], "account"],
  ].find(([keywords]) => keywords.some((keyword) => query.includes(keyword)))?.[1];
  if (destination) switchView(destination);
}

async function copySupportReport() {
  const button = document.querySelector("#copy-support-report");
  const output = document.querySelector("#support-result");
  const report = [
    "Ping Optimizer Windows beta support report",
    `Generated: ${new Date().toISOString()}`,
    `Selected game: ${gameName?.textContent ?? "Unknown"}`,
    `Mode: ${modeSelect?.value ?? "Unknown"}`,
    `Detected state: ${detectionState?.textContent ?? "Unknown"}`,
    `CPU: ${document.querySelector("#system-cpu")?.textContent ?? "Unavailable"}`,
    `GPU: ${document.querySelector("#system-gpu")?.textContent ?? "Unavailable"}`,
    `RAM: ${document.querySelector("#system-ram")?.textContent ?? "Unavailable"}`,
    `Last route: ${document.querySelector("#route-detail")?.textContent ?? "Not measured"}`,
  ].join("\n");
  setBusy(button, true, "Copying...");
  try {
    await navigator.clipboard.writeText(report);
    if (output) output.textContent = "Support report copied. It contains no password or game-memory data.";
    showToast("Support report copied.");
  } catch {
    if (output) output.textContent = "Windows did not allow clipboard access. No report was sent.";
  } finally {
    setBusy(button, false, "Copy report");
  }
}

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => switchView(item.dataset.view));
});
document.querySelectorAll("[data-open-view]").forEach((item) => {
  item.addEventListener("click", () => switchView(item.dataset.openView));
});
openGameLibraryButton?.addEventListener("click", focusGameSearch);
window.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === "k") {
    event.preventDefault();
    focusGameSearch();
  }
  if (event.key === "Escape") toggleGameLibrary(false);
});
gameSearchInput?.addEventListener("input", () => {
  gameSearchQuery = gameSearchInput.value.trim().toLowerCase();
  switchView("home");
  renderGames();
});
gameSearchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") handleSearchCommand();
});
gameHeroArt?.addEventListener("load", () => {
  gameHeroArt.hidden = false;
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
document.querySelector("#scan-games")?.addEventListener("click", () => scanGame({ notify: true }));
document.querySelector("#run-network-test")?.addEventListener("click", () => runDiagnostics());
document.querySelector("#apply-performance")?.addEventListener("click", applyPerformance);
document.querySelector("#restore-performance")?.addEventListener("click", restorePerformance);
document.querySelector("#run-repair")?.addEventListener("click", runRepair);
document.querySelector("#save-settings")?.addEventListener("click", saveSettings);
document.querySelector("#minimize")?.addEventListener("click", () => api.minimize());
document.querySelector("#close")?.addEventListener("click", () => api.close());
document.querySelector("#fps-scan")?.addEventListener("click", scanFpsBoost);
document.querySelector("#fps-benchmark")?.addEventListener("click", () => benchmarkFpsBoost());
document.querySelector("#fps-baseline")?.addEventListener("click", () => benchmarkFpsBoost("baseline"));
document.querySelector("#fps-after")?.addEventListener("click", () => benchmarkFpsBoost("after"));
document.querySelector("#fps-apply")?.addEventListener("click", applyPerformance);
document.querySelector("#fps-rollback")?.addEventListener("click", restorePerformance);
document.querySelector("#easy-lobby-compare")?.addEventListener("click", compareEasyLobby);
document.querySelector("#show-all-games")?.addEventListener("click", () => toggleGameLibrary());
document.querySelector("#copy-support-report")?.addEventListener("click", copySupportReport);
document.querySelector("#open-support")?.addEventListener("click", async () => {
  const opened = await api.openExternal?.(
    "https://github.com/mbella800/pingbooster/issues/new/choose",
  );
  if (!opened) showToast("Beta support is not connected yet. Copy a support report for now.");
});
document.querySelectorAll("[data-auth-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-auth-tab]").forEach((item) => {
      item.classList.toggle("active", item === tab);
    });
    const password = document.querySelector("#account-password");
    if (password) {
      password.autocomplete = tab.dataset.authTab === "signup" ? "new-password" : "current-password";
    }
    const submit = document.querySelector("#account-submit");
    if (submit) submit.textContent = tab.dataset.authTab === "signup" ? "Create account" : "Continue securely";
  });
});
document.querySelector("#account-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const result = document.querySelector("#account-result");
  if (result) {
    result.textContent =
      "The form is valid, but no credentials were sent: the secure account server still needs to be connected.";
  }
  showToast("Account server is not connected in this beta.");
});
document.querySelector("#start-trial")?.addEventListener("click", () => {
  switchView("account");
  showToast("Create an account after the secure account service is connected.");
});
document.querySelector("#redeem-submit")?.addEventListener("click", () => {
  const input = document.querySelector("#redeem-code");
  const result = document.querySelector("#redeem-result");
  const hasCode = Boolean(input?.value.trim());
  if (result) {
    result.textContent = hasCode
      ? "Code format accepted locally. Secure validation is not connected, so nothing was activated."
      : "Enter the code exactly as it was provided.";
  }
  showToast(hasCode ? "Code server is not connected yet." : "Enter an activation code.");
});

async function initialize() {
  supportedGames = await api.listGames();
  populateGameSelect();
  renderGames();
  await initializeEasyLobby();
  const settings = await loadSettings();
  stopGameEvents = api.onGameChanged?.(handleGameChanged) ?? null;
  stopSessionEvents = api.onSessionRestored?.(handleAutomaticRestore) ?? null;
  stopFpsEvents =
    api.onFpsBoostState?.((state) => {
      if (state.lastScan?.system?.telemetry) {
        renderSystemTelemetry(state.lastScan.system.telemetry);
      }
    }) ?? null;
  stopFpsProgressEvents = api.onFpsBoostProgress?.(renderFpsProgress) ?? null;
  stopEasyLobbyEvents =
    api.onEasyLobbyState?.((state) => {
      const label = document.querySelector("#easy-lobby-state");
      if (state.status === "measuring" && label) {
        label.textContent = "Measuring direct regional latency...";
      } else if (state.results) {
        renderEasyLobbyResults(state);
      }
    }) ?? null;
  await refreshSystemTelemetry();
  telemetryTimer = window.setInterval(refreshSystemTelemetry, 12000);
  updateClock();
  clockTimer = window.setInterval(updateClock, 30000);
  if (settings.autoDetect) await scanGame();
  const performanceState = await api.getPerformanceState?.();
  if (performanceState?.active) {
    renderPerformanceState(
      {
        ...performanceState,
        message: `${performanceState.gameName ?? "A previous game"} still has a temporary power plan active. Open Performance and choose Restore.`,
      },
      { notify: false },
    );
  }
  if (settings.diagnosticsOnLaunch) runDiagnostics();
}

window.addEventListener("beforeunload", () => {
  stopGameEvents?.();
  stopSessionEvents?.();
  stopFpsEvents?.();
  stopFpsProgressEvents?.();
  stopEasyLobbyEvents?.();
  if (telemetryTimer) window.clearInterval(telemetryTimer);
  if (clockTimer) window.clearInterval(clockTimer);
});

initialize();
