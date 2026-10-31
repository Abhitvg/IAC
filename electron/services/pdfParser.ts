/* eslint-disable no-control-regex */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Modern, robust PDF text extraction using pdfjs-dist.
 * Handles complex multi-column resumes, Unicode character sets, and nested text blocks.
 */
function resolveWorkerSrc(): string {
  try {
    return require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  } catch {}
  try {
    return require.resolve('pdfjs-dist/build/pdf.worker.mjs');
  } catch {}
  const candidate = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs');
  if (fs.existsSync(candidate)) return candidate;
  return '';
}

function resolveCMapUrl(): string {
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
 * Checks if extracted text is corrupt, unmapped glyph mojibake, or unreadable binary.
 */
export function isGarbledOrMojibakeText(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  const clean = text.trim();

  // Check for high density of null bytes or repeated 00/0 interleaving (e.g. "00i03000G0", "d06000000 0 :0'00500000")
  const zeroRunMatches = clean.match(/(?:[a-zA-Z0-9][0\x00]){4,}|(?:00[A-Za-z0-9]){3,}/g);
  if (zeroRunMatches && zeroRunMatches.length > 3) {
    return true;
  }

  // Check if high percentage of characters are non-printable, replacement, or control characters
  const nonPrintableMatches = clean.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFFFD]/g);
  if (nonPrintableMatches && nonPrintableMatches.length / clean.length > 0.25) {
    return true;
  }

  // For longer extracted text (> 80 characters), check recognizable word ratio
  if (clean.length > 80) {
    const words = clean.split(/\s+/).filter((w) => w.length >= 2);
    if (words.length >= 8) {
      const recognizableWords = words.filter(
        (w) => /[aeiouyAEIOUY]/.test(w) && !/[^\x20-\x7E\u00A0-\u024F]/.test(w)
      );
      if (recognizableWords.length / words.length < 0.25) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Fallback OCR extraction for image-only or corrupt/unmapped PDFs using macOS native Vision OCR.
 */
async function tryOcrPdf(buffer: Uint8Array): Promise<string> {
  const isMac = process.platform === 'darwin';
  const ocrBin = path.join(__dirname, '../../bin/mac-ocr');
  const tempDir = os.tmpdir();
  const baseName = `iac_pdf_ocr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const tmpPdf = path.join(tempDir, `${baseName}.pdf`);
  const tmpPng = path.join(tempDir, `${baseName}.png`);

  try {
    await fs.promises.writeFile(tmpPdf, buffer);

    if (isMac && fs.existsSync(ocrBin)) {
      try {
        await execFileAsync('sips', ['-s', 'format', 'png', tmpPdf, '--out', tmpPng]);
        if (fs.existsSync(tmpPng)) {
          const { stdout } = await execFileAsync(ocrBin, [tmpPng]);
          const ocrText = (stdout || '').trim();
          if (ocrText && !isGarbledOrMojibakeText(ocrText)) {
            return ocrText;
          }
        }
      } catch (sipsErr) {
        console.warn('[PDFParser] macOS sips/OCR rendering failed:', sipsErr);
      }
    }
  } catch (err) {
    console.warn('[PDFParser] OCR fallback error:', err);
  } finally {
    try {
      if (fs.existsSync(tmpPdf)) await fs.promises.unlink(tmpPdf);
    } catch {}
    try {
      if (fs.existsSync(tmpPng)) await fs.promises.unlink(tmpPng);
    } catch {}
  }

  return '';
}

export async function parsePdfBuffer(arrayBuffer: ArrayBuffer | Buffer | Uint8Array): Promise<string> {
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

  // Find PDF header within the buffer (PDF specification accepts %PDF within initial bytes or pooled buffer)
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

    // Use a cloned copy to prevent detaching caller buffer
    const copy = new Uint8Array(uint8.slice(0));

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
          // Normalize ligatures and strip control characters
          const normalized = item.str
            .replace(/\uFB00/g, 'ff')
            .replace(/\uFB01/g, 'fi')
            .replace(/\uFB02/g, 'fl')
            .replace(/\uFB03/g, 'ffi')
            .replace(/\uFB04/g, 'ffl')
            .replace(/\uFB05/g, 'ft')
            .replace(/\uFB06/g, 'st')
            .replace(/[\x00\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

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
    console.warn('[PDFParser] pdfjs-dist extraction failed or invalid PDF structure:', err);
  }

  // If text layer is clean and readable, return it
  if (rawExtractedText && !isGarbledOrMojibakeText(rawExtractedText)) {
    return rawExtractedText;
  }

  // If text layer is empty or garbled mojibake, try OCR
  const ocrText = await tryOcrPdf(uint8);
  if (ocrText && !isGarbledOrMojibakeText(ocrText)) {
    return ocrText;
  }

  // If both direct text extraction and OCR failed, return a clean informative message
  // NEVER return raw binary gibberish into the candidate resume field!
  return 'Could not extract readable text from PDF. The document may be image-only, scanned, or use custom encrypted font encodings. Please paste your resume text directly into the editor below or upload as .txt, .md, or .docx.';
}
