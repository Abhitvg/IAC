import { describe, it, expect, beforeEach } from 'vitest';
import {
  TaskClassificationService,
} from '../src/services/TaskClassificationService';
import {
  ApplicationFormAssistanceService,
  ExtractedFormQuestion,
} from '../src/services/ApplicationFormAssistanceService';
import {
  CandidateKnowledgeBase,
  CandidateConfirmationWorkflow,
} from '../src/services/candidateIntelligence';
import { useAppStore } from '../src/store/useAppStore';
import { useCareerOpsStore } from '../src/store/useCareerOpsStore';
import {
  VENDOR_QUESTIONNAIRE_OCR,
  JOB_APPLICATION_FORM_OCR,
} from './fixtures/vendor_questionnaire_fixture';

describe('P0 Factual Grounding & Anti-Fabrication Audit Suite', () => {
  beforeEach(() => {
    useAppStore.getState().clearAndResetToListen();
    useCareerOpsStore.getState().enableDemoMode();
  });

  // 1. Candidate lists AWS but has no implementation evidence
  it('1. Candidate lists AWS in skills but has no personal contribution evidence: returns empty answer and NEEDS_USER_INPUT', () => {
    const kb = new CandidateKnowledgeBase(`
Candidate: Abhishek Singh
Skills: AWS, Cloud Architecture, EC2, S3
`);
    const questions = ApplicationFormAssistanceService.extractQuestions(
      '1. What infrastructure or AWS APIs have you personally implemented in the past 12 months?'
    );
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);

    expect(answer.conciseAnswer).toBe('');
    expect(answer.currentAnswer).toBe('');
    expect(answer.safetyState).toBe('NEEDS_USER_INPUT');
    expect(answer.responseMode).toBe('NEEDS_CLARIFICATION');
    expect(answer.confidence).toBe('low');
    expect(answer.clarificationRequest).toBeDefined();
    // Negative test: MUST NOT fabricate AWS implementation
    expect(answer.conciseAnswer).not.toContain('AWS S3 object storage');
  });

  // 2. Candidate lists Kafka but has no personal contribution evidence
  it('2. Candidate lists Kafka in resume but has no personal contribution evidence: rejects inventing Kafka implementation', () => {
    const kb = new CandidateKnowledgeBase(`
Candidate: Abhishek Singh
Skills: Apache Kafka, Event-driven Architecture
`);
    const questions = ApplicationFormAssistanceService.extractQuestions(
      '1. What distributed event streaming or message brokers have you implemented?'
    );
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);

    expect(answer.conciseAnswer).toBe('');
    expect(answer.safetyState).toBe('NEEDS_USER_INPUT');
    expect(answer.confidence).toBe('low');
    // Negative assertions: MUST NOT invent rebalance storms, consumer groups, or idempotency keys
    expect(answer.conciseAnswer).not.toContain('Apache Kafka');
    expect(answer.conciseAnswer).not.toContain('rebalance');
    expect(answer.conciseAnswer).not.toContain('idempotent');
  });

  // 3. Candidate has a project repository but authorship is unknown
  it('3. Candidate has a project repository but personal contribution is UNKNOWN: refuses to claim personal implementation', () => {
    const kb = new CandidateKnowledgeBase('');
    kb.registerProject({
      name: 'CloudTelemetryHub',
      technologyStack: ['Kafka', 'Docker'],
      personalContribution: 'UNKNOWN',
      repositoryUrl: 'https://github.com/example/CloudTelemetryHub',
      verificationStatus: 'REPOSITORY_SUPPORTED',
    });

    const questions = ApplicationFormAssistanceService.extractQuestions(
      '1. Describe your personal implementation work on CloudTelemetryHub.'
    );
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);

    expect(answer.conciseAnswer).toBe('');
    expect(answer.safetyState).toBe('NEEDS_USER_INPUT');
    expect(answer.missingInformation.some((m) => m.includes('no verified personal implementation'))).toBe(true);
  });

  // 4. Candidate has confirmed Kafka implementation with documented personal contribution
  it('4. Candidate has confirmed Kafka implementation with documented personal contribution: generates VALIDATED answer grounded strictly in verified contribution', () => {
    const kb = new CandidateKnowledgeBase('');
    kb.registerProject({
      name: 'EventIngestService',
      technologyStack: ['Kafka', 'Java'],
      challenges: ['consumer partition rebalance latency during deploys'],
    });
    const ticket = CandidateConfirmationWorkflow.issueTicket('EventIngestService');
    kb.confirmProject('EventIngestService', {
      ticket,
      ownership: 'core_contributor',
      personalContribution: 'Implemented dead-letter queue handlers and partition rebalance listeners',
      verifiedTechnologies: ['Kafka', 'Java'],
      source: 'explicit_candidate_action',
      confirmedBy: 'candidate_user_action',
    });

    const questions = ApplicationFormAssistanceService.extractQuestions(
      '1. What technologies have you implemented in the past 12 months, and what challenges did you face?'
    );
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);

    expect(answer.safetyState).toBe('VALIDATED');
    expect(answer.responseMode).toBe('PERSONAL_EXPERIENCE');
    expect(answer.confidence).toBe('high');
    expect(answer.conciseAnswer).toContain('EventIngestService');
    expect(answer.conciseAnswer).toContain('Implemented dead-letter queue handlers and partition rebalance listeners');
    expect(answer.conciseAnswer).toContain('consumer partition rebalance latency during deploys');
  });

  // 5. Candidate is asked about US work authorization with no declaration
  it('5. Candidate is asked about US work authorization with no declaration: returns empty answer and NEEDS_USER_INPUT (never auto-declares)', () => {
    const kb = new CandidateKnowledgeBase('Candidate: Jane Doe\nSkills: React, Node.js');
    const questions = ApplicationFormAssistanceService.extractQuestions(
      '* 3. Are you legally authorized to work in the United States?'
    );
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);

    expect(answer.conciseAnswer).toBe('');
    expect(answer.currentAnswer).toBe('');
    expect(answer.safetyState).toBe('NEEDS_USER_INPUT');
    expect(answer.responseMode).toBe('NEEDS_CLARIFICATION');
    expect(answer.confidence).toBe('low');
    expect(answer.missingInformation.some((m) => m.includes('No verified declaration'))).toBe(true);
    expect(answer.clarificationRequest).toContain('Please specify your status');
    // Negative test: Never assume "Yes"
    expect(answer.conciseAnswer).not.toMatch(/yes|authorized/i);
  });

  // 6. Candidate is asked about sponsorship with no declaration
  it('6. Candidate is asked about sponsorship with no declaration: returns empty answer and NEEDS_USER_INPUT (never auto-declares "No")', () => {
    const kb = new CandidateKnowledgeBase('Candidate: John Smith');
    const questions = ApplicationFormAssistanceService.extractQuestions(
      'Will you now or in the future require visa sponsorship?'
    );
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);

    expect(answer.conciseAnswer).toBe('');
    expect(answer.safetyState).toBe('NEEDS_USER_INPUT');
    expect(answer.confidence).toBe('low');
    // Negative test: Never assume "No"
    expect(answer.conciseAnswer).not.toMatch(/no|do not require/i);
  });

  // 7. Candidate has explicitly confirmed a factual declaration
  it('7. Candidate has explicitly confirmed a factual declaration: outputs CANDIDATE_CONFIRMED with recorded status', () => {
    const kb = new CandidateKnowledgeBase('');
    const ticket = CandidateConfirmationWorkflow.issueTicket('fact_auth_1', 'fact_confirmation');
    kb.addFact({
      id: 'fact_auth_1',
      fact: 'Legally authorized to work in the United States for any employer.',
      source: 'resume_explicit',
      verificationStatus: 'RESUME_REPORTED',
      confidence: 0.6,
    });
    // Promote via valid confirmation ticket
    kb.promoteToVerifiedFact('fact_auth_1', {
      ticket,
      source: 'primary_document',
      confirmationDetails: 'Candidate confirmed US work authorization',
    });

    const questions = ApplicationFormAssistanceService.extractQuestions(
      'Are you authorized to work in the United States?'
    );
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);

    expect(answer.conciseAnswer).toContain('authorized to work in the United States');
    expect(answer.safetyState).toBe('CANDIDATE_CONFIRMED');
    expect(answer.responseMode).toBe('PERSONAL_EXPERIENCE');
    expect(answer.evidenceUsed.length).toBeGreaterThan(0);
  });

  // 8. Candidate has technical knowledge but no implementation experience
  it('8. Candidate has technical knowledge but no implementation experience: formats as objective TECHNICAL_GUIDANCE without first-person claims', () => {
    const kb = new CandidateKnowledgeBase('Candidate: Abhishek Singh\nSkills: System Design');
    const questions = ApplicationFormAssistanceService.extractQuestions(
      'Describe how PostgreSQL achieves ACID transaction guarantees compared to DynamoDB key-value access.'
    );
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);

    expect(answer.safetyState).toBe('TECHNICAL_GUIDANCE');
    expect(answer.responseMode).toBe('TECHNICAL_KNOWLEDGE');
    expect(answer.conciseAnswer).toContain('PostgreSQL provides ACID');
    expect(answer.conciseAnswer).toContain('DynamoDB');
    // Negative test: Must NOT claim personal implementation "I built / I selected in my project"
    expect(answer.conciseAnswer).not.toMatch(/\bI selected\b|\bin my project\b|\bmy implementation\b/i);
    expect(answer.factualWarnings.some((w) => w.includes('TECHNICAL GUIDANCE'))).toBe(true);
  });

  // 9. Candidate participated in evaluation but did not make the final vendor decision
  it('9. Candidate participated in evaluation but did not make the final vendor decision: accurately reflects evaluation role without procurement fabrication', () => {
    const kb = new CandidateKnowledgeBase('');
    kb.registerProject({
      name: 'AuthMigration',
      technologyStack: ['Okta', 'Keycloak'],
    });
    const ticket = CandidateConfirmationWorkflow.issueTicket('AuthMigration');
    kb.confirmProject('AuthMigration', {
      ticket,
      ownership: 'core_contributor',
      personalContribution: 'Built prototype integrations and conducted vendor evaluation benchmarks for auth providers',
      verifiedTechnologies: ['Okta', 'Keycloak'],
      source: 'explicit_candidate_action',
      confirmedBy: 'candidate_user_action',
    });

    const questions = ApplicationFormAssistanceService.extractQuestions(
      'What was your role in choosing that vendor or API?'
    );
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);

    expect(answer.safetyState).toBe('VALIDATED');
    expect(answer.conciseAnswer).toContain('conducting technical proof-of-concept evaluations');
    // Negative test: Must NOT claim sole ownership or contract signing
    expect(answer.conciseAnswer).not.toContain('direct ownership of evaluating vendor options');
    expect(answer.conciseAnswer).not.toContain('signed the contract');
  });

  // 10. Candidate implemented a vendor-selected API but did not choose it
  it('10. Candidate implemented a vendor-selected API but did not choose it: asks clarification rather than fabricating evaluator role', () => {
    const kb = new CandidateKnowledgeBase('');
    kb.registerProject({
      name: 'PaymentProcessor',
      technologyStack: ['Stripe'],
      personalContribution: 'Integrated Stripe webhook processing and idempotency keys after leadership selected Stripe',
      verificationStatus: 'CANDIDATE_CONFIRMED',
    });

    const questions = ApplicationFormAssistanceService.extractQuestions(
      'What was your role in choosing that vendor or API?'
    );
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);

    // Contrib mentions after leadership selected Stripe -> no verified vendor evaluation/selection
    expect(answer.conciseAnswer).toBe('');
    expect(answer.safetyState).toBe('NEEDS_USER_INPUT');
    expect(answer.clarificationRequest).toBeDefined();
    expect(answer.missingInformation.length).toBeGreaterThan(0);
  });

  // 11. Candidate has no vendor experience
  it('11. Candidate has no vendor experience: returns empty answer and NEEDS_USER_INPUT (never defaults to technical evaluator)', () => {
    const kb = new CandidateKnowledgeBase('Candidate: Alice\nSkills: C++, Linux Kernel');
    const questions = ApplicationFormAssistanceService.extractQuestions(
      'What was your role in choosing that vendor or API?'
    );
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);

    expect(answer.conciseAnswer).toBe('');
    expect(answer.safetyState).toBe('NEEDS_USER_INPUT');
    expect(answer.confidence).toBe('low');
    // Negative test: NEVER default to "I served as technical evaluator"
    expect(answer.conciseAnswer).not.toContain('technical evaluator');
  });

  // 12. Candidate is asked about SLA monitoring without monitoring evidence
  it('12. Candidate is asked about SLA monitoring: generates objective TECHNICAL_GUIDANCE without claiming personal Prometheus/Datadog implementations', () => {
    const kb = new CandidateKnowledgeBase('Candidate: Bob');
    const questions = ApplicationFormAssistanceService.extractQuestions(
      'Describe how you monitor SLA compliance, latency, and failure failover for third-party endpoints.'
    );
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);

    expect(answer.safetyState).toBe('TECHNICAL_GUIDANCE');
    expect(answer.responseMode).toBe('TECHNICAL_KNOWLEDGE');
    expect(answer.conciseAnswer).toContain('SLA compliance is monitored via');
    expect(answer.conciseAnswer).toContain('circuit breaker');
    // Negative test: Does NOT claim personal setup of Datadog or Netflix Hystrix
    expect(answer.conciseAnswer).not.toMatch(/\bI configured\b|\bI setup\b|\bmy Datadog\b/i);
  });

  // 13. Technical guidance is generated without first-person personal claims
  it('13. Technical guidance is generated without first-person personal claims', () => {
    const kb = new CandidateKnowledgeBase('Candidate: Charlie');
    const questions = ApplicationFormAssistanceService.extractQuestions(
      'Explain how circuit breakers protect distributed systems during third-party endpoint latency spikes.'
    );
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);

    expect(answer.safetyState).toBe('TECHNICAL_GUIDANCE');
    expect(answer.responseMode).toBe('TECHNICAL_KNOWLEDGE');
    expect(answer.conciseAnswer).not.toMatch(/\bI\s+(implemented|deployed|configured|built)\b/i);
  });

  // 14. Missing evidence causes clarification instead of invented content
  it('14. Missing evidence causes clarification instead of invented content', () => {
    const kb = new CandidateKnowledgeBase('');
    const questions = ApplicationFormAssistanceService.extractQuestions(
      'Please detail your experience negotiating enterprise software agreements.'
    );
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);

    expect(answer.conciseAnswer).toBe('');
    expect(answer.safetyState).toBe('NEEDS_USER_INPUT');
    expect(answer.responseMode).toBe('NEEDS_CLARIFICATION');
    expect(answer.clarificationRequest).toBeDefined();
    expect(answer.missingInformation.length).toBeGreaterThan(0);
  });

  // 15. Character limits are respected without silently changing factual meaning
  it('15. Character limits are respected without silently changing factual meaning', () => {
    const questions = ApplicationFormAssistanceService.extractQuestions(`
1. Describe how SLA compliance is monitored.
[ Max 120 chars ]
`);
    const kb = new CandidateKnowledgeBase('');
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);

    expect(answer.conciseAnswer.length).toBeLessThanOrEqual(120);
    expect(answer.isOverLimit).toBe(false);
    expect(answer.safetyState).toBe('TECHNICAL_GUIDANCE');
  });
});
