const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pingOptimizer", {
  detectGame: () => ipcRenderer.invoke("game:detect"),
  listGames: () => ipcRenderer.invoke("games:list"),
  runDiagnostics: (request) => ipcRenderer.invoke("network:diagnose", request),
  applyPerformance: (options) => ipcRenderer.invoke("performance:apply", options),
  restorePerformance: () => ipcRenderer.invoke("performance:restore"),
  runSafeRepair: () => ipcRenderer.invoke("tools:repair"),
  getHistory: () => ipcRenderer.invoke("history:list"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  minimize: () => ipcRenderer.send("window:minimize"),
  close: () => ipcRenderer.send("window:close"),
});
