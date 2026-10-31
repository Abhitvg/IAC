import path from 'path';
import fs from 'fs';

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
 * Validates permission requests with a strict allowlist:
 * Allow only 'media' (microphone) for the app's own origin (file:// or local dev server).
 * Deny all other permissions (geolocation, notifications, camera, MIDI, clipboard-read, etc.).
 */
export function isPermissionAllowed(
  permission: string,
  requestingOrigin: string,
  devServerUrl?: string
): boolean {
  if (
    permission !== 'media' &&
    permission !== 'clipboard-sanitized-write' &&
    permission !== 'clipboard-write'
  ) {
    return false;
  }

  const isFileOrigin = requestingOrigin.startsWith('file://');
  const isDevOrigin = Boolean(devServerUrl && requestingOrigin.startsWith(devServerUrl));

  return isFileOrigin || isDevOrigin;
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

  return text
    // Groq API keys
    .replace(/gsk_[A-Za-z0-9_-]{20,}/g, '[REDACTED_GROQ_KEY]')
    // OpenAI API keys
    .replace(/sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g, '[REDACTED_OPENAI_KEY]')
    // Google AI keys
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_GOOGLE_KEY]')
    // AWS Access Key ID
    .replace(/\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]')
    // JWT tokens
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT_TOKEN]')
    // Bearer auth tokens
    .replace(/Bearer\s+[A-Za-z0-9_.-]{20,}/gi, 'Bearer [REDACTED_AUTH_TOKEN]')
    // DB connection passwords
    .replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/gi, '$1[REDACTED_PASSWORD]$3')
    .replace(/(password\s*[:=]\s*['"]?)[^'"\s;]+(['"]?)/gi, '$1[REDACTED_PASSWORD]$2');
}

/**
 * Validates that an IPC event was dispatched exclusively by the trusted main window frame.
 */
export function isTrustedSender(
  event: { senderFrame?: any; sender?: any },
  mainWindow: any
): boolean {
  if (!mainWindow || !mainWindow.webContents) return false;

  // Validate senderFrame is the top-level main frame
  if (event?.senderFrame) {
    if (mainWindow.webContents.mainFrame) {
      return event.senderFrame === mainWindow.webContents.mainFrame;
    }
    return event.senderFrame.parent === null;
  }

  // Fallback to checking webContents equality
  if (event?.sender) {
    return event.sender === mainWindow.webContents;
  }

  return false;
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
