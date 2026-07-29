const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pingOptimizer", {
  detectGame: () => ipcRenderer.invoke("game:detect"),
  runDiagnostics: () => ipcRenderer.invoke("network:diagnose"),
  minimize: () => ipcRenderer.send("window:minimize"),
  close: () => ipcRenderer.send("window:close"),
});
