import { describe, it, expect, beforeEach } from 'vitest';
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
import { useAppStore } from '../src/store/useAppStore';
import { useCareerOpsStore } from '../src/store/useCareerOpsStore';
import { InterviewEngine } from '../src/services/InterviewEngine';
import {
  VENDOR_QUESTIONNAIRE_OCR,
  JOB_APPLICATION_FORM_OCR,
  BEHAVIORAL_INTERVIEW_OCR,
  CODING_PROBLEM_OCR,
  MULTIPLE_CHOICE_ASSESSMENT_OCR,
} from './fixtures/vendor_questionnaire_fixture';

describe('Comprehensive Context-Aware Pipeline & Application Form Assistance Suite', () => {
  beforeEach(() => {
    useAppStore.getState().clearAndResetToListen();
    useCareerOpsStore.getState().enableDemoMode();
  });

  // Requirement 8.1: Vendor-evaluation questionnaire
  it('1. Vendor-evaluation questionnaire: correctly identifies VENDOR_EVALUATION, never rejects as coding problem, and extracts all 3 questions', () => {
    const classification = TaskClassificationService.classify(VENDOR_QUESTIONNAIRE_OCR);
    expect(classification.category).toBe('VENDOR_EVALUATION');
    expect(classification.category).not.toBe('CODING_PROBLEM');
    expect(classification.suggestedAction).toBe('assist_application');

    const questions = ApplicationFormAssistanceService.extractQuestions(VENDOR_QUESTIONNAIRE_OCR);
    expect(questions.length).toBe(3);
  });

  // Requirement 8.2: Job application with personal experience questions
  it('2. Job application with personal experience questions: accurately flags asksPersonalExperience and requires candidate evidence', () => {
    const questions = ApplicationFormAssistanceService.extractQuestions(JOB_APPLICATION_FORM_OCR);
    const q1 = questions[0];
    expect(q1.questionText).toContain('Describe a high-throughput distributed system');
    expect(q1.asksPersonalExperience).toBe(true);

    const kb = new CandidateKnowledgeBase('');
    kb.registerProject({
      name: 'HighThroughputRelay',
      technologyStack: ['Kafka', 'Go'],
    });
    const ticket = CandidateConfirmationWorkflow.issueTicket('HighThroughputRelay');
    kb.confirmProject('HighThroughputRelay', {
      ticket,
      ownership: 'core_contributor',
      personalContribution: 'Designed partitioned event pipeline processing 2M events/sec',
      verifiedTechnologies: ['Kafka', 'Go'],
      source: 'explicit_candidate_action',
      confirmedBy: 'candidate_user_action',
    });

    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(q1, kb);
    expect(answer.evidenceUsed.length).toBeGreaterThan(0);
    expect(answer.safetyState).toBe('VALIDATED');
    expect(answer.isOverLimit).toBe(false);
  });

  // Requirement 8.3: API integration experience question
  it('3. API integration experience question: cites verified technologies and concrete technical challenges without inventing APIs', () => {
    const questions = ApplicationFormAssistanceService.extractQuestions(VENDOR_QUESTIONNAIRE_OCR);
    const q1 = questions[0]; // "What infrastructure, APIs or other third-party technologies have you implemented in the past 12 months..."
    const kb = new CandidateKnowledgeBase('');
    kb.registerProject({
      name: 'CloudSync',
      technologyStack: ['Kafka', 'AWS S3', 'Docker'],
      challenges: ['mitigating consumer group rebalance latency and network partitions'],
    });
    const ticket = CandidateConfirmationWorkflow.issueTicket('CloudSync');
    kb.confirmProject('CloudSync', {
      ticket,
      ownership: 'core_contributor',
      personalContribution: 'Integrated Apache Kafka event streaming and S3 storage pipelines',
      verifiedTechnologies: ['Kafka', 'AWS S3', 'Docker'],
      source: 'explicit_candidate_action',
      confirmedBy: 'candidate_user_action',
    });

    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(q1, kb);
    expect(answer.conciseAnswer).toContain('CloudSync');
    expect(answer.conciseAnswer).toContain('Kafka');
    expect(answer.conciseAnswer).toContain('consumer group rebalance');
    expect(answer.safetyState).toBe('VALIDATED');
    expect(answer.conciseAnswer).not.toContain('I created AWS');
  });

  // Requirement 8.4: Vendor selection and ownership question
  it('4. Vendor selection and ownership question: refuses to fabricate sole procurement authority and returns NEEDS_USER_INPUT when unverified', () => {
    const questions = ApplicationFormAssistanceService.extractQuestions(VENDOR_QUESTIONNAIRE_OCR);
    const q2 = questions[1]; // "What was your role in choosing that vendor or API?"
    const kb = new CandidateKnowledgeBase('Candidate: Abhishek Singh\nSkills: System Design, Architecture');
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(q2, kb);

    expect(answer.conciseAnswer).toBe('');
    expect(answer.safetyState).toBe('NEEDS_USER_INPUT');
    expect(answer.missingInformation.length).toBeGreaterThan(0);
    expect(answer.clarificationRequest).toBeDefined();
  });

  // Requirement 8.5: Behavioral interview question
  it('5. Behavioral interview question: accurately classifies into BEHAVIORAL_INTERVIEW', () => {
    const classification = TaskClassificationService.classify(BEHAVIORAL_INTERVIEW_OCR);
    expect(classification.category).toBe('BEHAVIORAL_INTERVIEW');
    expect(classification.suggestedAction).toBe('spoken_interview');
  });

  // Requirement 8.6: Technical interview question
  it('6. Technical interview question: accurately classifies into TECHNICAL_INTERVIEW', () => {
    const techQuestion = 'How does the Raft consensus algorithm prevent split-brain during leader election?';
    const classification = TaskClassificationService.classify(techQuestion);
    expect(classification.category).toBe('TECHNICAL_INTERVIEW');
  });

  // Requirement 8.7: Java coding problem
  it('7. Java coding problem: accurately classifies into CODING_PROBLEM and routes to solver', () => {
    const classification = TaskClassificationService.classify(CODING_PROBLEM_OCR);
    expect(classification.category).toBe('CODING_PROBLEM');
    expect(classification.suggestedAction).toBe('solve_coding');
  });

  // Requirement 8.8: Multiple-choice assessment
  it('8. Multiple-choice assessment: accurately classifies into MULTIPLE_CHOICE_ASSESSMENT', () => {
    const classification = TaskClassificationService.classify(MULTIPLE_CHOICE_ASSESSMENT_OCR);
    expect(classification.category).toBe('MULTIPLE_CHOICE_ASSESSMENT');
    expect(classification.suggestedAction).toBe('mcq_quiz');
  });

  // Requirement 8.9: Form with character limits
  it('9. Form with character limits: strictly bounds answers within specified character length', () => {
    const questions = ApplicationFormAssistanceService.extractQuestions(VENDOR_QUESTIONNAIRE_OCR);
    const q3 = questions[2]; // Max 500 characters
    expect(q3.characterLimit).toBe(500);

    const kb = new CandidateKnowledgeBase('');
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(q3, kb);
    expect(answer.conciseAnswer.length).toBeLessThanOrEqual(500);
    expect(answer.isOverLimit).toBe(false);
  });

  // Requirement 8.10: Multi-question application page
  it('10. Multi-question application page: maintains distinct independent answers and does NOT combine them into one answer', () => {
    const questions = ApplicationFormAssistanceService.extractQuestions(VENDOR_QUESTIONNAIRE_OCR);
    expect(questions.length).toBe(3);

    const kb = new CandidateKnowledgeBase('');
    kb.registerProject({
      name: 'EventBridge',
      technologyStack: ['Kafka', 'AWS'],
    });
    const ticket = CandidateConfirmationWorkflow.issueTicket('EventBridge');
    kb.confirmProject('EventBridge', {
      ticket,
      ownership: 'core_contributor',
      personalContribution: 'Implemented event stream filters and delivery retry logic',
      verifiedTechnologies: ['Kafka', 'AWS'],
      source: 'explicit_candidate_action',
      confirmedBy: 'candidate_user_action',
    });

    const ans1 = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);
    const ans2 = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[1], kb);
    const ans3 = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[2], kb);

    expect(ans1.conciseAnswer).not.toBe(ans2.conciseAnswer);
    expect(ans2.conciseAnswer).not.toBe(ans3.conciseAnswer);
    expect(ans1.questionId).not.toBe(ans2.questionId);
  });

  // Requirement 8.11: OCR with partially missing text
  it('11. OCR with partially missing text: degrades gracefully and sets clarification flags instead of hallucinating', () => {
    const partialOcr = `
1. What was the outcome of project ... [Text partially obscured]
[ Max 200 chars ]
`;
    const questions = ApplicationFormAssistanceService.extractQuestions(partialOcr);
    expect(questions.length).toBe(1);

    const kb = new CandidateKnowledgeBase('Candidate: Abhishek Singh');
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);
    expect(answer.safetyState).toBe('NEEDS_USER_INPUT');
    expect(answer.conciseAnswer).toBe('');
    expect(answer.clarificationRequest).toBeDefined();
  });

  // Requirement 8.12: Unknown task category
  it('12. Unknown task category: flags low confidence and requests user selection', () => {
    const unknownText = 'System diagnostics menu option 4 - View logs';
    const classification = TaskClassificationService.classify(unknownText);
    expect(classification.isLowConfidence).toBe(true);
    expect(classification.suggestedAction).toBe('prompt_user');
  });

  // Requirement 8.13: Unsupported personal experience claims
  it('13. Unsupported personal experience claims: separates verified experience from theoretical knowledge', () => {
    const kb = new CandidateKnowledgeBase('Candidate: Abhishek Singh\nSkills: Java, Concurrency');
    const questions = ApplicationFormAssistanceService.extractQuestions(
      '1. Describe your direct experience managing multimillion dollar procurement contracts for SaaS providers.'
    );
    const answer = ApplicationFormAssistanceService.generateTruthfulAnswer(questions[0], kb);

    expect(answer.missingInformation.length).toBeGreaterThan(0);
    expect(answer.conciseAnswer).toBe('');
    expect(answer.safetyState).toBe('NEEDS_USER_INPUT');
  });

  // Requirement 8.14: Screen overlay compact-mode behavior
  it('14. Screen overlay compact-mode behavior: toggles teleprompterViewMode state cleanly', () => {
    const store = useAppStore.getState();
    expect(store.teleprompterViewMode).toBe('full');

    store.setTeleprompterViewMode('compact');
    expect(useAppStore.getState().teleprompterViewMode).toBe('compact');

    store.setTeleprompterViewMode('minimized');
    expect(useAppStore.getState().teleprompterViewMode).toBe('minimized');
  });

  // Requirement 8.15: End-to-end Screen detection event routing to Application Assistance
  it('15. End-to-end Screen detection event routing: captures vendor questionnaire and activates applicationSession without coding rejection', async () => {
    await InterviewEngine.handleEvent({
      type: 'SCREEN_PROBLEM_DETECTED',
      rawText: VENDOR_QUESTIONNAIRE_OCR,
      mode: 'fullscreen',
    });

    const store = useAppStore.getState();
    expect(store.responseMode).toBe('application');
    expect(store.applicationSession).toBeDefined();
    expect(store.applicationSession.category).toBe('VENDOR_EVALUATION');
    expect(store.applicationSession.questions.length).toBe(3);
    expect(store.currentAnswer).not.toContain('algorithmic task is present');
    expect(store.currentAnswer).not.toContain('Java solution');
  });
});
