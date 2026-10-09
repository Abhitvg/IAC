import { ipcMain, BrowserWindow } from 'electron';
import { WebSocketServer, WebSocket } from 'ws';

let wsServer: WebSocketServer | null = null;
let mainWindowRef: BrowserWindow | null = null;

export function setupIpcHandlers(mainWindow: BrowserWindow | null) {
  mainWindowRef = mainWindow;

  // Settings storage (using simple JSON file for portability)
  const Store = require('electron-store');
  const store = new Store({
    name: 'settings',
    defaults: {
      aiProvider: 'openai',
      aiModel: 'gpt-4o-mini',
      whisperModel: 'base',
      preferredLanguage: 'python',
      responseMode: 'interview',
      temperature: 0.7,
      maxTokens: 2048,
      theme: 'dark',
      audioFormat: 'wav',
      browserIntegration: false,
      alwaysOnTop: false,
      shortcuts: {
        record: 'R',
        analyze: 'A',
        copyAnswer: 'C',
        quickAnswer: 'Q',
        detailedAnswer: 'D',
        minimize: 'Escape',
        regenerate: 'CommandOrControl+Enter',
      },
      systemPrompt: `You are a technical interview assistant. Provide clear, concise, and accurate answers to interview questions. When answering coding questions, provide well-structured solutions with time and space complexity analysis. Format your responses in markdown.`,
      customApiEndpoint: '',
      ollamaEndpoint: 'http://localhost:11434',
    },
  });

  ipcMain.handle('settings:get', () => store.store);
  ipcMain.handle('settings:set', (_event: any, key: string, value: any) => {
    store.set(key, value);
    return true;
  });

  // Secure credential storage
  ipcMain.handle('credentials:get', async (_event: any, service: string) => {
    try {
      const keytar = require('keytar');
      return await keytar.getPassword('ai-interview-assistant', service);
    } catch {
      // Fallback to encrypted store if keytar unavailable
      return store.get(`credentials.${service}`, null);
    }
  });

  ipcMain.handle('credentials:set', async (_event: any, service: string, key: string) => {
    try {
      const keytar = require('keytar');
      await keytar.setPassword('ai-interview-assistant', service, key);
    } catch {
      store.set(`credentials.${service}`, key);
    }
    return true;
  });

  ipcMain.handle('credentials:delete', async (_event: any, service: string) => {
    try {
      const keytar = require('keytar');
      await keytar.deletePassword('ai-interview-assistant', service);
    } catch {
      store.delete(`credentials.${service}`);
    }
    return true;
  });

  // WebSocket server for browser extension communication
  ipcMain.handle('ws:start', () => {
    if (wsServer) return { port: (wsServer.address() as any)?.port };
    
    wsServer = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    
    wsServer.on('connection', (ws: WebSocket) => {
      ws.on('message', (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          // Validate message structure
          if (data.type && data.content) {
            mainWindowRef?.webContents.send('browser-context', data);
          }
        } catch (e) {
          console.error('Invalid WebSocket message:', e);
        }
      });
    });

    const address = wsServer.address();
    const port = typeof address === 'object' ? address?.port : 0;
    return { port };
  });

  ipcMain.handle('ws:stop', () => {
    if (wsServer) {
      wsServer.close();
      wsServer = null;
    }
    return true;
  });
}
