import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

export const MAX_WRITE_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB max write limit

export interface PathValidationResult {
  allowed: boolean;
  resolvedPath?: string;
  reason?: string;
}

/**
 * Resolves a path to its canonical real path on disk, walking up to the nearest
 * existing ancestor to properly handle macOS /var -> /private/var and symlink aliases.
 */
export function getCanonicalPath(target: string): string {
  const resolved = path.resolve(target);
  if (fs.existsSync(resolved)) {
    return fs.realpathSync(resolved);
  }
  let current = path.dirname(resolved);
  let tail = path.basename(resolved);
  while (!fs.existsSync(current) && current !== path.dirname(current)) {
    tail = path.join(path.basename(current), tail);
    current = path.dirname(current);
  }
  const realCurrent = fs.existsSync(current) ? fs.realpathSync(current) : current;
  return path.join(realCurrent, tail);
}

/**
 * Validates that a file path is safe for reading:
 * 1. Must be inside userData, OR
 * 2. Must be in the explicitly approved files Set (from open-file dialog in current session).
 * Resolves real path to prevent symlink traversal outside allowed directories and rejects "../" escapes.
 */
export function validateReadPath(
  filePath: string,
  userDataDir: string,
  approvedFilePaths: Set<string>
): PathValidationResult {
  if (!filePath || typeof filePath !== 'string') {
    return { allowed: false, reason: 'Invalid or empty file path' };
  }

  try {
    const normalizedTarget = path.resolve(filePath);

    if (!fs.existsSync(normalizedTarget)) {
      return { allowed: false, reason: 'File not found' };
    }

    // Resolve symlinks to physical disk path
    const realTarget = fs.realpathSync(normalizedTarget);
    const realUserData = getCanonicalPath(userDataDir);

    // Check if within userData directory
    const isInsideUserData =
      realTarget === realUserData || realTarget.startsWith(realUserData + path.sep);

    if (isInsideUserData) {
      return { allowed: true, resolvedPath: realTarget };
    }

    // Check if user explicitly chose and approved this file via open-file dialog
    const isApproved =
      approvedFilePaths.has(realTarget) ||
      approvedFilePaths.has(normalizedTarget) ||
      Array.from(approvedFilePaths).some((appPath) => getCanonicalPath(appPath) === realTarget);

    if (isApproved) {
      return { allowed: true, resolvedPath: realTarget };
    }

    return {
      allowed: false,
      reason: 'Access denied: Path is outside userData and was not approved via open-file dialog',
    };
  } catch (err: any) {
    return { allowed: false, reason: `Path validation error: ${err.message || String(err)}` };
  }
}

/**
 * Validates that a file path and payload size are safe for writing:
 * 1. Must be strictly inside userData.
 * 2. Cannot target userData root itself.
 * 3. Payload size must not exceed limit (25MB).
 * 4. Resolves parent directory realpath to prevent symlink escapes.
 */
export function validateWritePath(
  filePath: string,
  dataByteLength: number,
  userDataDir: string,
  maxSizeBytes: number = MAX_WRITE_FILE_SIZE_BYTES
): PathValidationResult {
  if (!filePath || typeof filePath !== 'string') {
    return { allowed: false, reason: 'Invalid or empty file path' };
  }

  if (dataByteLength > maxSizeBytes) {
    return {
      allowed: false,
      reason: `Payload exceeds maximum allowed size of ${maxSizeBytes} bytes (got ${dataByteLength} bytes)`,
    };
  }

  try {
    const canonicalTarget = getCanonicalPath(filePath);
    const realUserData = getCanonicalPath(userDataDir);

    // Target must strictly be inside userData, not the root itself
    if (canonicalTarget === realUserData) {
      return { allowed: false, reason: 'Access denied: Cannot overwrite userData root' };
    }

    const isInsideUserData = canonicalTarget.startsWith(realUserData + path.sep);
    if (!isInsideUserData) {
      return { allowed: false, reason: 'Access denied: Cannot write files outside userData' };
    }

    // If destination file already exists, check that it is not a symlink pointing outside userData
    if (fs.existsSync(path.resolve(filePath))) {
      const realTarget = fs.realpathSync(path.resolve(filePath));
      if (!realTarget.startsWith(realUserData + path.sep)) {
        return {
          allowed: false,
          reason: 'Access denied: Destination symlink points outside userData',
        };
      }
      return { allowed: true, resolvedPath: realTarget };
    }

    return { allowed: true, resolvedPath: canonicalTarget };
  } catch (err: any) {
    return { allowed: false, reason: `Write path validation error: ${err.message || String(err)}` };
  }
}

/**
 * Validates that a path is safe for deletion:
 * 1. Target must exist.
 * 2. Target must strictly be inside userData (never deleting userData root itself).
 */
export function validateDeletePath(targetPath: string, userDataDir: string): PathValidationResult {
  if (!targetPath || typeof targetPath !== 'string') {
    return { allowed: false, reason: 'Invalid or empty target path' };
  }

  try {
    const resolvedPath = path.resolve(targetPath);
    if (!fs.existsSync(resolvedPath)) {
      return { allowed: false, reason: 'Target does not exist' };
    }

    const realTarget = fs.realpathSync(resolvedPath);
    const realUserData = getCanonicalPath(userDataDir);

    if (realTarget === realUserData) {
      return { allowed: false, reason: 'Access denied: Cannot delete userData root' };
    }

    if (!realTarget.startsWith(realUserData + path.sep)) {
      return { allowed: false, reason: 'Access denied: Cannot delete path outside userData' };
    }

    return { allowed: true, resolvedPath: realTarget };
  } catch (err: any) {
    return {
      allowed: false,
      reason: `Delete path validation error: ${err.message || String(err)}`,
    };
  }
}

/**
 * Validates permission requests with a strict allowlist and exact origin matching:
 * Allow only 'media' (microphone) and clipboard write for the app's own canonical origin.
 * Replaces string-prefix trust decisions with strict parsed URL/origin validation.
 * Denies all untrusted origins, lookalikes, credential-embedded URLs, and unapproved permissions.
 */
export function isPermissionAllowed(
  permission: string,
  requestingOrigin: string,
  devServerUrl: string | undefined = process.env.VITE_DEV_SERVER_URL
): boolean {
  if (
    permission !== 'media' &&
    permission !== 'clipboard-sanitized-write' &&
    permission !== 'clipboard-write'
  ) {
    return false;
  }

  if (!requestingOrigin || typeof requestingOrigin !== 'string' || !requestingOrigin.trim()) {
    return false;
  }

  return isTrustedAppOrigin(requestingOrigin, devServerUrl);
}

/**
 * Constructs a strict Content Security Policy header.
 */
export function buildCspHeader(isDev: boolean): string {
  const devConnect = isDev
    ? ' ws://127.0.0.1:* http://127.0.0.1:* ws://localhost:* http://localhost:*'
    : '';

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    `connect-src 'self' https: wss: ws://127.0.0.1:* http://127.0.0.1:*${devConnect}`,
    "font-src 'self' data: https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Returns sandbox config based on environment: true for production, false only for development.
 */
export function getSandboxConfig(isProduction: boolean): boolean {
  return isProduction;
}

/**
 * Redacts sensitive credentials, API keys, tokens, and secrets from text.
 * Prevents secrets from leaking into logs, OCR buffers, telemetry, or error messages.
 */
export function redactSensitiveData(text: string): string {
  if (!text || typeof text !== 'string') return '';

  return (
    text
      // Groq API keys
      .replace(/gsk_[A-Za-z0-9_-]{20,}/g, '[REDACTED_GROQ_KEY]')
      // OpenAI API keys
      .replace(/sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g, '[REDACTED_OPENAI_KEY]')
      // Google AI keys
      .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_GOOGLE_KEY]')
      // AWS Access Key ID
      .replace(/\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]')
      // JWT tokens
      .replace(
        /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g,
        '[REDACTED_JWT_TOKEN]'
      )
      // Bearer auth tokens
      .replace(/Bearer\s+[A-Za-z0-9_.-]{20,}/gi, 'Bearer [REDACTED_AUTH_TOKEN]')
      // DB connection passwords
      .replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/gi, '$1[REDACTED_PASSWORD]$3')
      .replace(/(password\s*[:=]\s*['"]?)[^'"\s;]+(['"]?)/gi, '$1[REDACTED_PASSWORD]$2')
  );
}

/**
 * Resolves the canonical list of approved local application entry points for file: URLs.
 * In packaged production, strictly derives from Electron's application path and asar resources;
 * process.cwd() is prohibited in packaged production to prevent working-directory spoofing.
 */
export function getApprovedAppHtmlPaths(): string[] {
  const candidates: string[] = [];

  let electronApp: any;
  try {
    electronApp = require('electron')?.app;
  } catch {}

  const isPackaged = Boolean(electronApp?.isPackaged);

  if (electronApp?.getAppPath) {
    try {
      const appPath = electronApp.getAppPath();
      candidates.push(path.resolve(appPath, 'dist/index.html'));
      candidates.push(path.resolve(appPath, 'index.html'));
    } catch {}
  }

  if (process.resourcesPath) {
    candidates.push(path.resolve(process.resourcesPath, 'app.asar', 'dist/index.html'));
    candidates.push(path.resolve(process.resourcesPath, 'dist/index.html'));
  }

  // In packaged production, strictly omit cwd and local dev directory relatives
  if (!isPackaged) {
    if (typeof __dirname !== 'undefined') {
      candidates.push(path.resolve(__dirname, '../dist/index.html'));
      candidates.push(path.resolve(__dirname, '../../dist/index.html'));
      candidates.push(path.resolve(__dirname, 'index.html'));
    }
    if (process.cwd()) {
      candidates.push(path.resolve(process.cwd(), 'dist/index.html'));
    }
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      candidates.push(path.resolve('/app/dist/index.html'));
    }
  }

  return Array.from(new Set(candidates.map((p) => path.normalize(p))));
}

/**
 * Checks if a given URL belongs to the trusted local application origin.
 * Strict URL parsing, credentials rejection, effective port matching,
 * traversal rejection, and canonical entry point validation are enforced.
 */
export function isTrustedAppOrigin(
  url: string,
  devServerUrl: string | undefined = process.env.VITE_DEV_SERVER_URL,
  allowedFilePaths?: string[]
): boolean {
  if (!url || typeof url !== 'string' || !url.trim()) return false;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }

  // Reject credentials in userinfo (e.g. http://localhost:5173@attacker.example)
  if (parsed.username || parsed.password) {
    return false;
  }

  // Production file: protocol validation
  if (parsed.protocol === 'file:') {
    // 1. Hostname must be empty or localhost (reject Windows UNC or remote hostnames)
    if (parsed.hostname && parsed.hostname !== 'localhost') {
      return false;
    }

    // 2. Reject path traversal sequences, URL-encoded traversal, alternate backslash separators
    const rawPath = parsed.pathname;
    if (
      url.includes('\\') ||
      url.includes('%5c') ||
      url.includes('%5C') ||
      rawPath.includes('/..') ||
      rawPath.includes('\\..') ||
      rawPath.includes('..') ||
      rawPath.includes('\\') ||
      url.includes('%2e%2e') ||
      url.includes('%2E%2E') ||
      url.includes('%2f%2e%2e') ||
      url.includes('%2F%2E%2E')
    ) {
      return false;
    }

    let filePath: string;
    try {
      filePath = fileURLToPath(parsed);
    } catch {
      return false;
    }

    // 3. Reject paths that contain traversal or alternate separators even after decoding
    // A decoded Windows file URL naturally contains backslashes. Reject only
    // parent-directory path segments; the raw URL above already rejects encoded
    // or literal alternate separators supplied by the renderer.
    if (filePath.split(/[\\/]+/).includes('..')) {
      return false;
    }

    const normalizedPath = path.normalize(filePath);
    const comparisonPath = (value: string) => {
      const resolved = path.resolve(value);
      return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    };

    // 4. Must strictly target an approved application html entry point (not package.json, js, etc.)
    if (!normalizedPath.endsWith('/index.html') && !normalizedPath.endsWith('\\index.html')) {
      return false;
    }

    const approvedPaths =
      allowedFilePaths && allowedFilePaths.length > 0
        ? allowedFilePaths.map((p) => path.normalize(p))
        : getApprovedAppHtmlPaths();

    if (
      !approvedPaths.some(
        (approvedPath) => comparisonPath(approvedPath) === comparisonPath(normalizedPath)
      )
    ) {
      return false;
    }

    // 5. If destination exists, verify realpath is within approved entry points (preventing symlink aliases)
    if (fs.existsSync(normalizedPath)) {
      try {
        const real = fs.realpathSync(normalizedPath);
        const approvedReals = approvedPaths
          .filter((p) => fs.existsSync(p))
          .map((p) => {
            try {
              return fs.realpathSync(p);
            } catch {
              return p;
            }
          });
        if (
          approvedReals.length > 0 &&
          !approvedReals.some(
            (approvedPath) => comparisonPath(approvedPath) === comparisonPath(real)
          )
        ) {
          return false;
        }
      } catch {
        return false;
      }
    }

    return true;
  }

  // Development http: / https: protocol validation
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    if (!devServerUrl || typeof devServerUrl !== 'string' || !devServerUrl.trim()) {
      return false;
    }

    let devParsed: URL;
    try {
      devParsed = new URL(devServerUrl.trim());
    } catch {
      return false;
    }

    if (devParsed.username || devParsed.password) {
      return false;
    }

    // Strict protocol equality
    if (parsed.protocol !== devParsed.protocol) {
      return false;
    }

    // Strict hostname equality (disallow hostname-prefix, suffix, or domain lookalikes)
    if (parsed.hostname.toLowerCase() !== devParsed.hostname.toLowerCase()) {
      return false;
    }

    // Strict effective port comparison
    const getEffectivePort = (u: URL) => u.port || (u.protocol === 'https:' ? '443' : '80');
    if (getEffectivePort(parsed) !== getEffectivePort(devParsed)) {
      return false;
    }

    // Normalized origin comparison
    return parsed.origin === devParsed.origin;
  }

  return false;
}

/**
 * Validates that an IPC event was dispatched exclusively by the trusted main window frame
 * and that the sender's origin matches the allowed application origin.
 * Rejects unexpected frames, subframes, redirected navigations, and destroyed windows.
 */
export function isTrustedSender(
  event: { senderFrame?: any; sender?: any },
  mainWindow: any,
  devServerUrl: string | undefined = process.env.VITE_DEV_SERVER_URL,
  allowedFilePaths?: string[]
): boolean {
  if (!mainWindow) return false;
  if (typeof mainWindow.isDestroyed === 'function' && mainWindow.isDestroyed()) return false;
  if (!mainWindow.webContents) return false;
  if (
    typeof mainWindow.webContents.isDestroyed === 'function' &&
    mainWindow.webContents.isDestroyed()
  ) {
    return false;
  }

  // Electron IPC events must identify both the originating WebContents and frame.
  // Missing identity metadata is not treated as a trusted renderer.
  if (!event?.sender || event.sender !== mainWindow.webContents) {
    return false;
  }

  const frame = event.senderFrame;
  if (!frame || frame.parent !== null) {
    return false;
  }

  if (!mainWindow.webContents.mainFrame || frame !== mainWindow.webContents.mainFrame) {
    return false;
  }

  // Both the dispatching frame and current document must be the trusted app origin.
  if (
    typeof frame.url !== 'string' ||
    !frame.url ||
    !isTrustedAppOrigin(frame.url, devServerUrl, allowedFilePaths)
  ) {
    return false;
  }

  if (typeof mainWindow.webContents.getURL !== 'function') {
    return false;
  }
  const currentUrl = mainWindow.webContents.getURL();
  if (!currentUrl || !isTrustedAppOrigin(currentUrl, devServerUrl, allowedFilePaths)) {
    return false;
  }

  return true;
}

/**
 * Validates external URL protocols: only http: and https: are permitted.
 */
export function isSafeExternalUrl(url: string): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates IPC sender and options for the privileged net:safe-fetch-pinned handler.
 * Rejects unauthorized senders, subframes, untrusted origins, and malformed options.
 * Enforces mandatory allowedOrigin matching to prevent open proxying.
 */
export function validateSafeFetchPinnedIpc(
  event: any,
  options: any,
  mainWindow: any,
  devServerUrl: string | undefined = process.env.VITE_DEV_SERVER_URL
): {
  url: string;
  allowedOrigin: string;
  timeoutMs: number;
  maxByteSize: number;
  maxRedirects: number;
  userAgent?: string;
} {
  // 1. Validate sender is the trusted main window
  if (!isTrustedSender(event, mainWindow, devServerUrl)) {
    throw new Error('Unauthorized IPC sender');
  }

  // 2. Reject subframes / iframes
  if (event?.senderFrame && event.senderFrame.parent !== null) {
    throw new Error('Unauthorized IPC sender: subframe requests are prohibited');
  }

  // 3. Validate options object
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Invalid arguments: options must be an object');
  }

  // 3b. Prohibit renderer callers from injecting customCa, TLS certificate overrides, or test hooks
  if (
    options.customCa !== undefined ||
    options.ca !== undefined ||
    options.cert !== undefined ||
    options.key !== undefined ||
    options.rejectUnauthorized !== undefined ||
    options.checkServerIdentity !== undefined ||
    options._testOnlyAllowLoopback !== undefined ||
    options.customResolver !== undefined ||
    options.customRequester !== undefined
  ) {
    throw new Error(
      'Security violation: customCa, TLS certificate overrides, and test hooks cannot be supplied by IPC callers'
    );
  }

  // 4. Validate URL
  if (typeof options.url !== 'string' || !options.url.trim() || options.url.length > 2048) {
    throw new Error('Invalid options: url must be a non-empty string under 2048 characters');
  }

  // 5. Require valid allowedOrigin for renderer-initiated requests
  if (
    typeof options.allowedOrigin !== 'string' ||
    !options.allowedOrigin.trim() ||
    options.allowedOrigin.length > 2048
  ) {
    throw new Error(
      'Unauthorized: allowedOrigin is required for renderer-initiated network requests'
    );
  }

  let parsedUrl: URL;
  let parsedOrigin: URL;
  try {
    parsedUrl = new URL(options.url.trim());
    parsedOrigin = new URL(options.allowedOrigin.trim());
  } catch {
    throw new Error('Invalid URL or allowedOrigin format');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(
      `Unsupported protocol "${parsedUrl.protocol}". Only http: and https: are allowed.`
    );
  }

  if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
    throw new Error(`Unsupported allowedOrigin protocol "${parsedOrigin.protocol}"`);
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('URLs containing embedded credentials (userinfo) are prohibited');
  }

  // Enforce origin match: protocol, hostname, and port
  const urlPort = parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80');
  const originPort = parsedOrigin.port || (parsedOrigin.protocol === 'https:' ? '443' : '80');
  if (
    parsedUrl.protocol !== parsedOrigin.protocol ||
    parsedUrl.hostname.toLowerCase() !== parsedOrigin.hostname.toLowerCase() ||
    urlPort !== originPort
  ) {
    throw new Error(
      `Cross-origin fetch blocked: URL origin (${parsedUrl.origin}) does not match allowedOrigin (${parsedOrigin.origin})`
    );
  }

  // 6. Validate numerical boundaries
  const timeoutMs =
    typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
      ? Math.min(Math.max(Math.floor(options.timeoutMs), 1000), 30000)
      : 8000;

  const maxByteSize =
    typeof options.maxByteSize === 'number' && Number.isFinite(options.maxByteSize)
      ? Math.min(Math.max(Math.floor(options.maxByteSize), 1024), 5 * 1024 * 1024)
      : 1024 * 1024;

  const maxRedirects =
    typeof options.maxRedirects === 'number' && Number.isFinite(options.maxRedirects)
      ? Math.min(Math.max(Math.floor(options.maxRedirects), 0), 10)
      : 5;

  const userAgent =
    typeof options.userAgent === 'string' && options.userAgent.length <= 256
      ? options.userAgent
      : undefined;

  return {
    url: parsedUrl.toString(),
    allowedOrigin: parsedOrigin.origin,
    timeoutMs,
    maxByteSize,
    maxRedirects,
    userAgent,
  };
}
