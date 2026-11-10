import { inflateRawSync } from 'zlib';
import {
  MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES,
  MAX_DOCX_UNCOMPRESSED_BYTES,
  type DocxArchiveEntryMetadata,
} from './docxArchiveLimits';

export interface DocxArchiveExpansionValidation {
  allowed: boolean;
  reason?: string;
}

/**
 * Verify actual DEFLATE output sizes in the privileged Node process.
 * Central-directory metadata alone is not sufficient against forged ZIP size fields.
 */
export function validateDocxArchiveExpansion(
  input: ArrayBuffer | Uint8Array,
  entries: DocxArchiveEntryMetadata[]
): DocxArchiveExpansionValidation {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let totalUncompressedBytes = 0;

  for (const entry of entries) {
    if (entry.compressionMethod === 0) {
      if (entry.compressedSize !== entry.uncompressedSize) {
        return { allowed: false, reason: 'DOCX stored entry has inconsistent size metadata.' };
      }
      totalUncompressedBytes += entry.compressedSize;
    } else if (entry.compressionMethod === 8) {
      try {
        const compressedData = buffer.subarray(
          entry.dataOffset,
          entry.dataOffset + entry.compressedSize
        );
        const inflated = inflateRawSync(compressedData, {
          maxOutputLength: MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES,
        });

        if (inflated.byteLength !== entry.uncompressedSize) {
          return {
            allowed: false,
            reason: 'DOCX entry expansion does not match its declared uncompressed size.',
          };
        }

        totalUncompressedBytes += inflated.byteLength;
      } catch {
        return {
          allowed: false,
          reason: 'DOCX entry exceeded safe decompression limits or contains corrupt DEFLATE data.',
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
