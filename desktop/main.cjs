const { app, BrowserWindow, ipcMain } = require("electron");
const { execFile, execFileSync } = require("node:child_process");
const dns = require("node:dns").promises;
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const knownGames = [
  ["FortniteClient-Win64-Shipping.exe", "Fortnite", "Competitive"],
  ["VALORANT-Win64-Shipping.exe", "VALORANT", "Competitive"],
  ["cs2.exe", "Counter-Strike 2", "Competitive"],
  ["League of Legends.exe", "League of Legends", "Competitive"],
  ["r5apex.exe", "Apex Legends", "Competitive"],
  ["Overwatch.exe", "Overwatch 2", "Competitive"],
  ["RocketLeague.exe", "Rocket League", "Competitive"],
  ["RobloxPlayerBeta.exe", "Roblox", "Automatic"],
  ["GenshinImpact.exe", "Genshin Impact", "Stable"],
  ["cod.exe", "Call of Duty", "Competitive"],
  ["Wow.exe", "World of Warcraft", "Stable"],
  ["dota2.exe", "Dota 2", "Competitive"],
];

const HIGH_PERFORMANCE_GUID = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";
let sessionState = {
  originalPowerPlan: null,
  priorityPid: null,
  originalPriority: null,
  active: false,
};

function dataFile(name) {
  return path.join(app.getPath("userData"), name);
}

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(dataFile(name), "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(name, value) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(dataFile(name), JSON.stringify(value, null, 2), "utf8");
}

function rollbackFile() {
  return dataFile("rollback-journal.json");
}

function hasActiveChanges(state = sessionState) {
  return Boolean(state.originalPowerPlan || state.priorityPid);
}

function persistRollbackJournal() {
  sessionState.active = hasActiveChanges();
  if (!sessionState.active) {
    try {
      fs.rmSync(rollbackFile(), { force: true });
    } catch {}
    return;
  }
  writeJson("rollback-journal.json", {
    originalPowerPlan: sessionState.originalPowerPlan,
    priorityPid: sessionState.priorityPid,
    originalPriority: sessionState.originalPriority,
    savedAt: new Date().toISOString(),
  });
}

function restoreStateSync(state) {
  let powerRestored = !state?.originalPowerPlan;
  let priorityRestored = !state?.priorityPid || !Number.isFinite(state?.originalPriority);
  if (state?.originalPowerPlan) {
    try {
      execFileSync("powercfg.exe", ["/S", state.originalPowerPlan], { windowsHide: true });
      powerRestored = true;
    } catch {}
  }
  if (state?.priorityPid && Number.isFinite(state.originalPriority)) {
    try {
      os.setPriority(state.priorityPid, state.originalPriority);
      priorityRestored = true;
    } catch {
      try {
        os.getPriority(state.priorityPid);
        priorityRestored = false;
      } catch {
        priorityRestored = true;
      }
    }
  }
  return powerRestored && priorityRestored;
}

function recoverInterruptedSession() {
  const journal = readJson("rollback-journal.json", null);
  if (!journal) return;
  if (restoreStateSync(journal)) {
    try {
      fs.rmSync(rollbackFile(), { force: true });
    } catch {}
  }
}

function exec(program, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(program, args, { windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stderr }));
        return;
      }
      resolve(stdout);
    });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1060,
    minHeight: 700,
    frame: false,
    backgroundColor: "#050b14",
    title: "Ping Optimizer",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile("index.html");
}

function detectRunningGame() {
  return new Promise((resolve) => {
    execFile("tasklist.exe", ["/FO", "CSV", "/NH"], { windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      const lower = stdout.toLowerCase();
      const match = knownGames.find(([process]) => lower.includes(`"${process.toLowerCase()}"`));
      if (!match) {
        resolve(null);
        return;
      }
      const escaped = match[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const row = stdout.split(/\r?\n/).find((line) => new RegExp(`^"${escaped}"`, "i").test(line));
      const pidMatch = row?.match(/^"[^"]+","(\d+)"/);
      resolve({
        process: match[0],
        name: match[1],
        recommendedMode: match[2],
        pid: pidMatch ? Number(pidMatch[1]) : null,
      });
    });
  });
}

function tcpProbe(host, port = 443, timeout = 1700) {
  return new Promise((resolve) => {
    const started = performance.now();
    const socket = net.createConnection({ host, port });
    let settled = false;

    function finish(value) {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    }

    socket.setTimeout(timeout);
    socket.once("connect", () => finish(Math.round(performance.now() - started)));
    socket.once("timeout", () => finish(null));
    socket.once("error", () => finish(null));
  });
}

const diagnosticModes = {
  Automatic: { attempts: 5, timeout: 1300, jitterWeight: 1.2, failureWeight: 3 },
  "Lowest latency": { attempts: 7, timeout: 1200, jitterWeight: 0.45, failureWeight: 2 },
  "Maximum stability": { attempts: 8, timeout: 1600, jitterWeight: 2.2, failureWeight: 5 },
  "Quick check": { attempts: 3, timeout: 1000, jitterWeight: 1, failureWeight: 3 },
};

async function measureTarget(target, profile) {
  const samples = [];
  for (let attempt = 0; attempt < profile.attempts; attempt += 1) {
    samples.push(await tcpProbe(target.host, 443, profile.timeout));
  }
  const valid = samples.filter((value) => Number.isFinite(value));
  const sorted = [...valid].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  const average = valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  const variance = valid.length
    ? valid.reduce((sum, value) => sum + (value - average) ** 2, 0) / valid.length
    : null;

  return {
    name: target.name,
    latency: median,
    jitter: variance === null ? null : Math.round(Math.sqrt(variance)),
    failureRate: Math.round(((samples.length - valid.length) / samples.length) * 100),
    attempts: samples.length,
  };
}

async function runDiagnostics(request = {}) {
  const gameName = request.gameName || "Manual selection";
  const mode = diagnosticModes[request.mode] ? request.mode : "Automatic";
  const profile = diagnosticModes[mode];
  const targets = [
    { name: "Cloudflare edge", host: "1.1.1.1" },
    { name: "Google edge", host: "8.8.8.8" },
    { name: "Quad9 edge", host: "9.9.9.9" },
  ];
  const results = await Promise.all(targets.map((target) => measureTarget(target, profile)));
  const reachable = results.filter((result) => result.latency !== null);
  const score = (result) =>
    result.latency + result.jitter * profile.jitterWeight + result.failureRate * profile.failureWeight;
  const best = reachable.sort((a, b) => score(a) - score(b))[0] ?? null;
  const report = {
    results,
    best,
    gameName,
    mode,
    metric: "TCP connection response",
    testedAt: new Date().toISOString(),
  };
  const history = readJson("history.json", []);
  history.unshift(report);
  writeJson("history.json", history.slice(0, 30));
  return report;
}

function activePowerPlan() {
  try {
    const output = execFileSync("powercfg.exe", ["/GETACTIVESCHEME"], {
      encoding: "utf8",
      windowsHide: true,
    });
    return output.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i)?.[0] ?? null;
  } catch {
    return null;
  }
}

async function applyPerformanceProfile(options = {}) {
  const applied = [];
  const skipped = [];
  const game = await detectRunningGame();

  if (options.powerPlan) {
    const current = activePowerPlan();
    let capturedPowerPlan = false;
    try {
      const plans = await exec("powercfg.exe", ["/L"]);
      if (!plans.toLowerCase().includes(HIGH_PERFORMANCE_GUID)) {
        skipped.push("High Performance power plan is unavailable on this PC");
      } else if (!current) {
        skipped.push("The current Windows power plan could not be read safely");
      } else if (current?.toLowerCase() === HIGH_PERFORMANCE_GUID) {
        skipped.push("High Performance power plan is already active");
      } else {
        if (!sessionState.originalPowerPlan) {
          sessionState.originalPowerPlan = current;
          capturedPowerPlan = true;
          persistRollbackJournal();
        }
        await exec("powercfg.exe", ["/S", HIGH_PERFORMANCE_GUID]);
        applied.push("High Performance power plan");
      }
    } catch {
      if (capturedPowerPlan) {
        sessionState.originalPowerPlan = null;
        persistRollbackJournal();
      }
      skipped.push("Power plan could not be changed");
    }
  }

  if (options.processPriority) {
    if (!game?.pid) {
      skipped.push("No supported running game was detected");
    } else {
      try {
        if (sessionState.priorityPid && sessionState.priorityPid !== game.pid) {
          skipped.push("Another game session already has a temporary priority change");
        } else {
          if (!sessionState.priorityPid) {
            sessionState.priorityPid = game.pid;
            sessionState.originalPriority = os.getPriority(game.pid);
            persistRollbackJournal();
          }
          os.setPriority(game.pid, os.constants.priority.PRIORITY_HIGH);
          applied.push(`${game.name} process priority`);
        }
      } catch {
        if (sessionState.priorityPid === game.pid) {
          if (Number.isFinite(sessionState.originalPriority)) {
            try {
              os.setPriority(game.pid, sessionState.originalPriority);
            } catch {}
          }
          sessionState.priorityPid = null;
          sessionState.originalPriority = null;
          persistRollbackJournal();
        }
        skipped.push(`${game.name} priority needs additional Windows permission`);
      }
    }
  }

  persistRollbackJournal();
  return { applied, skipped, game, active: sessionState.active };
}

async function restorePerformanceProfile() {
  const restored = [];
  const failed = [];
  let remainingPowerPlan = sessionState.originalPowerPlan;
  let remainingPriorityPid = sessionState.priorityPid;
  let remainingOriginalPriority = sessionState.originalPriority;
  if (sessionState.originalPowerPlan) {
    try {
      await exec("powercfg.exe", ["/S", sessionState.originalPowerPlan]);
      restored.push("Previous power plan");
      remainingPowerPlan = null;
    } catch {
      failed.push("Previous power plan could not be restored");
    }
  }
  if (sessionState.priorityPid) {
    try {
      os.setPriority(
        sessionState.priorityPid,
        Number.isFinite(sessionState.originalPriority)
          ? sessionState.originalPriority
          : os.constants.priority.PRIORITY_NORMAL,
      );
      restored.push("Previous process priority");
      remainingPriorityPid = null;
      remainingOriginalPriority = null;
    } catch {
      try {
        os.getPriority(sessionState.priorityPid);
        failed.push("Previous game process priority could not be restored");
      } catch {
        restored.push("Game process already ended");
        remainingPriorityPid = null;
        remainingOriginalPriority = null;
      }
    }
  }
  sessionState = {
    originalPowerPlan: remainingPowerPlan,
    priorityPid: remainingPriorityPid,
    originalPriority: remainingOriginalPriority,
    active: Boolean(remainingPowerPlan || remainingPriorityPid),
  };
  persistRollbackJournal();
  return { restored, failed, active: sessionState.active };
}

function restorePerformanceSync() {
  if (restoreStateSync(sessionState)) {
    try {
      fs.rmSync(rollbackFile(), { force: true });
    } catch {}
  }
}

async function runSafeRepair() {
  const checks = [];
  try {
    const answer = await dns.lookup("one.one.one.one");
    checks.push({ name: "DNS resolution", status: "passed", detail: answer.address });
  } catch {
    checks.push({ name: "DNS resolution", status: "failed", detail: "Could not resolve a test hostname" });
  }

  try {
    await exec("ipconfig.exe", ["/flushdns"]);
    checks.push({ name: "DNS cache", status: "repaired", detail: "Windows DNS cache was flushed" });
  } catch {
    checks.push({ name: "DNS cache", status: "skipped", detail: "Windows did not allow the cache flush" });
  }

  try {
    const script =
      "Get-NetAdapter | Where-Object {$_.Status -eq 'Up'} | Select-Object Name,InterfaceDescription,LinkSpeed,Status | ConvertTo-Json -Compress";
    const output = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
    const parsed = output.trim() ? JSON.parse(output) : [];
    const adapters = Array.isArray(parsed) ? parsed : [parsed];
    checks.push({
      name: "Active adapters",
      status: adapters.length ? "passed" : "warning",
      detail: adapters.length
        ? adapters.map((adapter) => `${adapter.Name} · ${adapter.LinkSpeed}`).join(", ")
        : "No active adapter was reported",
    });
  } catch {
    checks.push({ name: "Active adapters", status: "warning", detail: "Adapter details were unavailable" });
  }

  return { checks, testedAt: new Date().toISOString() };
}

ipcMain.handle("game:detect", detectRunningGame);
ipcMain.handle("games:list", () =>
  knownGames.map(([process, name, recommendedMode]) => ({ process, name, recommendedMode })),
);
ipcMain.handle("network:diagnose", (_event, request) => runDiagnostics(request));
ipcMain.handle("performance:apply", (_event, options) => applyPerformanceProfile(options));
ipcMain.handle("performance:restore", restorePerformanceProfile);
ipcMain.handle("tools:repair", runSafeRepair);
ipcMain.handle("history:list", () => readJson("history.json", []));
ipcMain.handle("settings:get", () =>
  readJson("settings.json", {
    autoDetect: true,
    diagnosticsOnLaunch: false,
    minimizeToTray: false,
    preferredMode: "Automatic",
  }),
);
ipcMain.handle("settings:save", (_event, settings) => {
  writeJson("settings.json", settings);
  return settings;
});
ipcMain.on("window:minimize", (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.on("window:close", async (event) => {
  await restorePerformanceProfile();
  BrowserWindow.fromWebContents(event.sender)?.close();
});

app.whenReady().then(() => {
  recoverInterruptedSession();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", restorePerformanceSync);
