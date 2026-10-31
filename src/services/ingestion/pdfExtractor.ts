/**
 * PDF Document Extractor
 * Extracts text with page boundaries, Unicode ligature handling, and scanned-document detection.
 */

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
  pages: Array<{ pageNumber: number; text: string }>;
  isScannedOrImageOnly: boolean;
  ocrRequired: boolean;
  warnings: string[];
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

  // 1. Try Main-Process Electron PDF Parser
  if (typeof window !== 'undefined' && window.electronAPI?.parsePdf) {
    try {
      const fullText = await window.electronAPI.parsePdf(arrayBuffer);
      if (fullText && fullText.trim()) {
        const rawPages = fullText.split('\n\n--- Page Break ---\n\n');
        const pageItems = rawPages.map((pt, idx) => ({ pageNumber: idx + 1, text: pt.trim() }));
        const cleanFull = fullText.trim();
        const isScanned = cleanFull.length < 50;

        return {
          text: cleanFull,
          pageCount: pageItems.length || 1,
          pages: pageItems,
          isScannedOrImageOnly: isScanned,
          ocrRequired: isScanned,
          warnings: isScanned ? ['PDF appears to be scanned or image-only (insufficient text layer). OCR required.'] : [],
        };
      }
    } catch (err: any) {
      warnings.push(`Electron PDF bridge warning: ${err?.message || err}`);
    }
  }

  // 2. Client-side pdfjs-dist fallback
  try {
    const pdfjs = await import('pdfjs-dist');
    const uint8 = new Uint8Array(arrayBuffer);

    const loadingTask = pdfjs.getDocument({
      data: uint8,
      useSystemFonts: true,
      disableFontFace: true,
    });

    const doc = await loadingTask.promise;
    let combinedText = '';

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageStrings: string[] = [];

      for (const item of textContent.items) {
        if ('str' in item && typeof item.str === 'string') {
          // Normalize ligatures (e.g. fi, fl, ffi)
          const normalized = item.str
            .replace(/\uFB01/g, 'fi')
            .replace(/\uFB02/g, 'fl')
            .replace(/\uFB03/g, 'ffi')
            .replace(/\uFB04/g, 'ffl');
          pageStrings.push(normalized);
        }
      }

      const pageText = pageStrings.join(' ').replace(/\s+/g, ' ').trim();
      pages.push({ pageNumber: i, text: pageText });
      combinedText += pageText + '\n\n';
    }

    const cleanCombined = combinedText.trim();
    const isScanned = cleanCombined.length < 50;
    if (isScanned) {
      warnings.push('Document contains under 50 characters of embedded text. OCR is recommended.');
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
      text: '',
      pageCount: 0,
      pages: [],
      isScannedOrImageOnly: true,
      ocrRequired: true,
      warnings,
    };
  }
}

