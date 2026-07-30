const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pingOptimizer", {
  detectGame: () => ipcRenderer.invoke("game:detect"),
  listGames: () => ipcRenderer.invoke("games:list"),
  onGameChanged: (callback) => {
    const handler = (_event, game) => callback(game);
    ipcRenderer.on("game:changed", handler);
    return () => ipcRenderer.removeListener("game:changed", handler);
  },
  onSessionRestored: (callback) => {
    const handler = (_event, result) => callback(result);
    ipcRenderer.on("session:restored", handler);
    return () => ipcRenderer.removeListener("session:restored", handler);
  },
  runDiagnostics: (request) => ipcRenderer.invoke("network:diagnose", request),
  applyPerformance: (options) => ipcRenderer.invoke("performance:apply", options),
  restorePerformance: () => ipcRenderer.invoke("performance:restore"),
  getPerformanceState: () => ipcRenderer.invoke("performance:state"),
  scanFpsBoost: () => ipcRenderer.invoke("fps:scan"),
  benchmarkFpsBoost: (options) => ipcRenderer.invoke("fps:benchmark", options),
  applyFpsBoost: (options) => ipcRenderer.invoke("fps:apply", options),
  rollbackFpsBoost: () => ipcRenderer.invoke("fps:rollback"),
  getFpsBoostState: () => ipcRenderer.invoke("fps:state"),
  getSystemTelemetry: (options) => ipcRenderer.invoke("system:telemetry", options),
  onFpsBoostState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("fps:state-changed", handler);
    return () => ipcRenderer.removeListener("fps:state-changed", handler);
  },
  onFpsBoostProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on("fps:benchmark-progress", handler);
    return () => ipcRenderer.removeListener("fps:benchmark-progress", handler);
  },
  compareEasyLobby: (options) => ipcRenderer.invoke("easy-lobby:compare", options),
  listEasyLobbyRegions: () => ipcRenderer.invoke("easy-lobby:regions"),
  getEasyLobbyState: () => ipcRenderer.invoke("easy-lobby:state"),
  onEasyLobbyState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("easy-lobby:state-changed", handler);
    return () => ipcRenderer.removeListener("easy-lobby:state-changed", handler);
  },
  runSafeRepair: () => ipcRenderer.invoke("tools:repair"),
  getHistory: () => ipcRenderer.invoke("history:list"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  openExternal: (target) => ipcRenderer.invoke("app:open-external", target),
  minimize: () => ipcRenderer.send("window:minimize"),
  close: () => ipcRenderer.send("window:close"),
});
