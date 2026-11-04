/**
 * Builds small, structurally valid text PDFs for cross-platform parser tests.
 * This avoids relying on malformed hand-written xref offsets or missing font resources.
 */
export function createTextPdf(pageTexts: string[]): Uint8Array {
  if (pageTexts.length === 0) {
    throw new Error('At least one page of text is required.');
  }

  const fontObjectId = 3 + pageTexts.length * 2;
  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  const pageIds = pageTexts.map((_, index) => 3 + index * 2);
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageTexts.length} >>`;

  pageTexts.forEach((pageText, index) => {
    if (!/^[\x20-\x7E]*$/.test(pageText)) {
      throw new Error('Test PDF helper currently supports printable ASCII text only.');
    }
    const escapedText = pageText.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const contentStream = `BT /F1 12 Tf 72 712 Td (${escapedText}) Tj ET`;

    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] =
      `<< /Length ${Buffer.byteLength(contentStream, 'ascii')} >>\nstream\n${contentStream}\nendstream`;
  });

  objects[fontObjectId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  let pdf = '%PDF-1.4\n';
  const offsets = new Array<number>(fontObjectId + 1).fill(0);
  for (let objectId = 1; objectId <= fontObjectId; objectId += 1) {
    offsets[objectId] = Buffer.byteLength(pdf, 'ascii');
    pdf += `${objectId} 0 obj\n${objects[objectId]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${fontObjectId + 1}\n0000000000 65535 f \n`;
  for (let objectId = 1; objectId <= fontObjectId; objectId += 1) {
    pdf += `${String(offsets[objectId]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${fontObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Uint8Array(Buffer.from(pdf, 'ascii'));
}
