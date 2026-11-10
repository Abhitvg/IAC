import {
  MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES,
  MAX_DOCX_UNCOMPRESSED_BYTES,
  type DocxArchiveEntryMetadata,
} from '../../../electron/services/docxArchiveLimits';

export interface BrowserDocxExpansionValidation {
  allowed: boolean;
  reason?: string;
}

/**
 * Validate actual ZIP entry expansion in browser environments before Mammoth runs.
 * Read decompressed output incrementally so a forged central-directory size cannot
 * cause Mammoth to allocate an unbounded document.
 */
export async function validateDocxArchiveExpansionInBrowser(
  input: ArrayBuffer | Uint8Array,
  entries: DocxArchiveEntryMetadata[]
): Promise<BrowserDocxExpansionValidation> {
  if (typeof DecompressionStream === 'undefined' || typeof Blob === 'undefined') {
    return {
      allowed: false,
      reason: 'This environment cannot safely validate DOCX decompression.',
    };
  }

  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let totalUncompressedBytes = 0;

  for (const entry of entries) {
    if (
      !Number.isSafeInteger(entry.dataOffset) ||
      !Number.isSafeInteger(entry.compressedSize) ||
      entry.dataOffset < 0 ||
      entry.compressedSize < 0 ||
      entry.dataOffset > bytes.byteLength ||
      entry.compressedSize > bytes.byteLength - entry.dataOffset
    ) {
      return { allowed: false, reason: 'DOCX entry has invalid compressed data bounds.' };
    }

    if (entry.compressionMethod === 0) {
      if (entry.compressedSize !== entry.uncompressedSize) {
        return { allowed: false, reason: 'DOCX stored entry has inconsistent size metadata.' };
      }
      totalUncompressedBytes += entry.compressedSize;
    } else if (entry.compressionMethod === 8) {
      const compressedData = bytes.subarray(
        entry.dataOffset,
        entry.dataOffset + entry.compressedSize
      );
      const stream = new Blob([compressedData]).stream().pipeThrough(
        new DecompressionStream('deflate-raw')
      );
      const reader = stream.getReader();
      let entryUncompressedBytes = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          entryUncompressedBytes += value.byteLength;
          totalUncompressedBytes += value.byteLength;

          if (
            entryUncompressedBytes > MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES ||
            totalUncompressedBytes > MAX_DOCX_UNCOMPRESSED_BYTES
          ) {
            await reader.cancel();
            return {
              allowed: false,
              reason: 'DOCX archive exceeds the maximum actual uncompressed size.',
            };
          }
        }
      } catch {
        return {
          allowed: false,
          reason: 'DOCX entry contains invalid or unsafe DEFLATE data.',
        };
      } finally {
        reader.releaseLock();
      }

      if (entryUncompressedBytes !== entry.uncompressedSize) {
        return {
          allowed: false,
          reason: 'DOCX entry expansion does not match its declared uncompressed size.',
        };
      }
    } else {
      return { allowed: false, reason: 'DOCX archive uses an unsupported compression method.' };
    }

    if (totalUncompressedBytes > MAX_DOCX_UNCOMPRESSED_BYTES) {
      return {
        allowed: false,
        reason: 'DOCX archive exceeds the maximum actual uncompressed size.',
      };
    }
  }

  return { allowed: true };
}
