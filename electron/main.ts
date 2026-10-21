import { parsePdfBuffer } from './services/pdfParser';
import { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage } from 'electron';
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
    width: 1100,
    height: 760,
    minWidth: 800,
    minHeight: 560,
    frame: true,
    transparent: false,
    hasShadow: true,
    resizable: true,
    alwaysOnTop: false,
    backgroundColor: '#0f172a',
    title: 'AI Interview Practice Gym',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: process.env.NODE_ENV !== 'development',
    },
    icon: path.join(__dirname, '../public/icon.png'),
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.on('console-message', (_event, _level, message) => {
    console.log('[Renderer Log]', message);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

let tray: Tray | null = null;

function setupTray() {
  if (tray) return;

  const iconPath = path.join(__dirname, '../public/icon.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  try {
    tray = new Tray(icon);
    tray.setToolTip('AI Interview Practice Gym');

    const trayMenu = Menu.buildFromTemplate([
      {
        label: 'Show App',
        click: () => {
          if (!mainWindow) {
            createWindow();
          } else {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        role: 'quit',
      },
    ]);

    tray.setContextMenu(trayMenu);
    tray.on('click', () => {
      if (mainWindow?.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow?.show();
      }
    });
  } catch (err) {
    console.warn('[Electron] Could not initialize tray:', err);
  }
}

function setupNativeApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  ensureDirectories();
  createWindow();
  setupIpcHandlers(mainWindow);
  setupNativeApplicationMenu();
  setupTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Window controls
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
ipcMain.handle('window:is-always-on-top', () => mainWindow?.isAlwaysOnTop() ?? false);

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

// Read file (scoped strictly to userData)
ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
  const userDataPath = app.getPath('userData');
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(userDataPath)) {
    throw new Error('Access denied: Cannot read files outside application data directory');
  }
  return fs.readFileSync(resolvedPath);
});

// Write file (scoped strictly to userData)
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
  const userDataPath = app.getPath('userData');
  const resolvedPath = path.resolve(dirPath);
  if (!resolvedPath.startsWith(userDataPath)) {
    throw new Error('Access denied: Cannot list directories outside user data directory');
  }
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
  if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
    await shell.openExternal(url);
  }
});

// PDF parsing via modern pdfjs-dist with pdf-parse fallback
ipcMain.handle('fs:parse-pdf', async (_event, arrayBuffer: ArrayBuffer) => {
  return parsePdfBuffer(arrayBuffer);
});

// DOCX parsing
ipcMain.handle('fs:parse-docx', async (_event, arrayBuffer: ArrayBuffer) => {
  const mammoth = require('mammoth');
  const buffer = Buffer.from(arrayBuffer);
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
});
