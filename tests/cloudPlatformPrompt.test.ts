import { describe, expect, it } from 'vitest';
import {
  analyzeAlignment,
  shouldIncludeCloudPlatformGuidance,
} from '../src/services/candidatePersona';
import { buildRoleInterviewContextSection, buildRoleInterviewProfile } from '../src/services/roleInterviewContext';

const sophosRole = 'Software Engineer – DevOps / Cloud Platform';
const sophosJobDescription = `
Build Java and Spring Boot microservices.
Automate infrastructure with Terraform.
Work with AWS, Docker, Kubernetes, Jenkins, and CI/CD pipelines.
`;

describe('cloud platform interview guidance selection', () => {
  it('enables platform guidance for relevant Sophos role questions', () => {
    expect(
      shouldIncludeCloudPlatformGuidance(
        sophosRole,
        sophosJobDescription,
        'How would you structure Terraform modules for a Spring Boot microservice pipeline?',
        'General'
      )
    ).toBe(true);
  });

  it('enables guidance for Java backend questions in a cloud-platform role', () => {
    expect(
      shouldIncludeCloudPlatformGuidance(
        sophosRole,
        sophosJobDescription,
        'How does dependency injection work in Spring Boot?',
        'General'
      )
    ).toBe(true);
  });

  it('does not inject platform guidance into unrelated behavioral answers', () => {
    expect(
      shouldIncludeCloudPlatformGuidance(
        sophosRole,
        sophosJobDescription,
        'Tell me about a disagreement you had with a teammate.',
        'Behavioral'
      )
    ).toBe(false);
  });

  it('does not inject platform guidance into an unrelated frontend role', () => {
    expect(
      shouldIncludeCloudPlatformGuidance(
        'Frontend React Engineer',
        'Build accessible React interfaces with TypeScript.',
        'How would you design a Terraform module?',
        'General'
      )
    ).toBe(false);
  });
});

describe('job-description skill alignment', () => {
  it('does not count JavaScript as Java experience', () => {
    const result = analyzeAlignment(
      'Built production interfaces with JavaScript, React, and TypeScript.',
      'This role requires Java and Spring Boot.'
    );
    expect(result.matchedSkills).not.toContain('Java');
    expect(result.missingSkills).toContain('Java');
    expect(result.missingSkills).toContain('Spring Boot');
  });

  it('matches Java and Spring Boot when they are explicitly present', () => {
    const result = analyzeAlignment(
      'Developed Java services using Spring Boot.',
      'Build Java and Spring Boot microservices.'
    );
    expect(result.matchedSkills).toContain('Java');
    expect(result.matchedSkills).toContain('Spring Boot');
  });
});


describe('Sophos role-specific live interview context', () => {
  it('extracts Java, cloud, IaC, delivery, container, SDLC, and early-career signals', () => {
    const jobDescription = `${sophosJobDescription}
      The role asks for 1-2 years of development experience, automated unit and integration
      tests, complete SDLC ownership, Agile delivery, and defect resolution within SLAs.
    `;

    const profile = buildRoleInterviewProfile(sophosRole, jobDescription);
    const promptSection = buildRoleInterviewContextSection(sophosRole, jobDescription);

    expect(profile.isCloudPlatformRole).toBe(true);
    expect(profile.companyName).toBe('Sophos');
    expect(profile.experienceBand).toBe('early-career');
    expect(profile.focusAreas).toContain('Java and Spring Boot');
    expect(profile.focusAreas).toContain('Terraform and infrastructure as code');
    expect(profile.focusAreas).toContain('CI/CD and Jenkins');
    expect(profile.focusAreas).toContain('Docker and Kubernetes');
    expect(promptSection).toContain('1–2 years of experience');
    expect(promptSection).toContain('remote state and locking');
    expect(promptSection).toContain('readiness/liveness probes');
    expect(promptSection).toContain('do not infer proprietary internal tools');
  });

  it('extracts critical requirements from the full JD even when they appear after the live raw-JD budget', () => {
    const longJobDescription =
      'General role background. '.repeat(100) +
      'Required stack: Terraform, Jenkins, Docker, Kubernetes, AWS, and Spring Boot.';

    const promptSection = buildRoleInterviewContextSection(
      'Software Engineer',
      longJobDescription
    );

    expect(promptSection).toContain('Terraform and infrastructure as code');
    expect(promptSection).toContain('CI/CD and Jenkins');
    expect(promptSection).toContain('Docker and Kubernetes');
  });

  it('does not inject cloud platform guidance into an unrelated frontend role', () => {
    expect(
      buildRoleInterviewContextSection(
        'Frontend React Engineer',
        'Build accessible React interfaces with TypeScript and CSS.'
      )
    ).toBe('');
  });
});
