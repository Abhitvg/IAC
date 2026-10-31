/* eslint-disable no-control-regex */
/**
 * PDF Document Extractor
 * Extracts text with page boundaries, Unicode ligature handling, CMap support,
 * and scanned / corrupt mojibake document detection.
 */

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
  pages: Array<{ pageNumber: number; text: string }>;
  isScannedOrImageOnly: boolean;
  ocrRequired: boolean;
  warnings: string[];
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

  // 1. Try Main-Process Electron PDF Parser (has full Node/native access to CMap and macOS Vision OCR)
  if (typeof window !== 'undefined' && window.electronAPI?.parsePdf) {
    try {
      const fullText = await window.electronAPI.parsePdf(arrayBuffer);
      if (fullText && fullText.trim()) {
        const cleanFull = fullText.trim();
        const isGarbled = isGarbledOrMojibakeText(cleanFull);

        if (!isGarbled && !cleanFull.startsWith('Could not extract readable text')) {
          const rawPages = cleanFull.split('\n\n--- Page Break ---\n\n');
          const pageItems = rawPages.map((pt, idx) => ({ pageNumber: idx + 1, text: pt.trim() }));

          return {
            text: cleanFull,
            pageCount: pageItems.length || 1,
            pages: pageItems,
            isScannedOrImageOnly: false,
            ocrRequired: false,
            warnings: [],
          };
        } else {
          warnings.push('PDF appears to have an unreadable, scanned, or corrupt font text layer. OCR required.');
        }
      }
    } catch (err: any) {
      warnings.push(`Electron PDF bridge warning: ${err?.message || err}`);
    }
  }

  // 2. Client-side pdfjs-dist fallback
  try {
    const pdfjs = await import('pdfjs-dist');
    const uint8 = new Uint8Array(arrayBuffer);

    if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version || '4.0.379'}/pdf.worker.min.mjs`;
    }

    const loadingTask = pdfjs.getDocument({
      data: uint8,
      useSystemFonts: true,
      disableFontFace: false, // Ensure font face parsing is enabled
      cMapPacked: true,
    });

    const doc = await loadingTask.promise;
    let combinedText = '';

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageStrings: string[] = [];

      for (const item of textContent.items) {
        if ('str' in item && typeof item.str === 'string') {
          // Normalize ligatures (e.g. fi, fl, ffi) and strip control characters
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
      pages.push({ pageNumber: i, text: pageText });
      combinedText += pageText + '\n\n';
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
        isScannedOrImageOnly: true,
        ocrRequired: true,
        warnings,
      };
    }

    return {
      text: cleanCombined,
      pageCount: doc.numPages,
      pages,
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
  }
}
