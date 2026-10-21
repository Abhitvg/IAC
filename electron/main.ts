import { app, BrowserWindow, ipcMain, globalShortcut, dialog, shell, Menu, Tray, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { setupIpcHandlers } from './ipc/handlers';

let mainWindow: BrowserWindow | null = null;
let isContentProtected = true;

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
    width: 680,
    height: 500,
    minWidth: 420,
    minHeight: 280,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
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

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    console.log('[Renderer Log]', message);
  });

  // Make window invisible to screen share (Zoom, Meet, Teams, QuickTime, OBS)
  mainWindow.setContentProtection(true);
  if (process.platform === 'darwin') {
    mainWindow.setHiddenInMissionControl(true);
    mainWindow.excludedFromShownWindowsMenu = true;
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function toggleWindowVisibility() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
    console.log('[Electron] Stealth: Window hidden instantly (0ms, zero animation, zero trace)');
  } else {
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true, 'floating');
    if (process.platform === 'darwin') {
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
    mainWindow.focus();
    console.log('[Electron] Stealth: Window restored instantly');
  }
}

let tray: Tray | null = null;

function setupTray() {
  if (tray) return;

  const iconPath = path.join(__dirname, '../public/icon.png');
  let icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  try {
    tray = new Tray(icon);
    tray.setToolTip('AI Interview Assistant (Cmd+Shift+H to toggle)');

    const trayMenu = Menu.buildFromTemplate([
      {
        label: 'Show / Hide Overlay',
        accelerator: 'CmdOrCtrl+Shift+H',
        click: () => toggleWindowVisibility()
      },
      {
        label: 'Solve Screen Problem',
        accelerator: 'CmdOrCtrl+Shift+S',
        click: () => {
          if (!mainWindow?.isVisible()) mainWindow?.show();
          mainWindow?.webContents.send('trigger-screen-capture');
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        role: 'quit'
      }
    ]);

    tray.setContextMenu(trayMenu);
    tray.on('click', () => toggleWindowVisibility());
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
              {
                label: 'Toggle Stealth Overlay',
                accelerator: 'CmdOrCtrl+Shift+H',
                click: () => toggleWindowVisibility()
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
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
        { role: 'selectAll' as const }
      ]
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
        {
          label: 'Toggle Stealth Overlay (Backslash)',
          accelerator: 'CmdOrCtrl+\\',
          click: () => toggleWindowVisibility()
        }
      ]
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
              { role: 'window' as const }
            ]
          : [{ role: 'close' as const }])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function registerGlobalShortcuts() {
  // Global stealth toggle shortcuts that work system-wide even when inside Zoom / LeetCode / Chrome:
  const stealthShortcuts = [
    'CommandOrControl+Shift+H',     // Cmd+Shift+H (Mac) / Ctrl+Shift+H (Win)
    'CommandOrControl+Shift+Space', // Cmd+Shift+Space
    'CommandOrControl+\\',          // Cmd+\
    'Alt+H'                         // Option+H
  ];

  stealthShortcuts.forEach((shortcut) => {
    try {
      const ok = globalShortcut.register(shortcut, () => {
        toggleWindowVisibility();
      });
      if (ok) {
        console.log(`[Electron] Registered global stealth shortcut: ${shortcut}`);
      }
    } catch (err) {
      console.warn(`[Electron] Could not register shortcut ${shortcut}:`, err);
    }
  });
}

import { session } from 'electron';

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });
  session.defaultSession.setPermissionCheckHandler(() => true);

  ensureDirectories();
  createWindow();
  setupIpcHandlers(mainWindow);
  if (mainWindow) {
    mainWindow.setContentProtection(true);
    mainWindow.setAlwaysOnTop(true, 'floating');
    if (process.platform === 'darwin') {
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
  }
  setupNativeApplicationMenu();
  setupTray();
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
ipcMain.on('window:toggle-visibility', () => toggleWindowVisibility());
ipcMain.on('window:hide', () => mainWindow?.hide());
ipcMain.on('window:show', () => {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.focus();
});
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

// Content protection IPC (invisible in screen sharing)
ipcMain.handle('window:set-content-protection', (_event, enable: boolean) => {
  if (mainWindow) {
    mainWindow.setContentProtection(enable);
    isContentProtected = enable;
    console.log('[Electron] Content protection (screen stealth):', enable);
    return true;
  }
  return false;
});

ipcMain.handle('window:is-content-protected', () => {
  return isContentProtected;
});

ipcMain.on('window:toggle-content-protection', () => {
  if (mainWindow) {
    isContentProtected = !isContentProtected;
    mainWindow.setContentProtection(isContentProtected);
    console.log('[Electron] Toggled content protection (screen stealth):', isContentProtected);
  }
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

// PDF parsing
ipcMain.handle('fs:parse-pdf', async (_event, arrayBuffer: ArrayBuffer) => {
  const pdfParse = require('pdf-parse');
  const buffer = Buffer.from(arrayBuffer);
  const data = await pdfParse(buffer);
  return data.text || '';
});

// DOCX parsing
ipcMain.handle('fs:parse-docx', async (_event, arrayBuffer: ArrayBuffer) => {
  const mammoth = require('mammoth');
  const buffer = Buffer.from(arrayBuffer);
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
});


// ─── Screen Capture & Apple Vision Neural OCR ───
import { exec } from "child_process";
import util from "util";
const execAsync = util.promisify(exec);

ipcMain.handle("screen:capture-and-ocr", async (_event, mode: "fullscreen" | "snip" = "fullscreen") => {
  const tmpImg = path.join(app.getPath("temp"), `iac_screen_${Date.now()}.jpg`);
  const isMac = process.platform === "darwin";
  const ocrBin = path.join(__dirname, "../bin/mac-ocr");

  try {
    if (isMac) {
      const captureFlag = mode === "snip" ? "-i -x" : "-x";
      await execAsync(`screencapture ${captureFlag} "${tmpImg}"`);
    } else {
      // Linux cross-platform capture (maim / scrot / ImageMagick import)
      const snipCmd = `maim -s "${tmpImg}" || scrot -s "${tmpImg}" || import "${tmpImg}"`;
      const fullCmd = `maim "${tmpImg}" || scrot "${tmpImg}" || import -window root "${tmpImg}"`;
      await execAsync(mode === "snip" ? snipCmd : fullCmd);
    }

    if (!fs.existsSync(tmpImg)) {
      return { success: false, cancelled: true, error: "Screen capture was cancelled or capture tool missing (install: sudo apt install maim / scrot)." };
    }

    let text = "";
    if (isMac && fs.existsSync(ocrBin)) {
      const { stdout } = await execAsync(`"${ocrBin}" "${tmpImg}"`);
      text = stdout.trim();
    } else {
      // Linux OCR fallback via Tesseract
      try {
        const { stdout } = await execAsync(`tesseract "${tmpImg}" stdout --oem 1 -l eng 2>/dev/null || tesseract "${tmpImg}" stdout 2>/dev/null`);
        text = stdout.trim();
      } catch (_) {
        throw new Error("OCR engine not found. On Linux, please install tesseract: sudo apt install tesseract-ocr");
      }
    }

    try { fs.unlinkSync(tmpImg); } catch (_) {}

    if (!text) {
      return { success: false, error: "No text or code could be detected on the screen." };
    }

    return { success: true, text };
  } catch (err: any) {
    console.error("[Electron] Screen OCR error:", err);
    try { if (fs.existsSync(tmpImg)) fs.unlinkSync(tmpImg); } catch (_) {}
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle("screen:ocr-image", async (_event, filePath: string) => {
  const isMac = process.platform === "darwin";
  const ocrBin = path.join(__dirname, "../bin/mac-ocr");
  try {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: "File not found." };
    }

    let text = "";
    if (isMac && fs.existsSync(ocrBin)) {
      const { stdout } = await execAsync(`"${ocrBin}" "${resolvedPath}"`);
      text = stdout.trim();
    } else {
      const { stdout } = await execAsync(`tesseract "${resolvedPath}" stdout --oem 1 -l eng 2>/dev/null || tesseract "${resolvedPath}" stdout 2>/dev/null`);
      text = stdout.trim();
    }

    if (!text) {
      return { success: false, error: "No text could be extracted from image." };
    }
    return { success: true, text };
  } catch (err: any) {
    console.error("[Electron] Image OCR error:", err);
    return { success: false, error: err.message || String(err) };
  }
});
