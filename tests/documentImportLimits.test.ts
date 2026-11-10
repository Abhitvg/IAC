import { describe, expect, it } from 'vitest';
import {
  MAX_DOCUMENT_IMPORT_SIZE_BYTES,
  validateDocumentImportSize,
} from '../electron/services/documentImportLimits';

describe('validateDocumentImportSize', () => {
  it('accepts positive document sizes up to the configured limit', () => {
    expect(validateDocumentImportSize(1)).toEqual({ allowed: true });
    expect(validateDocumentImportSize(MAX_DOCUMENT_IMPORT_SIZE_BYTES)).toEqual({
      allowed: true,
    });
  });

  it('rejects empty, negative, non-integer, and non-finite sizes', () => {
    for (const size of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1024', null]) {
      expect(validateDocumentImportSize(size).allowed).toBe(false);
    }
  });

  it('rejects buffers larger than the configured 25 MB import limit', () => {
    const result = validateDocumentImportSize(MAX_DOCUMENT_IMPORT_SIZE_BYTES + 1);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('maximum import size');
  });
});
