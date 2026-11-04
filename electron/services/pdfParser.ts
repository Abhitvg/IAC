/* eslint-disable no-control-regex */
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
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
      return pathToFileURL(packagedPath.endsWith(path.sep) ? packagedPath : packagedPath + path.sep).href;
    }
  }
  try {
    const pkgPath = require.resolve('pdfjs-dist/package.json');
    const cMapDir = path.join(path.dirname(pkgPath), 'cmaps');
    if (fs.existsSync(cMapDir)) {
      return pathToFileURL(cMapDir.endsWith(path.sep) ? cMapDir : cMapDir + path.sep).href;
    }
  } catch {}
  const candidate = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'cmaps');
  if (fs.existsSync(candidate)) {
    return pathToFileURL(candidate.endsWith(path.sep) ? candidate : candidate + path.sep).href;
  }
  return '';
}

function resolveStandardFontUrl(): string {
  if (process.resourcesPath) {
    const packagedPath = path.join(process.resourcesPath, 'standard_fonts');
    if (fs.existsSync(packagedPath)) {
      return pathToFileURL(packagedPath.endsWith(path.sep) ? packagedPath : packagedPath + path.sep).href;
    }
  }
  try {
    const pkgPath = require.resolve('pdfjs-dist/package.json');
    const fontDir = path.join(path.dirname(pkgPath), 'standard_fonts');
    if (fs.existsSync(fontDir)) {
      return pathToFileURL(fontDir.endsWith(path.sep) ? fontDir : fontDir + path.sep).href;
    }
  } catch {}
  const candidate = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts');
  if (fs.existsSync(candidate)) {
    return pathToFileURL(candidate.endsWith(path.sep) ? candidate : candidate + path.sep).href;
  }
  return '';
}

export interface ExtractedPdfItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Geometric Layout & Multi-Column Sorting
 * Clusters raw PDF text items into lines and columns to prevent interleaving of multi-column resumes.
 */
export function sortAndFormatTextItems(rawItems: any[]): string {
  const items: ExtractedPdfItem[] = [];

  for (const item of rawItems) {
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

      if (normalized.trim()) {
        const x = Array.isArray(item.transform) ? item.transform[4] : 0;
        const y = Array.isArray(item.transform) ? item.transform[5] : 0;
        const width = item.width || 0;
        const height = item.height || 10;
        items.push({ str: normalized, x, y, width, height });
      }
    }
  }

  if (items.length === 0) return '';

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const it of items) {
    if (it.x < minX) minX = it.x;
    if (it.x + it.width > maxX) maxX = it.x + it.width;
    if (it.y < minY) minY = it.y;
    if (it.y + it.height > maxY) maxY = it.y + it.height;
  }

  const pageWidth = maxX - minX;

  // Helper to format a cluster of items into lines
  const formatLineCluster = (clusterItems: ExtractedPdfItem[]): string => {
    const lines: Array<{ y: number; items: ExtractedPdfItem[] }> = [];
    const sorted = [...clusterItems].sort((a, b) => b.y - a.y);

    for (const item of sorted) {
      let foundLine = false;
      for (const line of lines) {
        if (Math.abs(line.y - item.y) <= Math.max(3.5, item.height * 0.6)) {
          line.items.push(item);
          foundLine = true;
          break;
        }
      }
      if (!foundLine) {
        lines.push({ y: item.y, items: [item] });
      }
    }

    lines.sort((a, b) => b.y - a.y);

    return lines
      .map((line) => {
        line.items.sort((a, b) => a.x - b.x);
        return line.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
      })
      .filter((l) => l.length > 0)
      .join('\n');
  };

  // Detect 2-column layout if page width is sufficient and enough text items exist
  let bestSplitX: number | null = null;
  let maxColumnScore = 0;

  if (pageWidth > 150 && items.length > 15) {
    const step = pageWidth / 40;
    for (let candidateX = minX + 0.25 * pageWidth; candidateX <= minX + 0.70 * pageWidth; candidateX += step) {
      const gutterLeft = candidateX - 8;
      const gutterRight = candidateX + 8;

      let leftCount = 0;
      let rightCount = 0;
      let crossingCount = 0;

      for (const it of items) {
        const itRight = it.x + it.width;
        if (itRight <= gutterLeft) {
          leftCount++;
        } else if (it.x >= gutterRight) {
          rightCount++;
        } else {
          crossingCount++;
        }
      }

      if (leftCount >= items.length * 0.15 && rightCount >= items.length * 0.15) {
        const score = (leftCount + rightCount) - crossingCount * 2.5;
        if (score > maxColumnScore) {
          maxColumnScore = score;
          bestSplitX = candidateX;
        }
      }
    }
  }

  // If a distinct 2-column split was discovered
  if (bestSplitX !== null && maxColumnScore > items.length * 0.35) {
    const splitX = bestSplitX;

    // Detect if top header spans wide across the columns
    let headerY = maxY + 1;
    for (const it of items) {
      const itRight = it.x + it.width;
      const isCrossing = it.x < splitX - 10 && itRight > splitX + 10;
      if (isCrossing && it.y > minY + (maxY - minY) * 0.65) {
        if (it.y < headerY) {
          headerY = it.y;
        }
      }
    }

    const headerItems: ExtractedPdfItem[] = [];
    const col1Items: ExtractedPdfItem[] = [];
    const col2Items: ExtractedPdfItem[] = [];

    for (const it of items) {
      if (it.y >= headerY - 5) {
        headerItems.push(it);
      } else if (it.x + it.width / 2 < splitX) {
        col1Items.push(it);
      } else {
        col2Items.push(it);
      }
    }

    const sections: string[] = [];
    if (headerItems.length > 0) {
      sections.push(formatLineCluster(headerItems));
    }
    if (col1Items.length > 0) {
      sections.push(formatLineCluster(col1Items));
    }
    if (col2Items.length > 0) {
      sections.push(formatLineCluster(col2Items));
    }

    return sections.filter(Boolean).join('\n\n');
  }

  // Single-column fallback
  return formatLineCluster(items);
}

/**
 * Checks if extracted text is corrupt unmapped glyph mojibake or binary gibberish.
 * Never mistakes valid non-English UTF-8 text or short documents for mojibake.
 */
export function isGarbledOrMojibakeText(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  const clean = text.trim();

  // 1. Check for unmapped CID font byte interleaving (e.g. "00i03000G0", "d06000000 0 :0'00500000")
  const zeroRunMatches = clean.match(/(?:[a-zA-Z0-9][0\x00]){4,}|(?:00[A-Za-z0-9]){2,}/g);
  if (zeroRunMatches && zeroRunMatches.length >= 2) {
    return true;
  }

  // 1b. Check for raw CID notation output from pdfjs when font lacks ToUnicode mapping
  const cidNotationMatches = clean.match(/(?:\(?cid:\d+\)?)/gi);
  if (cidNotationMatches && cidNotationMatches.length > 2) {
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
      const pageText = sortAndFormatTextItems(content.items || []);
      if (pageText) {
        fullText += (fullText ? '\n\n--- Page Break ---\n\n' : '') + pageText;
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
