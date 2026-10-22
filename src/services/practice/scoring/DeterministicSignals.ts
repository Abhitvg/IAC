/**
 * DeterministicSignals: Extract fast, deterministic text signals.
 * Labeled strictly as "signals, not scores". Does not set or modify rubric scores.
 */

export interface DeterministicSignals {
  label: 'signals, not scores';
  hasNumberOrPercentage: boolean;
  numberOrPercentageMatches: string[];
  iCount: number;
  weCount: number;
  ownershipRatio: number;
  hasBigONotation: boolean;
  bigOMatches: string[];
  hasTimeComplexityMention: boolean;
  hasSpaceComplexityMention: boolean;
  hasConstraintClarification: boolean;
  hasTestingDryRunMention: boolean;
  detectedKeywords: string[];
}

export class DeterministicSignalsExtractor {
  public static extract(transcript: string): DeterministicSignals {
    const clean = (transcript || '').trim();
    const lower = clean.toLowerCase();
    const words = lower.split(/\s+/).filter(Boolean);

    // Number or Percentage detection
    const numRegex = /\b\d+(?:\.\d+)?(?:%|[a-zA-Z$]+)?/g;
    const numberOrPercentageMatches = clean.match(numRegex) || [];
    const hasNumberOrPercentage = numberOrPercentageMatches.length > 0;

    // "I" vs "We" Ownership counting
    const iWords = new Set(['i', "i'm", 'my', 'me', 'myself']);
    const weWords = new Set(['we', "we're", 'our', 'us', 'ourselves']);
    let iCount = 0;
    let weCount = 0;

    for (const w of words) {
      if (iWords.has(w)) iCount++;
      if (weWords.has(w)) weCount++;
    }

    const totalPronouns = iCount + weCount;
    const ownershipRatio = totalPronouns > 0 ? Number((iCount / totalPronouns).toFixed(2)) : 1.0;

    // Big-O Notation detection
    const bigORegex = /\bO\([^)]+\)/gi;
    const bigOMatches = clean.match(bigORegex) || [];
    const hasBigONotation = bigOMatches.length > 0;

    const hasTimeComplexityMention =
      hasBigONotation ||
      lower.includes('time complexity') ||
      lower.includes('linear time') ||
      lower.includes('constant time') ||
      lower.includes('logarithmic time');

    const hasSpaceComplexityMention =
      lower.includes('space complexity') ||
      lower.includes('auxiliary space') ||
      lower.includes('extra memory') ||
      lower.includes('in-place') ||
      lower.includes('call stack');

    // Constraint clarification check
    const hasConstraintClarification =
      lower.includes('constraint') ||
      lower.includes('edge case') ||
      lower.includes('empty') ||
      lower.includes('null') ||
      lower.includes('bounds') ||
      lower.includes('can the input');

    // Testing / Dry Run check
    const hasTestingDryRunMention =
      lower.includes('dry run') ||
      lower.includes('trace') ||
      lower.includes('test case') ||
      lower.includes('walk through an example');

    // General keyword mentions
    const keywords = [
      'caching',
      'redis',
      'sharding',
      'replication',
      'queue',
      'kafka',
      'circuit breaker',
      'spof',
      'two pointer',
      'hash map',
      'sliding window',
    ];
    const detectedKeywords = keywords.filter((k) => lower.includes(k));

    return {
      label: 'signals, not scores',
      hasNumberOrPercentage,
      numberOrPercentageMatches,
      iCount,
      weCount,
      ownershipRatio,
      hasBigONotation,
      bigOMatches,
      hasTimeComplexityMention,
      hasSpaceComplexityMention,
      hasConstraintClarification,
      hasTestingDryRunMention,
      detectedKeywords,
    };
  }
}
