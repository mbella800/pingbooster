const { app, BrowserWindow, ipcMain } = require("electron");
const { execFile } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

const knownGames = [
  ["FortniteClient-Win64-Shipping.exe", "Fortnite"],
  ["VALORANT-Win64-Shipping.exe", "VALORANT"],
  ["cs2.exe", "Counter-Strike 2"],
  ["League of Legends.exe", "League of Legends"],
  ["r5apex.exe", "Apex Legends"],
  ["Overwatch.exe", "Overwatch 2"],
  ["RocketLeague.exe", "Rocket League"],
  ["RobloxPlayerBeta.exe", "Roblox"],
  ["GenshinImpact.exe", "Genshin Impact"],
  ["cod.exe", "Call of Duty"],
  ["Wow.exe", "World of Warcraft"],
  ["dota2.exe", "Dota 2"],
];

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
      const match = knownGames.find(([process]) => lower.includes(process.toLowerCase()));
      resolve(match ? { process: match[0], name: match[1] } : null);
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

async function measureTarget(target) {
  const samples = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    samples.push(await tcpProbe(target.host));
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
    loss: Math.round(((samples.length - valid.length) / samples.length) * 100),
  };
}

async function runDiagnostics() {
  const targets = [
    { name: "Cloudflare edge", host: "1.1.1.1" },
    { name: "Google edge", host: "8.8.8.8" },
    { name: "Quad9 edge", host: "9.9.9.9" },
  ];
  const results = [];
  for (const target of targets) {
    results.push(await measureTarget(target));
  }
  const reachable = results.filter((result) => result.latency !== null);
  const best = reachable.sort((a, b) => a.latency - b.latency)[0] ?? null;
  return { results, best, testedAt: new Date().toISOString() };
}

ipcMain.handle("game:detect", detectRunningGame);
ipcMain.handle("network:diagnose", runDiagnostics);
ipcMain.on("window:minimize", (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.on("window:close", (event) => BrowserWindow.fromWebContents(event.sender)?.close());

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
