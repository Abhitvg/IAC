import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractPdfDocument } from '../src/services/ingestion/pdfExtractor';
import { createTextPdf } from './helpers/pdfFixtures';

const { getDocument } = vi.hoisted(() => ({
  getDocument: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe('renderer PDF extraction limits', () => {
  it('rejects PDFs above the page limit before extracting any page', async () => {
    const getPage = vi.fn();
    const destroy = vi.fn().mockResolvedValue(undefined);
    getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 101, getPage }),
      destroy,
    });

    const pdf = toArrayBuffer(createTextPdf(['page text']));

    const result = await extractPdfDocument(pdf);

    expect(result.text).toBe('');
    expect(result.pageCount).toBe(101);
    expect(result.pages).toEqual([]);
    expect(result.warnings.join(' ')).toContain('maximum supported page count');
    expect(getPage).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('does not treat the main-process page-limit error as extracted resume text', async () => {
    const parsePdf = vi
      .fn()
      .mockResolvedValue('PDF exceeds the maximum supported page count of 100 pages.');
    vi.stubGlobal('window', {
      electronAPI: { parsePdf },
    });

    const result = await extractPdfDocument(new ArrayBuffer(64));

    expect(result.text).toBe('');
    expect(result.pages).toEqual([]);
    expect(result.warnings).toContain('PDF exceeds the maximum supported page count of 100 pages.');
    expect(parsePdf).toHaveBeenCalledOnce();
    expect(getDocument).not.toHaveBeenCalled();
  });

  it('rejects oversized PDF buffers before calling either parser', async () => {
    const pdf = new ArrayBuffer(25 * 1024 * 1024 + 1);
    const result = await extractPdfDocument(pdf);

    expect(result.text).toBe('');
    expect(result.warnings.join(' ')).toContain('maximum import size');
    expect(getDocument).not.toHaveBeenCalled();
  });
});
