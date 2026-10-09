"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // Window controls
    minimize: () => electron_1.ipcRenderer.send('window:minimize'),
    maximize: () => electron_1.ipcRenderer.send('window:maximize'),
    close: () => electron_1.ipcRenderer.send('window:close'),
    toggleAlwaysOnTop: () => electron_1.ipcRenderer.send('window:toggle-always-on-top'),
    isAlwaysOnTop: () => electron_1.ipcRenderer.invoke('window:is-always-on-top'),
    // Paths
    getRecordingsDir: () => electron_1.ipcRenderer.invoke('get-recordings-dir'),
    getSessionsDir: () => electron_1.ipcRenderer.invoke('get-sessions-dir'),
    getUserDataPath: () => electron_1.ipcRenderer.invoke('get-user-data-path'),
    // File dialogs
    openFileDialog: (options) => electron_1.ipcRenderer.invoke('dialog:open-file', options),
    // File system
    readFile: (path) => electron_1.ipcRenderer.invoke('fs:read-file', path),
    writeFile: (path, data) => electron_1.ipcRenderer.invoke('fs:write-file', path, data),
    listDir: (path) => electron_1.ipcRenderer.invoke('fs:list-dir', path),
    deleteFile: (path) => electron_1.ipcRenderer.invoke('fs:delete', path),
    // Shell
    openExternal: (url) => electron_1.ipcRenderer.invoke('shell:open-external', url),
    // Settings
    getSettings: () => electron_1.ipcRenderer.invoke('settings:get'),
    setSettings: (key, value) => electron_1.ipcRenderer.invoke('settings:set', key, value),
    // Secure credentials
    getApiKey: (service) => electron_1.ipcRenderer.invoke('credentials:get', service),
    setApiKey: (service, key) => electron_1.ipcRenderer.invoke('credentials:set', service, key),
    deleteApiKey: (service) => electron_1.ipcRenderer.invoke('credentials:delete', service),
    // WebSocket server for browser extension
    startWsServer: () => electron_1.ipcRenderer.invoke('ws:start'),
    stopWsServer: () => electron_1.ipcRenderer.invoke('ws:stop'),
    onBrowserContext: (callback) => {
        electron_1.ipcRenderer.on('browser-context', (_event, data) => callback(data));
        return () => electron_1.ipcRenderer.removeAllListeners('browser-context');
    },
    // Platform
    platform: process.platform,
});
