/* eslint-disable no-control-regex */
import path from 'path';
import fs from 'fs';
import { executeOcr, getOcrEngineInfo } from './ocrService';

/**
 * Robust PDF text extraction using pdfjs-dist and native Apple Vision OCR fallback.
 * Handles complex multi-column resumes, CMap encodings, Unicode character sets,
 * non-English text, and multi-page scanned documents.
 */
function resolveWorkerSrc(): string {
  try {
    return require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  } catch {}
  try {
    return require.resolve('pdfjs-dist/build/pdf.worker.mjs');
  } catch {}
  const candidate = path.join(
    process.cwd(),
    'node_modules',
    'pdfjs-dist',
    'legacy',
    'build',
    'pdf.worker.mjs'
  );
  if (fs.existsSync(candidate)) return candidate;
  return '';
}

function resolveCMapUrl(): string {
  if (process.resourcesPath) {
    const packagedPath = path.join(process.resourcesPath, 'cmaps');
    if (fs.existsSync(packagedPath)) {
      return packagedPath.endsWith(path.sep) ? packagedPath : packagedPath + path.sep;
    }
  }
  try {
    const pkgPath = require.resolve('pdfjs-dist/package.json');
    const cMapDir = path.join(path.dirname(pkgPath), 'cmaps');
    if (fs.existsSync(cMapDir)) {
      return cMapDir.endsWith(path.sep) ? cMapDir : cMapDir + path.sep;
    }
  } catch {}
  const candidate = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'cmaps');
  if (fs.existsSync(candidate)) {
    return candidate.endsWith(path.sep) ? candidate : candidate + path.sep;
  }
  return '';
}

function resolveStandardFontUrl(): string {
  if (process.resourcesPath) {
    const packagedPath = path.join(process.resourcesPath, 'standard_fonts');
    if (fs.existsSync(packagedPath)) {
      return packagedPath.endsWith(path.sep) ? packagedPath : packagedPath + path.sep;
    }
  }
  try {
    const pkgPath = require.resolve('pdfjs-dist/package.json');
    const fontDir = path.join(path.dirname(pkgPath), 'standard_fonts');
    if (fs.existsSync(fontDir)) {
      return fontDir.endsWith(path.sep) ? fontDir : fontDir + path.sep;
    }
  } catch {}
  const candidate = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts');
  if (fs.existsSync(candidate)) {
    return candidate.endsWith(path.sep) ? candidate : candidate + path.sep;
  }
  return '';
}

/**
 * Checks if extracted text is corrupt unmapped glyph mojibake or binary gibberish.
 * Never mistakes valid non-English UTF-8 text or short documents for mojibake.
 */
export function isGarbledOrMojibakeText(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  const clean = text.trim();

  // 1. Check for unmapped CID font byte interleaving (e.g. "00i03000G0", "d06000000 0 :0'00500000")
  const zeroRunMatches = clean.match(/(?:[a-zA-Z0-9][0\x00]){4,}|(?:00[A-Za-z0-9]){3,}/g);
  if (zeroRunMatches && zeroRunMatches.length > 3) {
    return true;
  }

  // 2. Check for high density of replacement characters (\uFFFD) indicating failed glyph mapping
  const replacementMatches = clean.match(/\uFFFD/g);
  if (replacementMatches && replacementMatches.length > 5) {
    return true;
  }

  // 3. Check for high percentage of control characters (\x00-\x08\x0B\x0C\x0E-\x1F\x7F)
  const nonPrintableMatches = clean.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g);
  if (nonPrintableMatches && nonPrintableMatches.length / clean.length > 0.2) {
    return true;
  }

  // 4. For longer strings (> 100 chars), verify that Unicode letters or digits exist
  if (clean.length > 100) {
    const letterMatches = clean.match(/[\p{L}\p{N}]/gu);
    const letterRatio = letterMatches ? letterMatches.length / clean.length : 0;
    // Legitimate text in any language (Latin, CJK, Cyrillic, Arabic, etc.) has letter/digit ratio >= 0.4
    if (letterRatio < 0.25) {
      return true;
    }
  }

  return false;
}

export async function parsePdfBuffer(
  arrayBuffer: ArrayBuffer | Buffer | Uint8Array
): Promise<string> {
  if (!arrayBuffer || ('byteLength' in arrayBuffer && arrayBuffer.byteLength === 0)) {
    return '';
  }

  let uint8: Uint8Array;
  if (Buffer.isBuffer(arrayBuffer)) {
    uint8 = new Uint8Array(arrayBuffer.buffer, arrayBuffer.byteOffset, arrayBuffer.byteLength);
  } else if (arrayBuffer instanceof Uint8Array) {
    uint8 = new Uint8Array(arrayBuffer.buffer, arrayBuffer.byteOffset, arrayBuffer.byteLength);
  } else {
    uint8 = new Uint8Array(arrayBuffer);
  }

  // Locate the %PDF magic header
  const headerIdx = Buffer.from(uint8).indexOf('%PDF');
  if (headerIdx === -1) {
    return '';
  }

  if (headerIdx > 0) {
    uint8 = uint8.subarray(headerIdx);
  }

  let rawExtractedText = '';

  try {
    let pdfjs: any;
    try {
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      pdfjs = await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
    } catch {
      try {
        pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      } catch {
        pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
      }
    }

    const workerPath = resolveWorkerSrc();
    if (workerPath && pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = workerPath;
    }

    const cMapUrl = resolveCMapUrl();
    const standardFontDataUrl = resolveStandardFontUrl();

    // Use a cloned copy to prevent detaching the caller buffer
    const copy = new Uint8Array(uint8.slice(0));

    /**
     * Technical Environment Note:
     * In the Electron main process / headless Node runtime without a DOM document,
     * disableFontFace: true is required by PDF.js to prevent it from attempting DOM
     * @font-face CSS injection or structuredClone across fake workers (which throws
     * DOMException: Cannot transfer object of unsupported type).
     * With cMapUrl and standardFontDataUrl configured, PDF.js still fully parses
     * TrueType, CIDFont, and Type0 font tables internally for glyph-to-Unicode mapping.
     */
    const loadingTask = pdfjs.getDocument({
      data: copy,
      cMapUrl: cMapUrl || undefined,
      cMapPacked: true,
      standardFontDataUrl: standardFontDataUrl || undefined,
      useSystemFonts: true,
      disableFontFace: true,
    });

    const doc = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageStrings: string[] = [];

      for (const item of content.items) {
        if ('str' in item && typeof item.str === 'string') {
          const normalized = item.str
            .replace(/\uFB00/g, 'ff')
            .replace(/\uFB01/g, 'fi')
            .replace(/\uFB02/g, 'fl')
            .replace(/\uFB03/g, 'ffi')
            .replace(/\uFB04/g, 'ffl')
            .replace(/\uFB05/g, 'ft')
            .replace(/\uFB06/g, 'st')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

          if (normalized) {
            pageStrings.push(normalized);
          }
        }
      }

      const pageText = pageStrings.join(' ').replace(/\s+/g, ' ').trim();
      if (pageText) {
        fullText += pageText + '\n\n';
      }
    }

    rawExtractedText = fullText.trim();
  } catch (err) {
    console.warn('[PDFParser] pdfjs-dist extraction error:', err);
  }

  // If text layer is clean, readable, and non-empty, return it
  if (rawExtractedText && !isGarbledOrMojibakeText(rawExtractedText)) {
    return rawExtractedText;
  }

  // If text layer is empty or garbled mojibake, execute multi-page OCR fallback
  const ocrInfo = getOcrEngineInfo();
  if (ocrInfo.available) {
    const ocrResult = await executeOcr(uint8, {
      timeoutMs: 30000,
      maxFileSizeMb: ocrInfo.maxFileSizeMb,
    });
    if (ocrResult.success && ocrResult.text && !isGarbledOrMojibakeText(ocrResult.text)) {
      return ocrResult.text;
    }
  }

  // Graceful fallback notice if both direct extraction and OCR cannot produce text
  return 'Could not extract readable text from PDF. The document may be image-only, scanned, or use custom encrypted font encodings. Please paste your resume text directly into the editor below or upload as .txt, .md, or .docx.';
}
