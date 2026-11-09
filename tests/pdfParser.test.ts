import { describe, it, expect } from 'vitest';
import { parsePdfBuffer, toPdfJsNodeDirectoryPath } from '../electron/services/pdfParser';
import { createTextPdf } from './helpers/pdfFixtures';

describe('pdfParser', { timeout: 35000 }, () => {
  it('normalizes Node resource directories for Windows and POSIX PDF.js readers', () => {
    expect(
      toPdfJsNodeDirectoryPath('C:\\Users\\runner\\app\\node_modules\\pdfjs-dist\\standard_fonts')
    ).toBe('C:/Users/runner/app/node_modules/pdfjs-dist/standard_fonts/');
    expect(toPdfJsNodeDirectoryPath('/opt/app/node_modules/pdfjs-dist/cmaps/')).toBe(
      '/opt/app/node_modules/pdfjs-dist/cmaps/'
    );
  });

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
    const buffer = createTextPdf(['Candidate Resume Text 2026']);
    const result = await parsePdfBuffer(buffer);
    expect(result).toContain('Candidate Resume Text 2026');
  });
});
