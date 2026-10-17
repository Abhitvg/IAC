"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const ws = require("ws");
let wsServer = null;
let mainWindowRef = null;
function setupIpcHandlers(mainWindow2) {
  mainWindowRef = mainWindow2;
  const Store = require("electron-store");
  const store = new Store({
    name: "settings",
    defaults: {
      aiProvider: "openai",
      aiModel: "gpt-4o-mini",
      whisperModel: "base",
      preferredLanguage: "python",
      responseMode: "interview",
      temperature: 0.7,
      maxTokens: 2048,
      theme: "dark",
      audioFormat: "wav",
      browserIntegration: false,
      alwaysOnTop: false,
      shortcuts: {
        record: "R",
        analyze: "A",
        copyAnswer: "C",
        quickAnswer: "Q",
        detailedAnswer: "D",
        minimize: "Escape",
        regenerate: "CommandOrControl+Enter"
      },
      systemPrompt: `You are a technical interview assistant. Provide clear, concise, and accurate answers to interview questions. When answering coding questions, provide well-structured solutions with time and space complexity analysis. Format your responses in markdown.`,
      customApiEndpoint: "",
      ollamaEndpoint: "http://localhost:11434"
    }
  });
  electron.ipcMain.handle("settings:get", () => store.store);
  electron.ipcMain.handle("settings:set", (_event, key, value) => {
    store.set(key, value);
    return true;
  });
  electron.ipcMain.handle("credentials:get", async (_event, service) => {
    try {
      const keytar = require("keytar");
      return await keytar.getPassword("ai-interview-assistant", service);
    } catch {
      return store.get(`credentials.${service}`, null);
    }
  });
  electron.ipcMain.handle("credentials:set", async (_event, service, key) => {
    try {
      const keytar = require("keytar");
      await keytar.setPassword("ai-interview-assistant", service, key);
    } catch {
      store.set(`credentials.${service}`, key);
    }
    return true;
  });
  electron.ipcMain.handle("credentials:delete", async (_event, service) => {
    try {
      const keytar = require("keytar");
      await keytar.deletePassword("ai-interview-assistant", service);
    } catch {
      store.delete(`credentials.${service}`);
    }
    return true;
  });
  electron.ipcMain.handle("ws:start", () => {
    var _a;
    if (wsServer) return { port: (_a = wsServer.address()) == null ? void 0 : _a.port };
    wsServer = new ws.WebSocketServer({ port: 0, host: "127.0.0.1" });
    wsServer.on("connection", (ws2) => {
      ws2.on("message", (message) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type && data.content) {
            mainWindowRef == null ? void 0 : mainWindowRef.webContents.send("browser-context", data);
          }
        } catch (e) {
          console.error("Invalid WebSocket message:", e);
        }
      });
    });
    const address = wsServer.address();
    const port = typeof address === "object" ? address == null ? void 0 : address.port : 0;
    return { port };
  });
  electron.ipcMain.handle("ws:stop", () => {
    if (wsServer) {
      wsServer.close();
      wsServer = null;
    }
    return true;
  });
}
let mainWindow = null;
let isContentProtected = true;
const RECORDINGS_DIR = path.join(electron.app.getPath("userData"), "recordings");
const SESSIONS_DIR = path.join(electron.app.getPath("userData"), "sessions");
function ensureDirectories() {
  [RECORDINGS_DIR, SESSIONS_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 680,
    height: 500,
    minWidth: 420,
    minHeight: 280,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    ...process.platform === "darwin" ? {
      vibrancy: "under-window",
      visualEffectState: "active"
    } : {},
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    icon: path.join(__dirname, "../public/icon.png")
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  mainWindow.webContents.on("console-message", (_event, level, message) => {
    console.log("[Renderer Log]", message);
  });
  mainWindow.setContentProtection(true);
  if (process.platform === "darwin") {
    mainWindow.setHiddenInMissionControl(true);
    mainWindow.excludedFromShownWindowsMenu = true;
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
electron.app.whenReady().then(() => {
  electron.session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });
  electron.session.defaultSession.setPermissionCheckHandler(() => true);
  ensureDirectories();
  createWindow();
  setupIpcHandlers(mainWindow);
  if (mainWindow) {
    mainWindow.setContentProtection(true);
    mainWindow.setAlwaysOnTop(true, "floating");
    if (process.platform === "darwin") {
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
  }
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  electron.globalShortcut.unregisterAll();
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("will-quit", () => {
  electron.globalShortcut.unregisterAll();
});
electron.ipcMain.on("window:minimize", () => mainWindow == null ? void 0 : mainWindow.minimize());
electron.ipcMain.on("window:maximize", () => {
  if (mainWindow == null ? void 0 : mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow == null ? void 0 : mainWindow.maximize();
  }
});
electron.ipcMain.on("window:close", () => mainWindow == null ? void 0 : mainWindow.close());
electron.ipcMain.on("window:toggle-always-on-top", () => {
  if (mainWindow) {
    const isOnTop = mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(!isOnTop);
  }
});
electron.ipcMain.handle("window:is-always-on-top", () => {
  return (mainWindow == null ? void 0 : mainWindow.isAlwaysOnTop()) ?? false;
});
electron.ipcMain.handle("window:set-content-protection", (_event, enable) => {
  if (mainWindow) {
    mainWindow.setContentProtection(enable);
    isContentProtected = enable;
    console.log("[Electron] Content protection (screen stealth):", enable);
    return true;
  }
  return false;
});
electron.ipcMain.handle("window:is-content-protected", () => {
  return isContentProtected;
});
electron.ipcMain.on("window:toggle-content-protection", () => {
  if (mainWindow) {
    isContentProtected = !isContentProtected;
    mainWindow.setContentProtection(isContentProtected);
    console.log("[Electron] Toggled content protection (screen stealth):", isContentProtected);
  }
});
electron.ipcMain.handle("get-recordings-dir", () => RECORDINGS_DIR);
electron.ipcMain.handle("get-sessions-dir", () => SESSIONS_DIR);
electron.ipcMain.handle("get-user-data-path", () => electron.app.getPath("userData"));
electron.ipcMain.handle("dialog:open-file", async (_event, options) => {
  if (!mainWindow) return null;
  const result = await electron.dialog.showOpenDialog(mainWindow, options);
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});
electron.ipcMain.handle("fs:read-file", async (_event, filePath) => {
  const userDataPath = electron.app.getPath("userData");
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(userDataPath) && !resolvedPath.startsWith(electron.app.getPath("home"))) {
    throw new Error("Access denied: Cannot read files outside allowed directories");
  }
  return fs.readFileSync(resolvedPath);
});
electron.ipcMain.handle("fs:write-file", async (_event, filePath, data) => {
  const userDataPath = electron.app.getPath("userData");
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(userDataPath)) {
    throw new Error("Access denied: Cannot write files outside user data directory");
  }
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(resolvedPath, data);
  return true;
});
electron.ipcMain.handle("fs:list-dir", async (_event, dirPath) => {
  const resolvedPath = path.resolve(dirPath);
  if (!fs.existsSync(resolvedPath)) return [];
  return fs.readdirSync(resolvedPath, { withFileTypes: true }).map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory(),
    path: path.join(resolvedPath, entry.name)
  }));
});
electron.ipcMain.handle("fs:delete", async (_event, targetPath) => {
  const userDataPath = electron.app.getPath("userData");
  const resolvedPath = path.resolve(targetPath);
  if (!resolvedPath.startsWith(userDataPath)) {
    throw new Error("Access denied");
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
electron.ipcMain.handle("shell:open-external", async (_event, url) => {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    await electron.shell.openExternal(url);
  }
});
electron.ipcMain.handle("fs:parse-pdf", async (_event, arrayBuffer) => {
  const pdfParse = require("pdf-parse");
  const buffer = Buffer.from(arrayBuffer);
  const data = await pdfParse(buffer);
  return data.text || "";
});
electron.ipcMain.handle("fs:parse-docx", async (_event, arrayBuffer) => {
  const mammoth = require("mammoth");
  const buffer = Buffer.from(arrayBuffer);
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
});
