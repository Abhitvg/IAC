import { describe, it, expect } from 'vitest';
import {
  CodingEvaluationService,
  CodingExecutionStatusSchema,
} from '../src/services/practice/CodingEvaluationService';
import { TieredHint } from '../src/services/practice/types';

describe('Phase 4 — Coding Interview Evaluation Engine', () => {
  const sampleOptimalCode = `
function minSubArrayLen(target: number, nums: number[]): number {
  if (!nums || nums.length === 0) return 0;
  let minLen = Infinity;
  let left = 0;
  let runningSum = 0;

  for (let right = 0; right < nums.length; right++) {
    runningSum += nums[right];
    while (runningSum >= target) {
      minLen = Math.min(minLen, right - left + 1);
      runningSum -= nums[left++];
    }
  }
  return minLen === Infinity ? 0 : minLen;
}
`;

  const sampleExplanation =
    'I applied a dynamic sliding window with two pointers. The time complexity is O(N) because each pointer advances at most N times. Space complexity is O(1).';

  it('evaluates submission across all 8 required dimensions', async () => {
    const result = await CodingEvaluationService.evaluateSubmission({
      problemId: 'cq_arrays_02',
      curriculumTopicId: 'ds_arrays_strings',
      candidateSubmission: sampleOptimalCode,
      explanationTranscript: sampleExplanation,
      language: 'typescript',
      expectedOptimalComplexity: { time: 'O(N)', space: 'O(1)' },
    });

    expect(result.problemId).toBe('cq_arrays_02');
    expect(result.curriculumTopicId).toBe('ds_arrays_strings');
    expect(result.overallScore).toBeGreaterThanOrEqual(3.5);

    // Verify all 8 dimensions are present and scored
    const dims = result.dimensions;
    expect(dims.functionalCorrectness.score).toBeGreaterThanOrEqual(3);
    expect(dims.algorithmSelection.score).toBeGreaterThanOrEqual(3);
    expect(dims.timeComplexity.score).toBeGreaterThanOrEqual(3);
    expect(dims.spaceComplexity.score).toBeGreaterThanOrEqual(3);
    expect(dims.edgeCaseHandling.score).toBeGreaterThanOrEqual(3);
    expect(dims.codeReadability.score).toBeGreaterThanOrEqual(3);
    expect(dims.maintainability.score).toBeGreaterThanOrEqual(3);
    expect(dims.explanationReasoning.score).toBeGreaterThanOrEqual(3);

    expect(result.complexityAnalysis.isOptimal).toBe(true);
    expect(result.complexityAnalysis.actualTimeComplexity).toBe('O(N)');
    expect(result.complexityAnalysis.statedTimeComplexity).toBe('O(N)');
  });

  it('safely handles untrusted code execution status without direct eval in process', async () => {
    const dangerousCode = `require('child_process').execSync('whoami');`;
    const result = await CodingEvaluationService.evaluateSubmission({
      problemId: 'code_sec_01',
      candidateSubmission: dangerousCode,
      language: 'javascript',
      customTestCases: [{ id: 'tc1', input: '1', expected: '1' }],
    });

    // Verification of execution safety
    expect(result.executionStatus).toBe('not_executed');
    expect(result.testResults[0].error).toContain('Untrusted runtime execution skipped');

    // All execution statuses must conform to schema
    const parsedStatus = CodingExecutionStatusSchema.safeParse(result.executionStatus);
    expect(parsedStatus.success).toBe(true);
  });

  it('applies hint penalties transparently without fabricating arbitrary deductions', async () => {
    const hint1: TieredHint = {
      tier: 1,
      title: 'Gentle Nudge',
      content: 'Consider maintaining a running sum with two pointers.',
      penaltyPoints: 0.5,
    };
    const hint2: TieredHint = {
      tier: 2,
      title: 'Specific Hint',
      content: 'Shrink the left pointer when running sum meets target.',
      penaltyPoints: 1.0,
    };

    const unassisted = await CodingEvaluationService.evaluateSubmission({
      problemId: 'cq_arrays_02',
      candidateSubmission: sampleOptimalCode,
      explanationTranscript: sampleExplanation,
      language: 'typescript',
      hintsUsed: [],
    });

    const assisted = await CodingEvaluationService.evaluateSubmission({
      problemId: 'cq_arrays_02',
      candidateSubmission: sampleOptimalCode,
      explanationTranscript: sampleExplanation,
      language: 'typescript',
      hintsUsed: [hint1, hint2],
    });

    expect(assisted.overallScore).toBeLessThan(unassisted.overallScore);
    expect(assisted.hintsUsed).toHaveLength(2);
    expect(assisted.summaryFeedback).toContain('Candidate utilized 2 tiered hint(s)');
  });

  it('detects missing edge case guards and penalizes edgeCaseHandling dimension', async () => {
    const naiveCode = `
function minSubArrayLen(target: number, nums: number[]): number {
  let sum = 0;
  for (let i = 0; i < nums.length; i++) {
    sum += nums[i];
  }
  return sum;
}
`;
    const result = await CodingEvaluationService.evaluateSubmission({
      problemId: 'cq_arrays_02',
      candidateSubmission: naiveCode,
      language: 'typescript',
    });

    expect(result.dimensions.edgeCaseHandling.score).toBeLessThanOrEqual(2.5);
    expect(result.dimensions.edgeCaseHandling.rationale).toContain('Lacks defensive validation');
  });
});

