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
  runSafeRepair: () => ipcRenderer.invoke("tools:repair"),
  getHistory: () => ipcRenderer.invoke("history:list"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  minimize: () => ipcRenderer.send("window:minimize"),
  close: () => ipcRenderer.send("window:close"),
});
