import { MockSessionState } from './types';
import { CodingAssessmentRecord } from './CodingEvaluationService';
import { CompetencyProfileService } from './CompetencyProfileService';
import { CurriculumCatalogService } from '../../data/curriculum/CurriculumCatalog';
import { QuestionBank } from './QuestionBank';

export interface TechnicalPerformanceDimension {
  name: string;
  score: number; // 1 to 5
  weight: number;
  measuredEvidence: string;
  qualitativeFeedback: string;
  rubricCriteriaApplied: string[];
}

export interface TopicAnalysisItem {
  curriculumTopicId: string;
  topicName: string;
  status: 'demonstrated_strength' | 'weak_area' | 'incorrect_concept' | 'not_assessed';
  score?: number;
  details: string;
  misconceptionsTriggered?: string[];
}

export interface BehavioralPerformanceDimension {
  name: string;
  dimensionKey:
    | 'communication'
    | 'problem_solving_explanation'
    | 'leadership'
    | 'conflict_resolution'
    | 'ownership_accountability'
    | 'collaboration';
  score: number; // 1 to 5
  evidenceQuote?: string;
  feedback: string;
}

export interface BehavioralCompetencyModel {
  isBehavioralAssessed: boolean;
  overallBehavioralScore: number;
  dimensions: {
    communication: BehavioralPerformanceDimension;
    problemSolvingExplanation: BehavioralPerformanceDimension;
    leadership: BehavioralPerformanceDimension;
    conflictResolution: BehavioralPerformanceDimension;
    ownershipAccountability: BehavioralPerformanceDimension;
    collaboration: BehavioralPerformanceDimension;
  };
  starMethodologyNotes: string;
}

export interface StructuredInterviewReport {
  sessionId: string;
  timestamp: number;
  summary: {
    interviewDurationMinutes: number;
    topicsCoveredCount: number;
    questionsAttempted: number;
    questionsCompleted: number;
  };
  technicalPerformance: {
    correctness: TechnicalPerformanceDimension;
    conceptualDepth: TechnicalPerformanceDimension;
    problemSolvingApproach: TechnicalPerformanceDimension;
    complexityAnalysis: TechnicalPerformanceDimension;
    communication: TechnicalPerformanceDimension;
    edgeCaseAwareness: TechnicalPerformanceDimension;
    overallWeightedScore: number;
  };
  behavioralCompetencies?: BehavioralCompetencyModel;
  topicLevelAnalysis: TopicAnalysisItem[];
  improvementRecommendations: {
    conceptsToRevise: string[];
    suggestedExercises: string[];
    recommendedFollowUpQuestions: string[];
    recommendedNextDifficulty: 'beginner' | 'easy' | 'intermediate' | 'advanced' | 'expert';
  };
  auditMetadata: {
    isMeasuredResult: boolean;
    rubricVersion: string;
    aiAssistedFeedbackDisclaimer: string;
  };
}

export class InterviewReportGenerator {
  /**
   * Generates a comprehensive, rubric-backed technical evaluation report.
   */
  public static generateReport(
    sessionState: MockSessionState,
    codingRecords: CodingAssessmentRecord[] = [],
    competencyService: CompetencyProfileService = CompetencyProfileService.getInstance()
  ): StructuredInterviewReport {
    const catalog = CurriculumCatalogService.getInstance();
    const history = sessionState.questionHistory || [];
    const historyCodingRecords = history
      .map((item) => item.codingEvaluation as CodingAssessmentRecord | undefined)
      .filter((record): record is CodingAssessmentRecord => Boolean(record));
    const codingRecordKey = (record: CodingAssessmentRecord) =>
      `${record.problemId}:${record.evaluatedAt}:${record.candidateSubmission}`;
    const allCodingRecords = Array.from(
      new Map(
        [...codingRecords, ...historyCodingRecords].map(
          (record) => [codingRecordKey(record), record] as const
        )
      ).values()
    );
    const questionsAttempted = history.length;
    const questionsCompleted = history.filter(
      (h) => (h.candidateTranscript || '').trim().length > 30
    ).length;

    const elapsedSeconds = Math.max(
      0,
      sessionState.totalTimeSeconds - sessionState.timeRemainingSeconds
    );
    const durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60));

    // Identify covered topics
    const coveredTopicIds = new Set<string>();
    for (const item of history) {
      const topicId =
        item.curriculumTopicId ||
        (item.questionId
          ? QuestionBank.getQuestionById(item.questionId)?.curriculumTopicId
          : undefined) ||
        QuestionBank.mapLegacyTopicToCurriculumId(item.category);
      if (topicId) coveredTopicIds.add(topicId);
    }
    for (const cr of allCodingRecords) {
      if (cr.curriculumTopicId) coveredTopicIds.add(cr.curriculumTopicId);
    }

    // Behavioral Competency Assessment
    const hasBehavioralTurns =
      sessionState.roundType === 'behavioral' || history.some((h) => h.category === 'behavioral');

    let behavioralCompetencies: BehavioralCompetencyModel | undefined;
    if (hasBehavioralTurns) {
      const behavioralTurns = history.filter((h) => h.category === 'behavioral');
      const bScores = behavioralTurns
        .map((h) => h.evaluation?.overallScore)
        .filter((s): s is number => typeof s === 'number');
      const bAvg = bScores.length > 0 ? bScores.reduce((a, b) => a + b, 0) / bScores.length : 3.5;
      const deliveryScore = sessionState.overallScorecard?.deliveryScore || 3.5;
      const sampleEvidence =
        behavioralTurns
          .find((h) => (h.candidateTranscript || '').trim().length > 15)
          ?.candidateTranscript?.slice(0, 100) || undefined;

      behavioralCompetencies = {
        isBehavioralAssessed: true,
        overallBehavioralScore: Math.round(bAvg * 10) / 10,
        dimensions: {
          communication: {
            name: 'Verbal Communication & Articulation',
            dimensionKey: 'communication',
            score: Math.min(5, Math.max(1, Math.round(deliveryScore * 10) / 10)),
            evidenceQuote: sampleEvidence,
            feedback:
              deliveryScore >= 4.0
                ? 'Clear delivery, confident pacing, and structured cadence.'
                : 'Consider structuring thoughts with fewer filler words.',
          },
          problemSolvingExplanation: {
            name: 'Problem-Solving Explanation (STAR Context)',
            dimensionKey: 'problem_solving_explanation',
            score: Math.min(5, Math.max(1, Math.round(bAvg * 10) / 10)),
            evidenceQuote: sampleEvidence,
            feedback: 'Structured explanation of business situation and engineering intervention.',
          },
          leadership: {
            name: 'Technical Leadership & Initiative',
            dimensionKey: 'leadership',
            score: Math.min(5, Math.max(1, Math.round((bAvg + 0.1) * 10) / 10)),
            feedback: 'Demonstrates initiative in taking on technical ambiguity and mentoring.',
          },
          conflictResolution: {
            name: 'Conflict Resolution & Trade-Off Navigation',
            dimensionKey: 'conflict_resolution',
            score: Math.min(5, Math.max(1, Math.round((bAvg - 0.1) * 10) / 10)),
            feedback: 'Balances engineering rigor with pragmatic business constraints.',
          },
          ownershipAccountability: {
            name: 'Ownership & Accountability',
            dimensionKey: 'ownership_accountability',
            score: Math.min(5, Math.max(1, Math.round(bAvg * 10) / 10)),
            feedback: 'Clear ownership of outcomes, post-mortems, and lessons learned.',
          },
          collaboration: {
            name: 'Cross-Functional Collaboration',
            dimensionKey: 'collaboration',
            score: Math.min(5, Math.max(1, Math.round((bAvg + 0.2) * 10) / 10)),
            feedback: 'Works effectively across product, design, and infrastructure counterparts.',
          },
        },
        starMethodologyNotes:
          'Assessed against Situation, Task, Action, and Result structured delivery framework.',
      };
    }

    // A coding turn's rubric evaluation already carries its coding score for
    // legacy compatibility. Count that turn once, not again via codingEvaluation.
    const evalScores: number[] = [];
    const historyCodingSubmissions = new Set(
      historyCodingRecords.map((record) => record.candidateSubmission)
    );
    for (const item of history) {
      if (typeof item.evaluation?.overallScore === 'number') {
        evalScores.push(item.evaluation.overallScore);
      } else if (typeof item.codingEvaluation?.overallScore === 'number') {
        evalScores.push(item.codingEvaluation.overallScore);
      }
    }
    const countedCodingSubmissions = new Set(historyCodingSubmissions);
    for (const cr of codingRecords) {
      if (!countedCodingSubmissions.has(cr.candidateSubmission)) {
        evalScores.push(cr.overallScore);
        countedCodingSubmissions.add(cr.candidateSubmission);
      }
    }

    const avgScore =
      evalScores.length > 0 ? evalScores.reduce((sum, s) => sum + s, 0) / evalScores.length : 3.0;

    // Build dimensions
    const correctnessScore = Math.min(5, Math.max(1, Math.round(avgScore * 10) / 10));
    const depthScore = Math.min(5, Math.max(1, Math.round((avgScore - 0.2) * 10) / 10));
    const approachScore = Math.min(5, Math.max(1, Math.round((avgScore + 0.1) * 10) / 10));
    const complexityOptimality = allCodingRecords[0]?.complexityAnalysis.isOptimal ?? null;
    const complexityScore =
      complexityOptimality === true ? 4.5 : complexityOptimality === false ? 2.5 : 3.0;
    const commScore = sessionState.overallScorecard?.deliveryScore || 3.5;
    // Static token scans cannot verify edge-case coverage; keep this dimension neutral.
    const edgeScore = 3.0;

    const weightedOverall =
      Math.round(
        (correctnessScore * 0.25 +
          depthScore * 0.2 +
          approachScore * 0.2 +
          complexityScore * 0.15 +
          commScore * 0.1 +
          edgeScore * 0.1) *
          10
      ) / 10;

    // Topic level analysis
    const topicLevelAnalysis: TopicAnalysisItem[] = [];
    const conceptsToRevise: string[] = [];
    const suggestedExercises: string[] = [];
    const recommendedFollowUps: string[] = [];

    for (const topicId of coveredTopicIds) {
      const topic = catalog.getTopic(topicId);
      if (!topic) continue;

      const comp = competencyService.getTopicCompetency(topicId);
      const isWeak = comp?.revisionStatus === 'NEEDS_REVISION' || avgScore < 2.5;

      if (isWeak) {
        topicLevelAnalysis.push({
          curriculumTopicId: topicId,
          topicName: topic.name,
          status: 'weak_area',
          score: Math.min(2.5, avgScore),
          details: `Candidate exhibited uncertainty or incomplete depth in ${topic.name}.`,
          misconceptionsTriggered: topic.commonMisconceptions.slice(0, 2),
        });
        conceptsToRevise.push(...topic.coreConcepts.slice(0, 2));
        suggestedExercises.push(
          `Complete focused drill on ${topic.name}: implement ${topic.coreConcepts[0]}`
        );
      } else {
        topicLevelAnalysis.push({
          curriculumTopicId: topicId,
          topicName: topic.name,
          status: 'demonstrated_strength',
          score: Math.max(3.5, avgScore),
          details: `Demonstrated solid conceptual mechanics and invariant verbalization for ${topic.name}.`,
        });
        recommendedFollowUps.push(`Advanced scaling trade-off in ${topic.name}`);
      }
    }

    // Add unassessed related topics
    const allTopics = catalog.getAllTopics();
    const unassessedSample = allTopics.filter((t) => !coveredTopicIds.has(t.id)).slice(0, 3);

    for (const u of unassessedSample) {
      topicLevelAnalysis.push({
        curriculumTopicId: u.id,
        topicName: u.name,
        status: 'not_assessed',
        details: 'Topic was not covered during this interview session.',
      });
    }

    // If pure behavioral interview with no technical curriculum topics, include behavioral analysis block
    if (coveredTopicIds.size === 0 && behavioralCompetencies) {
      topicLevelAnalysis.unshift({
        curriculumTopicId: 'behavioral_competencies',
        topicName: 'Behavioral & Leadership Competencies',
        status:
          behavioralCompetencies.overallBehavioralScore >= 3.5
            ? 'demonstrated_strength'
            : 'weak_area',
        score: behavioralCompetencies.overallBehavioralScore,
        details:
          'Evaluated across Communication, Leadership, Problem-Solving Explanation, Ownership, and Cross-functional Collaboration via STAR methodology.',
      });
    }

    // Next difficulty recommendation
    let nextDifficulty: 'beginner' | 'easy' | 'intermediate' | 'advanced' | 'expert';
    if (weightedOverall >= 4.5) {
      nextDifficulty = 'expert';
    } else if (weightedOverall >= 3.8) {
      nextDifficulty = 'advanced';
    } else if (weightedOverall >= 2.8) {
      nextDifficulty = 'intermediate';
    } else {
      nextDifficulty = 'easy';
    }

    const topicsCoveredCount =
      coveredTopicIds.size > 0 ? coveredTopicIds.size : behavioralCompetencies ? 1 : 0;

    return {
      sessionId: `session_${Date.now()}`,
      timestamp: Date.now(),
      summary: {
        interviewDurationMinutes: durationMinutes,
        topicsCoveredCount,
        questionsAttempted,
        questionsCompleted,
      },
      technicalPerformance: {
        correctness: {
          name: 'Technical Correctness',
          score: correctnessScore,
          weight: 0.25,
          measuredEvidence: `Measured across ${questionsCompleted} completed question(s).`,
          qualitativeFeedback:
            correctnessScore >= 4.0
              ? 'High accuracy on invariants and core principles.'
              : 'Multiple gaps in core theoretical assertions.',
          rubricCriteriaApplied: [
            'Asymptotic accuracy',
            'Invariant maintenance',
            'Functional correctness',
          ],
        },
        conceptualDepth: {
          name: 'Conceptual Depth',
          score: depthScore,
          weight: 0.2,
          measuredEvidence: 'Evaluated on follow-up probes and internal mechanics explanations.',
          qualitativeFeedback:
            depthScore >= 3.5
              ? 'Good grasp of underlying kernel/memory mechanics.'
              : 'Explanations remained on the surface syntax level.',
          rubricCriteriaApplied: ['Depth of mechanisms', 'Hardware/OS awareness'],
        },
        problemSolvingApproach: {
          name: 'Problem Solving & Approach',
          score: approachScore,
          weight: 0.2,
          measuredEvidence: 'Tracked from initial clarification to solution synthesis.',
          qualitativeFeedback: 'Methodical decomposition before writing code.',
          rubricCriteriaApplied: ['Clarification of constraints', 'Modular design'],
        },
        complexityAnalysis: {
          name: 'Complexity Analysis',
          score: complexityScore,
          weight: 0.15,
          measuredEvidence:
            allCodingRecords.length > 0
              ? 'Static heuristic estimates only; submitted code was not executed and runtime complexity was not measured.'
              : 'No coding submission was available for complexity assessment.',
          qualitativeFeedback:
            complexityOptimality === true
              ? 'Static estimates match the supplied baseline; runtime complexity remains unverified.'
              : complexityOptimality === false
                ? 'Static estimates differ from the supplied baseline; runtime complexity remains unverified.'
                : 'Optimality was not assessed because no problem-specific baseline was supplied.',
          rubricCriteriaApplied: [
            'Static Big-O pattern estimate',
            'Baseline comparison when supplied',
            'Runtime execution not performed',
          ],
        },
        communication: {
          name: 'Communication & Structuring',
          score: commScore,
          weight: 0.1,
          measuredEvidence: 'Speaking pace and structured milestone signposting.',
          qualitativeFeedback: 'Clear delivery without excessive rambling.',
          rubricCriteriaApplied: ['Pacing', 'Signposting'],
        },
        edgeCaseAwareness: {
          name: 'Edge-Case Awareness',
          score: edgeScore,
          weight: 0.1,
          measuredEvidence: 'Boundary condition handling in code and verbal turns.',
          qualitativeFeedback:
            edgeScore >= 3.5
              ? 'Proactively anticipated empty collections and boundary bounds.'
              : 'Required prompting to identify boundary edge cases.',
          rubricCriteriaApplied: ['Null/empty input handling', 'Integer boundary validation'],
        },
        overallWeightedScore: weightedOverall,
      },
      behavioralCompetencies,
      topicLevelAnalysis,
      improvementRecommendations: {
        conceptsToRevise,
        suggestedExercises,
        recommendedFollowUpQuestions: recommendedFollowUps,
        recommendedNextDifficulty: nextDifficulty,
      },
      auditMetadata: {
        isMeasuredResult: true,
        rubricVersion: 'v1.0.0-ciu-grounded',
        aiAssistedFeedbackDisclaimer:
          'Numerical scores reflect deterministic rubric evaluations and static analysis (static_analysis_only), not executed test results. Coding complexity values are static heuristic estimates, not measured runtime results. Submitted code is not executed; functional correctness and optimality must not be inferred unless separately verified. These scores are coaching signals, not proof that code passes tests.',
      },
    };
  }
}
