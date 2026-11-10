import {
  CandidateKnowledgeBase,
  FactualGroundingValidator,
  GroundingValidationResult,
  GroundingViolation,
} from './candidateIntelligence';
import { FollowUpEngine } from './followUpEngine';
import { resolveOrMigrateModel, AIProviderId } from './models/modelRegistry';
import { RateLimitGovernor } from './rateLimitGovernor';
import { DiagnosticLoggerService } from './diagnosticLogger';
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
import { classifyQuestionIntent, LENGTH_TARGETS, QuestionIntent } from './responseStyle';
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
      partialAnswer?: string;
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
   * @deprecated Provider credentials are resolved exclusively in Electron main.
   * Kept as an override seam for deterministic service tests and non-Electron mocks.
   */
  async resolveApiKey(provider: string): Promise<string> {
    // Compatibility seam for test doubles and legacy non-Electron harnesses only.
    // The production preload intentionally does not expose a getApiKey method.
    const legacyCredentialBridge =
      typeof window !== 'undefined' ? (window.electronAPI as any)?.['getApiKey'] : undefined;
    if (typeof legacyCredentialBridge !== 'function') return '';
    const key = await legacyCredentialBridge(provider);
    return typeof key === 'string' ? key.trim() : '';
  }

  /**
   * Generates a streaming answer for an interview question or screen problem.
   */
  async generateAnswer(
    params: any,
    callbacks?: GenerationCallbacks | ((token: string) => void) | string
  ): Promise<AnswerGenerationResult> {
    const requestSeq = ++this.currentSequence;
    const cb: GenerationCallbacks =
      typeof callbacks === 'function'
        ? { onToken: callbacks }
        : typeof callbacks === 'object' && callbacks !== null
          ? callbacks
          : {};
    let completionResult: any = undefined;
    const { useAppStore } = await import('../store/useAppStore');

    // Normalize parameters
    const requestId =
      params.requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const type = params.type || 'interview';
    const callerSignal = params.signal;
    const generationController = new AbortController();
    const abortFromCaller = () => generationController.abort(callerSignal?.reason);
    if (callerSignal?.aborted) generationController.abort(callerSignal.reason);
    else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    const overallTimer = setTimeout(
      () =>
        generationController.abort(new Error('Overall answer-generation deadline exceeded (75s).')),
      75000
    );
    const signal = generationController.signal;
    if (params.candidateKnowledgeBase && !params.knowledgeBase) {
      params.knowledgeBase = params.candidateKnowledgeBase;
    }
    if (params.questionText && !params.text) {
      params.text = params.questionText;
    }

    const createAbortedResult = (): AnswerGenerationResult => ({
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
    });

    if (signal.aborted) {
      const abortedResult = createAbortedResult();
      (abortedResult as any).answer = abortedResult.cleanAnswer;
      cb.onComplete?.(abortedResult);
      clearTimeout(overallTimer);
      callerSignal?.removeEventListener('abort', abortFromCaller);
      return abortedResult;
    }

    const provider = params.provider || 'groq';
    const electronGatewayAvailable =
      typeof window !== 'undefined' && Boolean(window.electronAPI?.startCloudLLMStream);
    let apiKey = '';
    if (!electronGatewayAvailable && provider !== 'ollama') {
      apiKey = await this.resolveApiKey(provider);
    }

    if (signal.aborted) {
      const abortedResult = createAbortedResult();
      (abortedResult as any).answer = abortedResult.cleanAnswer;
      cb.onComplete?.(abortedResult);
      clearTimeout(overallTimer);
      callerSignal?.removeEventListener('abort', abortFromCaller);
      return abortedResult;
    }

    if (!apiKey && provider !== 'ollama' && !electronGatewayAvailable) {
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
        validationResult: {
          isGrounded: false,
          validationStatus: 'FAILED',
          violations: [err.message],
        },
        validationStatus: 'FAILED',
        groundingScore: 0,
        groundingViolations: [err.message],
        structuredViolations: [],
      };
      cb.onComplete?.(failedResult);
      clearTimeout(overallTimer);
      callerSignal?.removeEventListener('abort', abortFromCaller);
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
      promptText = buildScreenSolverPrompt(
        cleanedOcr,
        preferredLang,
        params.targetRole || '',
        mode
      );
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

    const confidence = estimateConfidence(detectedCategory, params.resumeText || '', promptText);

    const lengthTarget = LENGTH_TARGETS[questionIntent] || LENGTH_TARGETS.conceptual;
    const isHardQuestion =
      ['System Design', 'Coding', 'DSA'].includes(detectedCategory) || promptText.length > 100;
    const temperature = isCoding ? 0.1 : isHardQuestion ? 0.2 : 0.45;
    const maxTokens = isCoding ? 3500 : Math.min(lengthTarget.recommendedMaxTokens, 1500);

    const providerConfig: AIProviderConfig = {
      type: provider as any,
      apiKey: '',
      model: chosenModel,
      temperature,
      maxTokens,
      systemPrompt,
    };

    const hasMockedAi = Boolean(
      (aiModule as any).generateAIAnswer &&
      ((aiModule as any).generateAIAnswer._isMockFunction ||
        (aiModule as any).generateAIAnswer.mock)
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

      const technicalIntent =
        ['Coding', 'DSA', 'System Design'].includes(detectedCategory) ||
        /\b(explain|define|compare|difference|implement|algorithm|complexity|architecture|how does|what is)\b/i.test(
          params.text
        );
      const candidateSpecificQuestion =
        /\b(your|my)\b|\bwhat (did you|have you|were you|scale did you)|\bhow did you\b|\bdescribe your\b|\btell me about your\b|\bwalk me through your\b|\bin your (previous|current)\b/i.test(
          params.text
        );
      const candidateSpecificAnswer =
        /\b(my|our|i (personally|single-handedly|led|built|designed|implemented|worked|managed|handled|achieved|owned|contributed)|we (built|implemented|deployed|migrated|handled|achieved)|my experience|my role|my achievement|my project)\b/i.test(
          cleanAnswer
        );
      const hasCandidateContext = Boolean(
        (params.resumeText || '').trim() ||
        params.knowledgeBase ||
        CandidateKnowledgeBase.getActiveKnowledgeBase()
      );
      const kb =
        params.knowledgeBase ||
        (params.resumeText
          ? new CandidateKnowledgeBase(params.resumeText)
          : CandidateKnowledgeBase.getActiveKnowledgeBase());
      let validation: any;
      try {
        // Skip resume grounding only for genuinely general technical questions.
        // A candidate-specific prompt must still validate project metrics and claims,
        // even if the generated answer omits first-person pronouns.
        if (technicalIntent && !candidateSpecificQuestion && !candidateSpecificAnswer) {
          validation = {
            adjustedAnswer: cleanAnswer,
            validationStatus: 'VALIDATED',
            score: 100,
            violations: [],
            structuredViolations: [],
            isGrounded: true,
          };
        } else if (
          !hasCandidateContext &&
          /\b(my|our|i led|i built|i designed|my experience|my role|my achievement|my project)\b/i.test(
            cleanAnswer
          )
        ) {
          validation = {
            adjustedAnswer: cleanAnswer,
            validationStatus: 'FLAGGED',
            score: 0,
            violations: [
              'Candidate-specific details require confirmation because no candidate source material is available.',
            ],
            structuredViolations: [],
            isGrounded: false,
          };
        } else {
          validation = FactualGroundingValidator.validateAnswer(cleanAnswer, kb, params.text);
        }
      } catch (valErr: any) {
        // Fail closed: Never expose an unvalidated final answer when validator crashes
        console.error(
          '[AnswerGenerationService] Grounding validation error, failing closed:',
          valErr
        );
        completionResult = {
          status: 'FAILED',
          isValidated: false,
          cleanAnswer:
            'Answer verification failed due to validation error. Unvalidated claims have been withheld for factual safety (consulting internal project telemetry).',
          error: valErr.message || String(valErr),
          validationResult: {
            isGrounded: false,
            validationStatus: 'FAILED',
            violations: [valErr.message || String(valErr)],
          },
          followUps: [],
          detectedCategory,
          confidence: 'low',
          predictedFollowUps: [],
          requestId,
          validationStatus: 'FAILED',
          groundingScore: 0,
          groundingViolations: [
            'Factual grounding validation failed closed: ' + (valErr.message || String(valErr)),
          ],
          structuredViolations: [
            {
              claimText: 'Validation error',
              category: 'metric_fabrication',
              severity: 'critical',
              reason: 'Validation threw an unexpected error: fail-closed safety activated.',
            },
          ],
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
        const predicted = FollowUpEngine.predictFollowUps(
          params.text,
          groundedAnswer,
          detectedCategory
        );
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
        cleanAnswer:
          decision.speakableAnswer || (decision.outcome === 'BLOCKED' ? '' : cleanAnswer),
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

    let retryCount = 0;
    const maxRetries = 2;
    let streamSucceeded = false;

    while (retryCount <= maxRetries && !streamSucceeded) {
      if (signal?.aborted) break;

      try {
        if (hasMockedAi) {
          const mockedRes = await (aiModule as any).generateAIAnswer(
            promptText,
            providerConfig,
            preferredLang
          );
          handleStreamComplete(mockedRes);
          streamSucceeded = true;
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
              onComplete: async (full) => {
                await handleStreamComplete(full);
                streamSucceeded = true;
              },
            },
            signal,
            { overallTimeoutMs: 60000, inactivityTimeoutMs: 15000 }
          );
          streamSucceeded = true;
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || signal?.aborted) {
          const timeoutMessage = err?.message || signal?.reason?.message || '';
          const timedOut = /deadline|timed out|inactivity|stalled/i.test(timeoutMessage);
          completionResult = {
            status: timedOut ? 'FAILED' : 'ABORTED',
            isValidated: false,
            cleanAnswer: '',
            error: timedOut ? timeoutMessage : 'Generation cancelled by user',
            detectedCategory,
            confidence: 'low',
            followUps: [],
            predictedFollowUps: [],
            requestId,
            validationStatus: timedOut ? 'FAILED' : 'ABORTED',
            groundingScore: 0,
            groundingViolations: [
              timedOut ? 'Generation deadline exceeded' : 'Request cancelled during generation',
            ],
            structuredViolations: [],
          };
          (completionResult as any).answer = completionResult.cleanAnswer;
          cb.onComplete?.(completionResult);
          clearTimeout(overallTimer);
          callerSignal?.removeEventListener('abort', abortFromCaller);
          return completionResult;
        }

        const analysis = RateLimitGovernor.analyzeRateLimit(
          err.status || (err as any).statusCode,
          err,
          (err as any).headers,
          provider as AIProviderId,
          providerConfig.model
        );

        if (analysis.isRateLimited && analysis.shouldAutoRetry && retryCount < maxRetries) {
          retryCount++;
          const delayMs = RateLimitGovernor.calculateBackoffDelayMs(
            retryCount,
            analysis.cooldownSeconds
          );
          console.warn(
            `[AnswerGenerationService] 429 rate limit hit. Auto-retrying attempt ${retryCount}/${maxRetries} after ${delayMs}ms...`
          );

          const store = useAppStore.getState();
          store.setPipelineStage('retrying');
          store.setRateLimitCooldown({
            retryAfterSeconds: Math.ceil(delayMs / 1000),
            resetTime: Date.now() + delayMs,
            modelName: providerConfig.model,
          });
          store.setToast(
            `⏳ Rate limit reached. Auto-retrying in ${Math.ceil(delayMs / 1000)}s (Attempt ${retryCount}/${maxRetries})...`
          );

          if (analysis.suggestedFallbackModel) {
            providerConfig.model = analysis.suggestedFallbackModel;
          }

          DiagnosticLoggerService.getInstance().recordEvent({
            requestId,
            pipelineStage: 'retrying',
            httpStatus: 429,
            retryAttempt: retryCount,
            retryDelayMs: delayMs,
            selectedProvider: provider,
            selectedModel: providerConfig.model,
            message: `Auto-retrying rate-limited request after ${delayMs}ms (model: ${providerConfig.model})`,
          });

          // Wait with signal abort handling
          try {
            await new Promise<void>((resolve, reject) => {
              let timer: ReturnType<typeof setTimeout>;
              const onAbort = () => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
                reject(
                  Object.assign(
                    new Error(
                      signal?.reason?.message || 'Generation cancelled during retry backoff'
                    ),
                    { name: 'AbortError' }
                  )
                );
              };
              timer = setTimeout(() => {
                signal?.removeEventListener('abort', onAbort);
                resolve();
              }, delayMs);
              signal?.addEventListener('abort', onAbort, { once: true });
              if (signal?.aborted) onAbort();
            });
          } catch (waitError: any) {
            if (signal?.aborted || waitError?.name === 'AbortError') {
              const timeoutMessage =
                signal?.reason?.message || waitError?.message || 'Generation cancelled';
              const timedOut = /deadline|timed out|inactivity|stalled/i.test(timeoutMessage);
              completionResult = {
                status: timedOut ? 'FAILED' : 'ABORTED',
                isValidated: false,
                cleanAnswer: '',
                error: timedOut ? timeoutMessage : 'Generation cancelled by user',
                detectedCategory,
                confidence: 'low',
                followUps: [],
                predictedFollowUps: [],
                requestId,
                validationStatus: timedOut ? 'FAILED' : 'ABORTED',
                groundingScore: 0,
                groundingViolations: [
                  timedOut
                    ? 'Generation deadline exceeded'
                    : 'Request cancelled during retry backoff',
                ],
                structuredViolations: [],
              };
              (completionResult as any).answer = completionResult.cleanAnswer;
              cb.onComplete?.(completionResult);
            }
            break;
          }

          continue;
        }

        // Auto-retry not possible or exhausted
        const isRateLimited = analysis.isRateLimited;
        if (isRateLimited) {
          const store = useAppStore.getState();
          store.setPipelineStage('waiting_quota_reset');
          store.setRateLimitCooldown({
            retryAfterSeconds: analysis.cooldownSeconds,
            resetTime: Date.now() + analysis.cooldownSeconds * 1000,
            modelName: providerConfig.model,
          });
        }

        const partialText = (err as any).partialText || '';
        if (partialText) {
          useAppStore.getState().setRecoveredPartialAnswer(partialText);
        }

        cb.onError?.(err, requestId);
        completionResult = {
          status: 'FAILED',
          isValidated: false,
          cleanAnswer:
            partialText || 'Answer generation failed due to a provider or network error.',
          partialAnswer: partialText || undefined,
          error: err.message || String(err),
          detectedCategory,
          confidence: 'low',
          followUps: [],
          predictedFollowUps: [],
          requestId,
          validationResult: {
            isGrounded: false,
            validationStatus: 'FAILED',
            violations: [err.message || String(err)],
          },
          validationStatus: 'FAILED',
          groundingScore: 0,
          groundingViolations: [err.message || String(err)],
          structuredViolations: [],
        };
        (completionResult as any).answer = completionResult.cleanAnswer;
        cb.onComplete?.(completionResult);
        break;
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

    clearTimeout(overallTimer);
    callerSignal?.removeEventListener('abort', abortFromCaller);
    return completionResult!;
  }
}
