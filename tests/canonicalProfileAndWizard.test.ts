import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CanonicalProfileService,
  createCanonicalFact,
  canClaimPersonalAuthorship,
  evaluatePersonalAuthorship,
  canClaimProductionSkillExperience,
  evaluateProductionSkillExperience,
  validateDeclarationSafety,
  CandidateProject,
  CandidateSkill,
  validateCanonicalProfile,
  migrateProfileIfNeeded,
} from '../src/services/knowledgeVault';
import { IngestionResult } from '../src/services/ingestion/types';
import { KnowledgeVaultService } from '../src/services/knowledgeVault/knowledgeVaultService';
import { useCandidateVaultStore } from '../src/store/useCandidateVaultStore';
import { useAppStore } from '../src/store/useAppStore';
import {
  TrustedRepositoryInspectionService,
  TrustedIndependentAuditService,
  ImmutableRepositoryInspectionResult,
} from '../src/services/evidenceInspection';

describe('Canonical Candidate Profile & Evidence Integrity Acceptance Gate', () => {
  let service: CanonicalProfileService;

  beforeEach(() => {
    service = CanonicalProfileService.getInstance();
    service.clearAllCandidateData(() => useAppStore.getState().clearCandidateDocuments());
    TrustedIndependentAuditService.clearAuditors();
  });

  // Acceptance Test 1: Fake GitHub evidence strings cannot produce repository-supported verification
  it('1. Fake GitHub evidence strings cannot produce repository-supported verification', async () => {
    const projectWithFakeEvidenceString: CandidateProject = {
      id: 'proj-fake-git',
      name: 'Raft Engine',
      description: 'Distributed consensus system',
      repositoryUrl: 'https://github.com/example/raft-engine',
      ownership: 'PRIMARY_CONTRIBUTOR',
      exactContribution: 'Authored Raft log snapshotting algorithm',
      technologyStack: ['Go', 'gRPC'],
      deploymentStatus: 'deployed_production',
      outcomes: ['Consensus achieved'],
      // Attacker provides raw string like "github.com" or "git:commit:..." without genuine inspection
      evidenceReferences: ['git:commit:a1b2c3d4e5f6', 'https://github.com/example/raft-engine'],
      status: 'REPOSITORY_SUPPORTED',
      candidateConfirmed: true,
    };

    const evalResult = evaluatePersonalAuthorship(projectWithFakeEvidenceString);
    // MUST NOT be REPOSITORY_SUPPORTED_CONTRIBUTION because there is no sealed inspection record
    expect(evalResult.tier).not.toBe('REPOSITORY_SUPPORTED_CONTRIBUTION');
    expect(evalResult.tier).toBe('CANDIDATE_REPORTED');
    expect(evalResult.isIndependentlyVerified).toBe(false);

    // Now test with genuine sealed repository inspection from evidence subsystem
    const sandbox = TrustedRepositoryInspectionService.getSandboxProvider();
    sandbox.registerRepository('https://github.com/example/raft-engine', {
      commitSha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      treeSha: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
      authorEmail: 'candidate@example.com',
      files: {
        'snapshot.go': 'package raft\nfunc (r *Raft) Snapshot() {}',
      },
    });

    const validRepoInspection = await TrustedRepositoryInspectionService.inspectRepository({
      repositoryUrl: 'https://github.com/example/raft-engine',
      candidateIdentity: { fullName: 'Candidate', email: 'candidate@example.com' },
      targetProjectName: 'Raft Engine',
    });

    const genuineRepoProject: CandidateProject = {
      ...projectWithFakeEvidenceString,
      storedInspection: validRepoInspection,
      status: 'REPOSITORY_SUPPORTED',
      candidateConfirmed: true,
    };

    const genuineEval = evaluatePersonalAuthorship(genuineRepoProject);
    expect(genuineEval.canClaim).toBe(true);
    expect(genuineEval.tier).toBe('REPOSITORY_SUPPORTED_CONTRIBUTION');
    expect(genuineEval.isIndependentlyVerified).toBe(false);
  });

  // Acceptance Test 2: A fabricated INDEPENDENTLY_VERIFIED status cannot bypass the verification subsystem
  it('2. A fabricated INDEPENDENTLY_VERIFIED status cannot bypass the verification subsystem', () => {
    // Project claims INDEPENDENTLY_VERIFIED but has no verified cryptographic audit record
    const fabricatedProject: CandidateProject = {
      id: 'proj-fabricated-audit',
      name: 'Cloud Orchestrator',
      description: 'Container orchestrator',
      repositoryUrl: 'https://github.com/corp/orchestrator',
      ownership: 'SOLE_OWNER',
      exactContribution: 'Designed stateful failover controller',
      technologyStack: ['Go', 'Kubernetes'],
      deploymentStatus: 'deployed_production',
      outcomes: [],
      evidenceReferences: ['https://audit.example.com/fake-cert'],
      status: 'INDEPENDENTLY_VERIFIED', // Fabricated declaration
      candidateConfirmed: true,
    };

    const evalResult = evaluatePersonalAuthorship(fabricatedProject);
    // Invariant: MUST fail closed; cannot claim independent verification
    expect(evalResult.tier).not.toBe('INDEPENDENTLY_VERIFIED');
    expect(evalResult.tier).toBe('CANDIDATE_REPORTED');
    expect(evalResult.isIndependentlyVerified).toBe(false);

    // Tampered audit seal test:
    const tamperedAuditRecord: any = {
      auditId: 'audit-001',
      auditorId: 'unregistered-auditor',
      projectId: 'proj-fabricated-audit',
      candidateId: 'cand-1',
      verifiedAt: Date.now(),
      auditedFields: { personalContribution: 'Designed stateful failover controller' },
      __auditSeal: 'forged_hmac_seal_1234567890abcdef',
    };

    const projectWithTamperedAudit: CandidateProject = {
      ...fabricatedProject,
      storedInspection: tamperedAuditRecord,
    };

    const tamperedEval = evaluatePersonalAuthorship(projectWithTamperedAudit);
    expect(tamperedEval.tier).not.toBe('INDEPENDENTLY_VERIFIED');
    expect(tamperedEval.isIndependentlyVerified).toBe(false);
  });

  // Acceptance Test 3: A candidate cannot import a forged verification record
  it('3. A candidate cannot import a forged verification record', () => {
    const forgedPayload = {
      id: 'profile-forged-audit',
      version: 2,
      updatedAt: Date.now(),
      identity: {
        fullName: 'Attacker Candidate',
        email: 'attacker@example.com',
        location: 'Nowhere',
        preferredLanguage: 'English',
        links: {},
        candidateConfirmed: true,
      },
      education: [],
      career: {
        currentRole: 'Lead Architect',
        targetSeniority: 'principal',
        targetRoles: ['Principal Engineer'],
        preferredIndustries: [],
        noticePeriod: 'immediate',
        candidateConfirmed: true,
      },
      skills: [],
      experience: [],
      projects: [
        {
          id: 'proj-hack',
          name: 'Hacked Core',
          description: 'Forged audit claims',
          ownership: 'SOLE_OWNER',
          exactContribution: 'Claimed total ownership',
          technologyStack: ['C++'],
          deploymentStatus: 'deployed_production',
          outcomes: [],
          evidenceReferences: [],
          status: 'INDEPENDENTLY_VERIFIED', // Forged status
          candidateConfirmed: true,
          storedInspection: {
            auditId: 'fake-audit-id',
            auditorId: 'fake-auditor',
            projectId: 'proj-hack',
            candidateId: 'cand-1',
            verifiedAt: Date.now(),
            __auditSeal: 'fake-seal-1234567890',
          },
        },
      ],
      achievements: [],
      preferences: {
        answerLength: 'balanced',
        formality: 'professional',
        responsePerspective: 'first_person',
        language: 'English',
        technicalDepth: 'deep_code_and_architecture',
        responseStyle: 'structured_paragraphs',
        preferredCodingLanguage: 'C++',
        answerStructure: 'star',
      },
      declarations: {
        workAuthorization: { confirmed: true, authorized: true, jurisdictions: ['US'] },
        sponsorshipRequired: { confirmed: true, required: false },
        willingToRelocate: { confirmed: false, willing: null, preferredLocations: [] },
        securityClearance: { confirmed: false, active: null },
        otherDeclarations: {},
      },
      factsLedger: {},
    };

    // Schema validation MUST reject profile with forged unverified audit
    const outcome = validateCanonicalProfile(forgedPayload);
    expect(outcome.success).toBe(false);
    if (!outcome.success) {
      expect(outcome.errors.some((e) => e.includes('cryptographic audit seal'))).toBe(true);
    }

    const importResult = service.importJson(JSON.stringify(forgedPayload));
    expect(importResult.success).toBe(false);
  });

  // Acceptance Test 4: Unsupported schema versions are rejected
  it('4. Unsupported schema versions are rejected', () => {
    const v3Payload = {
      id: 'profile-future-v3',
      version: 3, // Future unsupported version
      updatedAt: Date.now(),
      identity: {
        fullName: 'Future Candidate',
        email: 'future@example.com',
        location: 'Berlin',
        preferredLanguage: 'English',
        links: {},
        candidateConfirmed: false,
      },
    };

    const outcomeV3 = validateCanonicalProfile(v3Payload);
    expect(outcomeV3.success).toBe(false);
    if (!outcomeV3.success) {
      expect(outcomeV3.errors[0]).toContain('Unsupported schema version: 3');
    }

    const v0Payload = { ...v3Payload, version: 0 };
    const outcomeV0 = validateCanonicalProfile(v0Payload);
    expect(outcomeV0.success).toBe(false);
    if (!outcomeV0.success) {
      expect(outcomeV0.errors[0]).toContain('Unsupported schema version: 0');
    }
  });

  // Acceptance Test 5: Unknown JSON fields are rejected (Strict Zod Schemas)
  it('5. Unknown JSON fields are rejected by strict validation', () => {
    const defaultProfile = service.getProfile();
    const maliciousPayload = {
      ...defaultProfile,
      injectedUnauthorizedField: 'malicious_content', // Unknown key
    };

    const outcome = validateCanonicalProfile(maliciousPayload);
    expect(outcome.success).toBe(false);
    if (!outcome.success) {
      expect(
        outcome.errors.some(
          (e) => e.toLowerCase().includes('unrecognized') || e.includes('injectedUnauthorizedField')
        )
      ).toBe(true);
    }

    // Prototype pollution attempt
    const protoPayload = JSON.parse('{"__proto__": {"admin": true}, "id": "test"}');
    const outcomeProto = validateCanonicalProfile(protoPayload);
    expect(outcomeProto.success).toBe(false);
    if (!outcomeProto.success) {
      expect(outcomeProto.errors.some((e) => e.includes('Prototype pollution'))).toBe(true);
    }
  });

  // Acceptance Test 6: Conflicting subsystem updates cannot silently overwrite candidate-confirmed facts
  it('6. Conflicting subsystem updates cannot silently overwrite candidate-confirmed facts', () => {
    // 1. Candidate confirms their name and title
    service.recordFact(
      'identity.fullName',
      'identity',
      'Alice Confirmed',
      'Manual Entry',
      'CANDIDATE_CONFIRMED',
      true
    );
    service.recordFact(
      'career.currentRole',
      'career',
      'Staff Engineer',
      'Manual Entry',
      'CANDIDATE_CONFIRMED',
      true
    );

    const current = service.getProfile();
    current.identity.fullName = 'Alice Confirmed';
    current.identity.candidateConfirmed = true;
    current.career.currentRole = 'Staff Engineer';
    current.career.candidateConfirmed = true;
    service.saveProfile(current);

    // 2. Incoming unconfirmed sync from an automated resume ingestion attempts to overwrite
    const conflictingIngestion: IngestionResult = {
      sourceId: 'src-conflicting',
      sourceType: 'resume_pdf',
      documentTitle: 'Old_Resume.pdf',
      rawText: 'Alice Junior Junior Developer',
      pageCount: 1,
      isImageOnlyOrScanned: false,
      ocrRequired: false,
      personalProfile: {
        fullName: 'Alice Junior Overwrite Attempt',
        email: 'alice@example.com',
        phone: '123',
        location: 'Nowhere',
        websites: [],
      },
      education: [],
      employment: [],
      projects: [],
      skills: {
        languages: [],
        frameworks: [],
        databases: [],
        messaging: [],
        cloud: [],
        devops: [],
        testing: [],
        architecture: [],
        aiMl: [],
        tools: [],
      },
      achievements: [],
      claims: [],
      chronologyAlerts: [],
      warnings: [],
      ingestedAt: Date.now(),
    };

    service.populateFromIngestion(conflictingIngestion);

    // Invariant: Candidate-confirmed identity MUST be preserved
    const afterSync = service.getProfile();
    expect(afterSync.identity.fullName).toBe('Alice Confirmed');
    expect(afterSync.factsLedger['identity.fullName'].value).toBe('Alice Confirmed');

    // 3. Subsystem sync from CareerOps with conflicting name attempts overwrite
    service.syncFromCareerOpsVault({
      isUserSupplied: true,
      fullName: 'CareerOps Conflicting Name',
      currentTitle: 'Junior Developer',
    });

    const afterCareerSync = service.getProfile();
    expect(afterCareerSync.identity.fullName).toBe('Alice Confirmed');
    expect(afterCareerSync.career.currentRole).toBe('Staff Engineer');
  });

  // Acceptance Test 7: Updates and deletions reconcile correctly across stores (deduplication & tombstones)
  it('7. Updates and deletions reconcile correctly across stores', () => {
    // 1. Candidate adds project
    const p1: CandidateProject = {
      id: 'proj-dedup-1',
      name: 'Event Streaming Engine',
      description: 'Distributed event bus',
      repositoryUrl: 'https://github.com/company/event-bus',
      ownership: 'PRIMARY_CONTRIBUTOR',
      exactContribution: 'Built zero-copy buffer serializer',
      technologyStack: ['Go', 'Kafka'],
      deploymentStatus: 'deployed_production',
      outcomes: ['Low latency achieved'],
      evidenceReferences: [],
      status: 'CANDIDATE_CONFIRMED',
      candidateConfirmed: true,
    };

    const prof = service.getProfile();
    prof.projects = [p1];
    service.saveProfile(prof);

    // 2. Incoming sync from KnowledgeVault has SAME repo URL but different ID and more technologies
    service.syncFromKnowledgeVault({
      projects: [
        {
          id: 'vault-different-id-999',
          title: 'event-bus',
          description: 'Event bus project from git import',
          repoUrl: 'https://github.com/company/event-bus.git', // Trailing .git should normalize
          technologies: ['Go', 'Docker', 'Kubernetes'],
          contributions: [{ id: 'c1', description: 'Unconfirmed crawler summary' }],
          status: 'REPOSITORY_SUPPORTED',
        },
      ],
    });

    const reconciled = service.getProfile();
    // Must NOT create a second duplicate project entry
    expect(reconciled.projects).toHaveLength(1);
    const merged = reconciled.projects[0];
    expect(merged.id).toBe('proj-dedup-1'); // Keeps original canonical ID
    expect(merged.exactContribution).toBe('Built zero-copy buffer serializer'); // Candidate confirmed exact contribution preserved
    expect(merged.technologyStack).toContain('Kafka');
    expect(merged.technologyStack).toContain('Docker'); // Merged technologies

    // 3. Deletion with tombstone: Candidate deletes project
    const deleted = service.deleteProject('proj-dedup-1', 'Candidate removed confidential project');
    expect(deleted).toBe(true);
    expect(service.getProfile().projects).toHaveLength(0);

    // 4. Repeated sync from external vault does NOT resurrect tombstoned project
    service.syncFromKnowledgeVault({
      projects: [
        {
          id: 'vault-different-id-999',
          title: 'Event Streaming Engine',
          repoUrl: 'https://github.com/company/event-bus',
          technologies: ['Go'],
          status: 'RESUME_REPORTED',
        },
      ],
    });

    // Tombstone respected: not resurrected
    expect(service.getProfile().projects).toHaveLength(0);
  });

  // Acceptance Test 8: Rigorous production skill claims require production deployment context
  it('8. Production skill claims require candidate implementation evidence and deployed production status', () => {
    const stagingProject: CandidateProject = {
      id: 'proj-staging',
      name: 'StagingApp',
      description: 'Internal demo',
      ownership: 'PRIMARY_CONTRIBUTOR',
      exactContribution: 'Implemented GraphQL resolvers and schema federation',
      technologyStack: ['TypeScript', 'GraphQL'],
      deploymentStatus: 'staging_demo', // NOT deployed_production!
      outcomes: [],
      evidenceReferences: [],
      status: 'CANDIDATE_CONFIRMED',
      candidateConfirmed: true,
    };

    const registeredProjects = [stagingProject];

    const graphQLSkill: CandidateSkill = {
      id: 'skill-graphql',
      name: 'GraphQL',
      experienceType: 'practical',
      projectReferences: ['StagingApp'],
      evidenceSource: 'Candidate Claim',
      status: 'CANDIDATE_CONFIRMED',
      candidateConfirmed: true,
    };

    // Cannot claim production because staging_demo is not deployed_production
    const evalStaging = evaluateProductionSkillExperience(graphQLSkill, registeredProjects);
    expect(evalStaging.canClaimProduction).toBe(false);
    expect(evalStaging.tier).toBe('CANDIDATE_REPORTED_PRACTICAL');

    // Upgrade project deployment status to deployed_production
    const prodProject: CandidateProject = {
      ...stagingProject,
      deploymentStatus: 'deployed_production',
    };

    const evalProd = evaluateProductionSkillExperience(graphQLSkill, [prodProject]);
    expect(evalProd.canClaimProduction).toBe(true);
    expect(evalProd.tier).toBe('CANDIDATE_REPORTED_PRODUCTION');
  });

  // Acceptance Test 9: Declaration consistency requires non-null answers when confirmed
  it('9. Declaration consistency requires non-null answers when confirmed', () => {
    const profile = service.getProfile();
    // Confirmed without an answer (null)
    profile.declarations.workAuthorization = {
      confirmed: true,
      authorized: null, // Invariant violation!
      jurisdictions: [],
    };

    const outcome = validateCanonicalProfile(profile);
    expect(outcome.success).toBe(false);
    if (!outcome.success) {
      expect(
        outcome.errors.some((e) =>
          e.includes('Confirmed work authorization declaration cannot have a null value')
        )
      ).toBe(true);
    }
  });
  it('does not report candidate data deleted when browser storage rejects deletion', () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(() => {
        throw new Error('Storage access denied');
      }),
    };

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {},
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });

    try {
      const current = service.getProfile();
      current.identity.fullName = 'Candidate data must remain available';
      service.saveProfile(current);

      const clearDocuments = vi.fn(() => true);
      expect(service.clearAllCandidateData(clearDocuments)).toMatchObject({
        success: false,
        failedStores: ['canonical-profile'],
      });
      expect(clearDocuments).not.toHaveBeenCalled();
      expect(service.getProfile().identity.fullName).toBe('Candidate data must remain available');
      expect(storage.removeItem).toHaveBeenCalledOnce();
    } finally {
      if (previousWindow) {
        Object.defineProperty(globalThis, 'window', previousWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
      if (previousStorage) {
        Object.defineProperty(globalThis, 'localStorage', previousStorage);
      } else {
        Reflect.deleteProperty(globalThis, 'localStorage');
      }
    }
  });

  it('reports candidate document reset failures instead of claiming success', () => {
    const clearDocuments = vi.fn(() => false);

    expect(service.clearAllCandidateData(clearDocuments)).toEqual({
      success: false,
      failedStores: ['candidate-documents'],
    });
    expect(clearDocuments).toHaveBeenCalledOnce();
  });

  it('reports candidate document reset exceptions instead of claiming success', () => {
    const clearDocuments = vi.fn(() => {
      throw new Error('Document store unavailable');
    });

    expect(service.clearAllCandidateData(clearDocuments)).toEqual({
      success: false,
      failedStores: ['candidate-documents'],
    });
    expect(clearDocuments).toHaveBeenCalledOnce();
  });

  it('clears canonical, Knowledge Vault, and CareerOps persisted candidate copies', () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const data: Record<string, string> = {};
    const removedKeys: string[] = [];
    const storage = {
      getItem: vi.fn((key: string) => data[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        data[key] = String(value);
      }),
      removeItem: vi.fn((key: string) => {
        removedKeys.push(key);
        delete data[key];
      }),
    };

    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });

    try {
      const profile = service.getProfile();
      profile.identity.fullName = 'Candidate data to clear';
      profile.identity.email = 'candidate@example.test';
      service.saveProfile(profile);
      useAppStore.getState().setResumeText('Sensitive resume content');
      useAppStore.getState().setJobDescriptionText('Confidential job description');
      useAppStore.getState().setTargetRole('Staff Engineer');

      expect(useCandidateVaultStore.getState().profile.fullName).toBe('Candidate data to clear');
      expect(useAppStore.getState().resumeText).toBe('Sensitive resume content');
      expect(useAppStore.getState().jobDescriptionText).toBe('Confidential job description');
      expect(useAppStore.getState().targetRole).toBe('Staff Engineer');
      expect(
        service.clearAllCandidateData(() => useAppStore.getState().clearCandidateDocuments())
      ).toEqual({ success: true, failedStores: [] });

      expect(service.getProfile().identity.fullName).toBe('');
      expect(useCandidateVaultStore.getState().profile.fullName).toBe('');
      expect(KnowledgeVaultService.getInstance().getVault().profile.name).toBe('');
      expect(useAppStore.getState().resumeText).toBe('');
      expect(useAppStore.getState().jobDescriptionText).toBe('');
      expect(useAppStore.getState().targetRole).toBe('');
      expect(removedKeys).toEqual(
        expect.arrayContaining([
          'iac_canonical_candidate_profile_v2',
          'iac_candidate_knowledge_vault_v2',
          'career_ops_candidate_vault_v1',
          'career_ops_candidate_vault_v2',
          'candidate_resume',
          'target_job_description',
          'target_role',
        ])
      );
    } finally {
      if (previousWindow) {
        Object.defineProperty(globalThis, 'window', previousWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
      if (previousStorage) {
        Object.defineProperty(globalThis, 'localStorage', previousStorage);
      } else {
        Reflect.deleteProperty(globalThis, 'localStorage');
      }
    }
  });
  it('returns false when canonical profile persistence rejects a write', () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('Storage quota exceeded');
      }),
      removeItem: vi.fn(),
    };

    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });

    try {
      const profile = service.getProfile();
      profile.identity.fullName = 'Unsaved candidate';
      expect(service.saveProfile(profile)).toBe(false);
      expect(storage.setItem).toHaveBeenCalled();
    } finally {
      if (previousWindow) {
        Object.defineProperty(globalThis, 'window', previousWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
      if (previousStorage) {
        Object.defineProperty(globalThis, 'localStorage', previousStorage);
      } else {
        Reflect.deleteProperty(globalThis, 'localStorage');
      }
    }
  });

  it('rolls back a partial resume-context deletion when browser storage rejects a later key', () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const data: Record<string, string> = {};
    const storage = {
      getItem: vi.fn((key: string) => data[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        data[key] = String(value);
      }),
      removeItem: vi.fn((key: string) => {
        if (key === 'target_job_description') {
          throw new Error('Storage deletion denied');
        }
        delete data[key];
      }),
    };

    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });

    try {
      useAppStore.getState().setResumeText('Resume must remain available');
      useAppStore.getState().setJobDescriptionText('Job description must remain available');
      useAppStore.getState().setTargetRole('Target role must remain available');

      expect(useAppStore.getState().clearCandidateDocuments()).toBe(false);
      expect(useAppStore.getState().resumeText).toBe('Resume must remain available');
      expect(useAppStore.getState().jobDescriptionText).toBe(
        'Job description must remain available'
      );
      expect(useAppStore.getState().targetRole).toBe('Target role must remain available');
      expect(data.candidate_resume).toBe('Resume must remain available');
      expect(data.target_job_description).toBe('Job description must remain available');
      expect(data.target_role).toBe('Target role must remain available');
    } finally {
      if (previousWindow) {
        Object.defineProperty(globalThis, 'window', previousWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
      if (previousStorage) {
        Object.defineProperty(globalThis, 'localStorage', previousStorage);
      } else {
        Reflect.deleteProperty(globalThis, 'localStorage');
      }
    }
  });
});
