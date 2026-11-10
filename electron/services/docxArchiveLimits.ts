import { validateDocumentImportSize } from './documentImportLimits';

export const MAX_DOCX_ARCHIVE_ENTRIES = 512;
export const MAX_DOCX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
export const MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
export const MAX_DOCX_COMPRESSION_RATIO = 100;

export interface DocxArchiveValidation {
  allowed: boolean;
  reason?: string;
}

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP64_EXTRA_FIELD_ID = 0x0001;

function hasZip64ExtraField(view: DataView, start: number, length: number): boolean {
  const end = start + length;
  let offset = start;

  while (offset + 4 <= end) {
    const fieldId = view.getUint16(offset, true);
    const fieldLength = view.getUint16(offset + 2, true);
    offset += 4;

    if (offset + fieldLength > end) return true;
    if (fieldId === ZIP64_EXTRA_FIELD_ID) return true;

    offset += fieldLength;
  }

  return offset !== end;
}

/**
 * Inspect ZIP central-directory metadata before Mammoth can decompress DOCX entries.
 * The limits apply to both Electron main-process parsing and renderer fallbacks.
 */
export function validateDocxArchive(
  input: ArrayBuffer | Uint8Array
): DocxArchiveValidation {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const sizeValidation = validateDocumentImportSize(bytes.byteLength);

  if (!sizeValidation.allowed) {
    return {
      allowed: false,
      reason: sizeValidation.reason || 'DOCX import size is invalid.',
    };
  }

  if (bytes.byteLength < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return { allowed: false, reason: 'Invalid DOCX ZIP archive.' };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimumEocdOffset = Math.max(0, bytes.byteLength - 22 - 0xffff);
  let eocdOffset = -1;

  for (let offset = bytes.byteLength - 22; offset >= minimumEocdOffset; offset--) {
    if (
      view.getUint32(offset, true) === EOCD_SIGNATURE &&
      offset + 22 + view.getUint16(offset + 20, true) === bytes.byteLength
    ) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset < 0) {
    return { allowed: false, reason: 'DOCX archive is missing a valid ZIP directory.' };
  }

  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const centralDirectoryDisk = view.getUint16(eocdOffset + 6, true);
  const entriesOnDisk = view.getUint16(eocdOffset + 8, true);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);

  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== totalEntries
  ) {
    return { allowed: false, reason: 'Multi-disk DOCX archives are not supported.' };
  }

  if (
    totalEntries === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff ||
    (eocdOffset >= 20 &&
      view.getUint32(eocdOffset - 20, true) === ZIP64_EOCD_LOCATOR_SIGNATURE)
  ) {
    return { allowed: false, reason: 'ZIP64 DOCX archives are not supported.' };
  }

  if (totalEntries === 0 || totalEntries > MAX_DOCX_ARCHIVE_ENTRIES) {
    return {
      allowed: false,
      reason: `DOCX archive exceeds the maximum of ${MAX_DOCX_ARCHIVE_ENTRIES} entries.`,
    };
  }

  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (
    centralDirectoryOffset < 4 ||
    centralDirectoryEnd > eocdOffset ||
    centralDirectoryEnd > bytes.byteLength
  ) {
    return { allowed: false, reason: 'DOCX archive has an invalid central directory.' };
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entryNames = new Set<string>();
  let totalUncompressedBytes = 0;
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index++) {
    if (
      cursor + 46 > centralDirectoryEnd ||
      view.getUint32(cursor, true) !== CENTRAL_DIRECTORY_SIGNATURE
    ) {
      return { allowed: false, reason: 'DOCX archive contains a malformed directory entry.' };
    }

    const flags = view.getUint16(cursor + 8, true);
    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraFieldLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const diskStart = view.getUint16(cursor + 34, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const entryEnd = cursor + 46 + fileNameLength + extraFieldLength + commentLength;

    if (
      entryEnd > centralDirectoryEnd ||
      fileNameLength === 0 ||
      fileNameLength > 1024 ||
      diskStart !== 0 ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      return { allowed: false, reason: 'DOCX archive contains an invalid or ZIP64 entry.' };
    }

    if ((flags & 0x0001) !== 0) {
      return { allowed: false, reason: 'Encrypted DOCX entries are not supported.' };
    }

    if (compressionMethod !== 0 && compressionMethod !== 8) {
      return { allowed: false, reason: 'DOCX archive uses an unsupported compression method.' };
    }

    const nameStart = cursor + 46;
    const extraStart = nameStart + fileNameLength;
    if (hasZip64ExtraField(view, extraStart, extraFieldLength)) {
      return { allowed: false, reason: 'ZIP64 DOCX entries are not supported.' };
    }

    let entryName: string;
    try {
      entryName = decoder.decode(bytes.subarray(nameStart, nameStart + fileNameLength));
    } catch {
      return { allowed: false, reason: 'DOCX archive contains an invalid entry name.' };
    }

    if (entryNames.has(entryName)) {
      return { allowed: false, reason: 'DOCX archive contains duplicate entry names.' };
    }
    entryNames.add(entryName);

    if (
      uncompressedSize > MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES ||
      totalUncompressedBytes + uncompressedSize > MAX_DOCX_UNCOMPRESSED_BYTES
    ) {
      return {
        allowed: false,
        reason: 'DOCX archive exceeds the maximum uncompressed document size.',
      };
    }

    if (
      (uncompressedSize > 0 && compressedSize === 0) ||
      (compressedSize > 0 && uncompressedSize / compressedSize > MAX_DOCX_COMPRESSION_RATIO) ||
      (compressionMethod === 0 && compressedSize !== uncompressedSize)
    ) {
      return {
        allowed: false,
        reason: `DOCX entry exceeds the maximum compression ratio of ${MAX_DOCX_COMPRESSION_RATIO}:1.`,
      };
    }

    if (
      localHeaderOffset + 30 > centralDirectoryOffset ||
      view.getUint32(localHeaderOffset, true) !== LOCAL_FILE_HEADER_SIGNATURE
    ) {
      return { allowed: false, reason: 'DOCX archive contains an invalid local file header.' };
    }

    const localFlags = view.getUint16(localHeaderOffset + 6, true);
    const localMethod = view.getUint16(localHeaderOffset + 8, true);
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const localNameStart = localHeaderOffset + 30;
    const localExtraStart = localNameStart + localNameLength;
    const dataStart = localExtraStart + localExtraLength;

    if (
      localFlags !== flags ||
      localMethod !== compressionMethod ||
      localNameLength !== fileNameLength ||
      dataStart > centralDirectoryOffset ||
      compressedSize > centralDirectoryOffset - dataStart ||
      hasZip64ExtraField(view, localExtraStart, localExtraLength)
    ) {
      return { allowed: false, reason: 'DOCX archive contains inconsistent ZIP entry metadata.' };
    }

    for (let nameIndex = 0; nameIndex < fileNameLength; nameIndex++) {
      if (bytes[localNameStart + nameIndex] !== bytes[nameStart + nameIndex]) {
        return { allowed: false, reason: 'DOCX archive contains mismatched entry names.' };
      }
    }

    totalUncompressedBytes += uncompressedSize;
    cursor = entryEnd;
  }

  if (cursor !== centralDirectoryEnd) {
    return { allowed: false, reason: 'DOCX archive has trailing central-directory data.' };
  }

  if (!entryNames.has('[Content_Types].xml') || !entryNames.has('word/document.xml')) {
    return { allowed: false, reason: 'ZIP archive is not a valid DOCX document.' };
  }

  return { allowed: true };
}
