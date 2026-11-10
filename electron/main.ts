import { parsePdfBuffer } from './services/pdfParser';
import { validateDocumentImportSize } from './services/documentImportLimits';
import { validateDocxArchive } from './services/docxArchiveLimits';
import { validateDocxArchiveExpansion } from './services/docxArchiveExpansion';
import { stitchOcrTexts, stitchSanitizedOcrTexts } from './services/ocrStitcher';
import { SafeConnectionFetcher, PinnedFetchOptions } from './services/safeConnectionFetcher';
import { resolveOcrBinaryPath, getOcrEngineInfo } from './services/ocrService';
import {
  app,
  clipboard,
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
import { execFile } from 'child_process';
import util from 'util';
import {
  buildAutoTypeAppleScript,
  getScreenCaptureCommands,
  getTesseractCommands,
  runNativeCommandFallback,
} from './services/nativeCommandRunner';
const execFileAsync = util.promisify(execFile);
import path from 'path';
import fs from 'fs';
import dns from 'dns';
import mammoth from 'mammoth';
import { setupIpcHandlers } from './ipc/handlers';
import {
  readFileSafely,
  validateReadPath,
  validateWritePath,
  validateDeletePath,
  isPermissionAllowed,
  buildCspHeader,
  getSandboxConfig,
  redactSensitiveData,
  isTrustedSender,
  isSafeExternalUrl,
  isTrustedAppOrigin,
  validateSafeFetchPinnedIpc,
} from './services/security';

// Linux stability configurations: prevent XDG portal crashes & GPU driver compositor terminations
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('disable-features', 'UsePortal');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}

// Global exception guards to prevent unexpected process crashes
process.on('uncaughtException', (err) => {
  console.error('[Electron Main Process Uncaught Exception]:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Electron Main Process Unhandled Rejection]:', reason);
});

let mainWindow: BrowserWindow | null = null;
let isContentProtected = true;
let tray: Tray | null = null;
let lastCapturedOcrText = '';

let RECORDINGS_DIR = '';
let SESSIONS_DIR = '';

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
    minWidth: 320,
    minHeight: 160,
    title: 'AI Interview Practice Gym',
    frame: true,
    transparent: process.platform === 'darwin',
    hasShadow: true,
    resizable: true,
    alwaysOnTop: false,
    backgroundColor: '#00000000',
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

  // Secure navigation: Intercept window.open and target="_blank"
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Intercept internal page navigation escaping the app origin
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedAppOrigin(url, process.env.VITE_DEV_SERVER_URL)) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) {
        shell.openExternal(url);
      }
    }
  });

  // Intercept subframe navigations escaping the app origin
  mainWindow.webContents.on('will-frame-navigate', (event) => {
    if (!isTrustedAppOrigin(event.url, process.env.VITE_DEV_SERVER_URL)) {
      event.preventDefault();
    }
  });

  // Diagnostic handlers for renderer termination / crash
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(
      '[Electron Renderer Process Terminated]:',
      details.reason,
      'exitCode:',
      details.exitCode
    );
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('[Electron Renderer Unresponsive]');
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
    if (process.platform === 'darwin') {
      mainWindow.setAlwaysOnTop(true, 'floating');
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } else {
      mainWindow.setAlwaysOnTop(true);
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

  try {
    globalShortcut.register('CommandOrControl+Shift+A', () => {
      if (!mainWindow?.isVisible()) mainWindow?.show();
      mainWindow?.webContents.send('trigger-append-screen-capture');
    });
  } catch (err) {
    console.warn('[Electron] Could not register append screen capture shortcut:', err);
  }

  try {
    globalShortcut.register('Alt+V', () => {
      mainWindow?.webContents.send('trigger-auto-type');
    });
  } catch (err) {
    console.warn('[Electron] Could not register auto-type shortcut:', err);
  }

  try {
    globalShortcut.register('Alt+T', () => {
      mainWindow?.webContents.send('trigger-auto-type-text');
    });
  } catch (err) {
    console.warn('[Electron] Could not register auto-type-text shortcut:', err);
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

// Enforce single-instance lock to prevent multiple application instances/windows from opening in production
const isDev = !app.isPackaged && Boolean(process.env.VITE_DEV_SERVER_URL);
const gotTheLock = isDev ? true : app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log(
    '[Electron] Another application instance is already running. Quitting duplicate instance.'
  );
  app.quit();
} else {
  if (!isDev) {
    app.on('second-instance', () => {
      // When a second instance tries to launch, focus our existing main window
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      }
    });
  }

  app.whenReady().then(() => {
    RECORDINGS_DIR = path.join(app.getPath('userData'), 'recordings');
    SESSIONS_DIR = path.join(app.getPath('userData'), 'sessions');
    // Strict permission handler: only allow "media" (microphone) for the app's own origin
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const url = webContents.getURL();
      const allowed = isPermissionAllowed(permission, url, process.env.VITE_DEV_SERVER_URL);
      callback(allowed);
    });

    session.defaultSession.setPermissionCheckHandler(
      (webContents, permission, requestingOrigin) => {
        const origin = requestingOrigin || (webContents ? webContents.getURL() : '');
        return isPermissionAllowed(permission, origin, process.env.VITE_DEV_SERVER_URL);
      }
    );

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
}

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  app.quit();
});

// Window controls IPC
ipcMain.on('window:minimize', (event) => {
  if (!isTrustedSender(event, mainWindow)) return;
  mainWindow?.minimize();
});
ipcMain.on('window:maximize', (event) => {
  if (!isTrustedSender(event, mainWindow)) return;
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window:close', (event) => {
  if (!isTrustedSender(event, mainWindow)) return;
  globalShortcut.unregisterAll();
  app.quit();
});
ipcMain.on('app:quit', (event) => {
  if (!isTrustedSender(event, mainWindow)) return;
  globalShortcut.unregisterAll();
  app.quit();
});
ipcMain.on('window:toggle-always-on-top', (event) => {
  if (!isTrustedSender(event, mainWindow)) return;
  if (mainWindow) {
    const isOnTop = mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(!isOnTop);
  }
});
ipcMain.handle('window:is-always-on-top', (event) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  return mainWindow?.isAlwaysOnTop() ?? false;
});

ipcMain.handle('window:set-size', (event, width: number, height: number) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  if (!Number.isFinite(width) || !Number.isFinite(height))
    throw new Error('Invalid window dimensions');
  if (!mainWindow) return false;
  try {
    mainWindow.setSize(Math.round(width), Math.round(height));
    return true;
  } catch (err) {
    console.error('[Electron] Failed to set window size:', err);
    return false;
  }
});

ipcMain.handle('window:get-size', (event) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  if (!mainWindow) return { width: 1024, height: 720 };
  const [width, height] = mainWindow.getSize();
  return { width, height };
});

ipcMain.handle('window:set-position', (event, x: number, y: number) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Invalid window position');
  if (!mainWindow) return false;
  try {
    mainWindow.setPosition(Math.round(x), Math.round(y));
    return true;
  } catch (err) {
    console.error('[Electron] Failed to set window position:', err);
    return false;
  }
});

ipcMain.handle('window:get-position', (event) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  if (!mainWindow) return { x: 100, y: 100 };
  const [x, y] = mainWindow.getPosition();
  return { x, y };
});

ipcMain.handle(
  'window:set-ignore-mouse-events',
  (event, ignore: boolean, options?: { forward?: boolean }) => {
    if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
    if (
      typeof ignore !== 'boolean' ||
      (options !== undefined &&
        (typeof options !== 'object' ||
          options === null ||
          (options.forward !== undefined && typeof options.forward !== 'boolean')))
    ) {
      throw new Error('Invalid mouse event options');
    }
    if (!mainWindow) return false;
    try {
      mainWindow.setIgnoreMouseEvents(Boolean(ignore), options || { forward: true });
      return true;
    } catch (err) {
      console.error('[Electron] Failed to set ignore mouse events:', err);
      return false;
    }
  }
);

ipcMain.handle('window:set-opacity', (event, opacity: number) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  if (!mainWindow) return false;
  if (typeof opacity !== 'number' || isNaN(opacity)) return false;
  const clamped = Math.max(0.12, Math.min(1.0, opacity));
  try {
    mainWindow.setOpacity(clamped);
    return true;
  } catch (err) {
    console.error('[Electron] Failed to set window opacity:', err);
    return false;
  }
});

ipcMain.handle('window:get-opacity', (event) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  if (!mainWindow) return 1.0;
  try {
    return mainWindow.getOpacity();
  } catch {
    return 1.0;
  }
});

// File system paths
ipcMain.handle('get-recordings-dir', (event) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  return RECORDINGS_DIR;
});
ipcMain.handle('get-sessions-dir', (event) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  return SESSIONS_DIR;
});
ipcMain.handle('get-user-data-path', (event) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  return app.getPath('userData');
});

// File dialog with path approval registration
ipcMain.handle('dialog:open-file', async (event, options: Electron.OpenDialogOptions) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, options || {});
  if (result.canceled || result.filePaths.length === 0) return null;
  const chosenPath = result.filePaths[0];

  try {
    // Store only the resolved target at the moment of user approval. Keeping the
    // lexical path would let a later symlink replacement inherit that approval.
    approvedFilePaths.add(fs.realpathSync(chosenPath));
  } catch {
    // Do not approve an unresolved path. A later read will fail closed.
  }

  return chosenPath;
});

// Read file strictly restricted to userData and approved file dialog paths
ipcMain.handle('fs:read-file', async (event, filePath: string) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  if (typeof filePath !== 'string') {
    throw new Error('Invalid argument: filePath must be a string');
  }

  return readFileSafely(filePath, app.getPath('userData'), approvedFilePaths);
});

// Write file restricted strictly to userData with size limits
ipcMain.handle(
  'fs:write-file',
  async (event, filePath: string, data: Buffer | string | ArrayBuffer) => {
    if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
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

    const userDataPath = app.getPath('userData');
    const initialValidation = validateWritePath(filePath, byteLength, userDataPath);
    if (!initialValidation.allowed || !initialValidation.resolvedPath) {
      throw new Error(initialValidation.reason || 'Access denied');
    }

    const dir = path.dirname(initialValidation.resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Revalidate after directory creation and open without truncation first.
    // A final dangling symlink can pass existsSync() as "missing"; r+ will
    // follow a live symlink without changing its target, while wx+ refuses
    // to create through a dangling symlink. We verify the opened descriptor
    // against lstat/realpath before truncating or writing any bytes.
    const validation = validateWritePath(filePath, byteLength, userDataPath);
    if (!validation.allowed || !validation.resolvedPath) {
      throw new Error(validation.reason || 'Access denied');
    }

    const destination = validation.resolvedPath;
    const realUserData = fs.realpathSync(userDataPath);
    const realParent = fs.realpathSync(path.dirname(destination));
    if (realParent !== realUserData && !realParent.startsWith(realUserData + path.sep)) {
      throw new Error('Access denied: Destination parent resolves outside userData');
    }

    let fileDescriptor: number | undefined;
    try {
      try {
        fileDescriptor = fs.openSync(destination, 'r+');
      } catch (error: any) {
        if (error?.code !== 'ENOENT') throw error;
        fileDescriptor = fs.openSync(destination, 'wx+', 0o600);
      }

      const descriptorStat = fs.fstatSync(fileDescriptor);
      const destinationStat = fs.lstatSync(destination);
      if (
        !descriptorStat.isFile() ||
        !destinationStat.isFile() ||
        destinationStat.isSymbolicLink() ||
        descriptorStat.dev !== destinationStat.dev ||
        descriptorStat.ino !== destinationStat.ino
      ) {
        throw new Error('Access denied: Destination changed or is not a regular file');
      }

      const realDestination = fs.realpathSync(destination);
      if (
        realDestination !== realUserData &&
        !realDestination.startsWith(realUserData + path.sep)
      ) {
        throw new Error('Access denied: Destination resolves outside userData');
      }

      const payload = data instanceof ArrayBuffer ? Buffer.from(data) : data;
      fs.ftruncateSync(fileDescriptor, 0);
      fs.writeFileSync(fileDescriptor, payload as any);
      return true;
    } finally {
      if (fileDescriptor !== undefined) {
        fs.closeSync(fileDescriptor);
      }
    }
  }
);

// List directory restricted to userData
ipcMain.handle('fs:list-dir', async (event, dirPath: string) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
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
ipcMain.handle('fs:delete', async (event, targetPath: string) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
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
ipcMain.handle('shell:open-external', async (event, url: string) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  if (isSafeExternalUrl(url)) {
    await shell.openExternal(url);
  } else {
    throw new Error('Invalid URL protocol. Only http: and https: are allowed.');
  }
});

// Native OS Clipboard handlers (guarantees clipboard writes work even when window is unfocused or transparent)
ipcMain.handle('clipboard:write-text', (event, text: string) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  if (typeof text !== 'string' || text.length > 1024 * 1024)
    throw new Error('Invalid clipboard text');
  try {
    const cleanText = typeof text === 'string' ? text : String(text ?? '');
    clipboard.writeText(cleanText);
    return { success: true };
  } catch (err: any) {
    console.error('[Main] Failed to write to clipboard:', err);
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('clipboard:read-text', (event) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  try {
    return clipboard.readText();
  } catch {
    return '';
  }
});

// PDF parsing via modern pdfjs-dist
ipcMain.handle('fs:parse-pdf', async (event, arrayBuffer: ArrayBuffer) => {
  if (!isTrustedSender(event, mainWindow)) {
    throw new Error('Unauthorized IPC sender');
  }
  if (!(arrayBuffer instanceof ArrayBuffer) && !Buffer.isBuffer(arrayBuffer)) {
    throw new Error('Invalid argument: expected ArrayBuffer or Buffer');
  }
  const sizeValidation = validateDocumentImportSize(arrayBuffer.byteLength);
  if (!sizeValidation.allowed) {
    throw new Error(sizeValidation.reason || 'Document import size is invalid.');
  }
  try {
    return await parsePdfBuffer(arrayBuffer);
  } catch (err: any) {
    console.error('[Electron] parsePdfBuffer error:', err);
    return '';
  }
});

// DNS resolution for SSRF verification
ipcMain.handle('net:resolve-dns', async (event, hostname: string) => {
  if (!isTrustedSender(event, mainWindow)) {
    throw new Error('Unauthorized IPC sender');
  }
  if (typeof hostname !== 'string' || !hostname.trim() || hostname.length > 255) {
    throw new Error('Invalid hostname argument');
  }
  const clean = hostname.trim().toLowerCase();
  return new Promise((resolve) => {
    dns.lookup(clean, { all: true }, (err, addresses) => {
      if (err) return resolve([]);
      resolve(addresses);
    });
  });
});

// Destination-pinned HTTP/HTTPS fetch for SSRF & DNS rebinding protection
ipcMain.handle('net:safe-fetch-pinned', async (event, options: PinnedFetchOptions) => {
  const sanitized = validateSafeFetchPinnedIpc(event, options, mainWindow);
  return SafeConnectionFetcher.fetch(sanitized);
});

function formatMammothHtmlToText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<tr[^>]*>/gi, '\n')
    .replace(/<td[^>]*>/gi, ' | ')
    .replace(/<\/td>/gi, '')
    .replace(/<\/tr>/gi, '')
    .replace(/<table[^>]*>/gi, '\n')
    .replace(/<\/table>/gi, '\n')
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, url, text) => {
      const cleanText = text.replace(/<[^>]+>/g, '').trim();
      const cleanUrl = url.trim();
      if (!cleanText || cleanText === cleanUrl) return cleanUrl;
      return `${cleanText} (${cleanUrl})`;
    })
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n\n$1\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// DOCX parsing with table and hyperlink preservation
ipcMain.handle('fs:parse-docx', async (event, arrayBuffer: ArrayBuffer) => {
  if (!isTrustedSender(event, mainWindow)) {
    throw new Error('Unauthorized IPC sender');
  }
  if (!(arrayBuffer instanceof ArrayBuffer) && !Buffer.isBuffer(arrayBuffer)) {
    throw new Error('Invalid argument: expected ArrayBuffer or Buffer');
  }
  const sizeValidation = validateDocumentImportSize(arrayBuffer.byteLength);
  if (!sizeValidation.allowed) {
    throw new Error(sizeValidation.reason || 'Document import size is invalid.');
  }
  const archiveValidation = validateDocxArchive(arrayBuffer);
  if (!archiveValidation.allowed) {
    throw new Error(`DOCX import rejected: ${archiveValidation.reason || 'Invalid DOCX archive.'}`);
  }
  const expansionValidation = validateDocxArchiveExpansion(
    arrayBuffer,
    archiveValidation.entries || []
  );
  if (!expansionValidation.allowed) {
    throw new Error(
      `DOCX import rejected: ${expansionValidation.reason || 'Unsafe DOCX expansion.'}`
    );
  }
  const buffer = Buffer.from(arrayBuffer);
  try {
    const htmlResult = await mammoth.convertToHtml({ buffer });
    if (htmlResult.value && htmlResult.value.trim()) {
      return formatMammothHtmlToText(htmlResult.value);
    }
  } catch {}
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
});

// Window visibility & protection IPC
ipcMain.on('window:toggle-visibility', (event) => {
  if (!isTrustedSender(event, mainWindow)) return;
  toggleWindowVisibility();
});
ipcMain.on('window:hide', (event) => {
  if (!isTrustedSender(event, mainWindow)) return;
  mainWindow?.hide();
});
ipcMain.on('window:show', (event) => {
  if (!isTrustedSender(event, mainWindow)) return;
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.focus();
});
ipcMain.handle('window:set-content-protection', (event, enable: boolean) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  if (typeof enable !== 'boolean') throw new Error('Invalid content protection value');
  if (mainWindow) {
    mainWindow.setContentProtection(enable);
    isContentProtected = enable;
    return true;
  }
  return false;
});
ipcMain.handle('window:is-content-protected', (event) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  return isContentProtected;
});
ipcMain.on('window:toggle-content-protection', (event) => {
  if (!isTrustedSender(event, mainWindow)) return;
  if (mainWindow) {
    isContentProtected = !isContentProtected;
    mainWindow.setContentProtection(isContentProtected);
  }
});

// Screen Capture & Neural OCR
ipcMain.handle(
  'screen:capture-and-ocr',
  async (event, mode: 'fullscreen' | 'snip' = 'fullscreen') => {
    if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
    if (mode !== 'fullscreen' && mode !== 'snip') throw new Error('Invalid screen capture mode');
    const tmpImg = path.join(app.getPath('temp'), `iac_screen_${Date.now()}.jpg`);
    const isMac = process.platform === 'darwin';
    const ocrBin = resolveOcrBinaryPath();

    try {
      if (isMac) {
        await runNativeCommandFallback(
          getScreenCaptureCommands(process.platform, mode, tmpImg),
          execFileAsync
        );
      } else {
        await runNativeCommandFallback(
          getScreenCaptureCommands(process.platform, mode, tmpImg),
          execFileAsync
        );
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
        text = String(stdout).trim();
      } else {
        try {
          const { stdout } = await runNativeCommandFallback(
            getTesseractCommands(tmpImg),
            execFileAsync
          );
          text = String(stdout).trim();
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

      const cleanText = redactSensitiveData(text);
      lastCapturedOcrText = cleanText;
      return { success: true, text: cleanText };
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

ipcMain.handle('screen:get-last-ocr-text', (event) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  return lastCapturedOcrText;
});
ipcMain.handle('screen:set-last-ocr-text', (event, text: string) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  if (typeof text !== 'string' || text.length > 100000) throw new Error('Invalid OCR text');
  lastCapturedOcrText = text || '';
  return true;
});

// Append Screen Capture (Scroll down & stitch multi-page problem descriptions)
ipcMain.handle(
  'screen:append-capture-and-ocr',
  async (event, mode: 'fullscreen' | 'snip' = 'fullscreen') => {
    if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
    if (mode !== 'fullscreen' && mode !== 'snip') throw new Error('Invalid screen capture mode');
    const tmpImg = path.join(app.getPath('temp'), `iac_screen_append_${Date.now()}.jpg`);
    const isMac = process.platform === 'darwin';
    const ocrBin = resolveOcrBinaryPath();

    try {
      if (isMac) {
        await runNativeCommandFallback(
          getScreenCaptureCommands(process.platform, mode, tmpImg),
          execFileAsync
        );
      } else {
        await runNativeCommandFallback(
          getScreenCaptureCommands(process.platform, mode, tmpImg),
          execFileAsync
        );
      }

      if (!fs.existsSync(tmpImg)) {
        return {
          success: false,
          cancelled: true,
          error: 'Screen capture cancelled.',
        };
      }

      let newText = '';
      if (isMac && fs.existsSync(ocrBin)) {
        const { stdout } = await execFileAsync(ocrBin, [tmpImg]);
        newText = String(stdout).trim();
      } else {
        const { stdout } = await runNativeCommandFallback(
          getTesseractCommands(tmpImg),
          execFileAsync
        );
        newText = String(stdout).trim();
      }

      try {
        fs.unlinkSync(tmpImg);
      } catch {
        // ignore
      }

      if (!newText) {
        return { success: false, error: 'No text detected on the scrolled screen.' };
      }

      // Stitch previous capture with new capture, deduplicating overlapping lines
      const stitched = stitchSanitizedOcrTexts(lastCapturedOcrText, newText);
      lastCapturedOcrText = stitched;

      return {
        success: true,
        text: stitched,
        appended: true,
        newLength: stitched.length,
      };
    } catch (err: any) {
      console.error('[Electron] Screen append OCR error:', err);
      try {
        if (fs.existsSync(tmpImg)) fs.unlinkSync(tmpImg);
      } catch {
        // ignore
      }
      return { success: false, error: err.message || String(err) };
    }
  }
);

// Stealth Keystroke Auto-Typer: Dispatches native OS keyboard HID events directly into active editor window
ipcMain.handle('system:auto-type', async (event, code: string, delayMs: number = 1500) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  if (typeof code !== 'string' || code.length > 100000)
    throw new Error('Invalid auto-type payload');
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 30000)
    throw new Error('Invalid auto-type delay');
  if (!code || typeof code !== 'string') {
    return { success: false, error: 'No code provided.' };
  }
  const isMac = process.platform === 'darwin';

  if (!isMac) {
    try {
      clipboard.writeText(code);
      return { success: true, method: 'clipboard' };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  }

  const tmpCode = path.join(app.getPath('temp'), `iac_code_${Date.now()}.txt`);
  const tmpScript = path.join(app.getPath('temp'), `iac_type_${Date.now()}.applescript`);

  try {
    fs.writeFileSync(tmpCode, code, 'utf8');

    // Keep the script source static and pass the data-file path as argv[0].
    // Neither the shell nor the AppleScript source interpolates a filesystem path.
    const appleScriptContent = buildAutoTypeAppleScript(delayMs);
    fs.writeFileSync(tmpScript, appleScriptContent, 'utf8');
    await execFileAsync('osascript', [tmpScript, tmpCode]);

    try {
      if (fs.existsSync(tmpCode)) fs.unlinkSync(tmpCode);
      if (fs.existsSync(tmpScript)) fs.unlinkSync(tmpScript);
    } catch {
      // ignore
    }

    return { success: true, method: 'keystroke' };
  } catch (err: any) {
    console.error('[Electron] Auto-type error:', err);
    try {
      if (fs.existsSync(tmpCode)) fs.unlinkSync(tmpCode);
      if (fs.existsSync(tmpScript)) fs.unlinkSync(tmpScript);
    } catch {
      // ignore
    }
    // Fallback: Copy clean code to clipboard
    try {
      clipboard.writeText(code);
      return {
        success: true,
        method: 'clipboard-fallback',
        warning:
          'Keystroke simulation required Accessibility permission; copied to clipboard instead.',
      };
    } catch (clipErr: any) {
      return { success: false, error: err.message || String(err) };
    }
  }
});

ipcMain.handle('screen:get-ocr-engine-info', (event) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  return getOcrEngineInfo();
});

ipcMain.handle('screen:ocr-image', async (event, filePath: string) => {
  if (!isTrustedSender(event, mainWindow)) throw new Error('Unauthorized IPC sender');
  if (typeof filePath !== 'string') {
    return { success: false, error: 'Invalid argument: filePath must be a string' };
  }
  const isMac = process.platform === 'darwin';
  const ocrBin = resolveOcrBinaryPath();
  try {
    const validation = validateReadPath(filePath, app.getPath('userData'), approvedFilePaths);
    if (!validation.allowed || !validation.resolvedPath) {
      return {
        success: false,
        error: validation.reason || 'Access denied: File outside authorized path',
      };
    }
    const resolvedPath = validation.resolvedPath;

    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: 'File not found.' };
    }

    let text = '';
    if (isMac && fs.existsSync(ocrBin)) {
      const { stdout } = await execFileAsync(ocrBin, [resolvedPath]);
      text = String(stdout).trim();
    } else {
      try {
        const { stdout } = await execFileAsync('tesseract', [
          resolvedPath,
          'stdout',
          '--oem',
          '1',
          '-l',
          'eng',
        ]);
        text = String(stdout).trim();
      } catch {
        const { stdout } = await execFileAsync('tesseract', [resolvedPath, 'stdout']);
        text = String(stdout).trim();
      }
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
