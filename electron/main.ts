import { app, BrowserWindow, ipcMain, globalShortcut, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { setupIpcHandlers } from './ipc/handlers';

let mainWindow: BrowserWindow | null = null;

const RECORDINGS_DIR = path.join(app.getPath('userData'), 'recordings');
const SESSIONS_DIR = path.join(app.getPath('userData'), 'sessions');

function ensureDirectories() {
  [RECORDINGS_DIR, SESSIONS_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 780,
    minWidth: 400,
    minHeight: 600,
    frame: false,
    transparent: false,
    resizable: true,
    alwaysOnTop: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 12, y: 12 },
    vibrancy: 'under-window',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, '../public/icon.png'),
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerGlobalShortcuts() {
  // These are app-level shortcuts that work even when minimized
  // Most shortcuts are handled in the renderer for better UX
}

app.whenReady().then(() => {
  ensureDirectories();
  createWindow();
  setupIpcHandlers(mainWindow);
  registerGlobalShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// IPC for window controls
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window:close', () => mainWindow?.close());
ipcMain.on('window:toggle-always-on-top', () => {
  if (mainWindow) {
    const isOnTop = mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(!isOnTop);
  }
});

ipcMain.handle('window:is-always-on-top', () => {
  return mainWindow?.isAlwaysOnTop() ?? false;
});

// File system paths
ipcMain.handle('get-recordings-dir', () => RECORDINGS_DIR);
ipcMain.handle('get-sessions-dir', () => SESSIONS_DIR);
ipcMain.handle('get-user-data-path', () => app.getPath('userData'));

// File dialog
ipcMain.handle('dialog:open-file', async (_event, options: Electron.OpenDialogOptions) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, options);
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Read file
ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
  // Security: only allow reading from userData directory
  const userDataPath = app.getPath('userData');
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(userDataPath) && !resolvedPath.startsWith(app.getPath('home'))) {
    throw new Error('Access denied: Cannot read files outside allowed directories');
  }
  return fs.readFileSync(resolvedPath);
});

// Write file
ipcMain.handle('fs:write-file', async (_event, filePath: string, data: Buffer | string) => {
  const userDataPath = app.getPath('userData');
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(userDataPath)) {
    throw new Error('Access denied: Cannot write files outside user data directory');
  }
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(resolvedPath, data);
  return true;
});

// List directory
ipcMain.handle('fs:list-dir', async (_event, dirPath: string) => {
  const resolvedPath = path.resolve(dirPath);
  if (!fs.existsSync(resolvedPath)) return [];
  return fs.readdirSync(resolvedPath, { withFileTypes: true }).map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory(),
    path: path.join(resolvedPath, entry.name),
  }));
});

// Delete file/directory
ipcMain.handle('fs:delete', async (_event, targetPath: string) => {
  const userDataPath = app.getPath('userData');
  const resolvedPath = path.resolve(targetPath);
  if (!resolvedPath.startsWith(userDataPath)) {
    throw new Error('Access denied');
  }
  if (fs.existsSync(resolvedPath)) {
    const stat = fs.statSync(resolvedPath);
    if (stat.isDirectory()) {
      fs.rmSync(resolvedPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(resolvedPath);
    }
  }
  return true;
});

// Open external URL
ipcMain.handle('shell:open-external', async (_event, url: string) => {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    await shell.openExternal(url);
  }
});
