export const MAX_DOCUMENT_IMPORT_SIZE_BYTES = 25 * 1024 * 1024;

export interface DocumentImportSizeValidation {
  allowed: boolean;
  reason?: string;
}

/** Bound renderer-supplied document buffers before parsers allocate or decode them. */
export function validateDocumentImportSize(byteLength: unknown): DocumentImportSizeValidation {
  if (typeof byteLength !== 'number' || !Number.isSafeInteger(byteLength) || byteLength <= 0) {
    return { allowed: false, reason: 'Document import must contain a non-empty valid byte buffer.' };
  }

  if (byteLength > MAX_DOCUMENT_IMPORT_SIZE_BYTES) {
    return {
      allowed: false,
      reason: `Document exceeds the maximum import size of ${MAX_DOCUMENT_IMPORT_SIZE_BYTES} bytes.`,
    };
  }

  return { allowed: true };
}
