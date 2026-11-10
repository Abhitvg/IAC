import { describe, expect, it } from 'vitest';
import {
  MAX_DOCX_ARCHIVE_ENTRIES,
  validateDocxArchive,
} from '../electron/services/docxArchiveLimits';

interface ZipFixtureEntry {
  name: string;
  data?: Buffer;
  method?: 0 | 8;
  uncompressedSize?: number;
}

function createZip(entries: ZipFixtureEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = entry.data || Buffer.alloc(0);
    const method = entry.method || 0;
    const uncompressedSize = entry.uncompressedSize ?? data.byteLength;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt32LE(data.byteLength, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(name.byteLength, 26);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt32LE(data.byteLength, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(name.byteLength, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);

    localOffset += localHeader.byteLength + name.byteLength + data.byteLength;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.byteLength, 12);
  endOfCentralDirectory.writeUInt32LE(localOffset, 16);

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
}

function requiredDocxEntries(): ZipFixtureEntry[] {
  return [
    { name: '[Content_Types].xml', data: Buffer.from('<Types/>') },
    { name: 'word/document.xml', data: Buffer.from('<document/>') },
  ];
}

describe('validateDocxArchive', () => {
  it('accepts a structurally valid DOCX ZIP archive', () => {
    expect(validateDocxArchive(createZip(requiredDocxEntries()))).toEqual({ allowed: true });
  });

  it('rejects malformed and non-DOCX ZIP payloads', () => {
    expect(validateDocxArchive(Buffer.from('not a zip')).allowed).toBe(false);
    expect(validateDocxArchive(createZip([{ name: 'readme.txt', data: Buffer.from('hello') }])).reason)
      .toContain('not a valid DOCX');
  });

  it('rejects archives with excessive entry counts', () => {
    const entries = [
      ...requiredDocxEntries(),
      ...Array.from({ length: MAX_DOCX_ARCHIVE_ENTRIES }, (_, index) => ({
        name: `word/media/image-${index}.png`,
      })),
    ];

    expect(validateDocxArchive(createZip(entries)).reason).toContain('maximum');
  });

  it('rejects entries with excessive compression ratios', () => {
    const entries = [
      ...requiredDocxEntries(),
      {
        name: 'word/document.xml',
        data: Buffer.from('x'),
        method: 8 as const,
        uncompressedSize: 101,
      },
    ];

    expect(validateDocxArchive(createZip(entries)).reason).toContain('compression ratio');
  });

  it('rejects archives whose total uncompressed size exceeds the configured limit', () => {
    const entries = [
      ...requiredDocxEntries(),
      ...Array.from({ length: 4 }, (_, index) => ({
        name: `word/media/image-${index}.bin`,
        data: Buffer.alloc(300_000),
        method: 8 as const,
        uncompressedSize: 20 * 1024 * 1024,
      })),
    ];

    expect(validateDocxArchive(createZip(entries)).reason).toContain('uncompressed document size');
  });

  it('rejects ZIP64 archives', () => {
    const archive = createZip(requiredDocxEntries());
    const eocdOffset = archive.length - 22;
    archive.writeUInt16LE(0xffff, eocdOffset + 10);

    expect(validateDocxArchive(archive).reason).toContain('ZIP64');
  });
});
