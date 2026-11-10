/* eslint-disable no-control-regex */
/**
 * PDF Document Extractor
 * Extracts text with page boundaries, Unicode ligature handling, CMap support,
 * and scanned / corrupt mojibake document detection.
 */

import { PageDiagnostic } from './types';
import {
  validateDocumentImportSize,
  validatePdfPageCount,
} from '../../../electron/services/documentImportLimits';

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
  pages: Array<{ pageNumber: number; text: string }>;
  pageDiagnostics?: PageDiagnostic[];
  isScannedOrImageOnly: boolean;
  ocrRequired: boolean;
  warnings: string[];
}

export interface ExtractedClientPdfItem {
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
  const items: ExtractedClientPdfItem[] = [];

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

  const formatLineCluster = (clusterItems: ExtractedClientPdfItem[]): string => {
    const lines: Array<{ y: number; items: ExtractedClientPdfItem[] }> = [];
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
        return line.items
          .map((it) => it.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      })
      .filter((l) => l.length > 0)
      .join('\n');
  };

  let bestSplitX: number | null = null;
  let maxColumnScore = 0;

  if (pageWidth > 150 && items.length > 15) {
    const step = pageWidth / 40;
    for (
      let candidateX = minX + 0.25 * pageWidth;
      candidateX <= minX + 0.7 * pageWidth;
      candidateX += step
    ) {
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
        const score = leftCount + rightCount - crossingCount * 2.5;
        if (score > maxColumnScore) {
          maxColumnScore = score;
          bestSplitX = candidateX;
        }
      }
    }
  }

  if (bestSplitX !== null && maxColumnScore > items.length * 0.35) {
    const splitX = bestSplitX;

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

    const headerItems: ExtractedClientPdfItem[] = [];
    const col1Items: ExtractedClientPdfItem[] = [];
    const col2Items: ExtractedClientPdfItem[] = [];

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

  return formatLineCluster(items);
}

/**
 * Checks if extracted text is corrupt, unmapped glyph mojibake, or unreadable binary.
 */
export function isGarbledOrMojibakeText(text: string): boolean {
  if (!text || text.trim().length === 0) return true;
  const clean = text.trim();
  if (clean.length < 50) return true;

  // Check for high density of null bytes or repeated 00/0 interleaving (e.g. "00i03000G0", "d06000000 0 :0'00500000")
  const zeroRunMatches = clean.match(/(?:[a-zA-Z0-9][0\x00]){4,}|(?:00[A-Za-z0-9]){3,}/g);
  if (zeroRunMatches && zeroRunMatches.length > 3) {
    return true;
  }

  // Count recognizable words
  const words = clean.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length < 5) return true;

  const recognizableWords = words.filter(
    (w) => /[aeiouyAEIOUY]/.test(w) && !/[^\x20-\x7E\u00A0-\u024F]/.test(w)
  );
  const recognizableRatio = recognizableWords.length / words.length;

  if (recognizableRatio < 0.35) {
    return true;
  }

  return false;
}

export async function extractPdfDocument(arrayBuffer: ArrayBuffer): Promise<PdfExtractionResult> {
  const warnings: string[] = [];
  const pages: Array<{ pageNumber: number; text: string }> = [];

  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    return {
      text: '',
      pageCount: 0,
      pages: [],
      isScannedOrImageOnly: false,
      ocrRequired: false,
      warnings: ['Received empty PDF buffer.'],
    };
  }

  const sizeValidation = validateDocumentImportSize(arrayBuffer.byteLength);
  if (!sizeValidation.allowed) {
    return {
      text: '',
      pageCount: 0,
      pages: [],
      isScannedOrImageOnly: false,
      ocrRequired: false,
      warnings: [sizeValidation.reason || 'PDF import size is invalid.'],
    };
  }

  // 1. Try Main-Process Electron PDF Parser (has full Node/native access to CMap and macOS Vision OCR)
  if (typeof window !== 'undefined' && window.electronAPI?.parsePdf) {
    try {
      const fullText = await window.electronAPI.parsePdf(arrayBuffer);
      if (fullText && fullText.trim()) {
        const cleanFull = fullText.trim();
        if (cleanFull.startsWith('PDF exceeds the maximum supported page count')) {
          return {
            text: '',
            pageCount: 0,
            pages: [],
            isScannedOrImageOnly: false,
            ocrRequired: false,
            warnings: [cleanFull],
          };
        }
        const isGarbled = isGarbledOrMojibakeText(cleanFull);

        if (!isGarbled && !cleanFull.startsWith('Could not extract readable text')) {
          const rawPages = cleanFull.split('\n\n--- Page Break ---\n\n');
          const pageItems = rawPages.map((pt, idx) => ({ pageNumber: idx + 1, text: pt.trim() }));
          const pageDiagnostics: PageDiagnostic[] = pageItems.map((p) => {
            const words = p.text.split(/\s+/).filter(Boolean);
            return {
              pageNumber: p.pageNumber,
              wordCount: words.length,
              characterCount: p.text.length,
              ocrApplied: false,
              warnings: words.length < 15 ? ['Low word count on page; check if scanned.'] : [],
            };
          });

          return {
            text: cleanFull,
            pageCount: pageItems.length || 1,
            pages: pageItems,
            pageDiagnostics,
            isScannedOrImageOnly: false,
            ocrRequired: false,
            warnings: [],
          };
        } else {
          warnings.push(
            'PDF appears to have an unreadable, scanned, or corrupt font text layer. OCR required.'
          );
        }
      }
    } catch (err: any) {
      warnings.push(`Electron PDF bridge warning: ${err?.message || err}`);
    }
  }

  // 2. Client-side pdfjs-dist fallback
  let loadingTask: any;
  try {
    const pdfjs = await import('pdfjs-dist');
    const uint8 = new Uint8Array(arrayBuffer);

    try {
      if (pdfjs.GlobalWorkerOptions) {
        // Use local packaged worker rather than external CDN for offline desktop reliability
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.mjs',
          import.meta.url
        ).toString();
      }
    } catch {
      if (pdfjs.GlobalWorkerOptions) {
        pdfjs.GlobalWorkerOptions.workerSrc = '';
      }
    }

    loadingTask = pdfjs.getDocument({
      data: uint8,
      useSystemFonts: true,
      disableFontFace: false, // Ensure font face parsing is enabled
      cMapPacked: true,
    });

    const doc = await loadingTask.promise;
    const pageCountValidation = validatePdfPageCount(doc.numPages);
    if (!pageCountValidation.allowed) {
      return {
        text: '',
        pageCount: doc.numPages,
        pages: [],
        isScannedOrImageOnly: false,
        ocrRequired: false,
        warnings: [pageCountValidation.reason || 'PDF page count is invalid.'],
      };
    }

    let combinedText = '';
    const pageDiagnostics: PageDiagnostic[] = [];

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = sortAndFormatTextItems(textContent.items || []);
      const words = pageText.split(/\s+/).filter(Boolean);

      pages.push({ pageNumber: i, text: pageText });
      pageDiagnostics.push({
        pageNumber: i,
        wordCount: words.length,
        characterCount: pageText.length,
        ocrApplied: false,
        warnings: words.length < 15 ? ['Low word count on page; image or scan likely.'] : [],
      });

      if (pageText) {
        combinedText += (combinedText ? '\n\n--- Page Break ---\n\n' : '') + pageText;
      }
    }

    const cleanCombined = combinedText.trim();
    const isGarbled = isGarbledOrMojibakeText(cleanCombined);
    const isScanned = cleanCombined.length < 50 || isGarbled;

    if (isGarbled) {
      warnings.push('Document contains corrupt font or unmapped glyph mojibake. OCR recommended.');
      return {
        text: 'Could not extract readable text from PDF. The document may be image-only, scanned, or use custom encrypted font encodings. Please paste your resume text directly into the editor below or upload as .txt, .md, or .docx.',
        pageCount: doc.numPages,
        pages: [],
        pageDiagnostics,
        isScannedOrImageOnly: true,
        ocrRequired: true,
        warnings,
      };
    }

    return {
      text: cleanCombined,
      pageCount: doc.numPages,
      pages,
      pageDiagnostics,
      isScannedOrImageOnly: isScanned,
      ocrRequired: isScanned,
      warnings,
    };
  } catch (err: any) {
    warnings.push(`Client PDF extraction error: ${err?.message || err}`);
    return {
      text: 'Could not extract readable text from PDF. Please paste your resume text directly into the editor below or upload as .txt, .md, or .docx.',
      pageCount: 0,
      pages: [],
      isScannedOrImageOnly: true,
      ocrRequired: true,
      warnings,
    };
  } finally {
    if (loadingTask) {
      try {
        await loadingTask.destroy();
      } catch {
        // The PDF.js worker may already have been torn down after a parsing failure.
      }
    }
  }
}
