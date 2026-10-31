import path from 'path';
import fs from 'fs';
import os from 'os';
import { app } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface OcrEngineInfo {
  available: boolean;
  platform: NodeJS.Platform;
  engine: 'apple_vision' | 'none';
  binaryPath: string;
  maxPages: number;
  maxFileSizeMb: number;
  supportsPdfDirectly: boolean;
}

/**
 * Resolves the path to the native OCR binary across:
 * 1. Packaged Electron application resources (process.resourcesPath/bin/mac-ocr)
 * 2. Asar unpacked directory
 * 3. Local development relative paths
 */
export function resolveOcrBinaryPath(): string {
  if (process.platform !== 'darwin') return '';

  const candidates = [
    // 1. Packaged extraResources
    path.join(process.resourcesPath || '', 'bin', 'mac-ocr'),
    // 2. Packaged asar unpacked
    path.join(
      app?.getAppPath ? app.getAppPath().replace('app.asar', 'app.asar.unpacked') : '',
      'bin',
      'mac-ocr'
    ),
    // 3. Relative to dist-electron/services
    path.join(__dirname, '../../bin/mac-ocr'),
    // 4. Relative to dist-electron
    path.join(__dirname, '../bin/mac-ocr'),
    // 5. CWD
    path.join(process.cwd(), 'bin', 'mac-ocr'),
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return '';
}

/**
 * Reports platform OCR capabilities without falsely claiming unsupported OS support.
 */
export function getOcrEngineInfo(): OcrEngineInfo {
  const binaryPath = resolveOcrBinaryPath();
  const available = Boolean(binaryPath && fs.existsSync(binaryPath));

  return {
    available,
    platform: process.platform,
    engine: available ? 'apple_vision' : 'none',
    binaryPath,
    maxPages: 10,
    maxFileSizeMb: 15,
    supportsPdfDirectly: true,
  };
}

export interface OcrExecutionOptions {
  timeoutMs?: number;
  maxFileSizeMb?: number;
}

/**
 * Executes OCR on a file buffer or existing file path with size bounds and execution timeout.
 */
export async function executeOcr(
  fileInput: string | Buffer | Uint8Array,
  options: OcrExecutionOptions = {}
): Promise<{ success: boolean; text?: string; error?: string }> {
  const { timeoutMs = 30000, maxFileSizeMb = 15 } = options;
  const ocrBin = resolveOcrBinaryPath();

  if (!ocrBin) {
    return {
      success: false,
      error: `OCR engine unavailable on platform "${process.platform}". Apple Vision OCR is supported on macOS.`,
    };
  }

  let targetFilePath: string;
  let isTempFile = false;

  try {
    if (typeof fileInput === 'string') {
      if (!fs.existsSync(fileInput)) {
        return { success: false, error: `File not found at path: ${fileInput}` };
      }
      const stats = await fs.promises.stat(fileInput);
      if (stats.size > maxFileSizeMb * 1024 * 1024) {
        return {
          success: false,
          error: `File size (${(stats.size / 1024 / 1024).toFixed(1)}MB) exceeds OCR limit of ${maxFileSizeMb}MB`,
        };
      }
      targetFilePath = fileInput;
    } else {
      const byteLength = fileInput.byteLength;
      if (byteLength > maxFileSizeMb * 1024 * 1024) {
        return {
          success: false,
          error: `File payload (${(byteLength / 1024 / 1024).toFixed(1)}MB) exceeds OCR limit of ${maxFileSizeMb}MB`,
        };
      }

      const tempDir = os.tmpdir();
      const isPdf =
        byteLength >= 4 &&
        fileInput[0] === 0x25 &&
        fileInput[1] === 0x50 &&
        fileInput[2] === 0x44 &&
        fileInput[3] === 0x46;
      const ext = isPdf ? '.pdf' : '.png';
      targetFilePath = path.join(
        tempDir,
        `iac_ocr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`
      );
      isTempFile = true;

      await fs.promises.writeFile(targetFilePath, Buffer.from(fileInput));
    }

    const { stdout } = await execFileAsync(ocrBin, [targetFilePath], {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });

    const text = (stdout || '').trim();
    return { success: true, text };
  } catch (err: any) {
    return {
      success: false,
      error: err.killed
        ? `OCR execution timed out after ${timeoutMs}ms`
        : `OCR execution error: ${err.message || err}`,
    };
  } finally {
    if (isTempFile && targetFilePath! && fs.existsSync(targetFilePath!)) {
      try {
        await fs.promises.unlink(targetFilePath!);
      } catch {}
    }
  }
}

