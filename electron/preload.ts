import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  toggleAlwaysOnTop: () => ipcRenderer.send('window:toggle-always-on-top'),
  isAlwaysOnTop: () => ipcRenderer.invoke('window:is-always-on-top'),

  // Paths
  getRecordingsDir: () => ipcRenderer.invoke('get-recordings-dir'),
  getSessionsDir: () => ipcRenderer.invoke('get-sessions-dir'),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),

  // File dialogs
  openFileDialog: (options: any) => ipcRenderer.invoke('dialog:open-file', options),

  // File system
  readFile: (path: string) => ipcRenderer.invoke('fs:read-file', path),
  writeFile: (path: string, data: any) => ipcRenderer.invoke('fs:write-file', path, data),
  listDir: (path: string) => ipcRenderer.invoke('fs:list-dir', path),
  deleteFile: (path: string) => ipcRenderer.invoke('fs:delete', path),

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),

  // Secure credentials
  getApiKey: (service: string) => ipcRenderer.invoke('credentials:get', service),
  setApiKey: (service: string, key: string) => ipcRenderer.invoke('credentials:set', service, key),
  deleteApiKey: (service: string) => ipcRenderer.invoke('credentials:delete', service),

  // WebSocket server for browser extension
  startWsServer: () => ipcRenderer.invoke('ws:start'),
  stopWsServer: () => ipcRenderer.invoke('ws:stop'),
  onBrowserContext: (callback: (data: any) => void) => {
    ipcRenderer.on('browser-context', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('browser-context');
  },

  // Platform
  platform: process.platform,
});
