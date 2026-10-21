import { parsePdfBuffer } from './services/pdfParser';
import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  dialog,
  shell,
  Menu,
  Tray,
  nativeImage,
  session,
} from 'electron';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import util from 'util';
import mammoth from 'mammoth';
import { setupIpcHandlers } from './ipc/handlers';
import {
  validateReadPath,
  validateWritePath,
  validateDeletePath,
  isPermissionAllowed,
  buildCspHeader,
  getSandboxConfig,
} from './services/security';

const execFileAsync = util.promisify(execFile);

let mainWindow: BrowserWindow | null = null;
let isContentProtected = true;

const RECORDINGS_DIR = path.join(app.getPath('userData'), 'recordings');
const SESSIONS_DIR = path.join(app.getPath('userData'), 'sessions');

// In-memory set of explicitly user-approved file paths from dialog:open-file
const approvedFilePaths = new Set<string>();

function ensureDirectories() {
  [RECORDINGS_DIR, SESSIONS_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

function createWindow() {
  const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
  const isProduction = !isDev || app.isPackaged || process.env.NODE_ENV === 'production';

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
      sandbox: getSandboxConfig(isProduction),
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

  // Screen-share stealth: Make window completely invisible to screen share (Zoom, Meet, Teams, OBS)
  mainWindow.setContentProtection(isContentProtected);
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
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  try {
    tray = new Tray(icon);
    tray.setToolTip('AI Interview Assistant (Cmd+Shift+H to toggle)');

    const trayMenu = Menu.buildFromTemplate([
      {
        label: 'Show / Hide Overlay',
        accelerator: 'CmdOrCtrl+Shift+H',
        click: () => toggleWindowVisibility(),
      },
      {
        label: 'Solve Screen Problem',
        accelerator: 'CmdOrCtrl+Shift+S',
        click: () => {
          if (!mainWindow?.isVisible()) mainWindow?.show();
          mainWindow?.webContents.send('trigger-screen-capture');
        },
      },
      { type: 'separator' },
      {
        label: 'Toggle Screen Stealth',
        type: 'checkbox',
        checked: isContentProtected,
        click: () => {
          isContentProtected = !isContentProtected;
          mainWindow?.setContentProtection(isContentProtected);
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        role: 'quit',
      },
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
                click: () => toggleWindowVisibility(),
              },
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
        {
          label: 'Toggle Stealth Overlay (Backslash)',
          accelerator: 'CmdOrCtrl+\\',
          click: () => toggleWindowVisibility(),
        },
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

function registerGlobalShortcuts() {
  const stealthShortcuts = [
    'CommandOrControl+Shift+H',
    'CommandOrControl+Shift+Space',
    'CommandOrControl+\\',
    'Alt+H',
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

  try {
    globalShortcut.register('CommandOrControl+Shift+S', () => {
      if (!mainWindow?.isVisible()) mainWindow?.show();
      mainWindow?.webContents.send('trigger-screen-capture');
    });
  } catch (err) {
    console.warn('[Electron] Could not register screen capture shortcut:', err);
  }
}

app.whenReady().then(() => {
  // Strict permission handler: only allow "media" (microphone) for the app's own origin
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL();
    const allowed = isPermissionAllowed(permission, url, process.env.VITE_DEV_SERVER_URL);
    callback(allowed);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const origin = requestingOrigin || (webContents ? webContents.getURL() : '');
    return isPermissionAllowed(permission, origin, process.env.VITE_DEV_SERVER_URL);
  });

  // Strict Content Security Policy (CSP) session header
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
    const csp = buildCspHeader(isDev);
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
      },
    });
  });

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

// IPC for window controls & stealth
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
ipcMain.handle('window:is-always-on-top', () => mainWindow?.isAlwaysOnTop() ?? false);

// Content protection IPC (invisible in screen sharing)
ipcMain.handle('window:set-content-protection', (_event, enable: boolean) => {
  if (typeof enable !== 'boolean') {
    throw new Error('Invalid argument: enable must be a boolean');
  }
  if (mainWindow) {
    mainWindow.setContentProtection(enable);
    isContentProtected = enable;
    console.log('[Electron] Content protection (screen stealth):', enable);
    return true;
  }
  return false;
});

ipcMain.handle('window:is-content-protected', () => isContentProtected);

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

// File dialog with path approval registration
ipcMain.handle('dialog:open-file', async (_event, options: Electron.OpenDialogOptions) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, options || {});
  if (result.canceled || result.filePaths.length === 0) return null;
  const chosenPath = result.filePaths[0];

  try {
    const realChosen = fs.realpathSync(chosenPath);
    approvedFilePaths.add(realChosen);
    approvedFilePaths.add(path.resolve(chosenPath));
  } catch {
    approvedFilePaths.add(path.resolve(chosenPath));
  }

  return chosenPath;
});

// Read file strictly restricted to userData and approved file dialog paths
ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
  if (typeof filePath !== 'string') {
    throw new Error('Invalid argument: filePath must be a string');
  }

  const validation = validateReadPath(filePath, app.getPath('userData'), approvedFilePaths);
  if (!validation.allowed || !validation.resolvedPath) {
    throw new Error(validation.reason || 'Access denied');
  }

  return fs.readFileSync(validation.resolvedPath);
});

// Write file restricted strictly to userData with size limits
ipcMain.handle('fs:write-file', async (_event, filePath: string, data: Buffer | string | ArrayBuffer) => {
  if (typeof filePath !== 'string') {
    throw new Error('Invalid argument: filePath must be a string');
  }

  const byteLength = typeof data === 'string'
    ? Buffer.byteLength(data)
    : Buffer.isBuffer(data)
    ? data.length
    : data instanceof ArrayBuffer
    ? data.byteLength
    : 0;

  const validation = validateWritePath(filePath, byteLength, app.getPath('userData'));
  if (!validation.allowed || !validation.resolvedPath) {
    throw new Error(validation.reason || 'Access denied');
  }

  const dir = path.dirname(validation.resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(validation.resolvedPath, data as any);
  return true;
});

// List directory restricted to userData
ipcMain.handle('fs:list-dir', async (_event, dirPath: string) => {
  if (typeof dirPath !== 'string') {
    throw new Error('Invalid argument: dirPath must be a string');
  }

  const userDataPath = app.getPath('userData');
  const resolvedPath = path.resolve(dirPath);

  try {
    const realTarget = fs.realpathSync(resolvedPath);
    const realUserData = fs.realpathSync(userDataPath);
    if (realTarget !== realUserData && !realTarget.startsWith(realUserData + path.sep)) {
      throw new Error('Access denied: Cannot list directories outside userData');
    }

    return fs.readdirSync(realTarget, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      path: path.join(realTarget, entry.name),
    }));
  } catch (err: any) {
    throw new Error(`Directory listing failed: ${err.message || String(err)}`, { cause: err });
  }
});

// Delete file/directory strictly restricted to userData
ipcMain.handle('fs:delete', async (_event, targetPath: string) => {
  if (typeof targetPath !== 'string') {
    throw new Error('Invalid argument: targetPath must be a string');
  }

  const validation = validateDeletePath(targetPath, app.getPath('userData'));
  if (!validation.allowed || !validation.resolvedPath) {
    throw new Error(validation.reason || 'Access denied');
  }

  const stat = fs.statSync(validation.resolvedPath);
  if (stat.isDirectory()) {
    fs.rmSync(validation.resolvedPath, { recursive: true, force: true });
  } else {
    fs.unlinkSync(validation.resolvedPath);
  }
  return true;
});

// Open external URL strictly restricted to http/https
ipcMain.handle('shell:open-external', async (_event, url: string) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
  } else {
    throw new Error('Invalid URL protocol. Only http: and https: are allowed.');
  }
});

// PDF parsing via modern pdfjs-dist with pdf-parse fallback
ipcMain.handle('fs:parse-pdf', async (_event, arrayBuffer: ArrayBuffer) => {
  if (!(arrayBuffer instanceof ArrayBuffer) && !Buffer.isBuffer(arrayBuffer)) {
    throw new Error('Invalid argument: expected ArrayBuffer or Buffer');
  }
  return parsePdfBuffer(arrayBuffer);
});

// DOCX parsing
ipcMain.handle('fs:parse-docx', async (_event, arrayBuffer: ArrayBuffer) => {
  if (!(arrayBuffer instanceof ArrayBuffer) && !Buffer.isBuffer(arrayBuffer)) {
    throw new Error('Invalid argument: expected ArrayBuffer or Buffer');
  }
  const buffer = Buffer.from(arrayBuffer);
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
});

// Screen Capture & Apple Vision Neural OCR using execFile with argument arrays
ipcMain.handle(
  'screen:capture-and-ocr',
  async (_event, mode: 'fullscreen' | 'snip' = 'fullscreen') => {
    const tmpImg = path.join(app.getPath('temp'), `iac_screen_${Date.now()}.jpg`);
    const isMac = process.platform === 'darwin';
    const ocrBin = path.join(__dirname, '../bin/mac-ocr');

    try {
      if (isMac) {
        const captureArgs = mode === 'snip' ? ['-i', '-x', tmpImg] : ['-x', tmpImg];
        await execFileAsync('screencapture', captureArgs);
      } else {
        const maimArgs = mode === 'snip' ? ['-s', tmpImg] : [tmpImg];
        await execFileAsync('maim', maimArgs);
      }

      if (!fs.existsSync(tmpImg)) {
        return {
          success: false,
          cancelled: true,
          error:
            'Screen capture was cancelled or capture tool missing (install: sudo apt install maim / scrot).',
        };
      }

      let text = '';
      if (isMac && fs.existsSync(ocrBin)) {
        const { stdout } = await execFileAsync(ocrBin, [tmpImg]);
        text = stdout.trim();
      } else {
        try {
          const { stdout } = await execFileAsync('tesseract', [
            tmpImg,
            'stdout',
            '--oem',
            '1',
            '-l',
            'eng',
          ]);
          text = stdout.trim();
        } catch (err) {
          throw new Error(
            'OCR engine not found. On Linux, please install tesseract: sudo apt install tesseract-ocr',
            { cause: err }
          );
        }
      }

      try {
        fs.unlinkSync(tmpImg);
      } catch (_) {}

      if (!text) {
        return { success: false, error: 'No text or code could be detected on the screen.' };
      }

      return { success: true, text };
    } catch (err: any) {
      console.error('[Electron] Screen OCR error:', err);
      try {
        if (fs.existsSync(tmpImg)) fs.unlinkSync(tmpImg);
      } catch (_) {}
      return { success: false, error: err.message || String(err) };
    }
  }
);

ipcMain.handle('screen:ocr-image', async (_event, filePath: string) => {
  if (typeof filePath !== 'string') {
    return { success: false, error: 'Invalid file path' };
  }

  const isMac = process.platform === 'darwin';
  const ocrBin = path.join(__dirname, '../bin/mac-ocr');
  try {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: 'File not found.' };
    }

    let text = '';
    if (isMac && fs.existsSync(ocrBin)) {
      const { stdout } = await execFileAsync(ocrBin, [resolvedPath]);
      text = stdout.trim();
    } else {
      const { stdout } = await execFileAsync('tesseract', [
        resolvedPath,
        'stdout',
        '--oem',
        '1',
        '-l',
        'eng',
      ]);
      text = stdout.trim();
    }

    if (!text) {
      return { success: false, error: 'No text could be extracted from image.' };
    }
    return { success: true, text };
  } catch (err: any) {
    console.error('[Electron] Image OCR error:', err);
    return { success: false, error: err.message || String(err) };
  }
});
