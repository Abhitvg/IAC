import { describe, expect, it } from 'vitest';
import { analyzeAlignment, shouldIncludeCloudPlatformGuidance } from '../src/services/candidatePersona';

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
