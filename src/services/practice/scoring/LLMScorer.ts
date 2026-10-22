import { z } from 'zod';
import { TieredHint } from '../types';
import { buildScorerPrompt } from '../prompts/scorer';
import { EvidenceValidator } from './EvidenceValidator';
import { DeterministicSignalsExtractor, DeterministicSignals } from './DeterministicSignals';
import { AIProviderConfig } from '../../../types';

// ─── Zod Schemas for Strict JSON Output Validation ───

export const ScorerDimensionOutputSchema = z.object({
  score: z.number().min(1).max(5),
  evidence: z.string().optional().default(''),
  note: z.string().optional().default(''),
});

export const ScorerQuestionOutputSchema = z.object({
  id: z.string().optional().default(''),
  type: z.string().optional().default(''),
  dimensions: z.record(ScorerDimensionOutputSchema),
  missed_points: z.array(z.string()).optional().default([]),
  model_answer_outline: z.array(z.string()).optional().default([]),
});

export const ScorerOutputSchema = z.object({
  questions: z.array(ScorerQuestionOutputSchema).min(1),
  overall: z.object({
    score: z.number().min(1).max(5),
    summary: z.string().optional().default(''),
    top_fixes: z.array(z.string()).optional().default([]),
    strengths: z.array(z.string()).optional().default([]),
  }),
  uncertainty: z.string().optional().default(''),
});

export type ScorerOutput = z.infer<typeof ScorerOutputSchema>;

export interface ScorerInput {
  transcript: string;
  question: {
    id?: string;
    type: 'coding' | 'system_design' | 'behavioral';
    prompt: string;
    expectedPoints?: string[];
    commonMistakes?: string[];
    rubricHooks?: string[];
  };
  hintsUsed: TieredHint[];
  config?: Partial<AIProviderConfig>;
  llmCaller?: (prompt: string, model: string) => Promise<string>;
}

export interface FinalScoredDimension {
  name: string;
  score: number;
  evidence: string;
  note: string;
  matchType: string;
  penaltyDeduction: number;
}

export interface FinalScoredReport {
  questions: Array<{
    id: string;
    type: string;
    dimensions: Record<string, FinalScoredDimension>;
    missed_points: string[];
    model_answer_outline: string[];
  }>;
  overall: {
    score: number;
    summary: string;
    top_fixes: string[];
    strengths: string[];
  };
  uncertainty: string;
  isHeuristicEstimate: boolean;
  confidenceBanner?: string;
  verdict:
    | 'Strong Hire'
    | 'Hire'
    | 'Leaning Hire'
    | 'No Hire'
    | 'Strong No Hire'
    | 'Uncalibrated (Heuristic Estimate)';
  signals: DeterministicSignals;
}

export class LLMScorer {
  /**
   * Selects the larger, high-parameter reasoning model for scoring rather than fast conversational models.
   */
  public static selectScoringModel(providerType: string = 'groq', currentModel?: string): string {
    switch (providerType.toLowerCase()) {
      case 'groq':
        return 'llama-3.3-70b-versatile';
      case 'openai':
        return 'gpt-4o';
      case 'openrouter':
        return 'meta-llama/llama-3.3-70b-instruct';
      case 'ollama':
        return currentModel && currentModel.includes('33') ? currentModel : 'llama3.3:70b';
      default:
        return currentModel || 'llama-3.3-70b-versatile';
    }
  }

  /**
   * Main entry point to evaluate candidate transcript.
   * Invokes LLM with strict JSON schema validation, retry mechanism, evidence verification, and code-based hint penalties.
   */
  public static async evaluate(input: ScorerInput): Promise<FinalScoredReport> {
    return LLMScorer._evaluateImpl(input);
  }
  public static score = LLMScorer.evaluate;
  private static async _evaluateImpl(input: ScorerInput): Promise<FinalScoredReport> {
    const transcript = (input.transcript || '').trim();
    const signals = DeterministicSignalsExtractor.extract(transcript);

    // Build question info payload
    const questionJson = {
      id: input.question.id || 'q1',
      type: input.question.type,
      prompt: input.question.prompt,
      expectedPoints: input.question.expectedPoints || [],
      commonMistakes: input.question.commonMistakes || [],
      rubricHooks: input.question.rubricHooks || [],
    };

    const hints = input.hintsUsed.map((h) => ({
      tier: h.tier,
      title: h.title,
      penaltyPoints: h.penaltyPoints,
    }));

    const prompt = buildScorerPrompt({
      transcript,
      questionJson,
      hints,
    });

    const modelName = this.selectScoringModel(input.config?.type, input.config?.model);

    let rawJson: ScorerOutput | null = null;
    let isHeuristicEstimate = false;
    let validationErrorMsg: string;

    // If caller provided or API key present, attempt LLM call
    if (input.llmCaller || input.config?.apiKey) {
      try {
        const caller = input.llmCaller || this.createDefaultCaller(input.config!);
        // Attempt 1
        const rawResponse = await caller(prompt, modelName);
        rawJson = this.parseAndValidate(rawResponse);
      } catch (err: any) {
        validationErrorMsg = err?.message || String(err);
        // Attempt 2 (Retry once with validation error appended)
        try {
          const retryPrompt = `${prompt}\n\nNOTE: Your previous attempt failed validation: "${validationErrorMsg}". Please return STRICT valid JSON matching the exact schema without any markdown formatting.`;
          const caller = input.llmCaller || this.createDefaultCaller(input.config!);
          const retryResponse = await caller(retryPrompt, modelName);
          rawJson = this.parseAndValidate(retryResponse);
        } catch (_retryErr: any) {
          isHeuristicEstimate = true;
          rawJson = null;
        }
      }
    } else {
      isHeuristicEstimate = true;
    }

    // If LLM scoring failed or offline, fall back to heuristic estimate
    if (!rawJson || isHeuristicEstimate) {
      return this.generateHeuristicEstimate(input, signals);
    }

    return this.postProcessScorerOutput(rawJson, transcript, input.hintsUsed, signals);
  }

  /**
   * Sanitizes, parses JSON, and validates strictly against Zod schema.
   */
  public static parseAndValidate(rawText: string): ScorerOutput {
    let cleanText = (rawText || '').trim();

    // Strip markdown code fences if model returned them
    if (cleanText.includes('```')) {
      const match = cleanText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match && match[1]) {
        cleanText = match[1].trim();
      }
    }

    const parsed = JSON.parse(cleanText);
    return ScorerOutputSchema.parse(parsed);
  }

  /**
   * Applies EvidenceValidator and code-enforced hint penalties to LLM output.
   */
  private static postProcessScorerOutput(
    output: ScorerOutput,
    transcript: string,
    hintsUsed: TieredHint[],
    signals: DeterministicSignals
  ): FinalScoredReport {
    // Calculate total hint penalty: Tier 1: 0.25, Tier 2: 0.5, Tier 3: 1.0
    let totalHintPenalty = 0;
    for (const h of hintsUsed) {
      if (h.tier === 1) totalHintPenalty += 0.25;
      else if (h.tier === 2) totalHintPenalty += 0.5;
      else if (h.tier === 3) totalHintPenalty += 1.0;
    }

    const processedQuestions = output.questions.map((q) => {
      const validatedDims = EvidenceValidator.validateDimensions(q.dimensions, transcript);
      const finalDims: Record<string, FinalScoredDimension> = {};

      const dimNames = Object.keys(validatedDims);
      const penaltyPerDim = dimNames.length > 0 ? totalHintPenalty / dimNames.length : 0;

      for (const [name, val] of Object.entries(validatedDims)) {
        // Apply penalty in code, floored at 1.0
        const postPenaltyScore = Math.max(1.0, Math.round((val.score - penaltyPerDim) * 10) / 10);
        finalDims[name] = {
          name,
          score: postPenaltyScore,
          evidence: val.evidence,
          note: val.note,
          matchType: val.matchType,
          penaltyDeduction: Math.round(penaltyPerDim * 100) / 100,
        };
      }

      return {
        id: q.id,
        type: q.type,
        dimensions: finalDims,
        missed_points: q.missed_points,
        model_answer_outline: q.model_answer_outline,
      };
    });

    // Compute composite overall score from validated dimensions
    let sumScore = 0;
    let dimCount = 0;
    for (const q of processedQuestions) {
      for (const dim of Object.values(q.dimensions)) {
        sumScore += dim.score;
        dimCount++;
      }
    }

    const overallScore =
      dimCount > 0 ? Math.round((sumScore / dimCount) * 10) / 10 : output.overall.score;

    // Determine verdict
    let verdict: 'Strong Hire' | 'Hire' | 'Leaning Hire' | 'No Hire' | 'Strong No Hire';
    if (overallScore >= 4.5) verdict = 'Strong Hire';
    else if (overallScore >= 3.8) verdict = 'Hire';
    else if (overallScore >= 3.0) verdict = 'Leaning Hire';
    else if (overallScore >= 2.0) verdict = 'No Hire';
    else verdict = 'Strong No Hire';

    return {
      questions: processedQuestions,
      overall: {
        score: overallScore,
        summary:
          output.overall.summary || 'Evaluation completed with verbatim evidence validation.',
        top_fixes: output.overall.top_fixes,
        strengths: output.overall.strengths,
      },
      uncertainty:
        output.uncertainty ||
        (transcript.length < 50 ? 'Transcript too brief for robust assessment.' : 'None'),
      isHeuristicEstimate: false,
      verdict,
      signals,
    };
  }

  /**
   * Generates clearly labeled heuristic estimate when offline or LLM fails.
   * NEVER produces a "Hire" or "No Hire" verdict.
   */
  private static generateHeuristicEstimate(
    input: ScorerInput,
    signals: DeterministicSignals
  ): FinalScoredReport {
    const transcript = (input.transcript || '').trim();
    const type = input.question.type;

    const baseDimScore = transcript.length > 200 ? 3.0 : 2.0;

    const defaultDimensions: Record<string, FinalScoredDimension> = {};
    const dimKeys =
      type === 'coding'
        ? [
            'problem_understanding',
            'approach',
            'correctness',
            'complexity',
            'testing',
            'communication',
          ]
        : type === 'system_design'
          ? [
              'requirements',
              'estimation',
              'architecture',
              'tradeoffs',
              'failure_modes',
              'communication',
            ]
          : ['structure', 'specificity', 'ownership', 'impact', 'reflection'];

    for (const key of dimKeys) {
      defaultDimensions[key] = {
        name: key,
        score: baseDimScore,
        evidence: '',
        note: 'Heuristic estimate (offline fallback)',
        matchType: 'none',
        penaltyDeduction: 0,
      };
    }

    return {
      questions: [
        {
          id: input.question.id || 'q1',
          type,
          dimensions: defaultDimensions,
          missed_points: ['Semantic verification requires active LLM connection.'],
          model_answer_outline: [
            'Follow structured framework: clarify -> design -> tradeoff -> test.',
          ],
        },
      ],
      overall: {
        score: baseDimScore,
        summary:
          'Evaluated by offline heuristic fallback because LLM was unavailable. Subject to calibration.',
        top_fixes: [
          'Connect configured LLM API key for verified rubric scoring and evidence quotes.',
        ],
        strengths: ['Completed verbal or typed practice attempt.'],
      },
      uncertainty:
        'LLM scoring unavailable. Semantic correctness and depth cannot be confirmed offline.',
      isHeuristicEstimate: true,
      confidenceBanner:
        'Estimated, low confidence: offline heuristic fallback. Not an official evaluation.',
      verdict: 'Uncalibrated (Heuristic Estimate)',
      signals,
    };
  }

  private static createDefaultCaller(config: Partial<AIProviderConfig>) {
    return async (prompt: string, model: string): Promise<string> => {
      const url =
        config.type === 'openrouter'
          ? 'https://openrouter.ai/api/v1/chat/completions'
          : config.type === 'openai'
            ? 'https://api.openai.com/v1/chat/completions'
            : 'https://api.groq.com/openai/v1/chat/completions';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1, // Low temperature for deterministic scoring
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        throw new Error(`LLMScorer API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    };
  }
}
