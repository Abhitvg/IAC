import { describe, expect, it } from 'vitest';
import { inspectEvidenceRepository } from '../electron/services/boundedEvidenceInspection';
import type { RepositoryInspectionRequest } from '../electron/services/evidenceVerificationService';

function request(
  overrides: Partial<RepositoryInspectionRequest> = {}
): RepositoryInspectionRequest {
  return {
    repositoryUrl: 'https://github.com/openai/openai',
    candidateIdentity: {
      fullName: 'Test Candidate',
      email: 'candidate@example.com',
    },
    targetProjectName: 'Test Project',
    authHeader: 'Bearer test-token',
    ...overrides,
  };
}

describe('Evidence repository inspection metadata limits', () => {
  it('rejects oversized repository URLs before URL parsing', () => {
    expect(() =>
      inspectEvidenceRepository(request({ repositoryUrl: 'x'.repeat(2049) }))
    ).toThrow('repositoryUrl');
  });

  it('rejects oversized authorization headers before making network requests', () => {
    expect(() =>
      inspectEvidenceRepository(request({ authHeader: 'a'.repeat(4097) }))
    ).toThrow('authHeader');
  });

  it('rejects CRLF in authorization headers', () => {
    expect(() =>
      inspectEvidenceRepository(request({ authHeader: 'Bearer token\r\nInjected: yes' }))
    ).toThrow('line breaks');
  });

  it('rejects oversized candidate identity and project metadata', () => {
    expect(() =>
      inspectEvidenceRepository(
        request({ candidateIdentity: { fullName: 'x'.repeat(257) } })
      )
    ).toThrow('candidateIdentity.fullName');

    expect(() =>
      inspectEvidenceRepository(request({ targetProjectName: 'x'.repeat(257) }))
    ).toThrow('targetProjectName');
  });
});
