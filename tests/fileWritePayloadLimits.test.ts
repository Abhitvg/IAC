import { describe, expect, it } from 'vitest';
import { MAX_WRITE_FILE_SIZE_BYTES, prepareFileWritePayload } from '../electron/services/security';

describe('IPC file-write payload normalization', () => {
  it('measures UTF-8 string bytes rather than JavaScript characters', () => {
    const prepared = prepareFileWritePayload('€');

    expect(prepared.byteLength).toBe(3);
    expect(prepared.payload).toBe('€');
  });

  it('measures ArrayBuffer payloads exactly', () => {
    const prepared = prepareFileWritePayload(new ArrayBuffer(17));

    expect(prepared.byteLength).toBe(17);
    expect(Buffer.isBuffer(prepared.payload)).toBe(true);
    expect((prepared.payload as Buffer).byteLength).toBe(17);
  });

  it('measures Uint8Array payloads instead of treating them as zero bytes', () => {
    const payload = new Uint8Array(MAX_WRITE_FILE_SIZE_BYTES + 1);
    const prepared = prepareFileWritePayload(payload);

    expect(prepared.byteLength).toBe(MAX_WRITE_FILE_SIZE_BYTES + 1);
    expect(Buffer.isBuffer(prepared.payload)).toBe(true);
    expect((prepared.payload as Buffer).byteLength).toBe(MAX_WRITE_FILE_SIZE_BYTES + 1);
  });

  it('preserves the byte offset and length of typed-array views', () => {
    const backing = new Uint8Array([10, 20, 30, 40, 50]);
    const view = new Uint8Array(backing.buffer, 1, 3);
    const prepared = prepareFileWritePayload(view);

    expect(prepared.byteLength).toBe(3);
    expect(Array.from(prepared.payload as Buffer)).toEqual([20, 30, 40]);
  });

  it('supports Buffer and DataView values transferred over IPC', () => {
    const bufferPrepared = prepareFileWritePayload(Buffer.from([1, 2, 3]));
    const dataViewPrepared = prepareFileWritePayload(
      new DataView(new Uint8Array([4, 5, 6, 7]).buffer, 1, 2)
    );

    expect(bufferPrepared.byteLength).toBe(3);
    expect(Array.from(bufferPrepared.payload as Buffer)).toEqual([1, 2, 3]);
    expect(dataViewPrepared.byteLength).toBe(2);
    expect(Array.from(dataViewPrepared.payload as Buffer)).toEqual([5, 6]);
  });

  it('rejects unsupported payloads instead of silently assigning zero bytes', () => {
    expect(() => prepareFileWritePayload({ byteLength: 50_000_000 })).toThrow(
      'expected a string or binary data'
    );
    expect(() => prepareFileWritePayload(null)).toThrow('expected a string or binary data');
  });
});
