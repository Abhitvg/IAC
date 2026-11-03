import { describe, it, expect, beforeEach } from 'vitest';
import {
  CanonicalProfileService,
  createCanonicalFact,
  canClaimPersonalAuthorship,
  canClaimProductionSkillExperience,
  validateDeclarationSafety,
  CandidateProject,
  CandidateSkill,
  DEFAULT_CANONICAL_PROFILE,
} from '../src/services/knowledgeVault';
import { IngestionResult } from '../src/services/ingestion/types';

describe('Canonical Candidate Profile & Personalization Model (Phase 1 & Phase 2)', () => {
  let service: CanonicalProfileService;

  beforeEach(() => {
    service = CanonicalProfileService.getInstance();
    service.clearAllCandidateData();
  });

  it('1. Initializes with zero fabricated experience, titles, or compensation', () => {
    const profile = service.getProfile();
    expect(profile.identity.fullName).toBe('');
    expect(profile.identity.email).toBe('');
    expect(profile.career.currentRole).toBe('');
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

    // Default is unsafe / unconfirmed
    expect(validateDeclarationSafety(profile.declarations.workAuthorization)).toBe(false);
    expect(validateDeclarationSafety(profile.declarations.sponsorshipRequired)).toBe(false);

    // Confirm work auth explicitly
    profile.declarations.workAuthorization = {
      confirmed: true,
      authorized: true,
      jurisdictions: ['United States'],
      confirmedAt: Date.now(),
    };
    expect(validateDeclarationSafety(profile.declarations.workAuthorization)).toBe(true);
  });

  it('3. Enforces invariant: Repository presence does not establish personal authorship', () => {
    const unconfirmedProject: CandidateProject = {
      id: 'proj-1',
      name: 'Distributed Engine',
      description: 'An open-source raft engine',
      repositoryUrl: 'https://github.com/example/raft-engine',
      ownership: 'UNKNOWN',
      exactContribution: '',
      technologyStack: ['Go', 'gRPC'],
      deploymentStatus: 'unreleased',
      outcomes: [],
      evidenceReferences: ['https://github.com/example/raft-engine'],
      status: 'REPOSITORY_SUPPORTED',
      candidateConfirmed: false,
    };

    expect(canClaimPersonalAuthorship(unconfirmedProject)).toBe(false);

    // Adding code and candidate confirmation with exact verified contribution enables claim
    const confirmedProject: CandidateProject = {
      ...unconfirmedProject,
      ownership: 'PRIMARY_CONTRIBUTOR',
      exactContribution: 'Implemented Raft log compaction and snapshotting state machine in consensus.go',
      status: 'CANDIDATE_CONFIRMED',
      candidateConfirmed: true,
    };

    expect(canClaimPersonalAuthorship(confirmedProject)).toBe(true);
  });

  it('4. Enforces invariant: Skills in resume default to theoretical and cannot claim production experience without verified project', () => {
    const theoreticalSkill: CandidateSkill = {
      id: 'skill-1',
      name: 'Apache Kafka',
      proficiency: 'intermediate',
      experienceType: 'theoretical',
      yearsUsed: 1,
      projectReferences: [],
      evidenceSource: 'Resume mention',
      status: 'RESUME_REPORTED',
      candidateConfirmed: false,
    };

    expect(canClaimProductionSkillExperience(theoreticalSkill)).toBe(false);

    // Practical skill with confirmed project reference
    const productionSkill: CandidateSkill = {
      ...theoreticalSkill,
      experienceType: 'practical',
      projectReferences: ['PaymentStreamingService'],
      status: 'CANDIDATE_CONFIRMED',
      candidateConfirmed: true,
    };

    expect(canClaimProductionSkillExperience(productionSkill)).toBe(true);
  });

  it('5. Ingests resume data cleanly: maps skills as theoretical, projects as UNKNOWN ownership', () => {
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
    expect(profile.identity.links.github).toBe('https://github.com/janedoe');

    // Skills verified as theoretical and RESUME_REPORTED
    const kafkaSkill = profile.skills.find((s) => s.name === 'Kafka');
    expect(kafkaSkill).toBeDefined();
    expect(kafkaSkill?.experienceType).toBe('theoretical');
    expect(kafkaSkill?.status).toBe('RESUME_REPORTED');
    expect(kafkaSkill?.candidateConfirmed).toBe(false);

    // Project verified as UNKNOWN ownership with zero fabricated contribution
    const project = profile.projects.find((p) => p.name === 'Telemetry Aggregator');
    expect(project).toBeDefined();
    expect(project?.ownership).toBe('UNKNOWN');
    expect(project?.exactContribution).toBe('');
    expect(project?.status).toBe('RESUME_REPORTED');
  });

  it('6. Records and audits fact provenance with edit history in ledger', () => {
    service.recordFact('location', 'identity', 'San Francisco, CA', 'Manual Entry', 'CANDIDATE_CONFIRMED', true);

    let profile = service.getProfile();
    expect(profile.factsLedger['location'].value).toBe('San Francisco, CA');
    expect(profile.factsLedger['location'].status).toBe('CANDIDATE_CONFIRMED');

    // Update the fact
    service.recordFact('location', 'identity', 'New York, NY', 'Manual Update', 'CANDIDATE_CONFIRMED', true);
    profile = service.getProfile();

    expect(profile.factsLedger['location'].value).toBe('New York, NY');
    expect(profile.factsLedger['location'].editHistory).toHaveLength(1);
    expect(profile.factsLedger['location'].editHistory[0].previousValue).toBe('San Francisco, CA');
  });

  it('7. Deletes individual facts safely from the audit ledger', () => {
    service.recordFact('targetSeniority', 'career', 'staff', 'Manual Selection', 'CANDIDATE_CONFIRMED', true);
    expect(service.getProfile().factsLedger['targetSeniority']).toBeDefined();

    const deleted = service.deleteFact('targetSeniority');
    expect(deleted).toBe(true);
    expect(service.getProfile().factsLedger['targetSeniority']).toBeUndefined();
  });

  it('8. JSON export and import round-trip preserves all fact provenance and candidate confirmation states', () => {
    const profile = service.getProfile();
    profile.identity.fullName = 'Alex Developer';
    profile.identity.candidateConfirmed = true;
    profile.declarations.workAuthorization = {
      confirmed: true,
      authorized: true,
      jurisdictions: ['Canada'],
      confirmedAt: 12345678,
    };
    service.saveProfile(profile);

    const exported = service.exportJson();
    expect(exported).toContain('Alex Developer');
    expect(exported).toContain('Canada');

    service.clearAllCandidateData();
    expect(service.getProfile().identity.fullName).toBe('');

    const importedOk = service.importJson(exported);
    expect(importedOk).toBe(true);

    const restored = service.getProfile();
    expect(restored.identity.fullName).toBe('Alex Developer');
    expect(restored.declarations.workAuthorization.jurisdictions).toEqual(['Canada']);
    expect(restored.declarations.workAuthorization.confirmed).toBe(true);
  });
});
