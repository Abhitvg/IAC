import { describe, it, expect } from 'vitest';
import { EvidenceValidator } from '../../src/services/practice/scoring/EvidenceValidator';
import { LLMScorer } from '../../src/services/practice/scoring/LLMScorer';
import { DeterministicSignalsExtractor } from '../../src/services/practice/scoring/DeterministicSignals';
import { TieredHint } from '../../src/services/practice/types';

describe('Phase 1: EvidenceValidator', () => {
  const sampleTranscript =
    'To solve this problem, I clarify the constraints first. The array can have negative numbers. ' +
    'I propose using a hash map to achieve O(N) time complexity and O(N) auxiliary space. ' +
    'Let me dry run with input two, seven, eleven.';

  it('accepts verbatim substring evidence without altering score', () => {
    const quote = 'I propose using a hash map to achieve O(N) time complexity';
    const res = EvidenceValidator.validateEvidence(quote, sampleTranscript, 4.5);

    expect(res.valid).toBe(true);
    expect(res.score).toBe(4.5);
    expect(res.evidence).toBe(quote);
    expect(res.matchType).toBe('verbatim');
  });

  it('accepts >=90% fuzzy match with minor punctuation or whitespace divergence', () => {
    // Minor variation: dropped "to", lowercase, slightly different spacing
    const quote = 'I propose using a hash map achieve O(N) time complexity';
    const res = EvidenceValidator.validateEvidence(quote, sampleTranscript, 4.5);

    expect(res.valid).toBe(true);
    expect(res.score).toBe(4.5);
    expect(res.matchType).toBe('fuzzy_90');
  });

  it('rejects fabricated quotes, discards quote, caps score at 2, and sets note', () => {
    const fabricatedQuote =
      'I optimized the binary search tree with red-black self balancing rotations';
    const res = EvidenceValidator.validateEvidence(
      fabricatedQuote,
      sampleTranscript,
      5.0,
      'Great algorithmic proof'
    );

    expect(res.valid).toBe(false);
    expect(res.score).toBe(2.0); // Capped at 2!
    expect(res.evidence).toBe(''); // Discarded!
    expect(res.note).toBe('no verifiable evidence');
    expect(res.matchType).toBe('none');
  });

  it("handles empty or 'no evidence' string by capping score at 2", () => {
    const res = EvidenceValidator.validateEvidence('no evidence', sampleTranscript, 4.0);
    expect(res.valid).toBe(false);
    expect(res.score).toBe(2.0);
    expect(res.evidence).toBe('');
  });
});

describe('Phase 1: DeterministicSignals', () => {
  it("extracts signals and labels strictly as 'signals, not scores'", () => {
    const transcript =
      'I built the service while we maintained legacy systems. ' +
      'It reduced latency by 35% and runs in O(N log N) time complexity. ' +
      'Can the input array be empty?';

    const signals = DeterministicSignalsExtractor.extract(transcript);

    expect(signals.label).toBe('signals, not scores');
    expect(signals.hasNumberOrPercentage).toBe(true);
    expect(signals.numberOrPercentageMatches).toContain('35%');
    expect(signals.iCount).toBe(1);
    expect(signals.weCount).toBe(1);
    expect(signals.hasBigONotation).toBe(true);
    expect(signals.hasTimeComplexityMention).toBe(true);
    expect(signals.hasConstraintClarification).toBe(true);
  });
});

describe('Phase 1: LLMScorer', () => {
  it('scores keyword-stuffed answer with no real content at most 2 on correctness and complexity', async () => {
    // Keyword stuffed without real substance or logic
    const keywordStuffedTranscript =
      'At company. Time complexity O(N). Brute force optimal hash map caching redis qps return true.';

    // Mock LLM correctly refusing to award points without real explanation
    const mockLlm = async () =>
      JSON.stringify({
        questions: [
          {
            id: 'q1',
            type: 'coding',
            dimensions: {
              correctness: {
                score: 1.5,
                evidence: 'return true',
                note: 'No algorithmic solution or logic provided; only scattered keywords.',
              },
              complexity: {
                score: 2.0,
                evidence: 'Time complexity O(N)',
                note: 'Stated Big-O notation with zero analysis or justification.',
              },
            },
            missed_points: ['No actual algorithm implemented', 'No data structure mechanics'],
            model_answer_outline: ['Define state, iterate, lookup complement in hash map.'],
          },
        ],
        overall: {
          score: 1.8,
          summary: 'Answer relies on keyword stuffing without addressing problem mechanics.',
          top_fixes: ['Explain why the data structure is used and walk through code line-by-line.'],
          strengths: [],
        },
        uncertainty: 'Candidate provided only disjoint keywords rather than coherent explanation.',
      });

    const report = await LLMScorer.evaluate({
      transcript: keywordStuffedTranscript,
      question: {
        type: 'coding',
        prompt: 'Two Sum',
        expectedPoints: ['Hash map approach', 'O(N) time O(N) space', 'Single pass'],
      },
      hintsUsed: [],
      llmCaller: mockLlm,
    });

    const q = report.questions[0];
    expect(q.dimensions.correctness.score).toBeLessThanOrEqual(2.0);
    expect(q.dimensions.complexity.score).toBeLessThanOrEqual(2.0);
    expect(report.verdict).toBe('Strong No Hire');
  });

  it('applies hint penalties in code: Tier 1 (-0.25), Tier 2 (-0.5), Tier 3 (-1.0)', async () => {
    const transcript = 'I solved it by using a hash map for O(N) runtime.';
    const mockLlm = async () =>
      JSON.stringify({
        questions: [
          {
            id: 'q1',
            type: 'coding',
            dimensions: {
              approach: {
                score: 4.0,
                evidence: 'I solved it by using a hash map',
                note: 'Used hash map',
              },
              complexity: {
                score: 4.0,
                evidence: 'for O(N) runtime',
                note: 'Stated runtime',
              },
            },
            missed_points: [],
            model_answer_outline: [],
          },
        ],
        overall: {
          score: 4.0,
          summary: 'Good answer.',
          top_fixes: [],
          strengths: ['Clear approach'],
        },
        uncertainty: 'None',
      });

    const hintsUsed: TieredHint[] = [
      { tier: 1, title: 'Gentle Nudge', content: 'Think hash map', penaltyPoints: 0.5 }, // Code applies 0.25
      { tier: 2, title: 'Specific Hint', content: 'Store index', penaltyPoints: 1.0 }, // Code applies 0.50
    ];
    // Total penalty = 0.75 across 2 dimensions -> 0.375 per dimension

    const report = await LLMScorer.evaluate({
      transcript,
      question: { type: 'coding', prompt: 'Two Sum' },
      hintsUsed,
      llmCaller: mockLlm,
    });

    const approachDim = report.questions[0].dimensions.approach;
    expect(approachDim.penaltyDeduction).toBeGreaterThan(0.3);
    expect(approachDim.score).toBeLessThan(4.0); // Penalty was applied in code!
  });

  it('retries once on invalid JSON and succeeds if retry returns valid JSON', async () => {
    let callCount = 0;
    const mockLlm = async (prompt: string) => {
      callCount++;
      if (callCount === 1) {
        return 'Not valid JSON: Error 500';
      }
      return JSON.stringify({
        questions: [
          {
            id: 'q1',
            type: 'behavioral',
            dimensions: {
              ownership: {
                score: 4.5,
                evidence: 'I led the migration',
                note: 'Strong first-person ownership.',
              },
            },
            missed_points: [],
            model_answer_outline: [],
          },
        ],
        overall: {
          score: 4.5,
          summary: 'Solid behavioral response.',
          top_fixes: [],
          strengths: ['Great leadership'],
        },
        uncertainty: 'None',
      });
    };

    const report = await LLMScorer.evaluate({
      transcript: 'I led the migration from scratch.',
      question: { type: 'behavioral', prompt: 'Tell me about a project' },
      hintsUsed: [],
      llmCaller: mockLlm,
    });

    expect(callCount).toBe(2); // Retried once!
    expect(report.isHeuristicEstimate).toBe(false);
    expect(report.questions[0].dimensions.ownership.score).toBe(4.5);
  });

  it('falls back to heuristic estimate when LLM completely fails, showing low confidence banner and no Hire/No Hire verdict', async () => {
    const failingLlm = async () => {
      throw new Error('API rate limit exceeded');
    };

    const report = await LLMScorer.evaluate({
      transcript: 'Short offline test answer',
      question: { type: 'coding', prompt: 'Solve binary tree' },
      hintsUsed: [],
      llmCaller: failingLlm,
    });

    expect(report.isHeuristicEstimate).toBe(true);
    expect(report.confidenceBanner).toContain('Estimated, low confidence');
    expect(report.verdict).toBe('Uncalibrated (Heuristic Estimate)');
    expect(report.verdict).not.toBe('Hire');
    expect(report.verdict).not.toBe('No Hire');
    expect(report.uncertainty).toContain('LLM scoring unavailable');
  });
});
