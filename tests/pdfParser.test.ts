import { describe, it, expect } from 'vitest';
import { parsePdfBuffer } from '../electron/services/pdfParser';

describe('pdfParser', () => {
  it('returns empty string gracefully for invalid or empty buffer', async () => {
    const emptyBuffer = new ArrayBuffer(0);
    const result = await parsePdfBuffer(emptyBuffer);
    expect(result).toBe('');
  });

  it('returns empty string for non-pdf random bytes', async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6]).buffer;
    const result = await parsePdfBuffer(garbage);
    expect(result).toBe('');
  });

  it('correctly extracts text from valid PDF buffer', async () => {
    const minimalPdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 72 712 Td (Candidate Resume Text 2026) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n0000000195 00000 n \ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n289\n%%EOF';
    const buffer = Buffer.from(minimalPdf);
    const result = await parsePdfBuffer(buffer.buffer);
    expect(result).toContain('Candidate Resume Text 2026');
  });
});
