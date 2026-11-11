import { describe, it, expect, beforeEach } from 'vitest';
import { InterviewReportGenerator } from '../src/services/practice/InterviewReportGenerator';
import { MockSessionState } from '../src/services/practice/types';
import { CodingAssessmentRecord } from '../src/services/practice/CodingEvaluationService';
import { CompetencyProfileService } from '../src/services/practice/CompetencyProfileService';

describe('Phase 7 — Structured Interview Evaluation Report', () => {
  beforeEach(() => {
    CompetencyProfileService.getInstance().resetProfile();
  });

  const mockSession: MockSessionState = {
    isActive: false,
    roundType: 'dsa_coding',
    persona: 'strict_big_tech',
    pressure: 'normal',
    totalTimeSeconds: 45 * 60,
    timeRemainingSeconds: 15 * 60,
    interruptionEnabled: false,
    isInterviewerSpeaking: false,
    interviewerThinkingSeconds: 0,
    currentQuestion: 'Given an array find contiguous subarray...',
    questionHistory: [
      {
        question: 'Explain collision resolution in hash tables.',
        category: 'ds_hash_tables',
        isFollowUp: false,
        candidateTranscript:
          'Separate chaining keeps linked lists in each bucket, while open addressing probes within the array.',
        hintsUsed: [],
        questionId: 'cq_hash_01',
        evaluation: {
          overallScore: 4.2,
          percentage: 84,
          dimensions: [],
          topLeverageFixes: [],
          modelAnswer: '',
          diffMissingPoints: [],
          assessedAt: Date.now(),
        },
      },
    ],
    overallScorecard: {
      finalRating: 'Hire',
      averageScore: 4.2,
      deliveryScore: 4.0,
      keyStrengths: ['Cache locality knowledge'],
      topImprovementPriorities: ['Tombstone deletion'],
    },
  };

  const mockCodingRecord: CodingAssessmentRecord = {
    problemId: 'cq_arrays_02',
    curriculumTopicId: 'ds_arrays_strings',
    candidateSubmission: 'function minSubArrayLen(...) { ... }',
    language: 'typescript',
    executionStatus: 'static_analysis_only',
    testResults: [],
    complexityAnalysis: {
      statedTimeComplexity: 'O(N)',
      actualTimeComplexity: 'O(N)',
      actualSpaceComplexity: 'O(1)',
      isOptimal: true,
    },
    hintsUsed: [],
    attempts: 1,
    timeTakenSeconds: 900,
    dimensions: {
      functionalCorrectness: { score: 4.5, quoteOrSnippet: '', rationale: 'Valid' },
      algorithmSelection: { score: 4.5, quoteOrSnippet: '', rationale: 'Optimal' },
      timeComplexity: { score: 4.5, quoteOrSnippet: '', rationale: 'O(N)' },
      spaceComplexity: { score: 5.0, quoteOrSnippet: '', rationale: 'O(1)' },
      edgeCaseHandling: { score: 4.0, quoteOrSnippet: '', rationale: 'Guards present' },
      codeReadability: { score: 4.0, quoteOrSnippet: '', rationale: 'Clean' },
      maintainability: { score: 4.0, quoteOrSnippet: '', rationale: 'Modular' },
      explanationReasoning: { score: 4.5, quoteOrSnippet: '', rationale: 'Clear' },
    },
    overallScore: 4.4,
    summaryFeedback: 'Strong coding performance.',
    evaluatedAt: Date.now(),
  };

  it('generates structured interview evaluation report with all mandatory sections', () => {
    const report = InterviewReportGenerator.generateReport(mockSession, [mockCodingRecord]);

    // 1. Summary
    expect(report.summary.interviewDurationMinutes).toBe(30);
    expect(report.summary.questionsAttempted).toBe(1);
    expect(report.summary.questionsCompleted).toBe(1);
    expect(report.summary.topicsCoveredCount).toBeGreaterThanOrEqual(2);

    // 2. Technical Performance Dimensions
    const tp = report.technicalPerformance;
    expect(tp.correctness.score).toBeGreaterThanOrEqual(4.0);
    expect(tp.conceptualDepth.score).toBeGreaterThanOrEqual(3.5);
    expect(tp.problemSolvingApproach.score).toBeGreaterThanOrEqual(4.0);
    expect(tp.complexityAnalysis.score).toBe(3);
    expect(tp.communication.score).toBe(4.0);
    expect(tp.edgeCaseAwareness.score).toBe(3);
    expect(tp.overallWeightedScore).toBeGreaterThanOrEqual(3.8);

    // Verify rubric criteria are explicitly documented
    expect(tp.correctness.rubricCriteriaApplied.length).toBeGreaterThanOrEqual(2);

    // 3. Topic-Level Analysis
    expect(report.topicLevelAnalysis.length).toBeGreaterThanOrEqual(2);
    const hashAnalysis = report.topicLevelAnalysis.find(
      (t) => t.curriculumTopicId === 'ds_hash_tables'
    );
    expect(hashAnalysis).toBeDefined();
    expect(hashAnalysis?.status).toBe('demonstrated_strength');

    // Unassessed topics included
    const unassessed = report.topicLevelAnalysis.find((t) => t.status === 'not_assessed');
    expect(unassessed).toBeDefined();

    // 4. Improvement Recommendations
    expect(report.improvementRecommendations.recommendedNextDifficulty).toBe('advanced');
    expect(report.auditMetadata.isMeasuredResult).toBe(true);
    expect(report.auditMetadata.aiAssistedFeedbackDisclaimer).toContain(
      'Numerical scores reflect deterministic rubric evaluations'
    );
  });

  it('does not count an attached coding evaluation twice in the session average', () => {
    const codingTurn = {
      ...mockSession.questionHistory[0],
      question: 'Implement the requested array algorithm.',
      category: 'coding',
      candidateTranscript: mockCodingRecord.candidateSubmission,
      evaluation: {
        overallScore: mockCodingRecord.overallScore,
        percentage: 88,
        dimensions: [],
        topLeverageFixes: [],
        modelAnswer: '',
        diffMissingPoints: [],
        assessedAt: Date.now(),
      },
      codingEvaluation: mockCodingRecord,
    };
    const lowerScoringTurn = {
      ...mockSession.questionHistory[0],
      question: 'Explain a behavioral scenario.',
      category: 'behavioral',
      candidateTranscript: 'I would communicate the risk and coordinate a recovery plan.',
      evaluation: {
        overallScore: 1.6,
        percentage: 32,
        dimensions: [],
        topLeverageFixes: [],
        modelAnswer: '',
        diffMissingPoints: [],
        assessedAt: Date.now(),
      },
    };
    const session: MockSessionState = {
      ...mockSession,
      questionHistory: [codingTurn, lowerScoringTurn],
    };

    const report = InterviewReportGenerator.generateReport(session, []);

    // (4.4 + 1.6) / 2 = 3.0; the attached coding record must not add a third vote.
    expect(report.technicalPerformance.correctness.score).toBe(3.0);
  });

  it('accurately identifies weak areas and misconceptions when scores are low', () => {
    const weakSession: MockSessionState = {
      ...mockSession,
      questionHistory: [
        {
          question: 'Explain Dijkstra shortest path with negative edges.',
          category: 'algo_graph_algorithms',
          isFollowUp: false,
          candidateTranscript: 'Dijkstra works fine with negative edges.',
          hintsUsed: [],
          evaluation: {
            overallScore: 1.5,
            percentage: 30,
            dimensions: [],
            topLeverageFixes: [],
            modelAnswer: '',
            diffMissingPoints: [],
            assessedAt: Date.now(),
          },
        },
      ],
    };

    const report = InterviewReportGenerator.generateReport(weakSession, []);
    const graphTopic = report.topicLevelAnalysis.find(
      (t) => t.curriculumTopicId === 'algo_graph_algorithms'
    );

    expect(graphTopic).toBeDefined();
    expect(graphTopic?.status).toBe('weak_area');
    expect(graphTopic?.misconceptionsTriggered).toBeDefined();
    expect(report.improvementRecommendations.conceptsToRevise.length).toBeGreaterThan(0);
    expect(report.improvementRecommendations.suggestedExercises.length).toBeGreaterThan(0);
    expect(report.improvementRecommendations.recommendedNextDifficulty).toBe('easy');
  });

  it('does not create a behavioral assessment without a scored behavioral answer', () => {
    const session: MockSessionState = {
      ...mockSession,
      roundType: 'behavioral',
      questionHistory: [
        {
          ...mockSession.questionHistory[0],
          category: 'behavioral',
          evaluation: undefined,
        },
      ],
    };

    const report = InterviewReportGenerator.generateReport(session, []);

    expect(report.behavioralCompetencies).toBeUndefined();
  });

  it('does not present aggregate behavioral scores as separately measured competencies', () => {
    const session: MockSessionState = {
      ...mockSession,
      roundType: 'behavioral',
      questionHistory: [
        {
          ...mockSession.questionHistory[0],
          category: 'behavioral',
          evaluation: {
            overallScore: 4.0,
            percentage: 80,
            dimensions: [],
            topLeverageFixes: [],
            modelAnswer: '',
            diffMissingPoints: [],
            assessedAt: Date.now(),
          },
        },
      ],
    };

    const report = InterviewReportGenerator.generateReport(session, []);
    const competencies = report.behavioralCompetencies;

    expect(competencies?.isBehavioralAssessed).toBe(true);
    expect(competencies?.overallBehavioralScore).toBe(4.0);
    expect(competencies?.dimensions.leadership.score).toBe(4.0);
    expect(competencies?.dimensions.conflictResolution.score).toBe(4.0);
    expect(competencies?.dimensions.collaboration.score).toBe(4.0);
    expect(competencies?.dimensions.leadership.feedback).toContain('not separately assessed');
    expect(competencies?.starMethodologyNotes).toContain('not separately measured');
  });

  it('classifies each topic from its own evidence instead of the session-wide average', () => {
    const session: MockSessionState = {
      ...mockSession,
      questionHistory: [
        {
          question: 'Explain collision resolution in hash tables.',
          category: 'ds_hash_tables',
          isFollowUp: false,
          candidateTranscript:
            'Separate chaining stores colliding keys in a bucket-specific chain.',
          hintsUsed: [],
          evaluation: {
            overallScore: 4.8,
            percentage: 96,
            dimensions: [],
            topLeverageFixes: [],
            modelAnswer: '',
            diffMissingPoints: [],
            assessedAt: Date.now(),
          },
        },
        {
          question: 'Explain Dijkstra shortest path with negative edges.',
          category: 'algo_graph_algorithms',
          isFollowUp: false,
          candidateTranscript: 'Dijkstra works fine with negative edges.',
          hintsUsed: [],
          evaluation: {
            overallScore: 1.5,
            percentage: 30,
            dimensions: [],
            topLeverageFixes: [],
            modelAnswer: '',
            diffMissingPoints: [],
            assessedAt: Date.now(),
          },
        },
      ],
    };

    const report = InterviewReportGenerator.generateReport(session, []);
    const hashTopic = report.topicLevelAnalysis.find(
      (topic) => topic.curriculumTopicId === 'ds_hash_tables'
    );
    const graphTopic = report.topicLevelAnalysis.find(
      (topic) => topic.curriculumTopicId === 'algo_graph_algorithms'
    );

    expect(hashTopic?.status).toBe('demonstrated_strength');
    expect(hashTopic?.score).toBe(4.8);
    expect(graphTopic?.status).toBe('weak_area');
    expect(graphTopic?.score).toBe(1.5);
  });
});
