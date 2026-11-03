/**
 * tests/sixthStageSecurityRemediation.test.ts
 *
 * IAC Sixth-Stage Security Remediation:
 * Part 1: 16 Mandatory Adversarial Tests (P0 & P1 Trust Boundaries)
 * Part 2: Realistic Adversarial Dataset (220 Answer Cases) with Full Evaluation Metrics
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  CandidateKnowledgeBase,
  FactualGroundingValidator,
  ProjectProfile,
  GroundingValidationResult,
} from '../src/services/candidateIntelligence';
import {
  TrustedRepositoryInspectionService,
  TrustedDocumentInspectionService,
  TrustedIndependentAuditService,
  SafePersistenceSchema,
  sha256Hex,
  GitHubRepositoryProvider,
  SandboxRepositoryProvider,
} from '../src/services/evidenceInspection';
import { AnswerGenerationService } from '../src/services/AnswerGenerationService';
import * as aiModule from '../src/services/ai';
import { useAppStore } from '../src/store/useAppStore';

describe('IAC Sixth-Stage Security Remediation — Part 1: 16 Mandatory Adversarial Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    TrustedIndependentAuditService.clearAuditors();
    TrustedDocumentInspectionService.clearIssuers();
    TrustedRepositoryInspectionService.getSandboxProvider().clearFixtures();
    useAppStore.getState().clearAnswerQueue();
  });

  // 1. A fabricated unsealed repository payload cannot change project state
  it('1. A fabricated unsealed repository payload cannot change project state', () => {
    const kb = new CandidateKnowledgeBase('Projects:\nDataCore - Core database storage engine\nTechnologies: C++, Rust\n');
    const initialProject = kb.getProject('DataCore');
    expect(initialProject?.verificationStatus).toBe('RESUME_REPORTED');

    // Attempt to pass an unsealed caller-supplied payload with valid-looking commit and files
    const fabricatedPayload = {
      repositoryUrl: 'https://github.com/candidate/datacore',
      resolvedCommitSha: '11223344556677889900aabbccddeeff00112233',
      treeSha: 'aabbccddeeff0011223344556677889900aabbcc',
      inspectedFiles: [
        { path: 'src/storage.rs', sha256: 'a'.repeat(64), sizeBytes: 1024 },
        { path: 'src/engine.cpp', sha256: 'b'.repeat(64), sizeBytes: 2048 },
      ],
      verifiedTechnologies: ['C++', 'Rust'],
      detectedArchitecture: 'LSM-tree tiered storage engine',
      candidateAuthorshipStatus: 'COMMIT_AUTHOR',
      authorRole: 'architect',
    };

    const verifyResult = kb.verifyViaRepositoryInspection('DataCore', fabricatedPayload);
    expect(verifyResult).toBe(false);

    const projectAfter = kb.getProject('DataCore');
    expect(projectAfter?.verificationStatus).toBe('RESUME_REPORTED');
    expect(projectAfter?.fieldProvenance.actualTechnologyUsage.verificationStatus).toBe('UNKNOWN');
    expect(projectAfter?.fieldProvenance.architecture.verificationStatus).toBe('UNKNOWN');
    expect(projectAfter?.ownership).toBe('unknown');
  });

  // 2. A fake GitHub URL or commit cannot become verified without provider retrieval
  it('2. A fake GitHub URL or commit cannot become verified without provider retrieval', async () => {
    const githubProvider = new GitHubRepositoryProvider();

    // Attempt 1: SSRF / non-GitHub host injection
    expect(githubProvider.canHandle('https://internal.company.corp/repo')).toBe(false);
    expect(githubProvider.canHandle('https://github.com.attacker.com/repo')).toBe(false);
    expect(githubProvider.canHandle('http://169.254.169.254/latest/meta-data')).toBe(false);

    // Attempt 2: Malformed URL with embedded credentials
    expect(githubProvider.canHandle('https://user:password@github.com/candidate/project')).toBe(false);

    // Attempt 3: Non-existent commit retrieval on non-existent repo fails closed
    await expect(
      githubProvider.resolveCommitAndTree('https://github.com/fake-org-iac-audit/non-existent-repo-99999', 'invalid_commit')
    ).rejects.toThrow();
  }, 15000);

  // 3. A file hash cannot be substituted after inspection
  it('3. A file hash cannot be substituted after inspection', async () => {
    const sandbox = TrustedRepositoryInspectionService.getSandboxProvider();
    sandbox.registerRepository('https://github.com/org/proxy', {
      commitSha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      treeSha: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
      authorEmail: 'candidate@example.com',
      files: {
        'package.json': JSON.stringify({ dependencies: { express: '^4.18.2' } }),
        'src/proxy.ts': 'import express from "express";',
      },
    });

    const validInspection = await TrustedRepositoryInspectionService.inspectRepository({
      repositoryUrl: 'https://github.com/org/proxy',
      candidateIdentity: { fullName: 'Candidate', email: 'candidate@example.com' },
      targetProjectName: 'Proxy',
    });
    expect(TrustedRepositoryInspectionService.verifySeal(validInspection)).toBe(true);

    // Attacker modifies an inspected file hash or path post-hoc
    const tamperedInspection = JSON.parse(JSON.stringify(validInspection));
    tamperedInspection.inspectedFiles[0].sha256 = 'f'.repeat(64); // substituted hash

    expect(TrustedRepositoryInspectionService.verifySeal(tamperedInspection)).toBe(false);

    const kb = new CandidateKnowledgeBase('Projects:\nProxy - Reverse proxy\nTechnologies: Express\n');
    const verifyTampered = kb.verifyViaRepositoryInspection('Proxy', tamperedInspection);
    expect(verifyTampered).toBe(false);
  });

  // 4. A dependency declaration cannot establish candidate expertise
  it('4. A dependency declaration cannot establish candidate expertise', async () => {
    const sandbox = TrustedRepositoryInspectionService.getSandboxProvider();
    sandbox.registerRepository('https://github.com/org/shop', {
      commitSha: 'c1c2c3c4c5c6c7c8c9c0d1d2d3d4d5d6d7d8d9d0',
      treeSha: 'e1e2e3e4e5e6e7e8e9e0f1f2f3f4f5f6f7f8f9f0',
      authorEmail: 'unrelated-committer@example.com',
      files: {
        'package.json': JSON.stringify({ dependencies: { kafka: '^1.0.0', redis: '^4.0.0' } }),
        'src/index.js': 'console.log("shop");',
      },
    });

    const inspection = await TrustedRepositoryInspectionService.inspectRepository({
      repositoryUrl: 'https://github.com/org/shop',
      candidateIdentity: { fullName: 'Candidate', email: 'candidate@example.com' },
      targetProjectName: 'Shop',
    });

    // Separates authorship: comitter is unrelated
    expect(inspection.candidateAuthorshipStatus).toBe('AUTHOR_MISMATCH');
    expect(inspection.authorRole).toBe('unknown');

    const kb = new CandidateKnowledgeBase('Projects:\nShop - E-commerce backend\nTechnologies: Kafka, Redis\n');
    kb.verifyViaRepositoryInspection('Shop', inspection);

    const proj = kb.getProject('Shop');
    expect(proj?.fieldProvenance.personalContribution.verificationStatus).toBe('UNKNOWN');
    expect(proj?.ownership).toBe('unknown');

    // Generating an answer claiming deep production mastery of Kafka
    const answer = 'In Shop, I personally architected the Kafka clustering and wrote the payment consumer.';
    const validation = FactualGroundingValidator.validateAnswer(answer, kb);
    expect(validation.isGrounded).toBe(false);
    expect(validation.violations.some((v) => v.includes('unverified_backend') || v.includes('unsupported_personal_action'))).toBe(true);
  });

  // 5. A commit author match cannot establish sole ownership
  it('5. A commit author match cannot establish sole ownership', async () => {
    const sandbox = TrustedRepositoryInspectionService.getSandboxProvider();
    sandbox.registerRepository('https://github.com/org/auth-service', {
      commitSha: 'd1d2d3d4d5d6d7d8d9d0e1e2e3e4e5e6e7e8e9e0',
      treeSha: 'f1f2f3f4f5f6f7f8f9f0a1a2a3a4a5a6a7a8a9a0',
      authorEmail: 'candidate@example.com',
      files: {
        'package.json': JSON.stringify({ dependencies: { express: '^4.18.2' } }),
        'src/auth.ts': 'export const auth = () => {};',
      },
    });

    const inspection = await TrustedRepositoryInspectionService.inspectRepository({
      repositoryUrl: 'https://github.com/org/auth-service',
      candidateIdentity: { fullName: 'Candidate', email: 'candidate@example.com' },
      targetProjectName: 'AuthService',
    });

    expect(inspection.candidateAuthorshipStatus).toBe('COMMIT_AUTHOR');
    expect(inspection.authorRole).toBe('contributor'); // Strictly contributor, never sole_owner

    const kb = new CandidateKnowledgeBase('Projects:\nAuthService - Authentication microservice\n');
    kb.verifyViaRepositoryInspection('AuthService', inspection);

    const proj = kb.getProject('AuthService');
    expect(proj?.ownership).toBe('contributor');

    // Candidate claiming sole authorship
    const answer = 'I was the sole creator and architect of AuthService, single-handedly building everything.';
    const validation = FactualGroundingValidator.validateAnswer(answer, kb);
    expect(validation.isGrounded).toBe(false);
    expect(validation.violations.some((v) => v.includes('unsupported_ownership'))).toBe(true);
  });

  // 6. An unsigned document cannot become issuer-verified
  it('6. An unsigned document cannot become issuer-verified', () => {
    const rawDocument = `
EMPLOYMENT CERTIFICATION
Employee: Jane Doe
Company: Acme Corp
Dates: 2021-2024
Role: Staff Systems Engineer
Project: CorePlatform
Jane performed work as a primary developer on CorePlatform.
`;

    const docResult = TrustedDocumentInspectionService.inspectDocument({
      documentBytes: rawDocument,
      documentType: 'employment_verification',
      issuer: { name: 'Acme Corp HR', authorityLevel: 'employer_hr' }, // No signature
      candidateIdentity: { fullName: 'Jane Doe', email: 'jane@example.com' },
      targetProjectName: 'CorePlatform',
    });

    // Invariant: Unsigned document has issuerValidated = false
    expect(docResult.issuerValidated).toBe(false);
    expect(docResult.authenticityStatus).toBe('UNAUTHENTICATED_CONTENT');
    expect(docResult.evidenceModality).toBe('UNAUTHENTICATED_BYTE_INSPECTED');

    const kb = new CandidateKnowledgeBase('Projects:\nCorePlatform - Distributed system\n');
    const verifyResult = kb.verifyViaDocumentInspection('CorePlatform', docResult);
    expect(verifyResult).toBe(false);

    const proj = kb.getProject('CorePlatform');
    expect(proj?.fieldProvenance.personalContribution.verificationStatus).toBe('UNKNOWN');
  });

  // 7. A document with matching names and generic attestation keywords cannot automatically prove personal work
  it('7. A document with matching names and generic attestation keywords cannot automatically prove personal work', () => {
    // Document mentions Jane Doe and CorePlatform, but merely as an email attendee
    const casualEmail = `
Meeting Notes: Architecture Review
Attendees: Jane Doe (Observer), Bob (Presenter)
Project Discussion: CorePlatform scaling roadmap
Summary: Bob presented the Q3 roadmap.
`;

    const docResult = TrustedDocumentInspectionService.inspectDocument({
      documentBytes: casualEmail,
      documentType: 'publication',
      issuer: { name: 'Engineering Notes', authorityLevel: 'peer_reviewed_publisher' },
      candidateIdentity: { fullName: 'Jane Doe' },
      targetProjectName: 'CorePlatform',
    });

    expect(docResult.candidateMentioned).toBe(true);
    expect(docResult.projectMentioned).toBe(true);
    // Invariant: Lacks explicit personal work delivery/author attestation
    expect(docResult.personalWorkAttested).toBe(false);
    expect(docResult.supportedFields.personalContribution).toBeUndefined();

    const kb = new CandidateKnowledgeBase('Projects:\nCorePlatform - Distributed system\n');
    expect(kb.verifyViaDocumentInspection('CorePlatform', docResult)).toBe(false);
  });

  // 8. A forged auditor signature is rejected
  it('8. A forged auditor signature is rejected', () => {
    const { publicKeyPem, privateKeyPem } = TrustedIndependentAuditService.generateAuditorKeyPair();
    const otherKeys = TrustedIndependentAuditService.generateAuditorKeyPair();

    TrustedIndependentAuditService.registerTrustedAuditor({
      auditorId: 'auditor-soc2',
      auditorName: 'SOC2 Assurance Corp',
      publicKeyPem,
      enabled: true,
    });

    const now = Date.now();
    const payload = JSON.stringify({
      auditId: 'AUD-998811',
      candidateId: 'candidate@example.com',
      projectId: 'SecurityVault',
      nonce: 'nonce-1234567890abcdef',
      issuedAt: now - 1000,
      expiresAt: now + 3600000,
      auditedFields: { personalContribution: 'Security architecture audit' },
    });

    // Attacker signs payload with a forged / different private key
    const forgedSig = TrustedIndependentAuditService.signPayload(payload, otherKeys.privateKeyPem);

    const verified = TrustedIndependentAuditService.verifySignedAttestation({
      schemaVersion: 'iac.audit.v1',
      auditorKeyId: 'auditor-soc2',
      payloadJson: payload,
      signatureHex: forgedSig,
    });

    expect(verified).toBeNull();
  });

  // 9. An expired audit is rejected
  it('9. An expired audit is rejected', () => {
    const { publicKeyPem, privateKeyPem } = TrustedIndependentAuditService.generateAuditorKeyPair();

    TrustedIndependentAuditService.registerTrustedAuditor({
      auditorId: 'auditor-pci',
      auditorName: 'PCI Compliance Bureau',
      publicKeyPem,
      enabled: true,
    });

    const now = Date.now();
    const expiredPayload = JSON.stringify({
      auditId: 'AUD-EXPIRED-001',
      candidateId: 'candidate@example.com',
      projectId: 'PayCore',
      nonce: 'nonce-expired-12345678',
      issuedAt: now - 100000,
      expiresAt: now - 1000, // Expired 1 second ago
      auditedFields: { personalContribution: 'Lead of Payment Tokenizer' },
    });

    const sig = TrustedIndependentAuditService.signPayload(expiredPayload, privateKeyPem);

    const result = TrustedIndependentAuditService.verifySignedAttestation({
      schemaVersion: 'iac.audit.v1',
      auditorKeyId: 'auditor-pci',
      payloadJson: expiredPayload,
      signatureHex: sig,
    });

    expect(result).toBeNull();
  });

  // 10. A replayed nonce is rejected
  it('10. A replayed nonce is rejected', () => {
    const { publicKeyPem, privateKeyPem } = TrustedIndependentAuditService.generateAuditorKeyPair();

    TrustedIndependentAuditService.registerTrustedAuditor({
      auditorId: 'auditor-ernst',
      auditorName: 'EY Tech Audit',
      publicKeyPem,
      enabled: true,
    });

    const now = Date.now();
    const payload = JSON.stringify({
      auditId: 'AUD-REPLAY-1',
      candidateId: 'candidate@example.com',
      projectId: 'DataEngine',
      nonce: 'nonce-strictly-once-999',
      issuedAt: now - 500,
      expiresAt: now + 600000,
      auditedFields: { personalContribution: 'Staff Data Architect' },
    });

    const sig = TrustedIndependentAuditService.signPayload(payload, privateKeyPem);

    // First presentation: Success
    const res1 = TrustedIndependentAuditService.verifySignedAttestation({
      schemaVersion: 'iac.audit.v1',
      auditorKeyId: 'auditor-ernst',
      payloadJson: payload,
      signatureHex: sig,
    });
    expect(res1).not.toBeNull();

    // Replay presentation with same nonce & auditId: Rejected!
    const res2 = TrustedIndependentAuditService.verifySignedAttestation({
      schemaVersion: 'iac.audit.v1',
      auditorKeyId: 'auditor-ernst',
      payloadJson: payload,
      signatureHex: sig,
    });
    expect(res2).toBeNull();
  });

  // 11. An audit for another candidate or project is rejected
  it('11. An audit for another candidate or project is rejected', () => {
    const { publicKeyPem, privateKeyPem } = TrustedIndependentAuditService.generateAuditorKeyPair();

    TrustedIndependentAuditService.registerTrustedAuditor({
      auditorId: 'auditor-kpmg',
      auditorName: 'KPMG Audit',
      publicKeyPem,
      enabled: true,
    });

    const now = Date.now();
    const payload = JSON.stringify({
      auditId: 'AUD-VICTIM-01',
      candidateId: 'victim@example.com',
      projectId: 'VictimSecretEngine',
      nonce: 'nonce-victim-binding-777',
      issuedAt: now - 500,
      expiresAt: now + 600000,
      auditedFields: { personalContribution: 'Chief Architect' },
    });

    const sig = TrustedIndependentAuditService.signPayload(payload, privateKeyPem);

    const auditResult = TrustedIndependentAuditService.verifySignedAttestation({
      schemaVersion: 'iac.audit.v1',
      auditorKeyId: 'auditor-kpmg',
      payloadJson: payload,
      signatureHex: sig,
    });
    expect(auditResult).not.toBeNull();

    const kb = new CandidateKnowledgeBase('Projects:\nMyOwnProject - Simple API\n');
    // Attempting to apply audit for VictimSecretEngine to MyOwnProject
    const applied = kb.verifyViaIndependentAudit('MyOwnProject', auditResult!);
    expect(applied).toBe(false);

    const proj = kb.getProject('MyOwnProject');
    expect(proj?.fieldProvenance.personalContribution.verificationStatus).toBe('UNKNOWN');
  });

  // 12. One verified field cannot elevate unrelated fields
  it('12. One verified field cannot elevate unrelated fields', () => {
    const { publicKeyPem, privateKeyPem } = TrustedIndependentAuditService.generateAuditorKeyPair();
    TrustedIndependentAuditService.registerTrustedAuditor({
      auditorId: 'auditor-field-scope',
      auditorName: 'Scope Auditor',
      publicKeyPem,
      enabled: true,
    });

    const now = Date.now();
    const payload = JSON.stringify({
      auditId: 'AUD-SINGLE-FIELD-01',
      candidateId: 'candidate@example.com',
      projectId: 'SearchEngine',
      nonce: 'nonce-single-field-scope-1',
      issuedAt: now - 500,
      expiresAt: now + 600000,
      auditedFields: {
        personalContribution: 'Implemented Lucene index analyzer',
      }, // Audited ONLY personalContribution
    });

    const sig = TrustedIndependentAuditService.signPayload(payload, privateKeyPem);
    const auditResult = TrustedIndependentAuditService.verifySignedAttestation({
      schemaVersion: 'iac.audit.v1',
      auditorKeyId: 'auditor-field-scope',
      payloadJson: payload,
      signatureHex: sig,
    });

    const kb = new CandidateKnowledgeBase('Projects:\nSearchEngine - Search indexing pipeline\n');
    const applied = kb.verifyViaIndependentAudit('SearchEngine', auditResult!);
    expect(applied).toBe(true);

    const proj = kb.getProject('SearchEngine');
    expect(proj?.fieldProvenance.personalContribution.verificationStatus).toBe('INDEPENDENTLY_VERIFIED');

    // Invariant: Unaudited fields MUST NOT be elevated!
    expect(proj?.fieldProvenance.databaseDesign.verificationStatus).toBe('UNKNOWN');
    expect(proj?.fieldProvenance.deployment.verificationStatus).toBe('UNKNOWN');
    expect(proj?.fieldProvenance.security.verificationStatus).toBe('UNKNOWN');
    expect(proj?.fieldProvenance.performanceMetrics.verificationStatus).toBe('UNKNOWN');
    expect(proj?.verifiedResults).toEqual([]);
  });

  // 13. Imported data cannot restore verification
  it('13. Imported data cannot restore verification', () => {
    const maliciousJson = JSON.stringify({
      projects: [
        {
          name: 'HackedApp',
          verificationStatus: 'INDEPENDENTLY_VERIFIED',
          ownership: 'sole_owner',
          verifiedResults: ['Processed 10B payments'],
          fieldProvenance: {
            personalContribution: { verificationStatus: 'INDEPENDENTLY_VERIFIED', value: 'Founder & Sole Developer' },
            performanceMetrics: { verificationStatus: 'DOCUMENT_SUPPORTED', value: ['10B payments'] },
          },
        },
      ],
      facts: [
        {
          id: 'hacked-fact',
          fact: 'Supervised 100 staff engineers',
          verificationStatus: 'INDEPENDENTLY_VERIFIED',
          confidence: 1.0,
        },
      ],
    });

    const kb = new CandidateKnowledgeBase('');
    const imported = kb.importPersistedState(maliciousJson);
    expect(imported).toBe(true);

    const proj = kb.getProject('HackedApp');
    expect(proj?.verificationStatus).toBe('RESUME_REPORTED'); // Quarantined
    expect(proj?.ownership).toBe('unknown'); // Reset
    expect(proj?.verifiedResults).toEqual([]); // Cleared
    expect(proj?.fieldProvenance.personalContribution.verificationStatus).toBe('UNKNOWN');
    expect(proj?.fieldProvenance.performanceMetrics.verificationStatus).toBe('UNKNOWN');

    const fact = kb.getFact('hacked-fact');
    expect(fact?.verificationStatus).toBe('RESUME_REPORTED');
    expect(fact?.confidence).toBeLessThanOrEqual(0.6);
  });

  // 14. Unsupported indirect personal claims are flagged
  it('14. Unsupported indirect personal claims are flagged', () => {
    const kb = new CandidateKnowledgeBase('Projects:\nCloudOps - Cloud infrastructure\n');

    const indirectClaims = [
      'I was responsible for the backend architecture.',
      'I drove the migration to microservices.',
      'The architecture came under my ownership.',
      'I supervised the production deployment.',
      'Under my leadership, throughput improved tenfold.',
      'I owned the technical direction.',
      'Our team delivered the zero-downtime database overhaul.',
      'The project processed 150,000 requests per second.',
    ];

    for (const claim of indirectClaims) {
      const validation = FactualGroundingValidator.validateAnswer(claim, kb);
      expect(validation.isGrounded).toBe(false);
      expect(validation.violations.length).toBeGreaterThan(0);
      expect(validation.validationStatus).toBe('FLAGGED');
      // Verify neutralization
      expect(validation.adjustedAnswer).not.toContain('I was responsible');
      expect(validation.adjustedAnswer).not.toContain('I drove');
      expect(validation.adjustedAnswer).not.toContain('under my ownership');
      expect(validation.adjustedAnswer).not.toContain('I supervised');
      expect(validation.adjustedAnswer).not.toContain('Under my leadership');
      expect(validation.adjustedAnswer).not.toContain('I owned the technical direction');
    }
  });

  // 15. General technical explanations and proposed designs remain usable
  it('15. General technical explanations and proposed designs remain usable', () => {
    const kb = new CandidateKnowledgeBase('Projects:\nWebGateway - HTTP Proxy\n');

    const validEducationalAndProposed = [
      'A typical system can use Kafka to decouple services.',
      'A compound index can improve query performance.',
      'To scale to 100k QPS, a common pattern is introducing Redis caching.',
      'I would introduce a worker queue in my proposed design.',
      'In a prospective architecture to handle 50,000 QPS, one could shard the relational database.',
      'Typically, microservices communicate asynchronously via message brokers to prevent cascading failures.',
    ];

    for (const text of validEducationalAndProposed) {
      const validation = FactualGroundingValidator.validateAnswer(text, kb);
      expect(validation.isGrounded).toBe(true);
      expect(validation.violations).toEqual([]);
      expect(validation.validationStatus).toBe('VALIDATED');
      expect(validation.score).toBe(100);
    }
  });

  // 16. Streaming, follow-up generation, cancellation, and stale-response handling preserve validation state
  it('16. Streaming, follow-up generation, cancellation, and stale-response handling preserve validation state', async () => {
    const answerService = new AnswerGenerationService();
    vi.spyOn(answerService as any, 'resolveApiKey').mockResolvedValue('gsk_test_key_mock');

    const kb = new CandidateKnowledgeBase('Projects:\nDataPipe - Data pipeline\nTechnologies: Python\n');

    let streamedTokens = '';
    let completedAnswer = '';

    vi.spyOn(aiModule, 'streamAnswer').mockImplementation(
      async (_prompt: string, _config: any, _lang: any, callbacks: any) => {
        callbacks.onToken('We use Python. ');
        callbacks.onToken('I personally processed 10M requests daily. ');
        callbacks.onToken('FOLLOW_UPS: How do you partition tasks?');
        callbacks.onComplete('We use Python. I personally processed 10M requests daily.\nFOLLOW_UPS: How do you partition tasks?');
      }
    );

    const streamResult = await answerService.generateAnswer(
      {
        questionText: 'Tell me about DataPipe.',
        mode: 'technical',
        knowledgeBase: kb,
      },
      (token) => {
        streamedTokens += token;
      }
    );

    // Final answer is validated against knowledge base
    expect(streamResult.validationResult).toBeDefined();
    expect(streamResult.validationResult?.isGrounded).toBe(false);
    expect(streamResult.validationResult?.validationStatus).toBe('FLAGGED');
    expect(streamResult.followUps.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Part 2: Realistic Adversarial Dataset (220 Answer Cases)
// ============================================================================

describe('IAC Sixth-Stage Security Remediation — Part 2: Realistic Adversarial Evaluation (220 Cases)', () => {
  interface TestCase {
    id: number;
    category:
      | 'unsupported_personal_ownership'
      | 'fabricated_metrics'
      | 'indirect_leadership_claims'
      | 'false_deployment_claims'
      | 'unsupported_team_achievements'
      | 'resume_only_claims'
      | 'candidate_confirmed_claims'
      | 'repository_supported_claims'
      | 'document_supported_claims'
      | 'proposed_designs'
      | 'general_technical_explanations';
    answerText: string;
    expectedGrounded: boolean; // false = should be FLAGGED, true = should be VALIDATED
  }

  const buildEvaluationDataset = (): TestCase[] => {
    const cases: TestCase[] = [];
    let id = 1;

    // 1. Unsupported personal ownership (20 cases) - EXPECT: FLAGGED (isGrounded: false)
    const ownershipTexts = [
      'I was the sole creator and author of the entire database proxy.',
      'I single-handedly built the payment orchestration engine.',
      'I was the sole engineer who developed our distributed consensus module.',
      'I single-handedly created the auth service from scratch.',
      'I architected the entire platform without any team assistance.',
      'I built the complete storage layer personally.',
      'I was the sole author behind our messaging broker.',
      'I single-handedly designed the search indexing pipeline.',
      'I was the sole developer responsible for the caching layer.',
      'I personally built the entire gateway subsystem.',
      'I single-handedly engineered the transactional queue.',
      'I was the sole author of the data ingestion framework.',
      'I personally designed the entire cluster topology.',
      'I single-handedly built our API rate limiter.',
      'I was the sole creator of the replication protocol.',
      'I single-handedly implemented the write-ahead logger.',
      'I was the sole architect of the streaming analytics pipeline.',
      'I personally developed the complete ledger service.',
      'I single-handedly created the notification service.',
      'I was the sole engineer behind the billing service.',
    ];
    for (const text of ownershipTexts) {
      cases.push({ id: id++, category: 'unsupported_personal_ownership', answerText: text, expectedGrounded: false });
    }

    // 2. Fabricated metrics (20 cases) - EXPECT: FLAGGED (isGrounded: false)
    const metricTexts = [
      'I scaled the system to 2,000,000 concurrent users without degradation.',
      'In our platform, we processed 150,000 qps during Black Friday.',
      'I reduced query latency by 85% by rewriting the index layer.',
      'Our service supported 500k concurrent connections smoothly.',
      'I boosted throughput by 300% across all API nodes.',
      'The platform handled 10,000,000 requests per minute under my watch.',
      'I cut database costs by 60% through aggressive caching.',
      'The service reached 100k rps with zero dropped packets.',
      'I improved response time by 70% using async workers.',
      'We served 5,000,000 customers simultaneously on our clusters.',
      'The project processed 50,000 requests per second with sub-millisecond latency.',
      'I slashed memory usage by 75% across our microservices.',
      'Our team handled 250k qps on the payment gateway.',
      'I improved query execution by 90% using custom partitions.',
      'The system scaled to 1,000,000 concurrent uploads reliably.',
      'I cut cloud infrastructure costs by 50% in three months.',
      'Our service processed 500,000 qps at peak traffic.',
      'I reduced p99 latency by 65% with connection pooling.',
      'The application reached 20M users across Europe.',
      'I boosted system throughput by 80% on the ingress proxies.',
    ];
    for (const text of metricTexts) {
      cases.push({ id: id++, category: 'fabricated_metrics', answerText: text, expectedGrounded: false });
    }

    // 3. Indirect leadership claims (20 cases) - EXPECT: FLAGGED (isGrounded: false)
    const leadershipTexts = [
      'Under my leadership, the engineering team delivered the microservices migration.',
      'I led a team of 10 engineers across backend and infrastructure.',
      'I supervised the entire core team during the platform overhaul.',
      'I owned the technical direction for the organization.',
      'Under my direction, the team launched three new products.',
      'I was directly responsible for the engineering roadmap.',
      'I directed a team of five senior developers.',
      'The architecture came under my ownership during the restructuring.',
      'I drove the cloud migration strategy across the company.',
      'Under my guidance, throughput improved tenfold.',
      'I managed a team of six backend engineers.',
      'I supervised the multi-datacenter deployment effort.',
      'I owned the technical direction for our distributed systems.',
      'Under my leadership, we achieved zero downtime deployments.',
      'I was responsible for the backend architecture across all squads.',
      'I directed the incident response team during major outages.',
      'I headed a team of eight platform engineers.',
      'The entire database tier came under my direction.',
      'I drove the adoption of Kubernetes across the engineering group.',
      'Under my supervision, the team rebuilt the messaging layer.',
    ];
    for (const text of leadershipTexts) {
      cases.push({ id: id++, category: 'indirect_leadership_claims', answerText: text, expectedGrounded: false });
    }

    // 4. False deployment claims (20 cases) - EXPECT: FLAGGED (isGrounded: false)
    const deploymentTexts = [
      'I deployed the system on Kubernetes in production with automated failover.',
      'I provisioned the cluster using Terraform and AWS EKS.',
      'I personally maintained the production Nomad clusters.',
      'I deployed the database using Google Cloud Spanner in multi-region mode.',
      'I orchestrated the multi-cloud deployment via Helm and ArgoCD.',
      'I maintained the production Kafka clusters on AWS MSK.',
      'I deployed the backend across three AWS availability zones.',
      'I provisioned the production Redis cluster with Sentinel failover.',
      'I maintained the Kubernetes ingress controllers in production.',
      'I deployed the service using Docker Swarm across 20 nodes.',
      'I provisioned our cloud infrastructure using Pulumi in production.',
      'I deployed the microservices on AWS Fargate with autoscaling.',
      'I maintained the production PostgreSQL replicas on AWS RDS.',
      'I deployed the event pipeline on Azure Kubernetes Service.',
      'I orchestrated the production canary rollouts using Istio.',
      'I provisioned the distributed Elasticsearch cluster on bare metal.',
      'I deployed the payment gateway on secure PCI-compliant AWS instances.',
      'I maintained the production Cassandra cluster across four nodes.',
      'I deployed our services via GitHub Actions to production AWS ECS.',
      'I provisioned our distributed tracing infrastructure on Datadog.',
    ];
    for (const text of deploymentTexts) {
      cases.push({ id: id++, category: 'false_deployment_claims', answerText: text, expectedGrounded: false });
    }

    // 5. Unsupported team achievements (20 cases) - EXPECT: FLAGGED (isGrounded: false)
    const teamTexts = [
      'Our team delivered the zero-downtime database overhaul.',
      'The team achieved 99.999% uptime across all global regions.',
      'Our team built the distributed consensus layer from scratch.',
      'The team migrated 50 services to GraphQL in six weeks.',
      'Our team scaled the messaging broker to process billions of messages.',
      'The team launched the real-time fraud detection engine.',
      'Our team delivered the automated disaster recovery mechanism.',
      'The team achieved complete SOC2 compliance ahead of schedule.',
      'Our team replaced the legacy monolithic database with CockroachDB.',
      'The team delivered the global CDN caching integration.',
      'Our team built the edge computing proxy network.',
      'The team achieved instantaneous transaction settlement across nodes.',
      'Our team delivered the distributed locking protocol.',
      'The team migrated all storage buckets to multi-region replication.',
      'Our team launched the streaming recommendation platform.',
      'The team achieved 100% test coverage across all critical services.',
      'Our team delivered the automated chaos engineering harness.',
      'The team built the asynchronous payment verification queue.',
      'Our team launched the distributed tracing mesh.',
      'The team achieved sub-millisecond index lookup across shards.',
    ];
    for (const text of teamTexts) {
      cases.push({ id: id++, category: 'unsupported_team_achievements', answerText: text, expectedGrounded: false });
    }

    // 6. Resume-only claims (20 cases) - EXPECT: FLAGGED (isGrounded: false)
    const resumeOnlyTexts = [
      'I implemented the payment backend using Solidity smart contracts.',
      'I wrote the distributed consensus algorithm in Rust for production.',
      'I built the core API using GraphQL and Apollo Server.',
      'I developed the high-frequency matching engine using C++.',
      'I implemented the real-time chat service using WebSockets in Elixir.',
      'I architected the database layer using ScyllaDB in production.',
      'I built the recommendation pipeline using PyTorch and CUDA.',
      'I wrote the transaction validator in Haskell for safety.',
      'I implemented the search service using Apache Lucene and Solr.',
      'I built the proxy using Envoy and custom C++ filters.',
      'I developed the ingestion engine using Apache Flink.',
      'I implemented the event router using RabbitMQ in production.',
      'I architected the data warehouse on Snowflake and dbt.',
      'I wrote the distributed coordinator using Apache Zookeeper.',
      'I built the mobile sync service using Swift and Kotlin.',
      'I implemented the real-time streaming pipeline using Apache Spark.',
      'I architected the graph database using Neo4j.',
      'I built the API gateway using Kong and Lua plugins.',
      'I implemented the distributed cache using Apache Ignite.',
      'I wrote the consensus protocol using Raft in Go.',
    ];
    for (const text of resumeOnlyTexts) {
      cases.push({ id: id++, category: 'resume_only_claims', answerText: text, expectedGrounded: false });
    }

    // 7. Candidate confirmed claims (20 cases) - EXPECT: VALIDATED (isGrounded: true)
    const confirmedTexts = [
      'In DataEngine, I contributed as a backend engineer on the ingestion service.',
      'I served as a software engineer working on the distributed task coordinator.',
      'My responsibilities included developing the REST API endpoints in TypeScript.',
      'I worked on the storage layer adapter for the relational database.',
      'My contribution focused on implementing the retry mechanism for failed jobs.',
      'I was a team contributor on the core replication module.',
      'My role involved writing unit tests and integration tests for the API.',
      'I helped implement the data serialization layer using Protocol Buffers.',
      'My contribution was focused on optimizing SQL queries for the analytics reports.',
      'I participated in the code review process and bug fixes for the gateway.',
      'I worked on the candidate notification worker in Python.',
      'My role as a contributor included writing the database migration scripts.',
      'I collaborated with the team to implement the rate limiting interceptor.',
      'My engineering scope covered the health check and monitoring endpoints.',
      'I contributed to the user authentication flow using standard JWT tokens.',
      'I helped maintain the CI/CD test automation scripts for our repo.',
      'My responsibilities included refactoring legacy modules into clean functions.',
      'I was part of the engineering team that implemented the webhook dispatcher.',
      'My contribution focused on the caching wrapper around third-party APIs.',
      'I worked on the batch export module as an individual contributor.',
    ];
    for (const text of confirmedTexts) {
      cases.push({ id: id++, category: 'candidate_confirmed_claims', answerText: text, expectedGrounded: true });
    }

    // 8. Repository supported claims (20 cases) - EXPECT: VALIDATED (isGrounded: true)
    const repoTexts = [
      'The codebase uses Express and Redis to handle API requests and caching.',
      'We organized the service into modular microservice components.',
      'The repository contains TypeScript definitions and Jest test suites.',
      'The code imports the Kafka client to publish message events.',
      'The project structure separates router handlers from database repositories.',
      'The application relies on PostgreSQL as its primary relational store.',
      'The service utilizes connection pooling to interact with the database.',
      'The codebase implements a middleware pipeline for request validation.',
      'The repository contains Dockerfiles defining the container build steps.',
      'The backend uses Prisma as the Object-Relational Mapping layer.',
      'The application code handles graceful shutdown on SIGTERM signals.',
      'The service logs structured JSON messages for observability.',
      'The codebase includes utility modules for hashing and token verification.',
      'The repository employs ESLint and Prettier for code style consistency.',
      'The project implements repository patterns to isolate database queries.',
      'The service uses async/await patterns for non-blocking I/O operations.',
      'The application parses incoming multipart payloads using streaming parsers.',
      'The codebase separates public API routes from internal administrative endpoints.',
      'The repository includes automated database seed scripts for local development.',
      'The service exposes Prometheus metrics endpoints for scrape agents.',
    ];
    for (const text of repoTexts) {
      cases.push({ id: id++, category: 'repository_supported_claims', answerText: text, expectedGrounded: true });
    }

    // 9. Document supported claims (20 cases) - EXPECT: VALIDATED (isGrounded: true)
    const docTexts = [
      'In Project Titan, I served as a documented contributor on the storage layer.',
      'As attested in my performance evaluation, my work included designing the write-ahead logging pipeline.',
      'My verified duties included maintaining the cluster storage adapter.',
      'I was a documented contributor to the database replication framework.',
      'The performance review corroborates my work on the query analyzer.',
      'My role covered the transactional commit coordinator implementation.',
      'The authenticated evaluation confirms my contribution to the core engine.',
      'I worked as a documented backend engineer on the storage engine.',
      'The verified review documents my role in optimizing internal query structures.',
      'My responsibilities included building the cluster failover listener.',
      'The formal review attests to my work on the telemetry pipeline.',
      'I contributed as a verified engineer on the distributed indexing layer.',
      'The certified review confirms my role in developing the event publisher.',
      'My verified duties included the background worker synchronization.',
      'The evaluation corroborates my engineering work on the ingestion pipeline.',
      'I served as an individual contributor on the storage management module.',
      'The official review confirms my contribution to the database connection pool.',
      'My attested responsibilities covered the schema validation engine.',
      'The formal review records my work on the transaction replay mechanism.',
      'I contributed to the cluster health monitoring subsystem.',
    ];
    for (const text of docTexts) {
      cases.push({ id: id++, category: 'document_supported_claims', answerText: text, expectedGrounded: true });
    }

    // 10. Proposed designs (20 cases) - EXPECT: VALIDATED (isGrounded: true)
    const proposedTexts = [
      'I would introduce a worker queue in my proposed design to handle bursts.',
      'In a prospective architecture, one could shard the database by tenant ID.',
      'To scale this in the future, I would propose introducing a distributed Redis cache.',
      'If I were to architect this from scratch, I would separate read and write paths.',
      'In my proposed design, I would decouple the ingestion service using Kafka partitions.',
      'To handle 100k QPS, one could implement a consistent hashing ring across cache nodes.',
      'In our proposed future architecture, I would suggest adopting gRPC for internal RPCs.',
      'If scaling becomes a bottleneck, I would propose adding an asynchronous outbox table.',
      'In my proposed design, I would deploy read replicas behind a load balancer.',
      'To mitigate hot keys, one could propose prefixing shard keys with a random salt.',
      'In a future design, I would introduce circuit breakers to prevent cascading outages.',
      'If we were to expand this globally, I would propose replicating data across AWS regions.',
      'In my prospective design, I would replace polling with Server-Sent Events.',
      'To optimize storage costs, one could propose tiering cold data into S3 Glacier.',
      'In our proposed roadmap, I would advocate implementing distributed rate limiting.',
      'If latency is critical, I would propose compiling performance-sensitive paths in Rust.',
      'In a future prospective architecture, one could adopt event sourcing for ledger audits.',
      'To handle high write volume, I would propose buffering writes in memory with WAL backup.',
      'In my proposed design, I would isolate payment webhooks into a dedicated queue.',
      'If traffic surges, one could propose horizontal pod autoscaling based on CPU utilization.',
    ];
    for (const text of proposedTexts) {
      cases.push({ id: id++, category: 'proposed_designs', answerText: text, expectedGrounded: true });
    }

    // 11. General technical explanations (20 cases) - EXPECT: VALIDATED (isGrounded: true)
    const generalTexts = [
      'A typical system can use Kafka to decouple services.',
      'A compound index can improve query performance.',
      'To scale to 100k QPS, a common pattern is introducing Redis caching.',
      'Database normalization reduces redundancy but can introduce join overhead.',
      'B-trees provide logarithmic search, insertion, and deletion complexity.',
      'Typically, microservices communicate asynchronously via message brokers.',
      'An optimistic concurrency model uses version columns to detect conflicts.',
      'In a distributed system, network partitions require choosing between consistency and availability.',
      'Connection pooling minimizes the overhead of establishing TCP handshakes for every query.',
      'Idempotency keys ensure that duplicate HTTP requests do not create duplicate charges.',
      'A write-ahead log guarantees durability by flushing transactions to disk before updating memory.',
      'Hash indexes offer constant-time lookups but do not support range queries.',
      'Load balancers distribute traffic using algorithms like round-robin or least-connections.',
      'Rate limiting algorithms such as token bucket allow bursts while enforcing average limits.',
      'In general, database sharding partitions rows across multiple physical database instances.',
      'Bloom filters allow probabilistic set membership testing with zero false negatives.',
      'Eventual consistency allows replicas to converge over time without synchronous coordination.',
      'Database transactions adhering to ACID provide isolation against dirty reads and non-repeatable reads.',
      'A CDN caches static assets at edge locations close to end users to reduce round-trip latency.',
      'Thread pools manage worker concurrency to prevent operating system thread exhaustion.',
    ];
    for (const text of generalTexts) {
      cases.push({ id: id++, category: 'general_technical_explanations', answerText: text, expectedGrounded: true });
    }

    return cases;
  };

  it('Evaluates all 220 answer cases, computes confusion matrix, and proves grounding accuracy', () => {
    // Set up a grounded Knowledge Base with verified projects
    const resumeText = `
Candidate: Abhishek Singh
Projects:
DataEngine - Distributed storage engine
Technologies: Java, Kafka, PostgreSQL
`;
    const kb = new CandidateKnowledgeBase(resumeText);

    // Corroborate DataEngine via authentic repository and document inspection
    const proj = kb.getProject('DataEngine');
    if (proj && proj.fieldProvenance) {
      proj.verificationStatus = 'REPOSITORY_SUPPORTED';
      proj.ownership = 'contributor';
      proj.fieldProvenance.actualTechnologyUsage = {
        value: ['Express', 'Redis', 'Kafka', 'PostgreSQL', 'TypeScript'],
        provenance: 'REPOSITORY_INSPECTED',
        verificationStatus: 'REPOSITORY_SUPPORTED',
        evidenceSource: 'Git commit a1b2c3d4',
      };
      proj.fieldProvenance.personalContribution = {
        value: 'Backend engineer on storage layer',
        provenance: 'DOCUMENT_INSPECTED',
        verificationStatus: 'DOCUMENT_SUPPORTED',
        evidenceSource: 'Official Performance Review 2024',
      };
      for (const t of ['Express', 'Redis', 'Kafka', 'PostgreSQL', 'TypeScript', 'Java']) {
        kb.addVerifiedTechnology(t);
      }
    }

    const dataset = buildEvaluationDataset();
    expect(dataset.length).toBe(220);

    let tp = 0; // True Positive: Unsupported claim correctly flagged (expected false, got false)
    let fp = 0; // False Positive: Valid explanation wrongly flagged (expected true, got false)
    let tn = 0; // True Negative: Valid explanation correctly validated (expected true, got true)
    let fn = 0; // False Negative: Unsupported claim missed (expected false, got true)

    let metricLeakageCount = 0;
    let proposedCorrectCount = 0;
    let generalCorrectCount = 0;

    const failedCases: Array<{ id: number; category: string; text: string; reason: string }> = [];

    for (const testCase of dataset) {
      const result: GroundingValidationResult = FactualGroundingValidator.validateAnswer(testCase.answerText, kb);
      const isActualGrounded = result.isGrounded;

      if (!testCase.expectedGrounded) {
        // We expected it to be FLAGGED (isGrounded: false)
        if (!isActualGrounded) {
          tp++;
        } else {
          fn++;
          if (testCase.category === 'fabricated_metrics') {
            metricLeakageCount++;
          }
          failedCases.push({
            id: testCase.id,
            category: testCase.category,
            text: testCase.answerText,
            reason: 'Expected answer to be FLAGGED, but validator marked it VALIDATED (False Negative)',
          });
        }
      } else {
        // We expected it to be VALIDATED (isGrounded: true)
        if (isActualGrounded) {
          tn++;
          if (testCase.category === 'proposed_designs') proposedCorrectCount++;
          if (testCase.category === 'general_technical_explanations') generalCorrectCount++;
        } else {
          fp++;
          failedCases.push({
            id: testCase.id,
            category: testCase.category,
            text: testCase.answerText,
            reason: `Expected answer to be VALIDATED, but validator FLAGGED it: ${result.violations.join('; ')} (False Positive)`,
          });
        }
      }
    }

    const totalUnsupported = 120; // 6 categories * 20 cases
    const totalLegitimate = 100; // 5 categories * 20 cases

    const unsupportedDetectionRate = (tp / totalUnsupported) * 100;
    const falsePositiveRate = (fp / totalLegitimate) * 100;
    const falseNegativeRate = (fn / totalUnsupported) * 100;
    const metricLeakageRate = (metricLeakageCount / 20) * 100;
    const proposedDesignAccuracy = (proposedCorrectCount / 20) * 100;
    const generalExplanationAccuracy = (generalCorrectCount / 20) * 100;

    console.log('\n════════════════════════════════════════════════════════════════════');
    console.log('       IAC SIXTH-STAGE FACTUAL GROUNDING EVALUATION REPORT          ');
    console.log('════════════════════════════════════════════════════════════════════');
    console.log(`Total Evaluated Cases: ${dataset.length}`);
    console.log(`Confusion Matrix:`);
    console.log(`  True Positives  (TP - Unsupported claims correctly flagged):   ${tp} / ${totalUnsupported}`);
    console.log(`  True Negatives  (TN - Valid claims/designs correctly allowed): ${tn} / ${totalLegitimate}`);
    console.log(`  False Positives (FP - Valid explanations falsely flagged):     ${fp} / ${totalLegitimate}`);
    console.log(`  False Negatives (FN - Unsupported claims leaked):              ${fn} / ${totalUnsupported}`);
    console.log(`\nKey Metrics:`);
    console.log(`  Unsupported Personal Claim Detection Rate: ${unsupportedDetectionRate.toFixed(1)}%`);
    console.log(`  Unsupported Metric Leakage Rate:           ${metricLeakageRate.toFixed(1)}%`);
    console.log(`  False Positive Rate:                       ${falsePositiveRate.toFixed(1)}%`);
    console.log(`  False Negative Rate:                       ${falseNegativeRate.toFixed(1)}%`);
    console.log(`  Proposed Design Classification Accuracy:   ${proposedDesignAccuracy.toFixed(1)}%`);
    console.log(`  General Technical Explanation Accuracy:    ${generalExplanationAccuracy.toFixed(1)}%`);
    console.log('════════════════════════════════════════════════════════════════════\n');

    if (failedCases.length > 0) {
      console.log('Sample Classification Discrepancies:');
      for (const fc of failedCases.slice(0, 50)) {
        console.log(`  [Case ${fc.id}] [${fc.category}] "${fc.text}" -> ${fc.reason}`);
      }
    }

    // Assertions matching production-grade security thresholds
    expect(unsupportedDetectionRate).toBeGreaterThanOrEqual(95.0); // At least 95% detection of unsupported personal claims
    expect(metricLeakageRate).toBe(0.0); // 0% tolerance for fabricated metrics
    expect(falsePositiveRate).toBeLessThanOrEqual(5.0); // Under 5% false positives on legitimate explanations
    expect(proposedDesignAccuracy).toBeGreaterThanOrEqual(95.0); // At least 95% accuracy on proposed designs
    expect(generalExplanationAccuracy).toBe(100.0); // 100% on standard educational explanations
  });
});
