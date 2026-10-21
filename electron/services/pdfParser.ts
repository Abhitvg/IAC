/**
 * Modern, robust PDF text extraction using pdfjs-dist with fallback to pdf-parse.
 * Handles complex multi-column resumes, Unicode character sets, and nested text blocks.
 */
export async function parsePdfBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  const copy = arrayBuffer.slice(0);
  const buffer = new Uint8Array(copy);

  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
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

    const clean = fullText.trim();
    if (clean.length > 0) {
      return clean;
    }
  } catch (err) {
    console.warn('[PDFParser] pdfjs-dist extraction failed, trying pdf-parse fallback:', err);
  }

  // Secondary fallback to pdf-parse
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(Buffer.from(arrayBuffer.slice(0)));
    return (data.text || '').trim();
  } catch (fallbackErr) {
    console.error('[PDFParser] pdf-parse fallback also failed:', fallbackErr);
    return '';
  }
}
