import { describe, it, expect } from 'vitest';
import {
  TaskClassificationService,
  ScreenTaskCategory,
} from '../src/services/TaskClassificationService';
import {
  ApplicationFormAssistanceService,
  ExtractedFormQuestion,
} from '../src/services/ApplicationFormAssistanceService';
import {
  CandidateKnowledgeBase,
  CandidateConfirmationWorkflow,
} from '../src/services/candidateIntelligence';
import {
  VENDOR_QUESTIONNAIRE_OCR,
  JOB_APPLICATION_FORM_OCR,
  BEHAVIORAL_INTERVIEW_OCR,
  CODING_PROBLEM_OCR,
  MULTIPLE_CHOICE_ASSESSMENT_OCR,
} from './fixtures/vendor_questionnaire_fixture';

describe('Intelligent Task Classification & Application Form Assistance', () => {
  describe('TaskClassificationService.classify()', () => {
    it('accurately classifies the external vendor evaluation questionnaire and does NOT categorize as CODING_PROBLEM', () => {
      const result = TaskClassificationService.classify(VENDOR_QUESTIONNAIRE_OCR);

      expect(result.category).toBe('VENDOR_EVALUATION');
      expect(result.category).not.toBe('CODING_PROBLEM');
      expect(result.suggestedAction).toBe('assist_application');
      expect(result.confidence).toBeGreaterThan(0.6);
      expect(result.supportingEvidence.some((e) => e.includes('vendor'))).toBe(true);
    });

    it('accurately classifies job application forms with greenhouse/careers keywords and form fields', () => {
      const result = TaskClassificationService.classify(JOB_APPLICATION_FORM_OCR);

      expect(result.category).toBe('JOB_APPLICATION_FORM');
      expect(result.suggestedAction).toBe('assist_application');
      expect(result.supportingEvidence.some((e) => e.includes('job application') || e.includes('Greenhouse'))).toBe(true);
    });

    it('accurately classifies coding algorithm problems (LeetCode/constraints/inputs)', () => {
      const result = TaskClassificationService.classify(CODING_PROBLEM_OCR);

      expect(result.category).toBe('CODING_PROBLEM');
      expect(result.suggestedAction).toBe('solve_coding');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('accurately classifies multiple choice questions (MCQ)', () => {
      const result = TaskClassificationService.classify(MULTIPLE_CHOICE_ASSESSMENT_OCR);

      expect(result.category).toBe('MULTIPLE_CHOICE_ASSESSMENT');
      expect(result.suggestedAction).toBe('mcq_quiz');
    });

    it('accurately classifies live behavioral interview questions', () => {
      const result = TaskClassificationService.classify(BEHAVIORAL_INTERVIEW_OCR);

      expect(result.category).toBe('BEHAVIORAL_INTERVIEW');
      expect(result.suggestedAction).toBe('spoken_interview');
    });

    it('returns UNKNOWN with isLowConfidence=true for vague or noisy inputs, requesting user selection', () => {
      const result = TaskClassificationService.classify('Click here to continue and view settings.');
      expect(result.isLowConfidence).toBe(true);
      expect(result.suggestedAction).toBe('prompt_user');
    });
  });

  describe('ApplicationFormAssistanceService.extractQuestions()', () => {
    it('extracts all individual numbered questions from vendor evaluation questionnaire', () => {
      const questions = ApplicationFormAssistanceService.extractQuestions(VENDOR_QUESTIONNAIRE_OCR);

      expect(questions.length).toBe(3);
      expect(questions[0].number).toBe(1);
      expect(questions[0].questionText).toContain('What infrastructure, APIs or other third-party technologies have you implemented');
      expect(questions[0].characterLimit).toBe(500);
      expect(questions[0].asksPersonalExperience).toBe(true);

      expect(questions[1].number).toBe(2);
      expect(questions[1].questionText).toContain('What was your role in choosing that vendor or API?');
      expect(questions[1].characterLimit).toBe(300);
      expect(questions[1].asksPersonalExperience).toBe(true);

      expect(questions[2].number).toBe(3);
      expect(questions[2].questionText).toContain('monitor SLA compliance, latency, and failure failover');
      expect(questions[2].characterLimit).toBe(500);
      expect(questions[2].asksTechnicalKnowledge).toBe(true);
    });

    it('extracts questions and identifies factual declarations (e.g. work authorization)', () => {
      const questions = ApplicationFormAssistanceService.extractQuestions(JOB_APPLICATION_FORM_OCR);

      expect(questions.length).toBe(3);
      expect(questions[2].questionText).toContain('authorized to work in the United States');
      expect(questions[2].asksFactualDeclaration).toBe(true);
      expect(questions[2].expectedFormat).toBe('declaration');
    });
  });

  describe('ApplicationFormAssistanceService.generateTruthfulAnswer()', () => {
    it('generates truthful answer for question 1 when candidate has confirmed implementation contribution', () => {
      const kb = new CandidateKnowledgeBase('');
      kb.registerProject({
        name: 'EventStreamingPlatform',
        technologyStack: ['Kafka', 'Docker'],
        challenges: ['consumer partition rebalance latency'],
      });
      const ticket = CandidateConfirmationWorkflow.issueTicket('EventStreamingPlatform');
      kb.confirmProject('EventStreamingPlatform', {
        ticket,
        ownership: 'core_contributor',
        personalContribution: 'Integrated Apache Kafka event consumer groups and idempotent processing',
        verifiedTechnologies: ['Kafka', 'Docker'],
        source: 'explicit_candidate_action',
        confirmedBy: 'candidate_user_action',
      });

      const questions = ApplicationFormAssistanceService.extractQuestions(VENDOR_QUESTIONNAIRE_OCR);
      const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);

      expect(answer.questionId).toBe(questions[0].id);
      expect(answer.conciseAnswer).toContain('Kafka');
      expect(answer.conciseAnswer.length).toBeLessThanOrEqual(500);
      expect(answer.evidenceUsed.length).toBeGreaterThan(0);
      expect(answer.safetyState).toBe('VALIDATED');
      expect(answer.isOverLimit).toBe(false);
    });

    it('returns NEEDS_USER_INPUT for question 2 (vendor selection role) and asks clarification when procurement authority is unverified', () => {
      const kb = new CandidateKnowledgeBase('Candidate: Abhishek Singh\nSkills: Java, Spring');
      const questions = ApplicationFormAssistanceService.extractQuestions(VENDOR_QUESTIONNAIRE_OCR);
      const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[1], kb);

      expect(answer.questionId).toBe(questions[1].id);
      expect(answer.conciseAnswer).toBe('');
      expect(answer.safetyState).toBe('NEEDS_USER_INPUT');
      expect(answer.missingInformation.length).toBeGreaterThan(0);
      expect(answer.clarificationRequest).toBeDefined();
    });

    it('generates verified technical guidance for SLA monitoring and failover without unsupported personal claims', () => {
      const kb = new CandidateKnowledgeBase('');
      const questions = ApplicationFormAssistanceService.extractQuestions(VENDOR_QUESTIONNAIRE_OCR);
      const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[2], kb);

      expect(answer.conciseAnswer).toContain('SLA compliance');
      expect(answer.conciseAnswer).toContain('circuit breaker');
      expect(answer.characterCount).toBeLessThanOrEqual(500);
      expect(answer.safetyState).toBe('TECHNICAL_GUIDANCE');
      expect(answer.responseMode).toBe('TECHNICAL_KNOWLEDGE');
      expect(answer.conciseAnswer).not.toMatch(/\bI implemented\b|\bmy Datadog\b/i);
    });

    it('refuses to auto-declare work authorization without candidate proof and asks user input', () => {
      const kb = new CandidateKnowledgeBase('Candidate: Abhishek Singh');
      const questions = ApplicationFormAssistanceService.extractQuestions(JOB_APPLICATION_FORM_OCR);
      const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[2], kb);

      expect(answer.conciseAnswer).toBe('');
      expect(answer.safetyState).toBe('NEEDS_USER_INPUT');
      expect(answer.clarificationRequest).toBeDefined();
    });
  });
});
