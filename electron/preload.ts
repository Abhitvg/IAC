import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  toggleVisibility: () => ipcRenderer.send('window:toggle-visibility'),
  hideWindow: () => ipcRenderer.send('window:hide'),
  showWindow: () => ipcRenderer.send('window:show'),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  quitApp: () => ipcRenderer.send('app:quit'),
  toggleAlwaysOnTop: () => ipcRenderer.send('window:toggle-always-on-top'),
  isAlwaysOnTop: () => ipcRenderer.invoke('window:is-always-on-top'),
  setContentProtection: (enable: boolean) =>
    ipcRenderer.invoke('window:set-content-protection', enable),
  isContentProtected: () => ipcRenderer.invoke('window:is-content-protected'),
  toggleContentProtection: () => ipcRenderer.send('window:toggle-content-protection'),
  setWindowOpacity: (opacity: number) => ipcRenderer.invoke('window:set-opacity', opacity),
  getWindowOpacity: () => ipcRenderer.invoke('window:get-opacity'),
  setWindowSize: (width: number, height: number) =>
    ipcRenderer.invoke('window:set-size', width, height),
  getWindowSize: () => ipcRenderer.invoke('window:get-size'),
  setWindowPosition: (x: number, y: number) => ipcRenderer.invoke('window:set-position', x, y),
  getWindowPosition: () => ipcRenderer.invoke('window:get-position'),
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) =>
    ipcRenderer.invoke('window:set-ignore-mouse-events', ignore, options),

  // Paths
  getRecordingsDir: () => ipcRenderer.invoke('get-recordings-dir'),
  getSessionsDir: () => ipcRenderer.invoke('get-sessions-dir'),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),

  // Encrypted candidate/practice/session persistence (main-process only).
  piiVaultGet: (namespace: string, key: string) =>
    ipcRenderer.invoke('pii-vault:get', namespace, key),
  piiVaultPut: (namespace: string, key: string, value: unknown) =>
    ipcRenderer.invoke('pii-vault:put', namespace, key, value),
  piiVaultVerify: (namespace: string, key: string, value: unknown) =>
    ipcRenderer.invoke('pii-vault:verify', namespace, key, value),
  piiVaultDelete: (namespace: string, key: string) =>
    ipcRenderer.invoke('pii-vault:delete', namespace, key),

  // File dialogs
  openFileDialog: (options?: any) => ipcRenderer.invoke('dialog:open-file', options),

  // File system
  readFile: (path: string) => ipcRenderer.invoke('fs:read-file', path),
  parsePdf: (arrayBuffer: ArrayBuffer) => ipcRenderer.invoke('fs:parse-pdf', arrayBuffer),
  parseDocx: (arrayBuffer: ArrayBuffer) => ipcRenderer.invoke('fs:parse-docx', arrayBuffer),
  writeFile: (path: string, data: any) => ipcRenderer.invoke('fs:write-file', path, data),
  listDir: (path: string) => ipcRenderer.invoke('fs:list-dir', path),
  deleteFile: (path: string) => ipcRenderer.invoke('fs:delete', path),

  // Network / SSRF verification
  resolveDns: (hostname: string) => ipcRenderer.invoke('net:resolve-dns', hostname),
  safeFetchPinned: (options: any) => ipcRenderer.invoke('net:safe-fetch-pinned', options),

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),

  // Secure credentials
  startCloudLLMStream: (request: {
    requestId: string;
    provider: 'groq' | 'openai' | 'openrouter';
    model: string;
    systemPrompt: string;
    question: string;
    temperature: number;
    maxTokens: number;
    stream: boolean;
  }) => ipcRenderer.invoke('ai:stream-start', request),
  cancelCloudLLMStream: (requestId: string) => ipcRenderer.invoke('ai:stream-cancel', requestId),
  onAIStreamChunk: (callback: (payload: { requestId: string; chunk: string }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { requestId: string; chunk: string }
    ) => callback(payload);
    ipcRenderer.on('ai:stream-chunk', listener);
    return () => ipcRenderer.removeListener('ai:stream-chunk', listener);
  },
  onAIStreamDone: (callback: (payload: { requestId: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { requestId: string }) =>
      callback(payload);
    ipcRenderer.on('ai:stream-done', listener);
    return () => ipcRenderer.removeListener('ai:stream-done', listener);
  },
  onAIStreamError: (
    callback: (payload: { requestId: string; name: string; message: string }) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { requestId: string; name: string; message: string }
    ) => callback(payload);
    ipcRenderer.on('ai:stream-error', listener);
    return () => ipcRenderer.removeListener('ai:stream-error', listener);
  },
  setApiKey: (service: string, key: string) => ipcRenderer.invoke('credentials:set', service, key),
  hasApiKey: (service: string) => ipcRenderer.invoke('credentials:has', service),
  deleteApiKey: (service: string) => ipcRenderer.invoke('credentials:delete', service),
  listConfiguredKeys: () => ipcRenderer.invoke('credentials:list'),
  preflightAI: (provider: 'groq' | 'openai' | 'openrouter', model: string) =>
    ipcRenderer.invoke('ai:preflight', { provider, model }),
  transcribeCloudAudio: (request: {
    requestId: string;
    provider: 'groq' | 'openai';
    model: string;
    audio: Uint8Array;
    language?: string;
    prompt?: string;
  }) => ipcRenderer.invoke('stt:transcribe', request),
  cancelCloudTranscription: (requestId: string) => ipcRenderer.invoke('stt:cancel', requestId),

  // WebSocket server for browser extension
  getWsInfo: () => ipcRenderer.invoke('ws:get-info'),
  copyWsToken: () => ipcRenderer.invoke('ws:copy-token'),
  startWsServer: () => ipcRenderer.invoke('ws:start'),
  stopWsServer: () => ipcRenderer.invoke('ws:stop'),
  onBrowserContext: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('browser-context', listener);
    return () => {
      ipcRenderer.removeListener('browser-context', listener);
    };
  },

  // Screen Capture & Neural OCR
  onTriggerScreenCapture: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('trigger-screen-capture', listener);
    return () => {
      ipcRenderer.removeListener('trigger-screen-capture', listener);
    };
  },
  onTriggerAppendScreenCapture: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('trigger-append-screen-capture', listener);
    return () => {
      ipcRenderer.removeListener('trigger-append-screen-capture', listener);
    };
  },
  onTriggerAutoType: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('trigger-auto-type', listener);
    return () => {
      ipcRenderer.removeListener('trigger-auto-type', listener);
    };
  },
  onTriggerAutoTypeText: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('trigger-auto-type-text', listener);
    return () => {
      ipcRenderer.removeListener('trigger-auto-type-text', listener);
    };
  },
  captureScreenAndOCR: (mode: 'fullscreen' | 'snip' = 'fullscreen') =>
    ipcRenderer.invoke('screen:capture-and-ocr', mode),
  appendScreenCaptureAndOCR: (mode: 'fullscreen' | 'snip' = 'fullscreen') =>
    ipcRenderer.invoke('screen:append-capture-and-ocr', mode),
  getLastOcrText: () => ipcRenderer.invoke('screen:get-last-ocr-text'),
  setLastOcrText: (text: string) => ipcRenderer.invoke('screen:set-last-ocr-text', text),
  ocrImageFile: (filePath: string) => ipcRenderer.invoke('screen:ocr-image', filePath),
  getOcrEngineInfo: () => ipcRenderer.invoke('screen:get-ocr-engine-info'),
  autoTypeCode: (code: string, delayMs?: number) =>
    ipcRenderer.invoke('system:auto-type', code, delayMs),

  // Privileged Evidence Inspection Operations
  inspectRepository: (request: any) => ipcRenderer.invoke('evidence:inspect-repository', request),
  inspectDocument: (request: any) => ipcRenderer.invoke('evidence:inspect-document', request),
  verifyIndependentAudit: (attestation: any) =>
    ipcRenderer.invoke('evidence:verify-audit', attestation),
  verifyInspectionSeal: (result: any) => ipcRenderer.invoke('evidence:verify-seal', result),

  // Clipboard
  copyToClipboard: (text: string) => ipcRenderer.invoke('clipboard:write-text', text),
  readClipboard: () => ipcRenderer.invoke('clipboard:read-text'),

  // Platform
  platform: process.platform,
});
