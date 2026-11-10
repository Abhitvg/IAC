import { describe, expect, it } from 'vitest';
import { inspectEvidenceDocument } from '../electron/services/boundedEvidenceInspection';
import { MAX_DOCUMENT_IMPORT_SIZE_BYTES } from '../electron/services/documentImportLimits';
import type { DocumentInspectionRequest } from '../electron/services/evidenceVerificationService';

describe('Evidence document import size limits', () => {
  const request = (
    documentBytes: string | Uint8Array | ArrayBuffer
  ): DocumentInspectionRequest => ({
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

    expect(() => inspectEvidenceDocument(request(payload))).toThrow('maximum import size');
  });

  it('rejects oversized ArrayBuffer payloads before creating a byte view', () => {
    const payload = new ArrayBuffer(MAX_DOCUMENT_IMPORT_SIZE_BYTES + 1);

    expect(() => inspectEvidenceDocument(request(payload))).toThrow('maximum import size');
  });

  it('checks UTF-8 byte length before allocating a Buffer for string payloads', () => {
    const payload = 'x'.repeat(MAX_DOCUMENT_IMPORT_SIZE_BYTES + 1);

    expect(() => inspectEvidenceDocument(request(payload))).toThrow('maximum import size');
  });

  it('rejects oversized signature metadata before cryptographic verification', () => {
    const payload = request(new Uint8Array(16));
    payload.issuer.signatureHex = 'a'.repeat(8194);

    expect(() => inspectEvidenceDocument(payload)).toThrow('issuer.signatureHex');
  });

  it('rejects oversized candidate identity metadata before document inspection', () => {
    const payload = request(new Uint8Array(16));
    payload.candidateIdentity.fullName = 'x'.repeat(257);

    expect(() => inspectEvidenceDocument(payload)).toThrow('candidateIdentity.fullName');
  });

  it('rejects empty and unsupported document payloads', () => {
    expect(() => inspectEvidenceDocument(request(''))).toThrow('non-empty valid byte buffer');
    expect(() => inspectEvidenceDocument({ documentBytes: {} } as never)).toThrow(
      'non-empty valid byte buffer'
    );
  });
});
