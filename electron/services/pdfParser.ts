import path from 'path';
import fs from 'fs';

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

export async function parsePdfBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    return '';
  }

  const copy = arrayBuffer.slice(0);
  const buffer = new Uint8Array(copy);

  try {
    let pdfjs: any;
    try {
      // Use native dynamic import() via Function constructor so TypeScript CommonJS compilation
      // does not transpile this into require(), which fails in Electron Node runtime with ERR_REQUIRE_ESM
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      pdfjs = await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
    } catch {
      try {
        // Fallback for environments with standard ESM or Vitest VM
        pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      } catch {
        // Fallback for standard CommonJS if supported
        pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
      }
    }
    
    // Explicitly configure workerSrc to prevent worker resolution failure in bundled Electron
    const workerPath = resolveWorkerSrc();
    if (workerPath && pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = workerPath;
    }

    const loadingTask = pdfjs.getDocument({
      data: buffer,
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
          pageStrings.push(item.str);
        }
      }

      fullText += pageStrings.join(' ') + '\n\n';
    }

    return fullText.trim();
  } catch (err) {
    console.warn('[PDFParser] pdfjs-dist extraction failed or invalid PDF structure:', err);
    return '';
  }
}
