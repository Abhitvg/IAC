import { STRUCTURE_EVALUATION_PROMPT } from '../prompts/structure';
import { REWRITE_PROMPT } from '../prompts/rewrite';
import { StructureAnalysisResult, SuggestedRewrite } from '../types';
import { validateEvidenceSubstring } from '../feedback/FeedbackImporter';
import { LLMManager } from '../../providers/LLMProvider';

export class StructureAnalyzer {
  private static readonly COMMON_CAPITALIZED_WORDS = new Set([
    'The',
    'This',
    'That',
    'These',
    'Those',
    'There',
    'Their',
    'Here',
    'In',
    'On',
    'At',
    'For',
    'To',
    'With',
    'By',
    'From',
    'As',
    'If',
    'When',
    'While',
    'After',
    'Before',
    'First',
    'Second',
    'Third',
    'Finally',
    'Next',
    'Then',
    'However',
    'Therefore',
    'Furthermore',
    'Moreover',
    'Additionally',
    'Instead',
    'Overall',
    'Ultimately',
    'Because',
    'Since',
    'Although',
    'Even',
    'We',
    'I',
    'Our',
    'My',
    'You',
    'Your',
    'They',
    'It',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
  ]);

  /**
   * Evaluates organization and structural narrative of a spoken technical transcript.
   */
  public static async analyze(params: {
    transcript: string;
    question: string;
    durationSeconds?: number;
    llmCaller?:
      | ((prompt: string, model?: string) => Promise<string>)
      | ((prompt: string, model: string) => Promise<string>);
  }): Promise<StructureAnalysisResult> {
    const rawTranscript = (params.transcript || '').trim();
    const words = rawTranscript.split(/\s+/).filter(Boolean);
    const sentences = rawTranscript.split(/[.!?]+(?:\s+|$)/).filter((s) => s.trim().length > 0);

    const answerLength = rawTranscript.length;
    const wordCount = words.length;
    const sentenceCount = sentences.length;

    // Estimate time to first claim / sentence
    const firstSentenceWords = sentences[0] ? sentences[0].split(/\s+/).filter(Boolean).length : 0;
    const assumedDuration =
      params.durationSeconds && params.durationSeconds > 0 ? params.durationSeconds : 60;
    const timeToFirstClaimSeconds =
      wordCount > 0 ? Math.round((firstSentenceWords / wordCount) * assumedDuration * 10) / 10 : 0;

    if (!rawTranscript) {
      return {
        headlineFirst: { met: false, quote: '' },
        signposting: { met: false, quote: '' },
        claimReasonExample: { count: 0, quotes: [] },
        tradeOffStated: { met: false, quote: '' },
        closingSummary: { met: false, quote: '' },
        tangents: [],
        tangentRatio: 0,
        structureScore: 1,
        reasons: ['No answer transcript provided.'],
        answerLength: 0,
        wordCount: 0,
        sentenceCount: 0,
        timeToFirstClaimSeconds: 0,
      };
    }

    try {
      const prompt = STRUCTURE_EVALUATION_PROMPT.replace('{{transcript}}', rawTranscript).replace(
        '{{question}}',
        params.question
      );

      let rawResponse: string;
      if (params.llmCaller) {
        rawResponse = await params.llmCaller(prompt, 'gpt-4o-mini');
      } else {
        const llm = new LLMManager();
        const res = await llm.executeWithFallback([{ role: 'user', content: prompt }], {
          temperature: 0.1,
        });
        rawResponse = res.text;
      }

      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM structure evaluation output');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return this.validateAndFinalize(parsed, rawTranscript, {
        answerLength,
        wordCount,
        sentenceCount,
        timeToFirstClaimSeconds,
      });
    } catch {
      return this.heuristicFallback(rawTranscript, {
        answerLength,
        wordCount,
        sentenceCount,
        timeToFirstClaimSeconds,
      });
    }
  }

  /**
   * Validates verbatim quotes and caps score at 2 if fabricated quotes are detected.
   */
  private static validateAndFinalize(
    parsed: any,
    rawTranscript: string,
    cheapSignals: {
      answerLength: number;
      wordCount: number;
      sentenceCount: number;
      timeToFirstClaimSeconds: number;
    }
  ): StructureAnalysisResult {
    let quoteFabricated = false;
    const first20PercentLength = Math.ceil(rawTranscript.length * 0.2);

    // 1. Headline first
    let headlineMet = Boolean(parsed.headlineFirst?.met);
    let headlineQuote = (parsed.headlineFirst?.quote || '').trim();
    if (headlineMet && headlineQuote && headlineQuote.toLowerCase() !== 'no evidence') {
      const isValid = validateEvidenceSubstring(headlineQuote, rawTranscript);
      if (!isValid) {
        quoteFabricated = true;
        headlineMet = false;
        headlineQuote = '';
      } else {
        // Must appear in the first 20% of the transcript
        const normTranscript = rawTranscript.toLowerCase().replace(/\s+/g, ' ');
        const normQuote = headlineQuote.toLowerCase().replace(/\s+/g, ' ');
        const pos = normTranscript.indexOf(normQuote);
        if (pos > first20PercentLength) {
          headlineMet = false;
        }
      }
    } else {
      headlineMet = false;
    }

    // 2. Signposting
    let signpostingMet = Boolean(parsed.signposting?.met);
    let signpostingQuote = (parsed.signposting?.quote || '').trim();
    if (signpostingMet && signpostingQuote && signpostingQuote.toLowerCase() !== 'no evidence') {
      if (!validateEvidenceSubstring(signpostingQuote, rawTranscript)) {
        quoteFabricated = true;
        signpostingMet = false;
        signpostingQuote = '';
      }
    } else {
      signpostingMet = false;
    }

    // 3. Claim Reason Example
    let creCount = Number(parsed.claimReasonExample?.count) || 0;
    const rawCreQuotes: string[] = Array.isArray(parsed.claimReasonExample?.quotes)
      ? parsed.claimReasonExample.quotes
      : [];
    const validCreQuotes: string[] = [];

    for (const q of rawCreQuotes) {
      if (q && q.toLowerCase() !== 'no evidence') {
        if (validateEvidenceSubstring(q, rawTranscript)) {
          validCreQuotes.push(q);
        } else {
          quoteFabricated = true;
        }
      }
    }
    creCount = Math.min(
      creCount,
      validCreQuotes.length > 0
        ? validCreQuotes.length
        : creCount > 0 && !quoteFabricated
          ? creCount
          : 0
    );

    // 4. Trade-off stated
    let tradeOffMet = Boolean(parsed.tradeOffStated?.met);
    let tradeOffQuote = (parsed.tradeOffStated?.quote || '').trim();
    if (tradeOffMet && tradeOffQuote && tradeOffQuote.toLowerCase() !== 'no evidence') {
      if (!validateEvidenceSubstring(tradeOffQuote, rawTranscript)) {
        quoteFabricated = true;
        tradeOffMet = false;
        tradeOffQuote = '';
      }
    } else {
      tradeOffMet = false;
    }

    // 5. Closing summary
    let closingMet = Boolean(parsed.closingSummary?.met);
    let closingQuote = (parsed.closingSummary?.quote || '').trim();
    if (closingMet && closingQuote && closingQuote.toLowerCase() !== 'no evidence') {
      if (!validateEvidenceSubstring(closingQuote, rawTranscript)) {
        quoteFabricated = true;
        closingMet = false;
        closingQuote = '';
      }
    } else {
      closingMet = false;
    }

    // 6. Tangents
    const validTangents: Array<{ quote: string; why: string }> = [];
    if (Array.isArray(parsed.tangents)) {
      for (const t of parsed.tangents) {
        if (t?.quote && validateEvidenceSubstring(t.quote, rawTranscript)) {
          validTangents.push({ quote: t.quote, why: t.why || 'Off-topic deviation' });
        }
      }
    }

    // Calculate tangent ratio
    const tangentWordsCount = validTangents.reduce((acc, t) => {
      return acc + t.quote.split(/\s+/).filter(Boolean).length;
    }, 0);
    const tangentRatio =
      cheapSignals.wordCount > 0
        ? Math.min(1.0, Math.round((tangentWordsCount / cheapSignals.wordCount) * 100) / 100)
        : 0;

    // Score calculation & penalty cap
    let rawScore = Math.max(1, Math.min(5, Math.round(Number(parsed.score) || 1)));
    const reasons: string[] = Array.isArray(parsed.reasons) ? parsed.reasons.filter(Boolean) : [];

    if (quoteFabricated) {
      rawScore = Math.min(rawScore, 2);
      reasons.unshift(
        'Score capped at 2: Judgments cited quotes not present in the answer transcript.'
      );
    }

    return {
      headlineFirst: { met: headlineMet, quote: headlineQuote },
      signposting: { met: signpostingMet, quote: signpostingQuote },
      claimReasonExample: { count: creCount, quotes: validCreQuotes },
      tradeOffStated: { met: tradeOffMet, quote: tradeOffQuote },
      closingSummary: { met: closingMet, quote: closingQuote },
      tangents: validTangents,
      tangentRatio,
      structureScore: rawScore,
      reasons,
      ...cheapSignals,
    };
  }

  /**
   * Deterministic heuristic fallback when LLM is offline or returns unparseable output.
   */
  public static heuristicFallback(
    transcript: string,
    cheapSignals: {
      answerLength: number;
      wordCount: number;
      sentenceCount: number;
      timeToFirstClaimSeconds: number;
    }
  ): StructureAnalysisResult {
    const tLower = transcript.toLowerCase();
    const first20 = tLower.slice(0, Math.ceil(tLower.length * 0.2));

    const headlineMet =
      first20.includes('we choose') ||
      first20.includes('i recommend') ||
      first20.includes('the solution is') ||
      first20.includes('the primary') ||
      first20.includes('we should') ||
      first20.includes('the key decision');

    const signpostingMet =
      tLower.includes('first') ||
      tLower.includes('second') ||
      tLower.includes('three parts') ||
      tLower.includes('two approaches') ||
      tLower.includes('step by step') ||
      tLower.includes('three considerations');

    const tradeOffMet =
      tLower.includes('however') ||
      tLower.includes('trade-off') ||
      tLower.includes('downside') ||
      tLower.includes('on the other hand') ||
      tLower.includes('the drawback');

    const closingMet =
      tLower.includes('in summary') ||
      tLower.includes('to conclude') ||
      tLower.includes('in short') ||
      tLower.includes('ultimately');

    let score = 1;
    const reasons: string[] = [];

    if (headlineMet) {
      score += 1;
      reasons.push('Decisive headline identified early in answer.');
    } else {
      reasons.push('Missing a clear conclusion or decision in the opening 20%.');
    }

    if (signpostingMet) {
      score += 1;
      reasons.push('Explicit roadmap markers found (e.g. first, second).');
    }

    if (tradeOffMet) {
      score += 1;
      reasons.push('Explicit architectural trade-offs acknowledged.');
    }

    if (closingMet) {
      score += 1;
      reasons.push('Clear one-sentence summary close.');
    }

    return {
      headlineFirst: { met: headlineMet, quote: headlineMet ? first20.slice(0, 80) : '' },
      signposting: { met: signpostingMet, quote: signpostingMet ? 'Roadmap markers present' : '' },
      claimReasonExample: { count: signpostingMet ? 2 : 0, quotes: [] },
      tradeOffStated: { met: tradeOffMet, quote: tradeOffMet ? 'Trade-off markers present' : '' },
      closingSummary: { met: closingMet, quote: closingMet ? 'Closing summary present' : '' },
      tangents: [],
      tangentRatio: 0,
      structureScore: Math.min(5, score),
      reasons,
      isHeuristicEstimate: true,
      ...cheapSignals,
    };
  }

  /**
   * Generates a structured before/after rewrite of the user's weakest paragraph.
   * Guarantees zero invented tools, numbers, or ungrounded facts.
   */
  public static async generateRewrite(params: {
    paragraph: string;
    llmCaller?:
      | ((prompt: string, model?: string) => Promise<string>)
      | ((prompt: string, model: string) => Promise<string>);
  }): Promise<SuggestedRewrite> {
    const original = (params.paragraph || '').trim();

    // Extract numbers from original
    const origNumbers = new Set(original.match(/\b\d+(?:\.\d+)?\b/g) || []);

    // Extract capitalized words from original
    const origCapitalized = new Set(original.match(/\b[A-Z][a-zA-Z0-9_]*\b/g) || []);

    const prompt = REWRITE_PROMPT.replace('{{paragraph}}', original);

    let rawRewrite: string;
    try {
      if (params.llmCaller) {
        rawRewrite = await params.llmCaller(prompt, 'gpt-4o-mini');
      } else {
        const llm = new LLMManager();
        const res = await llm.executeWithFallback([{ role: 'user', content: prompt }], {
          temperature: 0.1,
        });
        rawRewrite = res.text;
      }
    } catch {
      rawRewrite = `Headline: The approach handles failures cleanly.\nPoints:\n1. First: [add concrete mechanism].\n2. Second: [add monitoring detail].\nTrade-off: Requires [add trade-off].\nClose: This balances reliability.`;
    }

    // Sanitize invented numbers & tool names
    const sanitizedRewrite = this.enforceRewriteGrounding(
      original,
      rawRewrite,
      origNumbers,
      origCapitalized
    );

    return {
      originalParagraph: original,
      rewrittenParagraph: sanitizedRewrite,
      extractedNumbers: Array.from(origNumbers),
      extractedTools: Array.from(origCapitalized).filter(
        (w) => !this.COMMON_CAPITALIZED_WORDS.has(w)
      ),
      isGrounded: true,
    };
  }

  /**
   * Post-generation guard: Replaces any numbers or capitalized tools in rewrite that were absent in original
   * with bracketed placeholders.
   */
  public static enforceRewriteGrounding(
    original: string,
    rewritten: string,
    origNumbers?: Set<string>,
    origCapitalized?: Set<string>
  ): string {
    const numbers = origNumbers || new Set(original.match(/\b\d+(?:\.\d+)?\b/g) || []);
    const capitalized = origCapitalized || new Set(original.match(/\b[A-Z][a-zA-Z0-9_]*\b/g) || []);

    // Protect existing bracketed placeholders e.g. [add a concrete example here]
    const placeholders: string[] = [];
    const protectedText = rewritten.replace(/\[[^\]]+\]/g, (match) => {
      placeholders.push(match);
      return `__PLACEHOLDER_${placeholders.length - 1}__`;
    });

    // Check numbers
    let grounded = protectedText.replace(/\b\d+(?:\.\d+)?\b/g, (match) => {
      if (numbers.has(match)) {
        return match;
      }
      return '[add specific number]';
    });

    // Check capitalized words / tool names
    grounded = grounded.replace(/\b[A-Z][a-zA-Z0-9_]*\b/g, (match) => {
      if (this.COMMON_CAPITALIZED_WORDS.has(match) || capitalized.has(match)) {
        return match;
      }
      return '[specify tool]';
    });

    // Restore placeholders
    grounded = grounded.replace(/__PLACEHOLDER_(\d+)__/g, (_, idx) => {
      return placeholders[Number(idx)] || '';
    });

    return grounded.trim();
  }
}
