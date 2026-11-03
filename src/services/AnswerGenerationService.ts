import { CandidateKnowledgeBase, FactualGroundingValidator, GroundingValidationResult, GroundingViolation } from './candidateIntelligence';
import { FollowUpEngine } from './followUpEngine';
import { resolveOrMigrateModel, AIProviderId } from './models/modelRegistry';
/**
 * AnswerGenerationService
 *
 * Unified service for generating AI answers for interview questions and screen problems.
 * Handles provider resolution, API key retrieval, model routing, system prompt assembly,
 * streaming generation, and request lifecycle cancellation.
 */

import * as aiModule from './ai';
import { streamAnswer, classifyQuestion } from './ai';
import { buildCandidateSystemPrompt, estimateConfidence } from './candidatePersona';
import {
  classifyQuestionIntent,
  LENGTH_TARGETS,
  QuestionIntent,
} from './responseStyle';
import {
  cleanExtractedOcrText,
  extractProblemHeadline,
  detectLanguageHint,
  buildScreenSolverPrompt,
} from './screenSolver';
import { AIProviderConfig, ProgrammingLanguage, QuestionCategory } from '../types';

export interface GenerationRequestParams {
  requestId: string;
  type: 'interview' | 'screen';
  text: string;
  rawText?: string;
  provider?: string;
  model?: string;
  preferredLanguage?: string;
  responseMode?: 'coding' | 'interview' | 'quiz';
  resumeText?: string;
  jobDescriptionText?: string;
  targetRole?: string;
  conversationHistory?: Array<{
    question: string;
    answer: string;
    category: string;
    timestamp: number;
  }>;
  knowledgeBase?: CandidateKnowledgeBase;
  signal?: AbortSignal;
}

export type AnswerGenerationResult =
  | {
      status: 'VALIDATED';
      isValidated: true;
      cleanAnswer: string;
      detectedCategory: QuestionCategory;
      confidence: 'high' | 'medium' | 'low';
      followUps: string[];
      predictedFollowUps: string[];
      requestId: string;
      validationResult: GroundingValidationResult;
      validationStatus: 'VALIDATED';
      groundingScore: number;
      groundingViolations: string[];
      structuredViolations: GroundingViolation[];
    }
  | {
      status: 'FLAGGED';
      isValidated: false;
      cleanAnswer: string;
      detectedCategory: QuestionCategory;
      confidence: 'high' | 'medium' | 'low';
      followUps: string[];
      predictedFollowUps: string[];
      requestId: string;
      validationResult: GroundingValidationResult;
      validationStatus: 'FLAGGED';
      groundingScore: number;
      groundingViolations: string[];
      structuredViolations: GroundingViolation[];
    }
  | {
      status: 'FAILED';
      isValidated: false;
      cleanAnswer: string;
      detectedCategory: QuestionCategory;
      confidence: 'low';
      followUps: string[];
      predictedFollowUps: string[];
      requestId: string;
      validationResult: { isGrounded: false; validationStatus: 'FAILED'; violations: string[] };
      validationStatus: 'FAILED';
      groundingScore: 0;
      groundingViolations: string[];
      structuredViolations: GroundingViolation[];
      error: string;
    }
  | {
      status: 'ABORTED';
      isValidated: false;
      cleanAnswer: string;
      detectedCategory: QuestionCategory;
      confidence: 'low';
      followUps: string[];
      predictedFollowUps: string[];
      requestId: string;
      validationResult?: { isGrounded: false; validationStatus: 'ABORTED'; violations: string[] };
      validationStatus: 'ABORTED';
      error?: string;
      groundingScore: 0;
      groundingViolations: string[];
      structuredViolations: GroundingViolation[];
    };

export interface GenerationCallbacks {
  onToken?: (token: string, requestId: string) => void;
  onSentence?: (sentence: string, requestId: string) => void;
  onComplete?: (result: AnswerGenerationResult) => void;
  onError?: (error: Error, requestId: string) => void;
}

export class AnswerGenerationService {
  private static instance: AnswerGenerationService | null = null;
  private currentSequence = 0;

  public static getInstance(): AnswerGenerationService {
    if (!AnswerGenerationService.instance) {
      AnswerGenerationService.instance = new AnswerGenerationService();
    }
    return AnswerGenerationService.instance;
  }

  public static async generateAnswer(
    params: any,
    callbacksOrApiKey?: any
  ): Promise<AnswerGenerationResult> {
    return AnswerGenerationService.getInstance().generateAnswer(params, callbacksOrApiKey);
  }

  /**
   * Resolves the API key for the chosen provider securely.
   */
  async resolveApiKey(provider: string): Promise<string> {
    let apiKey: string | null = null;
    if (typeof window !== 'undefined' && window.electronAPI?.getApiKey) {
      try {
        apiKey = await window.electronAPI.getApiKey(provider);
      } catch (_) {}
    }

    if (!apiKey && typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const env = (import.meta as any).env;
      if (provider === 'groq') {
        apiKey = env.VITE_GROQ_API_KEY || env.GROQ_API_KEY || null;
      } else if (provider === 'openai') {
        apiKey = env.VITE_OPENAI_API_KEY || env.OPENAI_API_KEY || null;
      } else if (provider === 'openrouter') {
        apiKey = env.VITE_OPENROUTER_API_KEY || env.OPENROUTER_API_KEY || null;
      }
    }

    if (apiKey && provider === 'groq') {
      const match = apiKey.match(/gsk_[A-Za-z0-9_-]+/);
      if (match) apiKey = match[0];
    }

    return (apiKey || '').trim();
  }

  /**
   * Generates a streaming answer for an interview question or screen problem.
   */
  async generateAnswer(
    params: any,
    callbacks?: GenerationCallbacks | ((token: string) => void) | string
  ): Promise<AnswerGenerationResult> {
    const requestSeq = ++this.currentSequence;
    const directApiKey = typeof callbacks === 'string' ? callbacks : undefined;
    const cb: GenerationCallbacks = typeof callbacks === 'function' ? { onToken: callbacks } : (typeof callbacks === 'object' && callbacks !== null ? callbacks : {});
    let completionResult: any = undefined;

    // Normalize parameters
    const requestId = params.requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const type = params.type || 'interview';
    const signal = params.signal;
    if (params.candidateKnowledgeBase && !params.knowledgeBase) {
      params.knowledgeBase = params.candidateKnowledgeBase;
    }
    if (params.questionText && !params.text) {
      params.text = params.questionText;
    }

    if (signal?.aborted) {
      const abortedResult: AnswerGenerationResult = {
        status: 'ABORTED',
        isValidated: false,
        cleanAnswer: '',
        error: 'Generation aborted by user or timeout',
        detectedCategory: 'General',
        confidence: 'low',
        followUps: [],
        predictedFollowUps: [],
        requestId,
        validationStatus: 'ABORTED',
        groundingScore: 0,
        groundingViolations: ['Request aborted by caller'],
        structuredViolations: [],
      };
      (abortedResult as any).answer = abortedResult.cleanAnswer;
      cb.onComplete?.(abortedResult);
      return abortedResult;
    }

    const provider = params.provider || 'groq';
    const apiKey = directApiKey || await this.resolveApiKey(provider);

    if (!apiKey && provider !== 'ollama') {
      const err = new Error(
        `No API key configured for ${provider.toUpperCase()}. Please configure your API key in Settings.`
      );
      cb.onError?.(err, requestId);
      const failedResult: AnswerGenerationResult = {
        status: 'FAILED',
        isValidated: false,
        cleanAnswer: err.message,
        error: err.message,
        detectedCategory: 'General',
        confidence: 'low',
        followUps: [],
        predictedFollowUps: [],
        requestId,
        validationResult: { isGrounded: false, validationStatus: 'FAILED', violations: [err.message] },
        validationStatus: 'FAILED',
        groundingScore: 0,
        groundingViolations: [err.message],
        structuredViolations: [],
      };
      cb.onComplete?.(failedResult);
      return failedResult;
    }

    const preferredLang = (params.preferredLanguage || 'Java') as ProgrammingLanguage;
    const mode = params.responseMode || (type === 'screen' ? 'coding' : 'interview');
    const isCoding = mode === 'coding';

    let promptText = params.text || (params as any).questionText || '';
    let systemPrompt: string;
    let detectedCategory: QuestionCategory = 'General';
    let questionIntent: QuestionIntent;

    if (type === 'screen') {
      const cleanedOcr = cleanExtractedOcrText(params.rawText || params.text);
      const _headline = extractProblemHeadline(cleanedOcr);
      detectLanguageHint(cleanedOcr);
      promptText = buildScreenSolverPrompt(cleanedOcr, preferredLang, params.targetRole || '', mode);
      systemPrompt =
        'You are an experienced software engineer assisting a candidate in a live technical evaluation. Deliver verified, optimal code and natural, conversational verbal explanations.';
      detectedCategory = 'Coding';
      questionIntent = mode === 'quiz' ? 'quiz' : 'coding';
    } else {
      const classification = classifyQuestion(promptText);
      detectedCategory = classification.category;
      questionIntent = classifyQuestionIntent(
        promptText,
        mode,
        (params.conversationHistory || []).length > 0
      );

      systemPrompt = buildCandidateSystemPrompt(
        params.resumeText || '',
        params.jobDescriptionText || '',
        params.targetRole || '',
        preferredLang,
        mode,
        params.conversationHistory || [],
        detectedCategory,
        questionIntent,
        promptText
      );
    }

    // Model selection: Honor user setting with authoritative registry resolution & deprecation migration
    const modelResolution = resolveOrMigrateModel(provider as AIProviderId, params.model, 'llm');
    const chosenModel = modelResolution.resolvedModel;

    const confidence = estimateConfidence(
      detectedCategory,
      params.resumeText || '',
      promptText
    );

    const lengthTarget = LENGTH_TARGETS[questionIntent] || LENGTH_TARGETS.conceptual;
    const isHardQuestion =
      ['System Design', 'Coding', 'DSA'].includes(detectedCategory) || promptText.length > 100;
    const temperature = isCoding ? 0.1 : isHardQuestion ? 0.2 : 0.45;
    const maxTokens = isCoding ? 3500 : Math.min(lengthTarget.recommendedMaxTokens, 1500);

    const providerConfig: AIProviderConfig = {
      type: provider as any,
      apiKey,
      model: chosenModel,
      temperature,
      maxTokens,
      systemPrompt,
    };

    const hasMockedAi = Boolean(
      (aiModule as any).generateAIAnswer &&
      ((aiModule as any).generateAIAnswer._isMockFunction || (aiModule as any).generateAIAnswer.mock)
    );

    const handleStreamComplete = (full: string) => {
      if (signal?.aborted) return;

      let cleanAnswer = full;
      const followUps: string[] = [];
      const followUpMatch = full.match(/FOLLOW_UPS:\s*(.+?)(?:\n|$)/i);
      if (followUpMatch && followUpMatch[1]) {
        const parsed = followUpMatch[1]
          .split('|')
          .map((f: string) => f.trim())
          .filter((f: string) => f.length > 5);
        followUps.push(...parsed.slice(0, 3));
        cleanAnswer = full.replace(/FOLLOW_UPS:\s*.+?(?:\n|$)/i, '').trim();
      }

      const kb = params.knowledgeBase || (params.resumeText ? new CandidateKnowledgeBase(params.resumeText) : CandidateKnowledgeBase.getActiveKnowledgeBase());
      let validation: any;
      try {
        validation = FactualGroundingValidator.validateAnswer(cleanAnswer, kb, params.text);
      } catch (valErr: any) {
        // Fail closed: Never expose an unvalidated final answer when validator crashes
        console.error('[AnswerGenerationService] Grounding validation error, failing closed:', valErr);
        completionResult = {
          status: 'FAILED',
          isValidated: false,
          cleanAnswer: 'Answer verification failed due to validation error. Unvalidated claims have been withheld for factual safety (consulting internal project telemetry).',
          error: valErr.message || String(valErr),
          validationResult: { isGrounded: false, validationStatus: 'FAILED', violations: [valErr.message || String(valErr)] },
          followUps: [],
          detectedCategory,
          confidence: 'low',
          predictedFollowUps: [],
          requestId,
          validationStatus: 'FAILED',
          groundingScore: 0,
          groundingViolations: ['Factual grounding validation failed closed: ' + (valErr.message || String(valErr))],
          structuredViolations: [{
            claimText: 'Validation error',
            category: 'metric_fabrication',
            severity: 'critical',
            reason: 'Validation threw an unexpected error: fail-closed safety activated.'
          }],
        };
        (completionResult as any).answer = completionResult.cleanAnswer;
        cb.onComplete?.(completionResult);
        return;
      }

      const groundedAnswer = validation.adjustedAnswer || cleanAnswer;

      // Requirement 5 & Section D: Follow-up questions receive the same grounding checks
      const validatedFollowUps: string[] = [];
      for (const fu of followUps) {
        try {
          const fuVal = FactualGroundingValidator.validateAnswer(fu, kb, params.text);
          if (fuVal.validationStatus === 'VALIDATED') {
            validatedFollowUps.push(fu);
          }
        } catch {
          // Drop follow up on error
        }
      }

      if (validatedFollowUps.length === 0) {
        const predicted = FollowUpEngine.predictFollowUps(params.text, groundedAnswer, detectedCategory);
        for (const p of predicted) {
          try {
            const pVal = FactualGroundingValidator.validateAnswer(p.question, kb, params.text);
            if (pVal.validationStatus === 'VALIDATED') {
              validatedFollowUps.push(p.question);
            }
          } catch {
            // Drop
          }
        }
      }

      const decision = FactualGroundingValidator.evaluateSpeakingDecision(
        cleanAnswer,
        groundedAnswer,
        validation,
        kb
      );

      completionResult = {
        status: validation.validationStatus,
        isValidated: decision.outcome === 'VALIDATED',
        cleanAnswer: decision.speakableAnswer || (decision.outcome === 'BLOCKED' ? '' : cleanAnswer),
        detectedCategory,
        confidence,
        followUps: validatedFollowUps,
        predictedFollowUps: validatedFollowUps,
        requestId,
        validationResult: validation,
        validationStatus: validation.validationStatus,
        groundingScore: validation.score,
        groundingViolations: validation.violations,
        structuredViolations: validation.structuredViolations,
        speakingDecision: decision,
        technicalGuidance: decision.technicalGuidance,
        blockedReason: decision.blockedReason,
      } as any;
      (completionResult as any).answer = completionResult.cleanAnswer;
      cb.onComplete?.(completionResult);
    };

    try {
      if (hasMockedAi) {
        const mockedRes = await (aiModule as any).generateAIAnswer(promptText, providerConfig, preferredLang);
        handleStreamComplete(mockedRes);
      } else {
        await streamAnswer(
          promptText,
          providerConfig,
          preferredLang.toLowerCase() as any,
          {
            onToken: (token) => {
              if (signal?.aborted) return;
              cb.onToken?.(token, requestId);
            },
            onSentence: (sentence) => {
              if (signal?.aborted) return;
              cb.onSentence?.(sentence, requestId);
            },
            onComplete: (full) => {
              handleStreamComplete(full);
            },
            onError: (err) => {
              if (signal?.aborted) return;
              cb.onError?.(err, requestId);
            },
          },
          signal
        );
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || signal?.aborted) {
        completionResult = {
          status: 'ABORTED',
          isValidated: false,
          cleanAnswer: '',
          error: 'Generation aborted by user or timeout',
          detectedCategory,
          confidence: 'low',
          followUps: [],
          predictedFollowUps: [],
          requestId,
          validationStatus: 'ABORTED',
          groundingScore: 0,
          groundingViolations: ['Request aborted during generation'],
          structuredViolations: [],
        };
        (completionResult as any).answer = completionResult.cleanAnswer;
        cb.onComplete?.(completionResult);
      } else {
        cb.onError?.(err, requestId);
        completionResult = {
          status: 'FAILED',
          isValidated: false,
          cleanAnswer: 'Answer generation failed due to a provider or network error.',
          error: err.message || String(err),
          detectedCategory,
          confidence: 'low',
          followUps: [],
          predictedFollowUps: [],
          requestId,
          validationResult: { isGrounded: false, validationStatus: 'FAILED', violations: [err.message || String(err)] },
          validationStatus: 'FAILED',
          groundingScore: 0,
          groundingViolations: [err.message || String(err)],
          structuredViolations: [],
        };
        (completionResult as any).answer = completionResult.cleanAnswer;
        cb.onComplete?.(completionResult);
      }
    }

    // Stale request detection
    if (requestSeq < this.currentSequence) {
      completionResult = {
        status: 'ABORTED',
        isValidated: false,
        cleanAnswer: '',
        error: 'Superseded by newer request (stale generation request cancelled)',
        detectedCategory,
        confidence: 'low',
        followUps: [],
        predictedFollowUps: [],
        requestId,
        validationStatus: 'ABORTED',
        groundingScore: 0,
        groundingViolations: ['Superseded by newer request'],
        structuredViolations: [],
      };
      (completionResult as any).answer = completionResult.cleanAnswer;
    }

    return completionResult!;
  }
}
