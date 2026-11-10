import { describe, expect, it } from 'vitest';
import { verifyEvidenceSeal } from '../electron/services/boundedEvidenceInspection';
import { MAX_DOCUMENT_IMPORT_SIZE_BYTES } from '../electron/services/documentImportLimits';

describe('Evidence seal verification input limits', () => {
  it('rejects repository seals with too many inspected files', () => {
    const result = {
      __inspectionSeal: 'a'.repeat(64),
      inspectionId: 'inspection-123',
      repositoryUrl: 'https://github.com/openai/openai',
      resolvedCommitSha: 'a'.repeat(40),
      treeSha: 'b'.repeat(40),
      inspectedFiles: Array.from({ length: 26 }, () => ({
        path: 'src/index.ts',
        sha256: 'c'.repeat(64),
      })),
      verifiedTechnologies: [],
    };

    expect(verifyEvidenceSeal(result)).toBe(false);
  });

  it('rejects repository seals with oversized technology arrays', () => {
    const result = {
      __inspectionSeal: 'a'.repeat(64),
      inspectionId: 'inspection-123',
      repositoryUrl: 'https://github.com/openai/openai',
      resolvedCommitSha: 'a'.repeat(40),
      treeSha: 'b'.repeat(40),
      inspectedFiles: [],
      verifiedTechnologies: Array.from({ length: 101 }, () => 'typescript'),
    };

    expect(verifyEvidenceSeal(result)).toBe(false);
  });

  it('rejects document seals with oversized document byte lengths', () => {
    const result = {
      __documentSeal: 'a'.repeat(64),
      inspectionId: 'inspection-123',
      documentSha256: 'b'.repeat(64),
      documentByteLength: MAX_DOCUMENT_IMPORT_SIZE_BYTES + 1,
      issuerName: 'Trusted Issuer',
      supportedFields: { performanceMetrics: [] },
    };

    expect(verifyEvidenceSeal(result)).toBe(false);
  });

  it('rejects unbounded or malformed canonical repository seal fields', () => {
    const base = {
      __inspectionSeal: 'a'.repeat(64),
      inspectionId: 'inspection-123',
      inspectedAt: Date.now(),
      repositoryUrl: 'https://github.com/openai/openai',
      resolvedCommitSha: 'a'.repeat(40),
      treeSha: 'b'.repeat(40),
      inspectedFiles: [],
      verifiedTechnologies: [],
      candidateAuthorshipStatus: 'COMMIT_AUTHOR',
    };

    expect(verifyEvidenceSeal({ ...base, inspectedAt: 'x'.repeat(100_000) })).toBe(false);
    expect(verifyEvidenceSeal({ ...base, candidateAuthorshipStatus: 'x'.repeat(100_000) })).toBe(
      false
    );
    expect(
      verifyEvidenceSeal({
        ...base,
        resolvedCommitSha: { toString: () => 'a'.repeat(40) },
      })
    ).toBe(false);
  });

  it('requires primitive boolean fields in document seal canonical data', () => {
    const base = {
      __documentSeal: 'a'.repeat(64),
      inspectionId: 'inspection-123',
      documentSha256: 'b'.repeat(64),
      documentByteLength: 1024,
      issuerName: 'Trusted Issuer',
      issuerValidated: true,
      candidateMentioned: true,
      projectMentioned: false,
      personalWorkAttested: true,
      supportedFields: { performanceMetrics: [] },
    };

    expect(verifyEvidenceSeal({ ...base, issuerValidated: { value: true } })).toBe(false);
    expect(verifyEvidenceSeal({ ...base, personalWorkAttested: 'true' })).toBe(false);
  });

  it('rejects malformed seals before cryptographic comparison', () => {
    expect(verifyEvidenceSeal({ __inspectionSeal: 'not-a-digest' })).toBe(false);
    expect(verifyEvidenceSeal({ __documentSeal: 'not-a-digest' })).toBe(false);
    expect(verifyEvidenceSeal({ __auditSeal: 'not-a-digest' })).toBe(false);
  });
});
