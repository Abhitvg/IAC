import { z } from 'zod';
import { FeedbackRecord, FeedbackStrength, FeedbackWeakness, FeedbackSkill } from '../types';
import { renderFeedbackPrompt } from '../prompts/feedbackExtraction';
import { LLMManager } from '../../providers/LLMProvider';

// ═══════════════════════════════════════════════════════════════════
// Schemas
// ═══════════════════════════════════════════════════════════════════

const FeedbackSkillEnum = z.enum([
  'knowledge',
  'structure',
  'concreteness',
  'depth',
  'delivery',
  'other',
]);

const StrengthSchema = z.object({
  topic: z.string().default('General Communication'),
  skill: FeedbackSkillEnum.default('other'),
  evidence: z.string().default(''),
});

const WeaknessSchema = z.object({
  topic: z.string().default('General Technical'),
  skill: FeedbackSkillEnum.default('other'),
  severity: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  evidence: z.string().default(''),
  requestedFix: z.string().default(''),
});

const ExtractionResponseSchema = z.object({
  strengths: z.array(StrengthSchema).default([]),
  weaknesses: z.array(WeaknessSchema).default([]),
  overallTone: z.string().default(''),
  uncertainty: z.string().default(''),
});

export type RawExtractionResult = z.infer<typeof ExtractionResponseSchema>;

// ═══════════════════════════════════════════════════════════════════
// Utility Functions: Redaction, Normalization & Hashing
// ═══════════════════════════════════════════════════════════════════

/**
 * Strips identifiable emails, phone numbers, URLs, and user-provided custom names.
 */
export function redactFeedbackText(rawText: string, customNames: string[] = []): string {
  if (!rawText) return '';
  let redacted = rawText;

  // 1. Redact Emails
  redacted = redacted.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    '[REDACTED_EMAIL]'
  );

  // 2. Redact Phone Numbers (US, international formats)
  redacted = redacted.replace(
    /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    '[REDACTED_PHONE]'
  );

  // 3. Redact Web URLs
  redacted = redacted.replace(/https?:\/\/[^\s/$.?#].[^\s]*/gi, '[REDACTED_URL]');

  // 4. Redact User-Specified Sensitive Names / Terms
  for (const name of customNames) {
    const trimmed = name.trim();
    if (trimmed.length > 1) {
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp(`\\b${escaped}\\b`, 'gi');
      redacted = redacted.replace(reg, '[REDACTED_NAME]');
    }
  }

  return redacted;
}

/**
 * Normalizes text for verbatim substring comparison.
 */
export function normalizeForMatching(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Validates that an evidence quote is a verbatim substring of the redacted text.
 */
export function validateEvidenceSubstring(evidence: string, redactedText: string): boolean {
  if (!evidence || !evidence.trim()) return false;
  const normEv = normalizeForMatching(evidence);
  const normText = normalizeForMatching(redactedText);
  return normText.includes(normEv);
}

/**
 * Deterministic hash for deduplication.
 */
export function computeFeedbackHash(text: string): string {
  const clean = text.trim().toLowerCase().replace(/\s+/g, ' ');
  let h1 = 0xdeadbeef ^ clean.length;
  let h2 = 0x41c6ce57 ^ clean.length;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const p1 = (4294967296 + h1).toString(16).slice(1);
  const p2 = (4294967296 + h2).toString(16).slice(1);
  return `hash-${p1}${p2}`;
}

// ═══════════════════════════════════════════════════════════════════
// Heuristic Fallback Extractor
// ═══════════════════════════════════════════════════════════════════

export function heuristicExtract(redactedText: string): {
  strengths: FeedbackStrength[];
  weaknesses: FeedbackWeakness[];
  overallTone: string;
  uncertainty: string;
  isEstimated: boolean;
} {
  const sentences = redactedText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  const strengths: FeedbackStrength[] = [];
  const weaknesses: FeedbackWeakness[] = [];

  const praiseKeywords = [
    'strong',
    'excelled',
    'impressed',
    'good',
    'great',
    'solid',
    'well',
    'positive',
    'clear',
    'thorough',
    'comprehensive',
    'effective',
    'liked',
  ];

  const weaknessKeywords = [
    'improve',
    'lacked',
    'missing',
    'unstructured',
    'shallow',
    'struggled',
    'failed',
    'unclear',
    'weak',
    'rambled',
    'did not',
    'needs to',
    'would like',
    'gap',
    'concern',
    'vague',
    'hesitant',
  ];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();

    // Topic detection
    let topic = 'Technical Communication';
    if (
      lower.includes('system design') ||
      lower.includes('architecture') ||
      lower.includes('scale')
    ) {
      topic = 'System Design';
    } else if (
      lower.includes('code') ||
      lower.includes('algorithm') ||
      lower.includes('dsa') ||
      lower.includes('complexity')
    ) {
      topic = 'Coding & Algorithms';
    } else if (
      lower.includes('behavioral') ||
      lower.includes('leadership') ||
      lower.includes('conflict')
    ) {
      topic = 'Behavioral';
    }

    // Skill detection
    let skill: FeedbackSkill = 'knowledge';
    if (
      lower.includes('structure') ||
      lower.includes('rambl') ||
      lower.includes('organized') ||
      lower.includes('jumped')
    ) {
      skill = 'structure';
    } else if (
      lower.includes('example') ||
      lower.includes('concrete') ||
      lower.includes('metric') ||
      lower.includes('vague')
    ) {
      skill = 'concreteness';
    } else if (
      lower.includes('depth') ||
      lower.includes('shallow') ||
      lower.includes('trade-off') ||
      lower.includes('tradeoff')
    ) {
      skill = 'depth';
    } else if (
      lower.includes('pace') ||
      lower.includes('filler') ||
      lower.includes('speed') ||
      lower.includes('tone')
    ) {
      skill = 'delivery';
    }

    const hasPraise = praiseKeywords.some((w) => lower.includes(w));
    const hasWeakness = weaknessKeywords.some((w) => lower.includes(w));

    if (hasWeakness) {
      let severity: 1 | 2 | 3 = 1;
      if (
        lower.includes('major') ||
        lower.includes('failed') ||
        lower.includes('critical') ||
        lower.includes('unable')
      ) {
        severity = 3;
      } else if (
        lower.includes('notable') ||
        lower.includes('gap') ||
        lower.includes('struggled')
      ) {
        severity = 2;
      }

      weaknesses.push({
        topic,
        skill,
        severity,
        evidence: sentence,
        requestedFix: `Focus on ${skill} and provide clearer evidence for ${topic}.`,
      });
    } else if (hasPraise) {
      strengths.push({
        topic,
        skill,
        evidence: sentence,
      });
    }
  }

  return {
    strengths,
    weaknesses,
    overallTone:
      weaknesses.length > strengths.length
        ? 'Critical / Rejection Debrief'
        : 'Constructive / Positive',
    uncertainty:
      'Heuristic estimate: extracted via sentence pattern matching without LLM synthesis.',
    isEstimated: true,
  };
}

// ═══════════════════════════════════════════════════════════════════
// FeedbackImporter Service
// ═══════════════════════════════════════════════════════════════════

export class FeedbackImporter {
  /**
   * Previews the redaction of raw feedback text without transmitting data.
   */
  public static previewRedaction(rawText: string, customNames: string[] = []): string {
    return redactFeedbackText(rawText, customNames);
  }

  /**
   * Helper to execute LLM request via LLMManager, custom caller function, or generator object.
   */
  public static async invokeLLM(prompt: string, managerOrCaller: any): Promise<string> {
    if (typeof managerOrCaller === 'function') {
      return managerOrCaller(prompt);
    }
    if (managerOrCaller && typeof managerOrCaller.generateCompletion === 'function') {
      return managerOrCaller.generateCompletion(prompt);
    }
    if (managerOrCaller && typeof managerOrCaller.executeWithFallback === 'function') {
      const res = await managerOrCaller.executeWithFallback([{ role: 'user', content: prompt }], {
        temperature: 0.1,
        maxTokens: 1500,
      });
      return res.text;
    }
    throw new Error('No valid LLM execution method found on provider/manager.');
  }

  /**
   * Imports and structures interview feedback.
   * Throws if confirmed === false to enforce explicit user consent.
   */
  public static async importFeedback(params: {
    rawText: string;
    customNames?: string[];
    confirmed: boolean;
    useHeuristic?: boolean;
    metadata?: {
      company?: string;
      role?: string;
      date?: string;
      roundType?: string;
    };
    llmManager?:
      | LLMManager
      | ((prompt: string) => Promise<string>)
      | { generateCompletion: (p: string) => Promise<string> };
  }): Promise<FeedbackRecord> {
    if (!params.confirmed) {
      throw new Error(
        'FeedbackConfirmationRequiredError: User confirmation required before sending text to analysis.'
      );
    }

    const redactedText = redactFeedbackText(params.rawText, params.customNames || []);
    const sourceHash = computeFeedbackHash(redactedText);

    let extracted: {
      strengths: FeedbackStrength[];
      weaknesses: FeedbackWeakness[];
      overallTone: string;
      uncertainty: string;
      isEstimated: boolean;
    };

    if (params.useHeuristic || !params.llmManager) {
      extracted = heuristicExtract(redactedText);
    } else {
      extracted = await this.extractWithLLM(redactedText, params.llmManager);
    }

    // Verbatim Evidence Validation: Discard any items citing unverified quotes
    const validStrengths = extracted.strengths.filter((s) =>
      validateEvidenceSubstring(s.evidence, redactedText)
    );
    const validWeaknesses = extracted.weaknesses.filter((w) =>
      validateEvidenceSubstring(w.evidence, redactedText)
    );

    const record: FeedbackRecord = {
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: params.metadata?.date || new Date().toISOString().slice(0, 10),
      company: params.metadata?.company || 'Anonymous Employer',
      role: params.metadata?.role || 'Software Engineer',
      roundType: params.metadata?.roundType || 'General Technical',
      redactedText,
      strengths: validStrengths,
      weaknesses: validWeaknesses,
      overallTone: extracted.overallTone,
      uncertainty: extracted.uncertainty,
      sourceHash,
      isEstimated: extracted.isEstimated,
      createdAt: Date.now(),
    };

    return record;
  }

  /**
   * Executes LLM extraction with strict Zod validation, automated single retry,
   * and fallback to heuristic extractor.
   */
  private static async extractWithLLM(
    redactedText: string,
    managerOrCaller: any
  ): Promise<{
    strengths: FeedbackStrength[];
    weaknesses: FeedbackWeakness[];
    overallTone: string;
    uncertainty: string;
    isEstimated: boolean;
  }> {
    const prompt = renderFeedbackPrompt(redactedText);

    try {
      const rawOutput = await this.invokeLLM(prompt, managerOrCaller);
      const parsed = this.parseJsonExtraction(rawOutput);
      return {
        strengths: parsed.strengths,
        weaknesses: parsed.weaknesses,
        overallTone: parsed.overallTone,
        uncertainty: parsed.uncertainty,
        isEstimated: false,
      };
    } catch (err: any) {
      // Retry once with error context
      try {
        const retryPrompt = `${prompt}\n\nYour previous response failed validation: ${
          err?.message || 'Invalid JSON format'
        }. Please return STRICT JSON matching the schema:`;
        const retryOutput = await this.invokeLLM(retryPrompt, managerOrCaller);
        const retryParsed = this.parseJsonExtraction(retryOutput);
        return {
          strengths: retryParsed.strengths,
          weaknesses: retryParsed.weaknesses,
          overallTone: retryParsed.overallTone,
          uncertainty: retryParsed.uncertainty,
          isEstimated: false,
        };
      } catch {
        // Fall back to heuristic splitter
        const fallback = heuristicExtract(redactedText);
        fallback.uncertainty = `LLM extraction failed (${err?.message || 'invalid JSON'}). Fallback heuristic extraction used.`;
        fallback.isEstimated = true;
        return fallback;
      }
    }
  }

  /**
   * Extracts and validates JSON object from LLM response text.
   */
  public static parseJsonExtraction(text: string): RawExtractionResult {
    let clean = text.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      clean = clean.substring(firstBrace, lastBrace + 1);
    }

    const parsedJson = JSON.parse(clean);
    return ExtractionResponseSchema.parse(parsedJson);
  }
}
