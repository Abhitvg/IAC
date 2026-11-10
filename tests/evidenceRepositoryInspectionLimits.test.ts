import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectEvidenceRepository } from '../electron/services/boundedEvidenceInspection';
import {
  EvidenceVerificationService,
  type ImmutableRepositoryInspectionResult,
  type RepositoryInspectionRequest,
} from '../electron/services/evidenceVerificationService';

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Evidence repository inspection metadata limits', () => {
  it('caps repository inspection output before returning it to the renderer', async () => {
    const result = {
      inspectionId: 'inspection-123',
      inspectedAt: Date.now(),
      repositoryUrl: 'https://github.com/openai/openai',
      resolvedCommitSha: 'a'.repeat(40),
      treeSha: 'b'.repeat(40),
      inspectedFiles: [],
      verifiedTechnologies: [],
      dependencyDeclarations: Array.from({ length: 201 }, () => 'd'.repeat(300)),
      sourceCodeUsage: Array.from({ length: 201 }, () => 's'.repeat(600)),
      omittedFilePathsSample: Array.from({ length: 30 }, () => 'f'.repeat(2100)),
      demonstratedImplementation: 'x'.repeat(10_000),
      detectedArchitecture: 'x'.repeat(1_000),
      candidateAuthorshipStatus: 'COMMIT_AUTHOR',
      authorEmailFound: 'x'.repeat(400),
      authorRole: 'contributor',
      productionDeploymentVerified: false,
      businessOutcomesVerified: false,
      inspectionLimitations: {
        provider: 'github',
        totalFilesDiscovered: 25,
        filesInspected: 0,
        truncated: false,
        byteLimitPerFile: 1_000_000,
        inspectionTimeoutMs: 10_000,
      },
      supportedFields: {
        technologies: Array.from({ length: 101 }, () => 't'.repeat(140)),
      },
      __inspectionSeal: 'c'.repeat(64),
    } as ImmutableRepositoryInspectionResult;
    vi.spyOn(EvidenceVerificationService, 'inspectRepository').mockResolvedValue(result);

    const inspected = await inspectEvidenceRepository(request());

    expect(inspected.dependencyDeclarations).toHaveLength(200);
    expect(inspected.dependencyDeclarations[0]).toHaveLength(256);
    expect(inspected.sourceCodeUsage).toHaveLength(200);
    expect(inspected.sourceCodeUsage[0]).toHaveLength(512);
    expect(inspected.omittedFilePathsSample).toHaveLength(25);
    expect(inspected.omittedFilePathsSample?.[0]).toHaveLength(2048);
    expect(inspected.demonstratedImplementation).toHaveLength(8192);
    expect(inspected.detectedArchitecture).toHaveLength(512);
    expect(inspected.authorEmailFound).toHaveLength(320);
    expect(inspected.supportedFields?.technologies).toHaveLength(100);
    expect(inspected.supportedFields?.technologies?.[0]).toHaveLength(128);
    expect(inspected.__inspectionSeal).toBe(result.__inspectionSeal);
  });

  it('rejects oversized repository URLs before URL parsing', async () => {
    await expect(
      inspectEvidenceRepository(request({ repositoryUrl: 'x'.repeat(2049) }))
    ).rejects.toThrow('repositoryUrl');
  });

  it('rejects oversized authorization headers before making network requests', async () => {
    await expect(
      inspectEvidenceRepository(request({ authHeader: 'a'.repeat(4097) }))
    ).rejects.toThrow('authHeader');
  });

  it('rejects CRLF in authorization headers', async () => {
    await expect(
      inspectEvidenceRepository(request({ authHeader: 'Bearer token\r\nInjected: yes' }))
    ).rejects.toThrow('line breaks');
  });

  it('rejects oversized candidate identity and project metadata', async () => {
    await expect(
      inspectEvidenceRepository(request({ candidateIdentity: { fullName: 'x'.repeat(257) } }))
    ).rejects.toThrow('candidateIdentity.fullName');

    await expect(
      inspectEvidenceRepository(request({ targetProjectName: 'x'.repeat(257) }))
    ).rejects.toThrow('targetProjectName');
  });
});
