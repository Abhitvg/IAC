import { describe, it, expect } from 'vitest';
import {
  TaskClassificationService,
  ScreenTaskCategory,
} from '../src/services/TaskClassificationService';
import {
  ApplicationFormAssistanceService,
  ExtractedFormQuestion,
} from '../src/services/ApplicationFormAssistanceService';
import { CandidateKnowledgeBase } from '../src/services/candidateIntelligence';
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
    const kb = new CandidateKnowledgeBase(`
Candidate: Abhishek Singh
Title: Senior Software Engineer
Skills: Apache Kafka, PostgreSQL, Docker, AWS, Distributed Systems
Experience:
- Senior Backend Engineer at TechCorp (2021-Present):
  Engineered real-time Kafka event streaming architecture. Evaluated API integrations and latency metrics.
`);

    it('generates truthful answer for question 1 (third-party APIs & challenges) grounded strictly in verified stack', () => {
      const questions = ApplicationFormAssistanceService.extractQuestions(VENDOR_QUESTIONNAIRE_OCR);
      const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);

      expect(answer.questionId).toBe(questions[0].id);
      expect(answer.conciseAnswer).toContain('Kafka');
      expect(answer.conciseAnswer.length).toBeLessThanOrEqual(500);
      expect(answer.evidenceUsed.length).toBeGreaterThan(0);
      expect(answer.isOverLimit).toBe(false);
    });

    it('generates defensive, non-hallucinated answer for question 2 (vendor selection role) and asks clarification when procurement authority is unverified', () => {
      const questions = ApplicationFormAssistanceService.extractQuestions(VENDOR_QUESTIONNAIRE_OCR);
      const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[1], kb);

      expect(answer.questionId).toBe(questions[1].id);
      // Must not fabricate sole procurement signing or budget ownership
      expect(answer.conciseAnswer).not.toMatch(/I signed the contract|I managed the multimillion procurement budget/i);
      expect(answer.conciseAnswer).toContain('technical evaluator');
      expect(answer.missingInformation.length).toBeGreaterThan(0);
      expect(answer.clarificationRequest).toBeDefined();
      expect(answer.characterCount).toBeLessThanOrEqual(300);
    });

    it('generates verified technical answer for SLA monitoring and failover without unsupported claims', () => {
      const questions = ApplicationFormAssistanceService.extractQuestions(VENDOR_QUESTIONNAIRE_OCR);
      const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[2], kb);

      expect(answer.conciseAnswer).toContain('SLA compliance');
      expect(answer.conciseAnswer).toContain('circuit breaker');
      expect(answer.characterCount).toBeLessThanOrEqual(500);
      expect(answer.confidence).toBe('high');
    });

    it('accurately answers work authorization questions without hesitation', () => {
      const questions = ApplicationFormAssistanceService.extractQuestions(JOB_APPLICATION_FORM_OCR);
      const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[2], kb);

      expect(answer.conciseAnswer).toContain('authorized to work in the United States');
      expect(answer.confidence).toBe('high');
      expect(answer.factualWarnings.length).toBe(0);
    });
  });
});
