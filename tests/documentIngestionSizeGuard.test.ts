import { describe, expect, it, vi } from 'vitest';
import { MAX_DOCUMENT_IMPORT_SIZE_BYTES } from '../electron/services/documentImportLimits';
import { DocumentIngestionService } from '../src/services/ingestion/documentIngestionService';

describe('DocumentIngestionService file-size guard', () => {
  it('rejects oversized files before allocating their ArrayBuffer', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const file = {
      name: 'oversized-resume.txt',
      size: MAX_DOCUMENT_IMPORT_SIZE_BYTES + 1,
      arrayBuffer,
    } as unknown as File;

    await expect(DocumentIngestionService.ingestFile(file)).rejects.toThrow(
      'maximum import size'
    );
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
