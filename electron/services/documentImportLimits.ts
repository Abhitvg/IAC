export const MAX_DOCUMENT_IMPORT_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_PDF_PAGE_COUNT = 100;

export interface DocumentImportSizeValidation {
  allowed: boolean;
  reason?: string;
}

/** Bound renderer-supplied document buffers before parsers allocate or decode them. */
export function validateDocumentImportSize(
  byteLength: unknown
): DocumentImportSizeValidation {
  if (
    typeof byteLength !== 'number' ||
    !Number.isSafeInteger(byteLength) ||
    byteLength <= 0
  ) {
    return {
      allowed: false,
      reason: 'Document import must contain a non-empty valid byte buffer.',
    };
  }

  if (byteLength > MAX_DOCUMENT_IMPORT_SIZE_BYTES) {
    return {
      allowed: false,
      reason: `Document exceeds maximum import size of ${MAX_DOCUMENT_IMPORT_SIZE_BYTES} bytes.`,
    };
  }

  return { allowed: true };
}

/** Prevent unbounded page-by-page PDF extraction and OCR work. */
export function validatePdfPageCount(
  pageCount: unknown
): DocumentImportSizeValidation {
  if (
    typeof pageCount !== 'number' ||
    !Number.isSafeInteger(pageCount) ||
    pageCount <= 0
  ) {
    return {
      allowed: false,
      reason: 'PDF must contain a valid positive page count.',
    };
  }

  if (pageCount > MAX_PDF_PAGE_COUNT) {
    return {
      allowed: false,
      reason: `PDF exceeds maximum supported page count of ${MAX_PDF_PAGE_COUNT} pages.`,
    };
  }

  return { allowed: true };
}
