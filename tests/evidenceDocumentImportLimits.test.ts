import { describe, expect, it } from 'vitest';
import { inspectEvidenceDocument } from '../electron/services/boundedEvidenceInspection';
import { MAX_DOCUMENT_IMPORT_SIZE_BYTES } from '../electron/services/documentImportLimits';

describe('Evidence document import size limits', () => {
  const request = (documentBytes: string | Uint8Array | ArrayBuffer) => ({
    documentBytes,
    documentType: 'publication' as const,
    issuer: {
      name: 'Test Publisher',
      authorityLevel: 'peer_reviewed_publisher' as const,
    },
    candidateIdentity: {
      fullName: 'Test Candidate',
    },
    targetProjectName: 'Test Project',
  });

  it('rejects oversized Uint8Array payloads before document parsing or hashing', () => {
    const payload = new Uint8Array(MAX_DOCUMENT_IMPORT_SIZE_BYTES + 1);

    expect(() => inspectEvidenceDocument(request(payload))).toThrow(
      'maximum import size'
    );
  });

  it('rejects oversized ArrayBuffer payloads before creating a byte view', () => {
    const payload = new ArrayBuffer(MAX_DOCUMENT_IMPORT_SIZE_BYTES + 1);

    expect(() => EvidenceVerificationService.inspectDocument(request(payload))).toThrow(
      'maximum import size'
    );
  });

  it('checks UTF-8 byte length before allocating a Buffer for string payloads', () => {
    const payload = 'x'.repeat(MAX_DOCUMENT_IMPORT_SIZE_BYTES + 1);

    expect(() => EvidenceVerificationService.inspectDocument(request(payload))).toThrow(
      'maximum import size'
    );
  });
});
