/**
 * EvidenceValidator: Verifies that cited rubric evidence actually exists in the candidate transcript.
 * Enforces verbatim substring match or >=90% fuzzy match. Discards invalid quotes and caps dimension score at 2.
 */

export interface ValidationResult {
  valid: boolean;
  score: number;
  evidence: string;
  note: string;
  matchType: 'verbatim' | 'fuzzy_90' | 'none';
}

export class EvidenceValidator {
  /**
   * Normalizes whitespace and converts to lowercase for deterministic comparison.
   */
  public static normalize(text: string): string {
    return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /**
   * Validates a single quoted evidence string against the raw transcript.
   * If validation fails: discards quote, caps score at 2, and sets note to 'no verifiable evidence'.
   */
  public static validateEvidence(
    evidence: string,
    transcript: string,
    rawScore: number,
    existingNote?: string
  ): ValidationResult {
    const normEvidence = this.normalize(evidence);
    const normTranscript = this.normalize(transcript);

    // If quote is empty, generic placeholder, or says "no evidence"
    if (
      !normEvidence ||
      normEvidence === 'no evidence' ||
      normEvidence === 'none' ||
      normEvidence === 'n/a'
    ) {
      return {
        valid: false,
        score: Math.min(rawScore, 2),
        evidence: '',
        note: existingNote && existingNote.length > 0 ? existingNote : 'no verifiable evidence',
        matchType: 'none',
      };
    }

    // 1. Verbatim Substring Check (100% exact match after whitespace/case normalization)
    if (normTranscript.includes(normEvidence)) {
      return {
        valid: true,
        score: rawScore,
        evidence: evidence.trim(),
        note: existingNote || '',
        matchType: 'verbatim',
      };
    }

    // 2. Fuzzy Match Check (>= 90% similarity)
    const fuzzyRatio = this.calculateBestFuzzyMatch(normEvidence, normTranscript);
    if (fuzzyRatio >= 0.9) {
      return {
        valid: true,
        score: rawScore,
        evidence: evidence.trim(),
        note: existingNote || '',
        matchType: 'fuzzy_90',
      };
    }

    // Quote failed verification!
    return {
      valid: false,
      score: Math.min(rawScore, 2),
      evidence: '',
      note: 'no verifiable evidence',
      matchType: 'none',
    };
  }

  /**
   * Validates all dimensions in a scored evaluation record.
   */
  public static validateDimensions(
    dimensions: Record<string, { score: number; evidence?: string; note?: string }>,
    transcript: string
  ): Record<string, { score: number; evidence: string; note: string; matchType: string }> {
    const validated: Record<
      string,
      { score: number; evidence: string; note: string; matchType: string }
    > = {};

    for (const [name, dim] of Object.entries(dimensions)) {
      const res = this.validateEvidence(dim.evidence || '', transcript, dim.score, dim.note);
      validated[name] = {
        score: res.score,
        evidence: res.evidence,
        note: res.note,
        matchType: res.matchType,
      };
    }

    return validated;
  }

  /**
   * Computes the maximum similarity ratio between the target string and sliding windows of the transcript.
   */
  private static calculateBestFuzzyMatch(target: string, transcript: string): number {
    if (!target || !transcript) return 0;
    if (transcript.length < target.length * 0.8) {
      return this.levenshteinSimilarity(target, transcript);
    }

    const targetWords = target.split(' ');
    const transcriptWords = transcript.split(' ');

    // Word-level sliding window
    const windowSize = Math.max(1, targetWords.length);
    let bestRatio = 0;

    for (let i = 0; i <= transcriptWords.length - windowSize; i++) {
      const windowStr = transcriptWords.slice(i, i + windowSize).join(' ');
      const ratio = this.levenshteinSimilarity(target, windowStr);
      if (ratio > bestRatio) {
        bestRatio = ratio;
      }
      if (bestRatio >= 0.95) break; // Early exit on very high match
    }

    // Also check expanded window (+- 2 words) to catch dropped or added words
    const expandedSize = Math.min(transcriptWords.length, windowSize + 2);
    for (let i = 0; i <= transcriptWords.length - expandedSize; i++) {
      const windowStr = transcriptWords.slice(i, i + expandedSize).join(' ');
      const ratio = this.levenshteinSimilarity(target, windowStr);
      if (ratio > bestRatio) {
        bestRatio = ratio;
      }
      if (bestRatio >= 0.95) break;
    }

    return bestRatio;
  }

  /**
   * Levenshtein similarity metric returning a float between 0.0 and 1.0.
   */
  public static levenshteinSimilarity(s1: string, s2: string): number {
    const longer = s1.length >= s2.length ? s1 : s2;
    const shorter = s1.length < s2.length ? s1 : s2;

    if (longer.length === 0) return 1.0;

    const costs: number[] = [];
    for (let i = 0; i <= shorter.length; i++) {
      costs[i] = i;
    }

    for (let i = 1; i <= longer.length; i++) {
      costs[0] = i;
      let nw = i - 1;
      for (let j = 1; j <= shorter.length; j++) {
        const cj = Math.min(
          1 + Math.min(costs[j], costs[j - 1]),
          longer[i - 1] === shorter[j - 1] ? nw : nw + 1
        );
        nw = costs[j];
        costs[j] = cj;
      }
    }

    const distance = costs[shorter.length];
    return (longer.length - distance) / longer.length;
  }
}
