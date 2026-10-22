import { parsePdfBuffer } from './services/pdfParser';
import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  session,
  globalShortcut,
  Tray,
  nativeImage,
} from 'electron';
import { exec } from 'child_process';
import util from 'util';
const execAsync = util.promisify(exec);
import path from 'path';
import fs from 'fs';
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

let mainWindow: BrowserWindow | null = null;
let isContentProtected = true;
let tray: Tray | null = null;

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

  // Standard visible, titled desktop window with native OS title bar and frame controls
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: 'AI Interview Practice Gym',
    frame: true,
    transparent: false,
    hasShadow: true,
    resizable: true,
    alwaysOnTop: false,
    backgroundColor: '#0f172a',
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

  if (isContentProtected) {
    try {
      mainWindow.setContentProtection(true);
      if (process.platform === 'darwin') {
        mainWindow.setHiddenInMissionControl(true);
        mainWindow.excludedFromShownWindowsMenu = true;
      }
    } catch (e) {
      console.warn('[Electron] Could not enable initial content protection:', e);
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function toggleWindowVisibility() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true, 'floating');
    if (process.platform === 'darwin') {
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
    mainWindow.focus();
  }
}

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

function registerGlobalShortcuts() {
  const stealthShortcuts = [
    'CommandOrControl+Shift+H',
    'CommandOrControl+Shift+Space',
    'CommandOrControl+\\',
    'Alt+H',
  ];
  stealthShortcuts.forEach((shortcut) => {
    try {
      globalShortcut.register(shortcut, () => {
        toggleWindowVisibility();
      });
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

// Window controls IPC
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
ipcMain.handle(
  'fs:write-file',
  async (_event, filePath: string, data: Buffer | string | ArrayBuffer) => {
    if (typeof filePath !== 'string') {
      throw new Error('Invalid argument: filePath must be a string');
    }

    const byteLength =
      typeof data === 'string'
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
  }
);

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

// PDF parsing via modern pdfjs-dist
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

// Window visibility & protection IPC
ipcMain.on('window:toggle-visibility', () => toggleWindowVisibility());
ipcMain.on('window:hide', () => mainWindow?.hide());
ipcMain.on('window:show', () => {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.focus();
});
ipcMain.handle('window:set-content-protection', (_event, enable: boolean) => {
  if (mainWindow) {
    mainWindow.setContentProtection(enable);
    isContentProtected = enable;
    return true;
  }
  return false;
});
ipcMain.handle('window:is-content-protected', () => isContentProtected);
ipcMain.on('window:toggle-content-protection', () => {
  if (mainWindow) {
    isContentProtected = !isContentProtected;
    mainWindow.setContentProtection(isContentProtected);
  }
});

// Screen Capture & Neural OCR
ipcMain.handle(
  'screen:capture-and-ocr',
  async (_event, mode: 'fullscreen' | 'snip' = 'fullscreen') => {
    const tmpImg = path.join(app.getPath('temp'), `iac_screen_${Date.now()}.jpg`);
    const isMac = process.platform === 'darwin';
    const ocrBin = path.join(__dirname, '../bin/mac-ocr');

    try {
      if (isMac) {
        const captureFlag = mode === 'snip' ? '-i -x' : '-x';
        await execAsync(`screencapture ${captureFlag} "${tmpImg}"`);
      } else {
        const snipCmd = `maim -s "${tmpImg}" || scrot -s "${tmpImg}" || import "${tmpImg}"`;
        const fullCmd = `maim "${tmpImg}" || scrot "${tmpImg}" || import -window root "${tmpImg}"`;
        await execAsync(mode === 'snip' ? snipCmd : fullCmd);
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
        const { stdout } = await execAsync(`"${ocrBin}" "${tmpImg}"`);
        text = stdout.trim();
      } else {
        try {
          const { stdout } = await execAsync(
            `tesseract "${tmpImg}" stdout --oem 1 -l eng 2>/dev/null || tesseract "${tmpImg}" stdout 2>/dev/null`
          );
          text = stdout.trim();
        } catch (ocrErr: any) {
          throw new Error(
            'OCR engine not found. On Linux, please install tesseract: sudo apt install tesseract-ocr',
            { cause: ocrErr }
          );
        }
      }

      try {
        fs.unlinkSync(tmpImg);
      } catch {
        // ignore
      }

      if (!text) {
        return { success: false, error: 'No text or code could be detected on the screen.' };
      }

      return { success: true, text };
    } catch (err: any) {
      console.error('[Electron] Screen OCR error:', err);
      try {
        if (fs.existsSync(tmpImg)) fs.unlinkSync(tmpImg);
      } catch {
        // ignore
      }
      return { success: false, error: err.message || String(err) };
    }
  }
);

ipcMain.handle('screen:ocr-image', async (_event, filePath: string) => {
  const isMac = process.platform === 'darwin';
  const ocrBin = path.join(__dirname, '../bin/mac-ocr');
  try {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: 'File not found.' };
    }

    let text = '';
    if (isMac && fs.existsSync(ocrBin)) {
      const { stdout } = await execAsync(`"${ocrBin}" "${resolvedPath}"`);
      text = stdout.trim();
    } else {
      const { stdout } = await execAsync(
        `tesseract "${resolvedPath}" stdout --oem 1 -l eng 2>/dev/null || tesseract "${resolvedPath}" stdout 2>/dev/null`
      );
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
