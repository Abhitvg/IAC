import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { IdentitySection } from '../src/components/wizard/IdentitySection';
import { WizardSidebar } from '../src/components/wizard/WizardSidebar';
import { WizardHeader } from '../src/components/wizard/WizardHeader';
import { WizardFooter } from '../src/components/wizard/WizardFooter';
import { ExperienceSection } from '../src/components/wizard/ExperienceSection';
import { ProjectsSection } from '../src/components/wizard/ProjectsSection';
import { EducationSection } from '../src/components/wizard/EducationSection';
import { CareerSection } from '../src/components/wizard/CareerSection';
import { SkillsSection } from '../src/components/wizard/SkillsSection';
import { AchievementsSection } from '../src/components/wizard/AchievementsSection';
import { PreferencesSection } from '../src/components/wizard/PreferencesSection';
import { DeclarationsSection } from '../src/components/wizard/DeclarationsSection';
import { ReviewSection } from '../src/components/wizard/ReviewSection';
import { CanonicalCandidateProfile } from '../src/services/knowledgeVault';

describe('Candidate Profile Wizard Component Architecture & Memoization', () => {
  const mockIdentity = {
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    location: 'San Francisco, CA',
    preferredLanguage: 'English',
    links: { github: 'https://github.com/janedoe' },
    candidateConfirmed: true,
  };

  const mockProfile: CanonicalCandidateProfile = {
    id: 'profile_1',
    version: 1,
    updatedAt: Date.now(),
    identity: mockIdentity,
    education: [
      {
        id: 'edu_1',
        institution: 'Stanford',
        degree: 'B.S. CS',
        fieldOfStudy: 'Computer Science',
        startDate: '2016',
        endDate: '2020',
        grade: '3.9',
        status: 'CANDIDATE_CONFIRMED',
        candidateConfirmed: true,
      },
    ],
    career: {
      currentRole: 'Senior Software Engineer',
      targetRoles: ['Staff Engineer'],
      preferredIndustries: ['Tech'],
      targetSeniority: 'senior',
      noticePeriod: '2 weeks',
      candidateConfirmed: true,
    },
    skills: [
      {
        id: 'skill_1',
        name: 'Go',
        category: 'languages',
        proficiency: 'expert',
        experienceType: 'practical',
        yearsUsed: 5,
        projectReferences: ['KVStore'],
        evidenceSource: 'Candidate Manual Entry',
        status: 'CANDIDATE_CONFIRMED',
        candidateConfirmed: true,
      },
    ],
    experience: [
      {
        id: 'exp_1',
        employer: 'CloudCorp',
        title: 'Senior Engineer',
        startDate: '2020-01-01',
        endDate: '2023-01-01',
        isCurrent: false,
        responsibilities: [],
        personallyImplemented: ['Designed consensus engine', 'Implemented WAL replication'],
        teamContributions: [],
        leadershipResponsibilities: [],
        outcomesAndMetrics: [],
        technologiesUsed: ['Go', 'Raft'],
        missingOrUncertainFacts: [],
        status: 'CANDIDATE_CONFIRMED',
        candidateConfirmed: true,
      },
    ],
    projects: [
      {
        id: 'proj_1',
        name: 'KVStore',
        description: 'Distributed key value store',
        repositoryUrl: 'https://github.com/janedoe/kvstore',
        ownership: 'SOLE_OWNER',
        exactContribution: 'Authored 100% of the Raft consensus and storage engine modules',
        technologyStack: ['Go', 'gRPC'],
        deploymentStatus: 'PRODUCTION_DEPLOYED',
        outcomes: [],
        evidenceReferences: [],
        status: 'CANDIDATE_CONFIRMED',
        candidateConfirmed: true,
      },
    ],
    achievements: [
      {
        id: 'ach_1',
        title: 'Best Distributed Systems Paper 2022',
        category: 'publication',
        status: 'CANDIDATE_CONFIRMED',
        candidateConfirmed: true,
      },
    ],
    preferences: {
      answerLength: 'concise',
      formality: 'professional',
      responsePerspective: 'first_person',
      language: 'English',
      technicalDepth: 'deep_code_and_architecture',
      responseStyle: 'structured_paragraphs',
      preferredCodingLanguage: 'Go',
      answerStructure: 'star',
    },
    declarations: {
      workAuthorization: {
        confirmed: true,
        authorized: true,
        jurisdictions: ['United States'],
      },
      sponsorshipRequired: {
        confirmed: true,
        required: false,
      },
      willingToRelocate: {
        confirmed: false,
        willing: null,
        preferredLocations: [],
      },
      securityClearance: {
        confirmed: false,
        active: null,
      },
      otherDeclarations: {},
    },
  };

  it('verifies all modular wizard sections are wrapped in React.memo', () => {
    // Check that components are memoized (React.memo returns an object with $$typeof Symbol(react.memo))
    expect((IdentitySection as any).$$typeof).toBe(Symbol.for('react.memo'));
    expect((WizardHeader as any).$$typeof).toBe(Symbol.for('react.memo'));
    expect((WizardSidebar as any).$$typeof).toBe(Symbol.for('react.memo'));
    expect((WizardFooter as any).$$typeof).toBe(Symbol.for('react.memo'));
    expect((EducationSection as any).$$typeof).toBe(Symbol.for('react.memo'));
    expect((CareerSection as any).$$typeof).toBe(Symbol.for('react.memo'));
    expect((SkillsSection as any).$$typeof).toBe(Symbol.for('react.memo'));
    expect((ExperienceSection as any).$$typeof).toBe(Symbol.for('react.memo'));
    expect((ProjectsSection as any).$$typeof).toBe(Symbol.for('react.memo'));
    expect((AchievementsSection as any).$$typeof).toBe(Symbol.for('react.memo'));
    expect((PreferencesSection as any).$$typeof).toBe(Symbol.for('react.memo'));
    expect((DeclarationsSection as any).$$typeof).toBe(Symbol.for('react.memo'));
    expect((ReviewSection as any).$$typeof).toBe(Symbol.for('react.memo'));
  });

  it('renders all sections to string cleanly without errors or crashes', () => {
    const dummyRegister = () => () => {};

    const headerHtml = renderToString(
      <WizardHeader
        completionPercentage={85}
        saveStatus="saved"
        saveStatusText="All changes saved"
        importErrors={null}
        isImporting={false}
        onExportJson={() => {}}
        onImportJsonFile={() => {}}
        onResumeFileUpload={() => {}}
        onShowClearConfirm={() => {}}
        onClose={() => {}}
      />
    );
    expect(headerHtml).toContain('Candidate Intelligence Wizard');
    expect(headerHtml).toContain('Complete');

    const sidebarHtml = renderToString(
      <WizardSidebar
        activeStep="identity"
        isImporting={false}
        onSelectStep={() => {}}
        onImportJsonFile={() => {}}
        onResumeFileUpload={() => {}}
        onShowClearConfirm={() => {}}
      />
    );
    expect(sidebarHtml).toContain('Identity');
    expect(sidebarHtml).toContain('wizard-sidebar');

    const identityHtml = renderToString(
      <IdentitySection
        identity={mockIdentity}
        onUpdateIdentity={() => {}}
        registerFlushHandler={dummyRegister}
      />
    );
    expect(identityHtml).toContain('data-testid="wizard-section-identity"');
    expect(identityHtml).toContain('Jane Doe');
    expect(identityHtml).toContain('jane@example.com');
    expect(identityHtml).toContain('wizard-grid-2col');

    const eduHtml = renderToString(
      <EducationSection
        education={mockProfile.education}
        onUpdateEducation={() => {}}
        registerFlushHandler={dummyRegister}
      />
    );
    expect(eduHtml).toContain('data-testid="wizard-section-education"');
    expect(eduHtml).toContain('Stanford');

    const careerHtml = renderToString(
      <CareerSection
        career={mockProfile.career}
        onUpdateCareer={() => {}}
        registerFlushHandler={dummyRegister}
      />
    );
    expect(careerHtml).toContain('data-testid="wizard-section-career"');
    expect(careerHtml).toContain('Senior Software Engineer');

    const skillsHtml = renderToString(
      <SkillsSection
        skills={mockProfile.skills}
        onUpdateSkills={() => {}}
        registerFlushHandler={dummyRegister}
      />
    );
    expect(skillsHtml).toContain('data-testid="wizard-section-skills"');
    expect(skillsHtml).toContain('Go');

    const expHtml = renderToString(
      <ExperienceSection
        experience={mockProfile.experience}
        onUpdateExperience={() => {}}
        registerFlushHandler={dummyRegister}
      />
    );
    expect(expHtml).toContain('data-testid="wizard-section-experience"');
    expect(expHtml).toContain('CloudCorp');

    const projHtml = renderToString(
      <ProjectsSection
        projects={mockProfile.projects}
        onUpdateProjects={() => {}}
        registerFlushHandler={dummyRegister}
      />
    );
    expect(projHtml).toContain('data-testid="wizard-section-projects"');
    expect(projHtml).toContain('KVStore');

    const revHtml = renderToString(
      <ReviewSection
        profile={mockProfile}
        onCompleteAndLock={() => {}}
      />
    );
    expect(revHtml).toContain('data-testid="wizard-section-review"');
    expect(revHtml).toContain('Complete &amp; Lock Profile');
  });

  it('measures warmed component render performance without cold-start noise', () => {
    const dummyRegister = () => () => {};
    const renderIdentity = () =>
      renderToString(
        <IdentitySection
          identity={mockIdentity}
          onUpdateIdentity={() => {}}
          registerFlushHandler={dummyRegister}
        />
      );

    // JIT and first-use setup can dominate the first few renders on hosted
    // Windows runners. Warm up before measuring the steady-state component.
    for (let i = 0; i < 10; i += 1) {
      renderIdentity();
    }

    const samples: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      const start = performance.now();
      renderIdentity();
      samples.push(performance.now() - start);
    }

    samples.sort((a, b) => a - b);
    const medianPerRender = samples[Math.floor(samples.length / 2)];

    // Assert steady-state latency; the median is robust against scheduler spikes.
    expect(medianPerRender).toBeLessThan(2.0);
  });
});
