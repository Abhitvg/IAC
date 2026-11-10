import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectEvidenceDocument } from '../electron/services/boundedEvidenceInspection';
import { MAX_DOCUMENT_IMPORT_SIZE_BYTES } from '../electron/services/documentImportLimits';
import {
  EvidenceVerificationService,
  type DocumentInspectionRequest,
  type ImmutableDocumentInspectionResult,
} from '../electron/services/evidenceVerificationService';

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('caps returned performance metrics without invalidating the document seal', () => {
    const result = {
      inspectionId: 'inspection-123',
      inspectedAt: Date.now(),
      documentId: 'document-123',
      documentType: 'publication',
      documentSha256: 'a'.repeat(64),
      documentByteLength: 16,
      issuerName: 'Test Publisher',
      issuerValidated: false,
      authenticityStatus: 'UNAUTHENTICATED_CONTENT',
      candidateMentioned: true,
      projectMentioned: true,
      personalWorkAttested: false,
      evidenceModality: 'UNAUTHENTICATED_BYTE_INSPECTED',
      supportedFields: {
        performanceMetrics: Array.from({ length: 101 }, (_, index) => `metric ${index}`),
      },
      __documentSeal: 'b'.repeat(64),
    } as ImmutableDocumentInspectionResult;
    vi.spyOn(EvidenceVerificationService, 'inspectDocument').mockReturnValue(result);

    const inspected = inspectEvidenceDocument(request(new Uint8Array(16)));

    expect(inspected.supportedFields.performanceMetrics).toHaveLength(100);
    expect(inspected.__documentSeal).toBe(result.__documentSeal);
  });

  it('rejects empty and unsupported document payloads', () => {
    expect(() => inspectEvidenceDocument(request(''))).toThrow('non-empty valid byte buffer');
    expect(() => inspectEvidenceDocument({ documentBytes: {} } as never)).toThrow(
      'non-empty valid byte buffer'
    );
  });
});
