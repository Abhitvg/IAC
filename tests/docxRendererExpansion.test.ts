import { deflateRawSync } from 'zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateDocxArchiveExpansionInBrowser } from '../src/services/ingestion/docxArchiveExpansion';

function asArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('renderer DOCX expansion validation', () => {
  it('accepts DEFLATE entries whose actual output matches the declared size', async () => {
    const documentXml = Buffer.from('<document>bounded content</document>');
    const compressed = deflateRawSync(documentXml);
    const input = asArrayBuffer(compressed);

    await expect(
      validateDocxArchiveExpansionInBrowser(input, [
        {
          compressionMethod: 8,
          compressedSize: compressed.byteLength,
          uncompressedSize: documentXml.byteLength,
          dataOffset: 0,
        },
      ])
    ).resolves.toEqual({ allowed: true });
  });

  it('rejects forged metadata when actual DEFLATE output exceeds the declared size', async () => {
    const actualContent = Buffer.alloc(1024, 0x41);
    const compressed = deflateRawSync(actualContent);
    const result = await validateDocxArchiveExpansionInBrowser(asArrayBuffer(compressed), [
      {
        compressionMethod: 8,
        compressedSize: compressed.byteLength,
        uncompressedSize: 1,
        dataOffset: 0,
      },
    ]);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('does not match');
  });

  it('rejects corrupt DEFLATE data before Mammoth can parse it', async () => {
    const corrupt = Buffer.from([0xff, 0xff, 0xff, 0xff]);
    const result = await validateDocxArchiveExpansionInBrowser(asArrayBuffer(corrupt), [
      {
        compressionMethod: 8,
        compressedSize: corrupt.byteLength,
        uncompressedSize: 4,
        dataOffset: 0,
      },
    ]);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('DEFLATE');
  });

  it('rejects invalid compressed-data offsets', async () => {
    const input = new ArrayBuffer(8);
    const result = await validateDocxArchiveExpansionInBrowser(input, [
      {
        compressionMethod: 8,
        compressedSize: 8,
        uncompressedSize: 8,
        dataOffset: 1,
      },
    ]);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('bounds');
  });

  it('fails closed when browser decompression is unavailable', async () => {
    vi.stubGlobal('DecompressionStream', undefined);
    const input = new ArrayBuffer(8);
    const result = await validateDocxArchiveExpansionInBrowser(input, []);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('cannot safely validate');
  });

  it('rejects unsupported compression methods', async () => {
    const input = new ArrayBuffer(8);
    const result = await validateDocxArchiveExpansionInBrowser(input, [
      {
        compressionMethod: 12,
        compressedSize: 8,
        uncompressedSize: 8,
        dataOffset: 0,
      },
    ]);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('unsupported compression');
  });
});
