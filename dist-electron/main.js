"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const handlers_1 = require("./ipc/handlers");
let mainWindow = null;
const RECORDINGS_DIR = path_1.default.join(electron_1.app.getPath('userData'), 'recordings');
const SESSIONS_DIR = path_1.default.join(electron_1.app.getPath('userData'), 'sessions');
function ensureDirectories() {
    [RECORDINGS_DIR, SESSIONS_DIR].forEach((dir) => {
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
    });
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 660,
        height: 480,
        minWidth: 420,
        minHeight: 280,
        frame: false,
        transparent: true,
        hasShadow: true,
        resizable: true,
        alwaysOnTop: true,
        backgroundColor: '#00000000',
        titleBarStyle: 'hidden',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
        icon: path_1.default.join(__dirname, '../public/icon.png'),
    });
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
    }
    mainWindow.webContents.on('console-message', (_event, level, message) => {
        console.log('[Renderer Log]', message);
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
function registerGlobalShortcuts() {
    // These are app-level shortcuts that work even when minimized
    // Most shortcuts are handled in the renderer for better UX
}
const electron_2 = require("electron");
electron_1.app.whenReady().then(() => {
    electron_2.session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(true);
    });
    electron_2.session.defaultSession.setPermissionCheckHandler(() => true);
    ensureDirectories();
    createWindow();
    (0, handlers_1.setupIpcHandlers)(mainWindow);
    if (mainWindow) {
        mainWindow.setAlwaysOnTop(true, 'floating');
        if (process.platform === 'darwin') {
            mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        }
    }
    registerGlobalShortcuts();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    electron_1.globalShortcut.unregisterAll();
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('will-quit', () => {
    electron_1.globalShortcut.unregisterAll();
});
// IPC for window controls
electron_1.ipcMain.on('window:minimize', () => mainWindow?.minimize());
electron_1.ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
    }
    else {
        mainWindow?.maximize();
    }
});
electron_1.ipcMain.on('window:close', () => mainWindow?.close());
electron_1.ipcMain.on('window:toggle-always-on-top', () => {
    if (mainWindow) {
        const isOnTop = mainWindow.isAlwaysOnTop();
        mainWindow.setAlwaysOnTop(!isOnTop);
    }
});
electron_1.ipcMain.handle('window:is-always-on-top', () => {
    return mainWindow?.isAlwaysOnTop() ?? false;
});
// File system paths
electron_1.ipcMain.handle('get-recordings-dir', () => RECORDINGS_DIR);
electron_1.ipcMain.handle('get-sessions-dir', () => SESSIONS_DIR);
electron_1.ipcMain.handle('get-user-data-path', () => electron_1.app.getPath('userData'));
// File dialog
electron_1.ipcMain.handle('dialog:open-file', async (_event, options) => {
    if (!mainWindow)
        return null;
    const result = await electron_1.dialog.showOpenDialog(mainWindow, options);
    if (result.canceled || result.filePaths.length === 0)
        return null;
    return result.filePaths[0];
});
// Read file
electron_1.ipcMain.handle('fs:read-file', async (_event, filePath) => {
    // Security: only allow reading from userData directory
    const userDataPath = electron_1.app.getPath('userData');
    const resolvedPath = path_1.default.resolve(filePath);
    if (!resolvedPath.startsWith(userDataPath) && !resolvedPath.startsWith(electron_1.app.getPath('home'))) {
        throw new Error('Access denied: Cannot read files outside allowed directories');
    }
    return fs_1.default.readFileSync(resolvedPath);
});
// Write file
electron_1.ipcMain.handle('fs:write-file', async (_event, filePath, data) => {
    const userDataPath = electron_1.app.getPath('userData');
    const resolvedPath = path_1.default.resolve(filePath);
    if (!resolvedPath.startsWith(userDataPath)) {
        throw new Error('Access denied: Cannot write files outside user data directory');
    }
    const dir = path_1.default.dirname(resolvedPath);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    fs_1.default.writeFileSync(resolvedPath, data);
    return true;
});
// List directory
electron_1.ipcMain.handle('fs:list-dir', async (_event, dirPath) => {
    const resolvedPath = path_1.default.resolve(dirPath);
    if (!fs_1.default.existsSync(resolvedPath))
        return [];
    return fs_1.default.readdirSync(resolvedPath, { withFileTypes: true }).map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: path_1.default.join(resolvedPath, entry.name),
    }));
});
// Delete file/directory
electron_1.ipcMain.handle('fs:delete', async (_event, targetPath) => {
    const userDataPath = electron_1.app.getPath('userData');
    const resolvedPath = path_1.default.resolve(targetPath);
    if (!resolvedPath.startsWith(userDataPath)) {
        throw new Error('Access denied');
    }
    if (fs_1.default.existsSync(resolvedPath)) {
        const stat = fs_1.default.statSync(resolvedPath);
        if (stat.isDirectory()) {
            fs_1.default.rmSync(resolvedPath, { recursive: true, force: true });
        }
        else {
            fs_1.default.unlinkSync(resolvedPath);
        }
    }
    return true;
});
// Open external URL
electron_1.ipcMain.handle('shell:open-external', async (_event, url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
        await electron_1.shell.openExternal(url);
    }
});
// PDF parsing
electron_1.ipcMain.handle('fs:parse-pdf', async (_event, arrayBuffer) => {
    const pdfParse = require('pdf-parse');
    const buffer = Buffer.from(arrayBuffer);
    const data = await pdfParse(buffer);
    return data.text || '';
});
// DOCX parsing
electron_1.ipcMain.handle('fs:parse-docx', async (_event, arrayBuffer) => {
    const mammoth = require('mammoth');
    const buffer = Buffer.from(arrayBuffer);
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
});
