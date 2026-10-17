"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  // Window controls
  minimize: () => electron.ipcRenderer.send("window:minimize"),
  maximize: () => electron.ipcRenderer.send("window:maximize"),
  close: () => electron.ipcRenderer.send("window:close"),
  toggleAlwaysOnTop: () => electron.ipcRenderer.send("window:toggle-always-on-top"),
  isAlwaysOnTop: () => electron.ipcRenderer.invoke("window:is-always-on-top"),
  setContentProtection: (enable) => electron.ipcRenderer.invoke("window:set-content-protection", enable),
  isContentProtected: () => electron.ipcRenderer.invoke("window:is-content-protected"),
  toggleContentProtection: () => electron.ipcRenderer.send("window:toggle-content-protection"),
  // Paths
  getRecordingsDir: () => electron.ipcRenderer.invoke("get-recordings-dir"),
  getSessionsDir: () => electron.ipcRenderer.invoke("get-sessions-dir"),
  getUserDataPath: () => electron.ipcRenderer.invoke("get-user-data-path"),
  // File dialogs
  openFileDialog: (options) => electron.ipcRenderer.invoke("dialog:open-file", options),
  // File system
  readFile: (path) => electron.ipcRenderer.invoke("fs:read-file", path),
  parsePdf: (arrayBuffer) => electron.ipcRenderer.invoke("fs:parse-pdf", arrayBuffer),
  parseDocx: (arrayBuffer) => electron.ipcRenderer.invoke("fs:parse-docx", arrayBuffer),
  writeFile: (path, data) => electron.ipcRenderer.invoke("fs:write-file", path, data),
  listDir: (path) => electron.ipcRenderer.invoke("fs:list-dir", path),
  deleteFile: (path) => electron.ipcRenderer.invoke("fs:delete", path),
  // Shell
  openExternal: (url) => electron.ipcRenderer.invoke("shell:open-external", url),
  // Settings
  getSettings: () => electron.ipcRenderer.invoke("settings:get"),
  setSettings: (key, value) => electron.ipcRenderer.invoke("settings:set", key, value),
  // Secure credentials
  getApiKey: (service) => electron.ipcRenderer.invoke("credentials:get", service),
  setApiKey: (service, key) => electron.ipcRenderer.invoke("credentials:set", service, key),
  deleteApiKey: (service) => electron.ipcRenderer.invoke("credentials:delete", service),
  // WebSocket server for browser extension
  startWsServer: () => electron.ipcRenderer.invoke("ws:start"),
  stopWsServer: () => electron.ipcRenderer.invoke("ws:stop"),
  onBrowserContext: (callback) => {
    electron.ipcRenderer.on("browser-context", (_event, data) => callback(data));
    return () => electron.ipcRenderer.removeAllListeners("browser-context");
  },
  // Platform
  platform: process.platform
});
