import { describe, it, expect, beforeEach } from 'vitest';
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

describe('Canonical Candidate Profile & Personalization Model (Phase 1 & Phase 2 Corrections)', () => {
  let service: CanonicalProfileService;

  beforeEach(() => {
    service = CanonicalProfileService.getInstance();
    service.clearAllCandidateData();
  });

  it('1. Initializes with zero invented defaults (targetSeniority is UNKNOWN, years unstated)', () => {
    const profile = service.getProfile();
    expect(profile.identity.fullName).toBe('');
    expect(profile.identity.email).toBe('');
    expect(profile.career.currentRole).toBe('');
    expect(profile.career.targetSeniority).toBe('UNKNOWN');
    expect(profile.career.totalExperienceYears).toBeUndefined();
    expect(profile.projects).toHaveLength(0);
    expect(profile.skills).toHaveLength(0);
    expect(profile.experience).toHaveLength(0);
    expect(profile.declarations.workAuthorization.confirmed).toBe(false);
    expect(profile.declarations.workAuthorization.authorized).toBeNull();
    expect(profile.declarations.sponsorshipRequired.confirmed).toBe(false);
    expect(profile.declarations.sponsorshipRequired.required).toBeNull();
  });

  it('2. Enforces invariant: Sensitive employment declarations are never inferred and require explicit confirmation', () => {
    const profile = service.getProfile();

    expect(validateDeclarationSafety(profile.declarations.workAuthorization)).toBe(false);
    expect(validateDeclarationSafety(profile.declarations.sponsorshipRequired)).toBe(false);

    profile.declarations.workAuthorization = {
      confirmed: true,
      authorized: true,
      jurisdictions: ['United States'],
      confirmedAt: Date.now(),
    };
    expect(validateDeclarationSafety(profile.declarations.workAuthorization)).toBe(true);
  });

  it('3. Strengthens canClaimPersonalAuthorship: distinguishes candidate-reported from repository-supported and independent verification', () => {
    // A: Repository presence without personal contribution is strictly UNVERIFIED
    const repoOnlyProject: CandidateProject = {
      id: 'proj-1',
      name: 'Raft Engine',
      description: 'An open-source raft engine',
      repositoryUrl: 'https://github.com/example/raft-engine',
      ownership: 'UNKNOWN',
      exactContribution: '',
      technologyStack: ['Go', 'gRPC'],
      deploymentStatus: 'UNKNOWN',
      outcomes: [],
      evidenceReferences: ['https://github.com/example/raft-engine'],
      status: 'REPOSITORY_SUPPORTED',
      candidateConfirmed: false,
    };

    const evalA = evaluatePersonalAuthorship(repoOnlyProject);
    expect(evalA.canClaim).toBe(false);
    expect(evalA.tier).toBe('UNVERIFIED');

    // B: Candidate confirmation without repository inspection is strictly CANDIDATE_REPORTED (NOT independently verified)
    const candidateReportedProject: CandidateProject = {
      ...repoOnlyProject,
      ownership: 'PRIMARY_CONTRIBUTOR',
      exactContribution: 'Authored Raft log snapshotting algorithm',
      evidenceReferences: [],
      status: 'CANDIDATE_CONFIRMED',
      candidateConfirmed: true,
    };

    const evalB = evaluatePersonalAuthorship(candidateReportedProject);
    expect(evalB.canClaim).toBe(true);
    expect(evalB.tier).toBe('CANDIDATE_REPORTED');
    expect(evalB.isIndependentlyVerified).toBe(false);
    expect(evalB.isCandidateReportedOnly).toBe(true);

    // C: Repository-supported: repository URL + inspectable git evidence + confirmed personal contribution
    const repoSupportedProject: CandidateProject = {
      ...candidateReportedProject,
      repositoryUrl: 'https://github.com/example/raft-engine',
      evidenceReferences: ['git:commit:a1b2c3d4e5f6'],
      status: 'REPOSITORY_SUPPORTED',
    };

    const evalC = evaluatePersonalAuthorship(repoSupportedProject);
    expect(evalC.canClaim).toBe(true);
    expect(evalC.tier).toBe('REPOSITORY_SUPPORTED_CONTRIBUTION');
    expect(evalC.isIndependentlyVerified).toBe(false);

    // D: Independently verified: cryptographic commit attestation or document audit
    const independentlyVerifiedProject: CandidateProject = {
      ...repoSupportedProject,
      status: 'INDEPENDENTLY_VERIFIED',
    };

    const evalD = evaluatePersonalAuthorship(independentlyVerifiedProject);
    expect(evalD.canClaim).toBe(true);
    expect(evalD.tier).toBe('INDEPENDENTLY_VERIFIED');
    expect(evalD.isIndependentlyVerified).toBe(true);
  });

  it('4. Strengthens canClaimProductionSkillExperience: resolves project references and verifies technology usage', () => {
    const registeredProject: CandidateProject = {
      id: 'proj-telemetry',
      name: 'TelemetryPipeline',
      description: 'Distributed metrics service',
      repositoryUrl: 'https://github.com/corp/telemetry',
      ownership: 'PRIMARY_CONTRIBUTOR',
      exactContribution: 'Implemented Kafka consumer groups and backpressure handling',
      technologyStack: ['Go', 'Kafka', 'Docker'],
      deploymentStatus: 'deployed_production',
      outcomes: ['Processed 50k events/sec'],
      evidenceReferences: ['git:commit:11223344'],
      status: 'CANDIDATE_CONFIRMED',
      candidateConfirmed: true,
    };

    const registeredProjects = [registeredProject];

    // A: Theoretical skill cannot claim production experience
    const theoreticalSkill: CandidateSkill = {
      id: 'skill-1',
      name: 'Kafka',
      proficiency: 'UNSPECIFIED',
      experienceType: 'theoretical',
      yearsUsed: undefined,
      projectReferences: ['TelemetryPipeline'],
      evidenceSource: 'Resume mention',
      status: 'RESUME_REPORTED',
      candidateConfirmed: false,
    };
    expect(canClaimProductionSkillExperience(theoreticalSkill, registeredProjects)).toBe(false);

    // B: Practical skill with unresolvable project reference is rejected
    const unresolvableSkill: CandidateSkill = {
      ...theoreticalSkill,
      experienceType: 'practical',
      projectReferences: ['NonExistentProject123'],
      status: 'CANDIDATE_CONFIRMED',
      candidateConfirmed: true,
    };
    const evalUnresolved = evaluateProductionSkillExperience(unresolvableSkill, registeredProjects);
    expect(evalUnresolved.canClaimProduction).toBe(false);
    expect(evalUnresolved.tier).toBe('UNRESOLVED_PROJECT_REF');

    // C: Practical skill where project does NOT use the skill is rejected
    const unusedSkill: CandidateSkill = {
      ...theoreticalSkill,
      name: 'Rust', // Project uses Go and Kafka, not Rust
      experienceType: 'practical',
      projectReferences: ['TelemetryPipeline'],
      status: 'CANDIDATE_CONFIRMED',
      candidateConfirmed: true,
    };
    const evalUnused = evaluateProductionSkillExperience(unusedSkill, registeredProjects);
    expect(evalUnused.canClaimProduction).toBe(false);
    expect(evalUnused.tier).toBe('UNVERIFIED');

    // D: Valid practical skill correctly resolved against confirmed project
    const validSkill: CandidateSkill = {
      ...theoreticalSkill,
      name: 'Kafka',
      experienceType: 'practical',
      projectReferences: ['TelemetryPipeline'],
      status: 'CANDIDATE_CONFIRMED',
      candidateConfirmed: true,
    };
    const evalValid = evaluateProductionSkillExperience(validSkill, registeredProjects);
    expect(evalValid.canClaimProduction).toBe(true);
    expect(evalValid.tier).toBe('CANDIDATE_REPORTED_PRACTICAL');
    expect(evalValid.isIndependentlyVerified).toBe(false);
  });

  it('5. Ingests resume data cleanly without invented years or proficiency', () => {
    const mockIngestion: IngestionResult = {
      sourceId: 'src-test',
      sourceType: 'resume_pdf',
      documentTitle: 'Resume_Jane_Doe.pdf',
      rawText: 'Jane Doe Senior Engineer jane@example.com',
      pageCount: 1,
      isImageOnlyOrScanned: false,
      ocrRequired: false,
      personalProfile: {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+1-555-0199',
        location: 'Seattle, WA',
        websites: [],
        githubUrl: 'https://github.com/janedoe',
      },
      education: [
        {
          id: 'edu-1',
          institution: 'University of Washington',
          degree: 'B.S. Computer Science',
          rawText: 'UW BS CS',
        },
      ],
      employment: [
        {
          id: 'emp-1',
          employer: 'Cloud Corp',
          role: 'Backend Engineer',
          isCurrentRole: true,
          responsibilities: ['Maintained APIs'],
          technologies: ['TypeScript', 'Node.js'],
          metrics: [],
          associatedProjectIds: [],
          rawText: 'Cloud Corp Backend Engineer',
        },
      ],
      projects: [
        {
          id: 'proj-1',
          name: 'Telemetry Aggregator',
          description: 'High throughput pipeline',
          contextType: 'employer',
          candidateRole: 'contributor',
          technologies: ['Go', 'Kafka'],
          outcomes: [],
          metrics: [],
          repositoryUrl: 'https://github.com/cloudcorp/telemetry',
          rawText: 'Telemetry Aggregator with Go and Kafka',
        },
      ],
      skills: {
        languages: ['TypeScript', 'Go'],
        frameworks: ['Express'],
        databases: ['PostgreSQL'],
        messaging: ['Kafka'],
        cloud: ['AWS'],
        devops: ['Docker'],
        testing: ['Jest'],
        architecture: ['Microservices'],
        aiMl: [],
        tools: ['Git'],
      },
      achievements: [],
      claims: [],
      chronologyAlerts: [],
      warnings: [],
      ingestedAt: Date.now(),
    };

    service.populateFromIngestion(mockIngestion);

    const profile = service.getProfile();
    expect(profile.identity.fullName).toBe('Jane Doe');
    expect(profile.identity.email).toBe('jane@example.com');

    // Invariant: Zero invented yearsUsed and proficiency
    const kafkaSkill = profile.skills.find((s) => s.name === 'Kafka');
    expect(kafkaSkill).toBeDefined();
    expect(kafkaSkill?.experienceType).toBe('theoretical');
    expect(kafkaSkill?.yearsUsed).toBeUndefined(); // NOT 1
    expect(kafkaSkill?.proficiency).toBe('UNSPECIFIED'); // NOT intermediate
    expect(kafkaSkill?.status).toBe('RESUME_REPORTED');
  });

  it('6. Enforces status-upgrade protection and immutable deletion tombstones in the audit ledger', () => {
    // Candidate cannot manually upgrade an unverified claim to INDEPENDENTLY_VERIFIED
    const fact = service.recordFact(
      'workAuthorization',
      'declaration',
      'Authorized',
      'Candidate Edit',
      'INDEPENDENTLY_VERIFIED', // requested
      true // candidate confirmed
    );

    // Protected: downgraded to CANDIDATE_CONFIRMED
    expect(fact.status).toBe('CANDIDATE_CONFIRMED');
    expect(service.getProfile().factsLedger['workAuthorization'].status).toBe('CANDIDATE_CONFIRMED');

    // Delete fact: creates tombstone instead of silently deleting
    const deleted = service.deleteFact('workAuthorization', 'User revoked declaration');
    expect(deleted).toBe(true);

    const storedFact = service.getProfile().factsLedger['workAuthorization'];
    expect(storedFact).toBeDefined();
    expect(storedFact.isDeleted).toBe(true);
    const lastHistory = storedFact.editHistory[storedFact.editHistory.length - 1];
    expect(lastHistory.action).toBe('DELETED');
    expect(lastHistory.reason).toBe('User revoked declaration');
  });

  it('7. Enforces runtime schema validation with Zod and rejects malformed profile imports', () => {
    // Malformed JSON (invalid enum, missing required fields)
    const invalidProfile = {
      id: 'bad-profile',
      version: 2,
      updatedAt: 'not-a-number', // invalid type
      identity: {
        fullName: 12345, // invalid type
      },
    };

    const outcome = validateCanonicalProfile(invalidProfile);
    expect(outcome.success).toBe(false);
    if (!outcome.success) {
      expect(outcome.errors.length).toBeGreaterThan(0);
    }

    const importRes = service.importJson(JSON.stringify(invalidProfile));
    expect(importRes.success).toBe(false);
    expect(importRes.errors).toBeDefined();
  });

  it('8. Performs versioned migration from v1 to v2 safely', () => {
    const v1Profile = {
      id: 'legacy-profile-v1',
      version: 1,
      identity: {
        fullName: 'Legacy User',
        email: 'legacy@example.com',
        location: 'Boston, MA',
        preferredLanguage: 'English',
        links: {},
        candidateConfirmed: false,
      },
      career: {
        currentRole: 'Software Engineer',
        noticePeriod: '2 weeks',
        targetRoles: ['Senior Software Engineer'],
        preferredIndustries: [],
        candidateConfirmed: false,
      },
      skills: [
        {
          id: 'sk-1',
          name: 'Java',
          projectReferences: [],
          evidenceSource: 'Legacy',
          status: 'RESUME_REPORTED',
          candidateConfirmed: false,
        },
      ],
      education: [],
      experience: [],
      projects: [],
      achievements: [],
      preferences: {
        answerLength: 'balanced',
        formality: 'professional',
        responsePerspective: 'first_person',
        language: 'English',
        technicalDepth: 'balanced',
        responseStyle: 'structured_paragraphs',
        preferredCodingLanguage: 'Java',
        answerStructure: 'star',
      },
      declarations: {
        workAuthorization: { confirmed: false, authorized: null, jurisdictions: [] },
        sponsorshipRequired: { confirmed: false, required: null },
        willingToRelocate: { confirmed: false, willing: null, preferredLocations: [] },
        securityClearance: { confirmed: false, active: null },
        otherDeclarations: {},
      },
    };

    const migrated = migrateProfileIfNeeded(v1Profile);
    expect(migrated.version).toBe(2);
    expect(migrated.career.targetSeniority).toBe('UNKNOWN');
    expect(migrated.skills[0].proficiency).toBe('UNSPECIFIED');

    const validation = validateCanonicalProfile(v1Profile);
    expect(validation.success).toBe(true);
  });

  it('9. Synchronizes bidirectionally with KnowledgeVaultService and CareerOps without infinite loops or duplicate projects', () => {
    // 1. Sync from KnowledgeVaultService
    const kv = KnowledgeVaultService.getInstance();
    const vault = kv.getVault();
    vault.projects = [
      {
        id: 'vault-proj-1',
        title: 'Vault Project Alpha',
        description: 'First project in vault',
        technologies: ['React', 'TypeScript'],
        contributions: [{ id: 'c1', description: 'Built UI', ownership: 'PRIMARY_CONTRIBUTOR' }],
        outcomes: ['Shipped v1'],
        metrics: [],
        evidenceIds: ['ev-1'],
        status: 'CANDIDATE_CONFIRMED',
      },
    ];
    kv.saveVault(vault);

    // Canonical profile service receives update
    service.syncFromKnowledgeVault(vault);
    let profile = service.getProfile();
    expect(profile.projects.some((p) => p.name === 'Vault Project Alpha')).toBe(true);

    // Call sync again to verify deduplication
    service.syncFromKnowledgeVault(vault);
    profile = service.getProfile();
    const matches = profile.projects.filter((p) => p.name === 'Vault Project Alpha');
    expect(matches).toHaveLength(1); // No duplicates

    // 2. Sync from CareerOps Vault
    const careerStore = useCandidateVaultStore.getState();
    careerStore.updateProfile({
      fullName: 'Updated Via CareerOps',
      email: 'careerops@example.com',
      location: 'Denver, CO',
    });

    service.syncFromCareerOpsVault(useCandidateVaultStore.getState().profile);
    profile = service.getProfile();
    expect(profile.identity.fullName).toBe('Updated Via CareerOps');
    expect(profile.identity.email).toBe('careerops@example.com');
    expect(profile.identity.location).toBe('Denver, CO');
  });
});
