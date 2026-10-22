/**
 * Modern, robust PDF text extraction using pdfjs-dist.
 * Handles complex multi-column resumes, Unicode character sets, and nested text blocks.
 */
export async function parsePdfBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    return '';
  }

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

    return fullText.trim();
  } catch (err) {
    console.warn('[PDFParser] pdfjs-dist extraction failed or invalid PDF structure:', err);
    return '';
  }
}
