import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  toggleVisibility: () => ipcRenderer.send('window:toggle-visibility'),
  hideWindow: () => ipcRenderer.send('window:hide'),
  showWindow: () => ipcRenderer.send('window:show'),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  toggleAlwaysOnTop: () => ipcRenderer.send('window:toggle-always-on-top'),
  isAlwaysOnTop: () => ipcRenderer.invoke('window:is-always-on-top'),
  setContentProtection: (enable: boolean) =>
    ipcRenderer.invoke('window:set-content-protection', enable),
  isContentProtected: () => ipcRenderer.invoke('window:is-content-protected'),
  toggleContentProtection: () => ipcRenderer.send('window:toggle-content-protection'),
  setWindowOpacity: (opacity: number) => ipcRenderer.invoke('window:set-opacity', opacity),
  getWindowOpacity: () => ipcRenderer.invoke('window:get-opacity'),
  setWindowSize: (width: number, height: number) => ipcRenderer.invoke('window:set-size', width, height),
  getWindowSize: () => ipcRenderer.invoke('window:get-size'),

  // Paths
  getRecordingsDir: () => ipcRenderer.invoke('get-recordings-dir'),
  getSessionsDir: () => ipcRenderer.invoke('get-sessions-dir'),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),

  // File dialogs
  openFileDialog: (options?: any) => ipcRenderer.invoke('dialog:open-file', options),

  // File system
  readFile: (path: string) => ipcRenderer.invoke('fs:read-file', path),
  parsePdf: (arrayBuffer: ArrayBuffer) => ipcRenderer.invoke('fs:parse-pdf', arrayBuffer),
  parseDocx: (arrayBuffer: ArrayBuffer) => ipcRenderer.invoke('fs:parse-docx', arrayBuffer),
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
  hasApiKey: (service: string) => ipcRenderer.invoke('credentials:has', service),
  deleteApiKey: (service: string) => ipcRenderer.invoke('credentials:delete', service),
  listConfiguredKeys: () => ipcRenderer.invoke('credentials:list'),

  // WebSocket server for browser extension
  getWsInfo: () => ipcRenderer.invoke('ws:get-info'),
  startWsServer: () => ipcRenderer.invoke('ws:start'),
  stopWsServer: () => ipcRenderer.invoke('ws:stop'),
  onBrowserContext: (callback: (data: any) => void) => {
    ipcRenderer.on('browser-context', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('browser-context');
  },

  // Screen Capture & Neural OCR
  onTriggerScreenCapture: (callback: () => void) => {
    ipcRenderer.on('trigger-screen-capture', () => callback());
    return () => ipcRenderer.removeAllListeners('trigger-screen-capture');
  },
  onTriggerAppendScreenCapture: (callback: () => void) => {
    ipcRenderer.on('trigger-append-screen-capture', () => callback());
    return () => ipcRenderer.removeAllListeners('trigger-append-screen-capture');
  },
  onTriggerAutoType: (callback: () => void) => {
    ipcRenderer.on('trigger-auto-type', () => callback());
    return () => ipcRenderer.removeAllListeners('trigger-auto-type');
  },
  captureScreenAndOCR: (mode: 'fullscreen' | 'snip' = 'fullscreen') =>
    ipcRenderer.invoke('screen:capture-and-ocr', mode),
  appendScreenCaptureAndOCR: (mode: 'fullscreen' | 'snip' = 'fullscreen') =>
    ipcRenderer.invoke('screen:append-capture-and-ocr', mode),
  getLastOcrText: () => ipcRenderer.invoke('screen:get-last-ocr-text'),
  setLastOcrText: (text: string) => ipcRenderer.invoke('screen:set-last-ocr-text', text),
  ocrImageFile: (filePath: string) => ipcRenderer.invoke('screen:ocr-image', filePath),
  autoTypeCode: (code: string, delayMs?: number) =>
    ipcRenderer.invoke('system:auto-type', code, delayMs),

  // Platform
  platform: process.platform,
});
