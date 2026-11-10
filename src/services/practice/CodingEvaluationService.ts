import { z } from 'zod';
import { TieredHint } from './types';

export const CodingExecutionStatusSchema = z.enum([
  'executed_passed',
  'executed_failed',
  'not_executed',
  'static_analysis_only',
  'ai_assessment_only',
]);

export type CodingExecutionStatus = z.infer<typeof CodingExecutionStatusSchema>;

export interface TestCaseResult {
  testCaseId: string;
  input: string;
  expected: string;
  actual?: string;
  passed: boolean;
  executionTimeMs?: number;
  error?: string;
}

export interface ComplexityAnalysisResult {
  statedTimeComplexity?: string;
  actualTimeComplexity: string;
  statedSpaceComplexity?: string;
  actualSpaceComplexity: string;
  /** null means optimality could not be assessed against a supplied baseline. */
  isOptimal: boolean | null;
  notes?: string;
}

export interface CodingDimensionScore {
  score: number; // 1 to 5
  quoteOrSnippet: string;
  rationale: string;
}

export interface CodingAssessmentRecord {
  problemId: string;
  curriculumTopicId?: string;
  candidateSubmission: string;
  language: string;
  executionStatus: CodingExecutionStatus;
  testResults: TestCaseResult[];
  complexityAnalysis: ComplexityAnalysisResult;
  hintsUsed: TieredHint[];
  attempts: number;
  timeTakenSeconds: number;
  dimensions: {
    functionalCorrectness: CodingDimensionScore;
    algorithmSelection: CodingDimensionScore;
    timeComplexity: CodingDimensionScore;
    spaceComplexity: CodingDimensionScore;
    edgeCaseHandling: CodingDimensionScore;
    codeReadability: CodingDimensionScore;
    maintainability: CodingDimensionScore;
    explanationReasoning: CodingDimensionScore;
  };
  overallScore: number;
  summaryFeedback: string;
  evaluatedAt: number;
}

export interface EvaluateSubmissionParams {
  problemId: string;
  curriculumTopicId?: string;
  candidateSubmission: string;
  explanationTranscript?: string;
  language: string;
  hintsUsed?: TieredHint[];
  attempts?: number;
  timeTakenSeconds?: number;
  expectedOptimalComplexity?: {
    time: string;
    space: string;
  };
  customTestCases?: Array<{ id: string; input: string; expected: string }>;
  llmCaller?: (prompt: string, model: string) => Promise<string>;
}

export class CodingEvaluationService {
  /**
   * Evaluates a candidate's coding submission across the 8 distinct dimensions,
   * enforcing strict separation between executed test results, static analysis,
   * and AI assessments. Untrusted code is never executed directly in main/renderer.
   */
  public static async evaluateSubmission(
    params: EvaluateSubmissionParams
  ): Promise<CodingAssessmentRecord> {
    const hintsUsed = params.hintsUsed || [];
    const attempts = params.attempts || 1;
    const timeTaken = params.timeTakenSeconds || 600;
    const code = params.candidateSubmission || '';
    const transcript = params.explanationTranscript || '';

    // 1. Static Analysis Checks (syntax, loops, patterns)
    const staticCheck = this.performStaticAnalysis(code, params.language);

    // 2. Test Execution Sandbox Handling
    // Never run eval() on untrusted user code in Electron main or renderer!
    const testResults: TestCaseResult[] = [];
    let executionStatus: CodingExecutionStatus = 'static_analysis_only';

    if (params.customTestCases && params.customTestCases.length > 0) {
      // If simulated or worker execution is available:
      // In this environment, we execute safe deterministic assertion simulations or mark not_executed
      for (const tc of params.customTestCases) {
        testResults.push({
          testCaseId: tc.id,
          input: tc.input,
          expected: tc.expected,
          passed: false,
          error: 'Untrusted runtime execution skipped in renderer boundary.',
        });
      }
      executionStatus = 'not_executed';
    }

    // 3. Complexity Extraction and Analysis
    const complexity = this.analyzeComplexity(code, transcript, params.expectedOptimalComplexity);

    // 4. Calculate Scores Across 8 Dimensions
    const dimensions = this.scoreDimensions({
      code,
      transcript,
      staticCheck,
      complexity,
      executionStatus,
      hintsUsed,
      curriculumTopicId: params.curriculumTopicId,
    });

    // Compute hint penalty on overall score
    const totalPenalty = hintsUsed.reduce((sum, h) => sum + (h.penaltyPoints || 0), 0);
    const rawAverage = Object.values(dimensions).reduce((sum, d) => sum + d.score, 0) / 8;
    const penalizedScore = Math.max(1.0, Math.round((rawAverage - totalPenalty * 0.3) * 10) / 10);

    return {
      problemId: params.problemId,
      curriculumTopicId: params.curriculumTopicId,
      candidateSubmission: code,
      language: params.language,
      executionStatus,
      testResults,
      complexityAnalysis: complexity,
      hintsUsed,
      attempts,
      timeTakenSeconds: timeTaken,
      dimensions,
      overallScore: penalizedScore,
      summaryFeedback: this.generateSummaryFeedback(
        penalizedScore,
        dimensions,
        complexity,
        hintsUsed
      ),
      evaluatedAt: Date.now(),
    };
  }

  /**
   * Static syntactic and structural code analysis.
   */
  private static performStaticAnalysis(
    code: string,
    _language: string
  ): {
    isEmptySubmission: boolean;
    hasLoops: boolean;
    hasRecursion: boolean;
    hasComments: boolean;
    lineCount: number;
    detectedIdentifiers: string[];
  } {
    const lines = code.split('\n');
    const hasLoops = /\b(for|while|forEach)\b/.test(code);
    const hasRecursion = /\bfunction\s+([a-zA-Z0-9_]+)[\s\S]*?\1\s*\(/.test(code);
    const hasComments = /\/\/|\/\*|\*/.test(code) || /#/.test(code);
    const detectedIdentifiers = Array.from(
      new Set(code.match(/\b[a-zA-Z_][a-zA-Z0-9_]{2,}\b/g) || [])
    );

    return {
      isEmptySubmission: code.trim().length === 0,
      hasLoops,
      hasRecursion,
      hasComments,
      lineCount: lines.length,
      detectedIdentifiers,
    };
  }

  /**
   * Analyzes time and space complexity claims against code structure and curriculum invariants.
   */
  private static analyzeComplexity(
    code: string,
    transcript: string,
    expectedOptimal?: { time: string; space: string }
  ): ComplexityAnalysisResult {
    // Extract stated Big-O from explanation
    const timeMatch = transcript.match(/O\([0-9nNlogkK\s^+*]+\)/);
    const statedTime = timeMatch ? timeMatch[0] : undefined;

    // Detect algorithmic patterns: sliding window with two pointers is O(N)
    const isSlidingWindow =
      (code.includes('left') &&
        code.includes('right') &&
        (code.includes('left++') || code.includes('++left'))) ||
      transcript.toLowerCase().includes('sliding window') ||
      transcript.toLowerCase().includes('two pointer');

    let actualTime = 'O(N)';
    if (isSlidingWindow) {
      actualTime = 'O(N)';
    } else {
      const nestedLoops = (code.match(/\bfor\s*\([^)]*\)[\s\S]*?\bfor\s*\(/g) || []).length;
      if (nestedLoops >= 1) {
        actualTime = 'O(N^2)';
      } else if (!code.includes('for') && !code.includes('while') && !code.includes('forEach')) {
        actualTime = 'O(1)';
      }
    }

    const actualSpace = /\b(new Array|new Map|new Set|\[\]|\{\})\b/.test(code) ? 'O(N)' : 'O(1)';

    // Regex-based source inspection cannot establish asymptotic complexity.
    // Keep estimates visible as hints, but never turn them into an optimality verdict.
    const isOptimal: boolean | null = null;

    return {
      statedTimeComplexity: statedTime,
      actualTimeComplexity: actualTime,
      statedSpaceComplexity: undefined,
      actualSpaceComplexity: actualSpace,
      isOptimal,
      notes:
        'Complexity values are regex-based static hints, not measured or validated complexity results. ' +
        'Optimality was not assessed because source-text heuristics cannot reliably prove time or space complexity.' +
        (expectedOptimal
          ? ` Supplied baseline: ${expectedOptimal.time} time and ${expectedOptimal.space} space.`
          : ' No problem-specific baseline was supplied.'),
    };
  }

  /**
   * Evaluates each of the 8 distinct dimensions.
   */
  private static scoreDimensions(params: {
    code: string;
    transcript: string;
    staticCheck: ReturnType<typeof CodingEvaluationService.performStaticAnalysis>;
    complexity: ComplexityAnalysisResult;
    executionStatus: CodingExecutionStatus;
    hintsUsed: TieredHint[];
    curriculumTopicId?: string;
  }): CodingAssessmentRecord['dimensions'] {
    const { code, transcript, staticCheck, complexity } = params;

    // 1. Functional Correctness
    // Static pattern checks cannot establish whether a submission returns correct
    // results. Keep non-empty, unexecuted code neutral; only an empty submission
    // is definitively incomplete without executing it.
    const correctnessScore = staticCheck.isEmptySubmission ? 1 : 3;

    // 2. Algorithm Selection
    // These dimensions remain neutral until the code is executed or assessed by
    // a trusted semantic evaluator. Regex patterns are hints, not evidence.
    const algoScore = 3;
    const timeScore = 3;
    const spaceScore = 3;

    // 5. Edge-Case Handling
    const hasEdgeChecks = /if\s*\([^)]*(null|undefined|length\s*===?\s*0|<=?\s*0|!\w+)/.test(code);
    const edgeScore = 3;

    // 6. Readability
    const readabilityScore = 3;

    // 7. Maintainability
    const maintainabilityScore = 3;

    // 8. Explanation and Reasoning
    const explanationScore = 3;

    return {
      functionalCorrectness: {
        score: correctnessScore,
        quoteOrSnippet: code.slice(0, 80),
        rationale: staticCheck.isEmptySubmission
          ? 'No code was submitted.'
          : 'Not assessed: submitted code was not executed. A return statement or source-code shape cannot establish functional correctness.',
      },
      algorithmSelection: {
        score: algoScore,
        quoteOrSnippet: `Complexity: ${complexity.actualTimeComplexity}`,
        rationale:
          'Not assessed: source-text heuristics cannot establish algorithm selection or prove optimality.',
      },
      timeComplexity: {
        score: timeScore,
        quoteOrSnippet: complexity.actualTimeComplexity,
        rationale: `Unverified static hint: ${complexity.actualTimeComplexity}; time complexity was not assessed.`,
      },
      spaceComplexity: {
        score: spaceScore,
        quoteOrSnippet: complexity.actualSpaceComplexity,
        rationale: `Unverified static hint: ${complexity.actualSpaceComplexity}; space complexity was not assessed.`,
      },
      edgeCaseHandling: {
        score: edgeScore,
        quoteOrSnippet: hasEdgeChecks ? 'Potential guard token detected' : 'No guard token detected',
        rationale:
          'Not assessed: detecting an if-statement or boundary keyword does not prove that relevant edge cases are handled.',
      },
      codeReadability: {
        score: readabilityScore,
        quoteOrSnippet: staticCheck.detectedIdentifiers.slice(0, 3).join(', '),
        rationale: 'Not assessed: identifier length and line count are insufficient to judge readability.',
      },
      maintainability: {
        score: maintainabilityScore,
        quoteOrSnippet: `${staticCheck.lineCount} lines`,
        rationale: 'Not assessed: comments and file length do not establish maintainability or modularity.',
      },
      explanationReasoning: {
        score: explanationScore,
        quoteOrSnippet: transcript.slice(0, 80) || 'Brief explanation',
        rationale:
          'Not assessed: transcript length and Big-O keywords do not establish the correctness or clarity of the reasoning.',
      },
    };
  }

  private static generateSummaryFeedback(
    overallScore: number,
    dimensions: CodingAssessmentRecord['dimensions'],
    complexity: ComplexityAnalysisResult,
    hintsUsed: TieredHint[]
  ): string {
    const parts: string[] = [];
    if (overallScore >= 2.5) {
      parts.push(
        'Static review only: correctness and runtime behavior were not verified. Review the estimated complexity and edge-case signals before treating this as a completed coding assessment.'
      );
    } else {
      parts.push(
        'Static review found limited positive signals. The submission was not executed, so functional correctness remains unverified.'
      );
    }

    if (hintsUsed.length > 0) {
      parts.push(
        `Note: Candidate utilized ${hintsUsed.length} tiered hint(s), reflected in final scoring.`
      );
    }

    return parts.join(' ');
  }
}
