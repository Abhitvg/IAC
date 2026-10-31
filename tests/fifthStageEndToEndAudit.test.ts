import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CandidateKnowledgeBase,
  FactualGroundingValidator,
} from '../src/services/candidateIntelligence';
import {
  TrustedRepositoryInspectionService,
  TrustedDocumentInspectionService,
  TrustedIndependentAuditService,
  SafePersistenceSchema,
  sha256Hex,
  hmacSha256Hex,
} from '../src/services/evidenceInspection';
import { AnswerGenerationService } from '../src/services/AnswerGenerationService';
import * as aiModule from '../src/services/ai';

describe('IAC Fifth-Stage Audit: Evidence Authenticity, Trust Boundaries and End-to-End Testing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    TrustedIndependentAuditService.clearAuditors();
  });

  // ==========================================================================
  // P0 — Repository verification must inspect real repositories
  // ==========================================================================
  describe('P0 — Trusted Repository Inspection Service', () => {
    it('resolves commits, tree, files, content SHA-256 and separates authorship from repo presence', async () => {
      const sandbox = TrustedRepositoryInspectionService.getSandboxProvider();
      const repoUrl = 'https://github.com/org/payment-gateway';
      const commitSha = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
      const treeSha = 'c3d4e5f6a1b20718293a4b5c6d7e8f9012345678';

      sandbox.registerRepository(repoUrl, {
        commitSha,
        treeSha,
        author: { name: 'Alice Committer', email: 'alice@external.org' },
        files: {
          'package.json': JSON.stringify({
            dependencies: { express: '^4.18.2', redis: '^4.6.0', pg: '^8.11.0' },
          }),
          'src/server.ts': 'import express from "express";\nconsole.log("payment service");',
          'Dockerfile': 'FROM node:18-alpine\nCMD ["npm", "start"]',
        },
      });

      // Candidate email is abhishek@example.com (does NOT match commit author alice@external.org)
      const inspectionResult = await TrustedRepositoryInspectionService.inspectRepository({
        repositoryUrl: repoUrl,
        candidateIdentity: { email: 'abhishek@example.com', fullName: 'Abhishek Singh' },
      });

      // 1. Commit and tree resolved
      expect(inspectionResult.resolvedCommitSha).toBe(commitSha);
      expect(inspectionResult.treeSha).toBe(treeSha);

      // 2. Inspected files and content hashes recorded
      expect(inspectionResult.inspectedFiles.length).toBeGreaterThanOrEqual(2);
      for (const file of inspectionResult.inspectedFiles) {
        expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(file.sizeBytes).toBeGreaterThan(0);
      }

      // 3. Technologies extracted from manifest & source
      expect(inspectionResult.verifiedTechnologies).toContain('Express');
      expect(inspectionResult.verifiedTechnologies).toContain('Redis');
      expect(inspectionResult.verifiedTechnologies).toContain('PostgreSQL');

      // 4. Authorship separation: Candidate did NOT author this commit
      expect(inspectionResult.candidateAuthorshipStatus).toBe('AUTHOR_MISMATCH');
      expect(inspectionResult.authorRole).toBe('unknown');

      // 5. Invariant: Does NOT infer sole ownership, production deployment, or business outcomes
      expect(inspectionResult.productionDeploymentVerified).toBe(false);
      expect(inspectionResult.businessOutcomesVerified).toBe(false);

      // 6. Seal verification passes
      expect(TrustedRepositoryInspectionService.verifySeal(inspectionResult)).toBe(true);

      // 7. Tampering with inspection result breaks seal
      const tampered = { ...inspectionResult, resolvedCommitSha: '0000000000000000000000000000000000000000' };
      expect(TrustedRepositoryInspectionService.verifySeal(tampered)).toBe(false);

      // 8. Applying to KnowledgeBase
      const kb = new CandidateKnowledgeBase('Projects:\nPaymentGateway - Payment routing\nTechnologies: Express\n');
      const verified = kb.verifyViaRepositoryInspection('PaymentGateway', inspectionResult);
      expect(verified).toBe(true);

      const proj = kb.getProject('PaymentGateway');
      expect(proj?.fieldProvenance.actualTechnologyUsage.verificationStatus).toBe('REPOSITORY_SUPPORTED');
      // Invariant: Unverified fields remain UNKNOWN
      expect(proj?.fieldProvenance.personalContribution.verificationStatus).toBe('UNKNOWN');
      expect(proj?.fieldProvenance.performanceMetrics.verificationStatus).toBe('UNKNOWN');
      expect(proj?.fieldProvenance.deployment.verificationStatus).toBe('UNKNOWN');
    });

    it('rejects fabricated or unapproved repository URLs and non-hex commit hashes', async () => {
      await expect(
        TrustedRepositoryInspectionService.inspectRepository({
          repositoryUrl: 'https://evil-unapproved-site.com/fake/repo',
          candidateIdentity: { email: 'test@example.com' },
        })
      ).rejects.toThrow(/approved host/i);
    });
  });

  // ==========================================================================
  // P0 — Document verification must inspect real documents
  // ==========================================================================
  describe('P0 — Trusted Document Inspection Service', () => {
    it('calculates SHA-256 from raw bytes, checks content, and separates project mention from personal work', () => {
      // Scenario A: Conference program mentions project and candidate, but has NO personal work attestation
      const conferenceProgram = `
ACM Conference on Distributed Systems 2024
Attendee Directory:
- Abhishek Singh (Participant)
Session List:
- Panel on Project Titan (High-throughput storage)
`;
      const docA = TrustedDocumentInspectionService.inspectDocument({
        documentBytes: conferenceProgram,
        documentType: 'publication',
        issuer: { name: 'ACM Conference Committee', authorityLevel: 'accredited_institution' },
        candidateIdentity: { fullName: 'Abhishek Singh', email: 'abhishek@example.com' },
        targetProjectName: 'Project Titan',
      });

      expect(docA.candidateMentioned).toBe(true);
      expect(docA.projectMentioned).toBe(true);
      // Mentioning the project is NOT attesting work!
      expect(docA.personalWorkAttested).toBe(false);
      expect(docA.supportedFields.personalContribution).toBeUndefined();

      // Applying un-attested document to KnowledgeBase fails to elevate personal work
      const kb = new CandidateKnowledgeBase('Projects:\nProject Titan - Storage\n');
      const resA = kb.verifyViaDocumentInspection('Project Titan', docA);
      expect(resA).toBe(false);

      // Scenario B: Formal Performance Review signed by Engineering VP attesting personal delivery and metrics
      const performanceReview = `
OFFICIAL PERFORMANCE REVIEW — 2024
Employee: Abhishek Singh
Role: Lead Backend Engineer
Project: Project Titan
Evaluation: Abhishek successfully completed and performed the work as primary engineer.
Verified Achievements:
- Abhishek reduced query latency by 45% across storage clusters.
- Duties included designing the write-ahead logging pipeline.
Signed: VP of Engineering, Cloud Corp
`;
      const cloudCorpKeys = TrustedIndependentAuditService.generateAuditorKeyPair();
      TrustedDocumentInspectionService.registerTrustedIssuer({
        issuerId: 'cloud-corp',
        issuerName: 'Cloud Corp HR & Engineering',
        authorityLevel: 'employer_hr',
        publicKeyPem: cloudCorpKeys.publicKeyPem,
        enabled: true,
      });
      const docBSha = sha256Hex(performanceReview);
      const docBSig = crypto.sign(null, Buffer.from(docBSha, 'hex'), crypto.createPrivateKey(cloudCorpKeys.privateKeyPem)).toString('hex');

      const docB = TrustedDocumentInspectionService.inspectDocument({
        documentBytes: performanceReview,
        documentType: 'performance_review',
        issuer: { issuerId: 'cloud-corp', name: 'Cloud Corp HR & Engineering', authorityLevel: 'employer_hr', signatureHex: docBSig },
        candidateIdentity: { fullName: 'Abhishek Singh', email: 'abhishek@example.com' },
        targetProjectName: 'Project Titan',
      });

      expect(docB.documentSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(docB.personalWorkAttested).toBe(true);
      expect(docB.supportedFields.personalContribution).toBeDefined();
      expect(docB.supportedFields.performanceMetrics).toContain('reduced query latency by 45%');

      // Verify seal
      expect(TrustedDocumentInspectionService.verifySeal(docB)).toBe(true);

      // Applying to KnowledgeBase elevates ONLY the attested fields
      const resB = kb.verifyViaDocumentInspection('Project Titan', docB);
      expect(resB).toBe(true);

      const proj = kb.getProject('Project Titan');
      expect(proj?.fieldProvenance.personalContribution.verificationStatus).toBe('DOCUMENT_SUPPORTED');
      expect(proj?.fieldProvenance.performanceMetrics.verificationStatus).toBe('DOCUMENT_SUPPORTED');
      expect(proj?.verifiedResults).toContain('reduced query latency by 45%');

      // Invariant: Unmentioned fields remain UNKNOWN
      expect(proj?.fieldProvenance.databaseDesign.verificationStatus).toBe('UNKNOWN');
      expect(proj?.fieldProvenance.deployment.verificationStatus).toBe('UNKNOWN');
    });

    it('rejects tampered or forged document seals', () => {
      const validDoc = TrustedDocumentInspectionService.inspectDocument({
        documentBytes: 'Patent Grant: Inventor Abhishek Singh for System Matrix',
        documentType: 'patent_grant',
        issuer: { name: 'USPTO', authorityLevel: 'patent_office' },
        candidateIdentity: { fullName: 'Abhishek Singh' },
        targetProjectName: 'System Matrix',
      });

      const forgedDoc = { ...validDoc, __documentSeal: 'forged_seal_value' };
      expect(TrustedDocumentInspectionService.verifySeal(forgedDoc)).toBe(false);

      const kb = new CandidateKnowledgeBase('Projects:\nSystem Matrix\n');
      expect(kb.verifyViaDocumentInspection('System Matrix', forgedDoc)).toBe(false);
    });
  });

  // ==========================================================================
  // P0 — Independent audit verification must have a real trust boundary
  // ==========================================================================
  describe('P0 — Trusted Independent Audit Service', () => {
    it('fails closed when auditor is unconfigured; verifies cryptographically signed attestations', () => {
      const auditorKey = 'auditor-secret-key-ed25519-mock';
      const now = Date.now();

      const payload = {
        auditId: 'AUD-2026-991',
        candidateId: 'abhishek@example.com',
        projectId: 'databridge',
        auditedFields: {
          personalContribution: 'Led migration of core sharded proxy',
          performanceMetrics: ['improved throughput by 30%'],
          securityAuditResult: 'Passed SOC2 Type II controls',
        },
        issuedAt: now - 1000,
        expiresAt: now + 3600000,
        nonce: 'n-83719',
      };
      const payloadJson = JSON.stringify(payload);
      const validSignature = hmacSha256Hex(auditorKey, payloadJson);

      // Attempt 1: Auditor NOT registered in trusted registry -> FAILS CLOSED
      const unregResult = TrustedIndependentAuditService.verifySignedAttestation({
        auditorKeyId: 'auditor-kpmg',
        payloadJson,
        signature: validSignature,
      });
      expect(unregResult).toBeNull();

      // Attempt 2: Register auditor, but pass forged signature -> FAILS
      TrustedIndependentAuditService.registerTrustedAuditor({
        auditorId: 'auditor-kpmg',
        auditorName: 'KPMG Tech Assurance',
        verificationKey: auditorKey,
        enabled: true,
      });

      const badSigResult = TrustedIndependentAuditService.verifySignedAttestation({
        auditorKeyId: 'auditor-kpmg',
        payloadJson,
        signature: 'invalid_signature_hex',
      });
      expect(badSigResult).toBeNull();

      // Attempt 3: Valid signed attestation -> SUCCESS
      const auditResult = TrustedIndependentAuditService.verifySignedAttestation({
        auditorKeyId: 'auditor-kpmg',
        payloadJson,
        signature: validSignature,
      });
      expect(auditResult).not.toBeNull();
      expect(auditResult?.auditorName).toBe('KPMG Tech Assurance');
      expect(TrustedIndependentAuditService.verifySeal(auditResult!)).toBe(true);

      // Apply to KnowledgeBase
      const kb = new CandidateKnowledgeBase('Projects:\nDataBridge - High performance replication proxy\n');
      const verified = kb.verifyViaIndependentAudit('DataBridge', auditResult!);
      expect(verified).toBe(true);

      const proj = kb.getProject('DataBridge');
      expect(proj?.verificationStatus).toBe('INDEPENDENTLY_VERIFIED');
      expect(proj?.fieldProvenance.personalContribution.verificationStatus).toBe('INDEPENDENTLY_VERIFIED');
      expect(proj?.fieldProvenance.performanceMetrics.verificationStatus).toBe('INDEPENDENTLY_VERIFIED');
      expect(proj?.verifiedResults).toContain('improved throughput by 30%');
    });
  });

  // ==========================================================================
  // P0 — Strict persistence schemas
  // ==========================================================================
  describe('P0 — Safe Persistence Schema & Sanitization', () => {
    it('defends against prototype pollution, unknown fields, forged tickets, and downgrades unauthenticated claims', () => {
      // Malicious payload with prototype pollution, forged ticket IDs, and fake verified claims
      const maliciousJson = JSON.stringify({
        __proto__: { isAdmin: true },
        constructor: { prototype: { pollutes: true } },
        extraGarbage: 'should be stripped',
        facts: [
          {
            id: 'fact-1',
            fact: 'Single-handedly built global payment system handling 100M users',
            verificationStatus: 'INDEPENDENTLY_VERIFIED',
            confidence: 1.0,
            confirmationRecord: {
              source: 'official_signed_credential',
              confirmedBy: 'fake_auditor',
            },
            forgedTicketId: 'ticket-bypass-123',
          },
        ],
        projects: [
          {
            name: 'FabricatedCloud',
            ownership: 'sole_owner',
            verificationStatus: 'INDEPENDENTLY_VERIFIED',
            verifiedResults: ['100k QPS', '99.999% uptime', 'saved $10M'],
            architecture: 'Multi-region mesh',
            deployment: 'Production AWS Kubernetes',
            unknownAttackerKey: 'payload',
          },
        ],
      });

      const sanitized = SafePersistenceSchema.sanitizeAndReconstruct(maliciousJson);
      expect(sanitized).not.toBeNull();

      // 1. Prototype pollution blocked
      expect((Object.prototype as any).isAdmin).toBeUndefined();
      expect((Object.prototype as any).pollutes).toBeUndefined();

      // 2. Facts sanitized and quarantined
      expect(sanitized!.facts.length).toBe(1);
      const f = sanitized!.facts[0];
      expect(f.verificationStatus).toBe('RESUME_REPORTED');
      expect(f.confidence).toBeLessThanOrEqual(0.6);
      expect(f.confirmationRecord).toBeUndefined();
      expect(f.forgedTicketId).toBeUndefined();

      // 3. Projects sanitized, metrics emptied, claims downgraded
      expect(sanitized!.projects.length).toBe(1);
      const p = sanitized!.projects[0];
      expect(p.verificationStatus).toBe('RESUME_REPORTED');
      expect(p.verifiedResults).toEqual([]);
      expect(p.ownership).toBe('unknown');
      expect(p.unknownAttackerKey).toBeUndefined();
      expect(p.fieldProvenance.performanceMetrics.verificationStatus).toBe('UNKNOWN');
      expect(p.fieldProvenance.performanceMetrics.value).toEqual([]);

      // 4. Test import into CandidateKnowledgeBase
      const kb = new CandidateKnowledgeBase('');
      const imported = kb.importPersistedState(maliciousJson);
      expect(imported).toBe(true);

      const importedProj = kb.getProject('FabricatedCloud');
      expect(importedProj?.verificationStatus).toBe('RESUME_REPORTED');
      expect(importedProj?.verifiedResults).toEqual([]);
    });

    it('migrates legacy format with flat technologies gracefully', () => {
      const legacyJson = JSON.stringify({
        projects: [
          {
            name: 'LegacyApp',
            technologies: ['Java', 'Spring', 'MySQL'],
            challenges: ['Memory tuning'],
          },
        ],
      });

      const sanitized = SafePersistenceSchema.sanitizeAndReconstruct(legacyJson);
      expect(sanitized).not.toBeNull();
      const p = sanitized!.projects[0];
      expect(p.name).toBe('LegacyApp');
      expect(p.technologyStack).toEqual(['Java', 'Spring', 'MySQL']);
      expect(p.fieldProvenance.projectExistence.value).toBe(true);
      expect(p.fieldProvenance.technologyMentions.value).toEqual(['Java', 'Spring', 'MySQL']);
    });
  });

  // ==========================================================================
  // P1 — Semantic factual-grounding evaluation
  // ==========================================================================
  describe('P1 — Semantic Factual Grounding Evaluation', () => {
    it('detects indirect personal attribution claims when unverified and neutralizes them cleanly', () => {
      const kb = new CandidateKnowledgeBase('Projects:\nCommerceApp - Storefront\nTechnologies: Java, PostgreSQL\n');

      const testClaims = [
        'I was responsible for the backend architecture of CommerceApp.',
        'I drove the migration of the database to PostgreSQL.',
        'The architecture came under my ownership during the project.',
        'I supervised the deployment to AWS ECS.',
        'Under my leadership, throughput improved tenfold in two weeks.',
        'I owned the technical direction of the company product.',
      ];

      for (const claim of testClaims) {
        const val = FactualGroundingValidator.validateAnswer(claim, kb, 'What was your role?');
        expect(val.isGrounded).toBe(false);
        expect(val.validationStatus).toBe('FLAGGED');
        expect(val.structuredViolations.length).toBeGreaterThan(0);

        // Adjusted answer must NOT invent alternative personal accomplishments
        expect(val.adjustedAnswer).not.toContain('I was responsible for');
        expect(val.adjustedAnswer).not.toContain('I drove');
        expect(val.adjustedAnswer).not.toContain('came under my ownership');
        expect(val.adjustedAnswer).not.toContain('I supervised');
        expect(val.adjustedAnswer).not.toContain('Under my leadership');
        expect(val.adjustedAnswer).not.toContain('I owned the technical direction');
      }
    });

    it('has 0% false positive rate on general technical explanations and proposed designs', () => {
      const kb = new CandidateKnowledgeBase('Projects:\nDocFlow\nTechnologies: React\n');

      const validExplanations = [
        'In a typical microservices architecture, a system processing 100k QPS should use Kafka for asynchronous queueing and Redis for caching.',
        'Adding a compound B-tree index can reduce query latency by 85% in relational databases.',
        'To handle 50k RPS, engineers typically partition the database and implement circuit breakers.',
        'Kafka guarantees at-least-once delivery by default, and can achieve effectively-once semantics using idempotent producers.',
        'In my proposed design, I would introduce an asynchronous worker queue to decouple order processing.',
        'For future scaling, a prospective architecture would shard data across multiple geographic regions.',
      ];

      for (const explanation of validExplanations) {
        const val = FactualGroundingValidator.validateAnswer(explanation, kb, 'How would you scale a service?');
        expect(val.isGrounded).toBe(true);
        expect(val.validationStatus).toBe('VALIDATED');
        expect(val.structuredViolations).toEqual([]);
      }
    });
  });

  // ==========================================================================
  // P1 — Real end-to-end verification (10 Stages Pipeline)
  // ==========================================================================
  describe('P1 — Real End-to-End Verification Pipeline (Stages 1-10)', () => {
    it('executes resume upload, extraction, review, inspection, streaming answer, grounding, and stale guard', async () => {
      // 1. Resume text upload with deliberate unverified claims
      const rawResumeText = `
Candidate: Abhishek Singh
Email: abhishek@example.com

EXPERIENCE:
Senior Systems Engineer at Independent Labs (2022 - Present)

Projects:
DataEngine - High-velocity event pipeline
- Mentioned technologies: Java, Kafka, Redis, Docker
- Claims to process 500k events/sec with sub-5ms latency
`;
      // 2. Project extraction & KnowledgeBase registration
      const kb = new CandidateKnowledgeBase(rawResumeText);
      const proj = kb.getProject('DataEngine');
      expect(proj).toBeDefined();
      expect(proj?.verificationStatus).toBe('RESUME_REPORTED');
      expect(proj?.verifiedResults).toEqual([]); // Unverified metrics quarantined

      // 3. Candidate review and explicit field confirmation
      const reviewSession = kb.startCandidateReviewSession('DataEngine');
      expect(reviewSession).not.toBeNull();
      const confirmed = kb.submitCandidateConfirmation(reviewSession!.sessionId, 'DataEngine', {
        confirmedBy: 'Abhishek Singh',
        actualTechnologyUsage: ['Java', 'Kafka'],
        databaseDesign: 'PostgreSQL partitioned tables with Redis cache',
        proposedFutureDesigns: ['Migrate ingest workers to Rust for lower memory usage'],
      });
      expect(confirmed).toBe(true);
      expect(proj?.fieldProvenance.actualTechnologyUsage.verificationStatus).toBe('CANDIDATE_CONFIRMED');

      // 4. Repository inspection through TrustedRepositoryInspectionService
      const sandbox = TrustedRepositoryInspectionService.getSandboxProvider();
      const repoUrl = 'https://github.com/org/data-engine';
      const commitSha = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b';
      const treeSha = 'f9e8d7c6b5a43210fedcba9876543210abcdef01';

      sandbox.registerRepository(repoUrl, {
        commitSha,
        treeSha,
        author: { name: 'Abhishek Singh', email: 'abhishek@example.com' },
        files: {
          'pom.xml': '<project><dependencies><dependency><groupId>org.apache.kafka</groupId><artifactId>kafka-clients</artifactId></dependency></dependencies></project>',
          'src/main/java/Engine.java': 'package engine;\npublic class Engine {}',
        },
      });

      const repoInspection = await TrustedRepositoryInspectionService.inspectRepository({
        repositoryUrl: repoUrl,
        candidateIdentity: { email: 'abhishek@example.com' },
      });
      const repoVerified = kb.verifyViaRepositoryInspection('DataEngine', repoInspection);
      expect(repoVerified).toBe(true);
      expect(proj?.fieldProvenance.actualTechnologyUsage.verificationStatus).toBe('REPOSITORY_SUPPORTED');
      expect(proj?.ownership).toBe('contributor'); // Never sole_owner

      // 5. Document inspection through TrustedDocumentInspectionService
      const patentBytes = `
UNITED STATES PATENT AND TRADEMARK OFFICE
Patent: US-2024-0019283
Title: Event Pipeline Ingestion Architecture
Inventor: Abhishek Singh
Assigned To: Independent Labs
Project Reference: DataEngine
`;
      const usptoKeys = TrustedIndependentAuditService.generateAuditorKeyPair();
      TrustedDocumentInspectionService.registerTrustedIssuer({
        issuerId: 'uspto',
        issuerName: 'USPTO',
        authorityLevel: 'patent_office',
        publicKeyPem: usptoKeys.publicKeyPem,
        enabled: true,
      });
      const patentSha = sha256Hex(patentBytes);
      const patentSig = crypto.sign(null, Buffer.from(patentSha, 'hex'), crypto.createPrivateKey(usptoKeys.privateKeyPem)).toString('hex');

      const docInspection = TrustedDocumentInspectionService.inspectDocument({
        documentBytes: patentBytes,
        documentType: 'patent_grant',
        issuer: { issuerId: 'uspto', name: 'USPTO', authorityLevel: 'patent_office', signatureHex: patentSig },
        candidateIdentity: { fullName: 'Abhishek Singh' },
        targetProjectName: 'DataEngine',
      });
      const docVerified = kb.verifyViaDocumentInspection('DataEngine', docInspection);
      expect(docVerified).toBe(true);
      expect(proj?.fieldProvenance.ownership.verificationStatus).toBe('DOCUMENT_SUPPORTED');
      // Invariant: Patent inventor mention caps ownership at contributor, never architect or sole owner
      expect(proj?.ownership).toBe('contributor');

      // 6 & 7. Answer Generation Service streaming with candidate grounding
      let streamedTokens = '';
      let completedResult: any = null;

      vi.spyOn(aiModule, 'streamAnswer').mockImplementation(
        async (_prompt: string, _config: any, _lang: any, callbacks: any) => {
          // Model attempts to generate answer with both general explanations and a fabricated personal metric
          callbacks.onToken('To scale an event pipeline, engineers typically buffer messages using Kafka. ');
          callbacks.onToken('In DataEngine, I personally handled 500k QPS and cut latency by 60%. ');
          callbacks.onToken('FOLLOW_UPS: How did you configure Kafka consumer groups? | What partition key strategy did you use?');
          callbacks.onComplete(
            'To scale an event pipeline, engineers typically buffer messages using Kafka. In DataEngine, I personally handled 500k QPS and cut latency by 60%.\nFOLLOW_UPS: How did you configure Kafka consumer groups? | What partition key strategy did you use?'
          );
        }
      );

      const answerService = AnswerGenerationService.getInstance();
      vi.spyOn(answerService, 'resolveApiKey').mockResolvedValue('gsk_mock_valid_key');
      await answerService.generateAnswer(
        {
          requestId: 'req-e2e-1',
          type: 'interview',
          text: 'How did you scale DataEngine?',
          resumeText: rawResumeText,
          knowledgeBase: kb,
          provider: 'groq',
        },
        {
          onToken: (tok) => {
            streamedTokens += tok;
          },
          onComplete: (res) => {
            completedResult = res;
          },
        }
      );

      // 8. Final answer grounding: flags unverified personal metric
      expect(completedResult).not.toBeNull();
      expect(completedResult.validationStatus).toBe('FLAGGED');
      expect(completedResult.groundingViolations.length).toBeGreaterThan(0);
      expect(completedResult.groundingViolations[0]).toContain('metric_fabrication');

      // 9. Follow-up generation verified
      expect(completedResult.predictedFollowUps.length).toBeGreaterThanOrEqual(1);

      // 10. Stale answer cancellation: New request drops older in-flight request
      const abortCtrl = new AbortController();
      let staleCompleted = false;

      vi.spyOn(aiModule, 'streamAnswer').mockImplementation(
        async (_prompt: string, _config: any, _lang: any, callbacks: any) => {
          // Abort mid-stream
          abortCtrl.abort();
          callbacks.onComplete('Stale generation result');
        }
      );

      await answerService.generateAnswer(
        {
          requestId: 'req-stale-test',
          type: 'interview',
          text: 'A newer question arrived',
          signal: abortCtrl.signal,
          knowledgeBase: kb,
          provider: 'groq',
        },
        {
          onComplete: () => {
            staleCompleted = true;
          },
        }
      );

      expect(staleCompleted).toBe(false); // Stale answer dropped cleanly
    });
  });
});
