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
});
