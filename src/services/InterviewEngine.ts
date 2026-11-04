/**
 * InterviewEngine
 *
 * Core coordinator for the real-time AI interview assistant workflow.
 * Manages audio recording, transcription, question detection, candidate recital vs. interruption classification,
 * answer streaming, request-scoped cancellation, and stale-response protection.
 */

import {
  cleanExtractedOcrText,
  extractProblemHeadline,
  detectLanguageHint,
} from './screenSolver';
import { classifyUtterance } from './interruptionDetector';
import { globalLatencyTracker } from './LatencyTracker';
import { useAppStore } from '../store/useAppStore';
import { AudioRecorder } from './audio';
import { transcribeAudio } from './whisper';
import { AnswerGenerationService } from './AnswerGenerationService';
import { DiagnosticLoggerService } from './diagnosticLogger';
import {
  FactualGroundingValidator,
  CandidateKnowledgeBase,
  SpeakingDecision,
} from './candidateIntelligence';
import { TaskClassificationService } from './TaskClassificationService';
import {
  ApplicationFormAssistanceService,
  ApplicationFormSession,
} from './ApplicationFormAssistanceService';

export type EngineEvent =
  | { type: 'START_LISTENING' }
  | { type: 'STOP_LISTENING' }
  | { type: 'UTTERANCE_FINALIZED'; blob: Blob; requestId?: string }
  | { type: 'QUESTION_DETECTED'; text: string; requestId?: string }
  | { type: 'SCREEN_PROBLEM_DETECTED'; text?: string; rawText?: string; requestId?: string; mode?: string }
  | { type: 'REGENERATE_ACTIVE_ANSWER' }
  | { type: 'CANCEL_ACTIVE_REQUEST' };

const audioService = AudioRecorder.getInstance();
const answerService = AnswerGenerationService.getInstance();

let activeAbortController: AbortController | null = null;
let activeRequestId: string | null = null;

let activeTranscriptionController: AbortController | null = null;
let pendingQuestionTimer: ReturnType<typeof setTimeout> | null = null;
let pendingQuestionText = '';
let pendingQuestionTranscript = '';
let pendingQuestionDeadline = 0;

export const QUESTION_CONTINUATION_GRACE_MS = 4000;

function clearPendingQuestionTimer(): void {
  if (pendingQuestionTimer) clearTimeout(pendingQuestionTimer);
  pendingQuestionTimer = null;
}


export class InterviewEngine {
  /**
   * Converts the current question into a bounded pending-finalization request.
   * The silence threshold remains user-configurable; the extra grace window is
   * a fixed continuation cap so incomplete-question mode cannot wait forever.
   */
  static markQuestionPendingFinalization(): void {
    const state = useAppStore.getState();
    const existing = state.currentQuestion?.trim() || '';
    if (!existing) return;
    pendingQuestionText = existing;
    pendingQuestionTranscript = existing;
    pendingQuestionDeadline = Date.now() + Math.min(3500, Math.max(400, state.speechPauseTolerance)) + QUESTION_CONTINUATION_GRACE_MS;
    state.setIsIncompleteQuestionMode(true);
    state.setPipelineStage('pending_finalization');
    state.setStatus('listening');
    clearPendingQuestionTimer();
    pendingQuestionTimer = setTimeout(() => {
      void InterviewEngine.finalizePendingQuestion();
    }, Math.max(0, pendingQuestionDeadline - Date.now()));
  }

  static appendPendingQuestionUtterance(text: string): boolean {
    const incoming = (text || '').trim();
    if (!incoming || !pendingQuestionText || Date.now() > pendingQuestionDeadline) return false;
    pendingQuestionText = `${pendingQuestionText.replace(/[.?!…]+$/, '')} ${incoming}`.trim();
    pendingQuestionTranscript = `${pendingQuestionTranscript} ${incoming}`.trim();
    const state = useAppStore.getState();
    state.setCurrentQuestion(pendingQuestionText);
    state.setIsIncompleteQuestionMode(true);
    clearPendingQuestionTimer();
    pendingQuestionDeadline = Date.now() + Math.min(3500, Math.max(400, state.speechPauseTolerance)) + QUESTION_CONTINUATION_GRACE_MS;
    pendingQuestionTimer = setTimeout(() => {
      void InterviewEngine.finalizePendingQuestion();
    }, Math.max(0, pendingQuestionDeadline - Date.now()));
    return true;
  }

  static async finalizePendingQuestion(): Promise<void> {
    const question = pendingQuestionText.trim();
    clearPendingQuestionTimer();
    pendingQuestionText = '';
    pendingQuestionDeadline = 0;
    useAppStore.getState().setIsIncompleteQuestionMode(false);
    if (!question) return;
    const fullTranscript = pendingQuestionTranscript;
    pendingQuestionTranscript = '';
    useAppStore.getState().updateDiagnostics({
      latestTranscript: fullTranscript,
      whisperStatus: 'Question finalized; generating answer',
      questionMatched: true,
    });
    await InterviewEngine.handleEvent({ type: 'QUESTION_DETECTED', text: question });
  }

  /**
   * Aborts any in-flight AI answer generation.
   */
  static abortActiveGeneration(): void {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
      const store = useAppStore.getState();
      store.clearDraft();
      store.enqueueSentences([]);
      store.setAnswerValidationStatus('ABORTED');
      store.setIsAnswerValidated(false);
      store.setRecitalState('listening');
      if (store.status === 'generating' || store.status === 'analyzing') {
        store.setStatus('listening');
      }
    }
  }

  /**
   * Aborts in-flight audio transcription.
   */
  static abortActiveTranscription(): void {
    if (activeTranscriptionController) {
      activeTranscriptionController.abort();
      activeTranscriptionController = null;
    }
  }

  /**
   * Cancels all active in-flight requests (transcription and generation).
   */
  static cancelAllActiveWork(): void {
    activeRequestId = null;
    InterviewEngine.abortActiveGeneration();
    InterviewEngine.abortActiveTranscription();
  }

  /**
   * Handles lifecycle and user events for the interview session.
   */
  static async handleEvent(event: EngineEvent): Promise<void> {
    const store = useAppStore.getState();

    switch (event.type) {
      case 'START_LISTENING': {
        // Idempotent start: if already active or starting, ignore redundant trigger
        if (store.status === 'listening' || audioService.getCaptureState() === 'active') {
          return;
        }

        InterviewEngine.cancelAllActiveWork();
        globalLatencyTracker.mark('speechStart');
        store.setStatus('listening');
        store.setRecitalState('listening');
        store.setToast('🎙️ Microphone Active — Listening for speech...');

        try {
          await audioService.start(async (utteranceBlob: Blob) => {
            // Guard: If capture was stopped while an utterance was finalizing, ignore
            if (useAppStore.getState().status === 'idle' || audioService.getCaptureState() === 'stopped') {
              return;
            }

            if (utteranceBlob.size < 500) {
              useAppStore.getState().updateDiagnostics({ whisperStatus: 'empty (blob too small)' });
              return;
            }

            useAppStore.getState().updateDiagnostics({ whisperStatus: 'transcribing...' });
            await InterviewEngine.handleEvent({
              type: 'UTTERANCE_FINALIZED',
              blob: utteranceBlob,
            });
          });
        } catch (e: any) {
          store.updateDiagnostics({ whisperStatus: 'Mic error: ' + (e?.message || e) });
          console.error('[InterviewEngine] Microphone start error:', e);
          const isPermission =
            e?.name === 'NotAllowedError' ||
            String(e).includes('Permission') ||
            String(e).includes('not allowed');
          const errorMsg = isPermission
            ? '🎙️ Microphone permission denied. Please grant microphone access in macOS System Settings > Privacy & Security > Microphone.'
            : `🎙️ Microphone error: ${e?.message || e}`;
          store.setToast(errorMsg);
          store.setStatus('idle');
          store.setRecitalState('idle');
        }
        break;
      }

      case 'UTTERANCE_FINALIZED': {
        // Guard: Stale or stopped session check
        if (store.status === 'idle') {
          return;
        }

        const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        activeRequestId = requestId;

        InterviewEngine.abortActiveTranscription();
        activeTranscriptionController = new AbortController();

        globalLatencyTracker.mark('speechEnd');
        globalLatencyTracker.mark('transcriptionStart');
        store.setStatus('transcribing');

        try {
          const result = await transcribeAudio(
            event.blob,
            store.settings,
            activeTranscriptionController.signal
          );

          // Check if this transcription was superseded by a newer request or cancelled
          if (activeRequestId !== requestId || useAppStore.getState().status === 'idle') {
            return;
          }

          globalLatencyTracker.mark('transcriptionEnd');
          let text = (result?.text || '').trim();

          // Strip non-speech brackets like [BLANK_AUDIO], (beep), [MUSIC], etc.
          text = text.replace(/\[[^\]]+\]|\([^)]+\)/g, '').trim();

          if (!text) {
            useAppStore.getState().updateDiagnostics({
              whisperStatus: 'no speech detected in utterance',
            });
            useAppStore.getState().setStatus('listening');
            useAppStore.getState().setPipelineStage('listening');
            return;
          }

          // If explicit Still Asking mode is active, retain each segment and give
          // continuation a bounded window. The timer guarantees eventual finalization.
          if (useAppStore.getState().isIncompleteQuestionMode && InterviewEngine.appendPendingQuestionUtterance(text)) {
            useAppStore.getState().addTranscript({
              id: `continuation_${requestId}`,
              speaker: 'unknown',
              text,
              timestamp: Date.now(),
              classification: 'PENDING_CONTINUATION',
              confidence: classification.confidence,
              reason: 'Appended inside bounded continuation window',
            });
            useAppStore.getState().updateDiagnostics({
              latestTranscript: text,
              whisperStatus: 'Pending question extended; finalization timer restarted',
            });
            return;
          }

          useAppStore.getState().setPipelineStage('transcript_received');
          useAppStore.getState().updateDiagnostics({
            latestTranscript: text,
          });

          DiagnosticLoggerService.getInstance().recordEvent({
            requestId,
            pipelineStage: 'transcript_received',
            message: text.slice(0, 100),
          });

          useAppStore.getState().setPipelineStage('identifying_question');

          // Intelligent Classification: Distinguish Candidate Recital vs. Third-Person Interruption
          const classification = classifyUtterance(
            text,
            useAppStore.getState().currentAnswer,
            useAppStore.getState().teleprompterQueue
          );

          console.log(
            '[InterviewEngine] Utterance classification:',
            classification.type,
            `(${classification.reason})`,
            `"${text}"`
          );

          DiagnosticLoggerService.getInstance().recordEvent({
            requestId,
            pipelineStage: 'identifying_question',
            transcriptClassification: {
              type: classification.type,
              confidence: classification.confidence,
              reason: classification.reason,
            },
          });

          // Preserve all recognized speech before classification-specific handling. A
          // classifier decision must never be the condition for transcript retention.
          useAppStore.getState().addTranscript({
            id: `transcript_${requestId}`,
            speaker: classification.type === 'CANDIDATE_RECITAL' ? 'user' : 'unknown',
            text,
            timestamp: Date.now(),
            classification: classification.type,
            confidence: classification.confidence,
            reason: classification.reason,
          });

          // Strong recital evidence remains the only automatic echo-suppression path.
          if (classification.type === 'CANDIDATE_RECITAL') {
            useAppStore.getState().setRecitalState('reciting');
            useAppStore.getState().updateDiagnostics({
              whisperStatus: `Candidate recital suppressed: ${classification.reason}`,
              recitalState: 'reciting',
              questionMatched: false,
            });
            useAppStore.getState().setStatus('listening');
            useAppStore.getState().setPipelineStage('listening');
            return;
          }

          // Ambiguous words are preserved. Plausible question intent can proceed to
          // generation even when speaker identity cannot be established.
          if (classification.type === 'UNCLASSIFIED') {
            if (classification.needsConfirmation) {
              await InterviewEngine.handleEvent({ type: 'QUESTION_DETECTED', text, requestId });
              return;
            }
            const pendingTranscript = {
              id: `unconfirmed_${requestId}`,
              text,
              confidence: classification.confidence,
              reason: classification.reason,
              timestamp: Date.now(),
            };
            useAppStore.getState().setLastUnconfirmedTranscript(pendingTranscript);
            useAppStore.getState().updateDiagnostics({
              latestTranscript: text,
              whisperStatus: `Speaker uncertain; transcript retained: ${classification.reason}`,
              questionMatched: false,
            });
            useAppStore.getState().setToast('Speech retained. Confirm as a question or dismiss it.');
            useAppStore.getState().setStatus('confirmation_required');
            useAppStore.getState().setPipelineStage('confirmation_required');
            return;
          }

          // 2. CONVERSATIONAL FILLER ("Yeah", "Okay", "Right")
          if (classification.type === 'CONVERSATIONAL_FILLER') {
            useAppStore.getState().updateDiagnostics({
              whisperStatus: `Conversational filler ignored ("${text}")`,
            });
            useAppStore.getState().addTranscript({
              id: Date.now().toString(),
              speaker: 'unknown',
              text: text,
              timestamp: Date.now(),
              classification: 'CONVERSATIONAL_FILLER',
              confidence: classification.confidence,
              reason: classification.reason,
            });
            useAppStore.getState().setStatus('listening');
            useAppStore.getState().setPipelineStage('listening');
            return;
          }

          // 3. AMBIGUOUS SPEECH: Require confirmation before generating answer
          if (
            classification.needsConfirmation ||
            (classification.confidence < 0.70 && classification.type === 'INTERVIEWER_INTERRUPTION')
          ) {
            const questionCandidate = classification.questionText || text;
            useAppStore.getState().setLastUnconfirmedTranscript({
              id: Date.now().toString(),
              text: questionCandidate,
              confidence: classification.confidence,
              reason: classification.reason,
              timestamp: Date.now(),
            });
            useAppStore.getState().setPipelineStage('confirmation_required');
            useAppStore.getState().updateDiagnostics({
              latestTranscript: questionCandidate,
              whisperStatus: `Awaiting user confirmation: "${questionCandidate.slice(0, 35)}..."`,
              questionMatched: false,
            });

            useAppStore.getState().addTranscript({
              id: Date.now().toString(),
              speaker: 'interviewer',
              text: questionCandidate,
              timestamp: Date.now(),
              classification: 'CONFIRMATION_REQUIRED',
              confidence: classification.confidence,
              reason: classification.reason,
            });

            DiagnosticLoggerService.getInstance().recordEvent({
              requestId,
              pipelineStage: 'confirmation_required',
              finalOutcome: 'CONFIRMATION_NEEDED',
              message: `Awaiting user confirmation for: "${questionCandidate.slice(0, 80)}" (${classification.reason})`,
            });
            return;
          }

          // 4. INTERVIEWER INTERRUPTION OR NEW QUESTION
          if (
            classification.type === 'INTERVIEWER_INTERRUPTION' ||
            classification.type === 'INTERVIEWER_QUESTION'
          ) {
            const currentStatus = useAppStore.getState().status;
            // A detected interviewer question is a new request even while an older
            // answer is streaming. QUESTION_DETECTED owns cancellation and stale-result guards.

            const questionText = classification.questionText || text;
            const isInterruption = classification.type === 'INTERVIEWER_INTERRUPTION';

            useAppStore.getState().setRecitalState(isInterruption ? 'interrupted' : 'listening');
            useAppStore.getState().setLastInterruption(questionText);
            useAppStore.getState().updateDiagnostics({
              latestTranscript: questionText,
              whisperStatus: isInterruption
                ? `⚡ Interviewer interruption: "${questionText.slice(0, 45)}..."`
                : 'Interviewer question received',
              recitalState: isInterruption ? 'interrupted' : 'listening',
              questionMatched: true,
            });

            if (isInterruption) {
              useAppStore.getState().setToast(`⚡ Third-person interruption: "${questionText.slice(0, 50)}..."`);
            }

            useAppStore.getState().addTranscript({
              id: Date.now().toString(),
              speaker: 'interviewer',
              text: questionText,
              timestamp: Date.now(),
              classification: classification.type,
              confidence: classification.confidence,
              reason: classification.reason,
            });

            await InterviewEngine.handleEvent({
              type: 'QUESTION_DETECTED',
              text: questionText,
              requestId,
            });
            return;
          }

          useAppStore.getState().setStatus('listening');
          useAppStore.getState().setPipelineStage('listening');
        } catch (e: any) {
          if (e.name !== 'AbortError') {
            useAppStore.getState().updateDiagnostics({
              whisperStatus: 'error: ' + (e?.message || e),
            });
            console.error('[InterviewEngine] Transcription error:', e);
            useAppStore.getState().setStatus('listening');
          }
        }
        break;
      }

      case 'QUESTION_DETECTED': {
        const incomingText = event.text.trim();
        // Guard: Prevent duplicate questions from generating duplicate answers accidentally
        if (
          incomingText &&
          store.currentQuestion &&
          incomingText.toLowerCase() === store.currentQuestion.trim().toLowerCase() &&
          (store.status === 'generating' || store.status === 'analyzing')
        ) {
          console.log('[InterviewEngine] Deduplicating identical in-flight question:', incomingText);
          return;
        }

        globalLatencyTracker.mark('questionDetected');

        const isExtending = store.isIncompleteQuestionMode && Boolean(store.currentQuestion);
        let finalQuestion = event.text;

        if (isExtending && store.currentQuestion) {
          finalQuestion = `${store.currentQuestion.trim()} ... ${event.text.trim()}`;
          store.setIsIncompleteQuestionMode(false);
          store.setToast(`➕ Appended continuation: "${event.text.slice(0, 45)}..."`);
        } else {
          if (store.currentQuestion && store.currentQuestion.trim() !== '') {
            store.pushToQuestionHistory({
              question: store.currentQuestion,
              answer: store.currentAnswer,
              confidence: store.answerConfidence,
            });
          }
        }

        InterviewEngine.abortActiveGeneration();

        activeAbortController = new AbortController();
        const requestId = event.requestId || 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        activeRequestId = requestId;

        store.incrementGenerationId();
        const currentGen = useAppStore.getState().generationId;

        store.clearAnswerQueue();
        store.clearUnconfirmedTranscript();
        store.setRecoveredPartialAnswer(null);
        store.setRateLimitCooldown(null);
        store.setPipelineStage('generating');
        store.setCurrentQuestion(finalQuestion);
        store.setCurrentAnswer('');
        store.setActiveRequestId(requestId);
        store.setAnswerValidationStatus('PENDING');
        store.setIsAnswerValidated(false);
        store.setGroundingResult(null, []);
        store.setStatus('analyzing');
        store.setRecitalState('listening');

        globalLatencyTracker.mark('generationStart');
        const currentStore = useAppStore.getState();

        DiagnosticLoggerService.getInstance().recordEvent({
          requestId,
          pipelineStage: 'generating',
          selectedProvider: currentStore.settings?.aiProvider || 'groq',
          selectedModel: currentStore.settings?.aiModel,
          message: `Generation started for: "${finalQuestion.slice(0, 80)}"`,
        });

        await answerService.generateAnswer(
          {
            requestId,
            type: 'interview',
            text: finalQuestion,
            provider: currentStore.settings?.aiProvider || 'groq',
            model: currentStore.settings?.aiModel,
            preferredLanguage: currentStore.settings?.preferredLanguage || 'Java',
            responseMode: currentStore.responseMode || 'interview',
            resumeText: currentStore.resumeText,
            jobDescriptionText: currentStore.jobDescriptionText,
            targetRole: currentStore.targetRole,
            conversationHistory: currentStore.conversationHistory || [],
            signal: activeAbortController.signal,
          },
          {
            onToken: (token, rId) => {
              if (rId !== activeRequestId || useAppStore.getState().generationId !== currentGen) return;
              useAppStore.getState().appendDraftToken(token);
              if (useAppStore.getState().status !== 'generating') {
                useAppStore.getState().setStatus('generating');
              }
              if (useAppStore.getState().pipelineStage !== 'streaming') {
                useAppStore.getState().setPipelineStage('streaming');
              }
            },
            onSentence: (sentence, rId) => {
              if (rId !== activeRequestId || useAppStore.getState().generationId !== currentGen) return;
              globalLatencyTracker.markFirstSentenceOnce();
              const currentDraftQueue = useAppStore.getState().draftQueue;
              useAppStore.getState().enqueueDraftSentences([...currentDraftQueue, sentence]);
            },
            onComplete: (res) => {
              const state = useAppStore.getState();
              if (res.requestId !== activeRequestId || res.requestId !== state.activeRequestId || state.generationId !== currentGen) {
                console.warn('[InterviewEngine] Discarded stale generation result:', res.requestId);
                return;
              }
              globalLatencyTracker.mark('generationEnd');
              console.log('Latency Report:', globalLatencyTracker.getReport());

              // Clear unvalidated streaming draft
              state.clearDraft();
              state.setPipelineStage('validating');

              const decision: SpeakingDecision =
                (res as any).speakingDecision ||
                FactualGroundingValidator.evaluateSpeakingDecision(
                  res.cleanAnswer || '',
                  res.cleanAnswer,
                  res.validationResult,
                  currentStore.resumeText ? new CandidateKnowledgeBase(currentStore.resumeText) : CandidateKnowledgeBase.getActiveKnowledgeBase()
                );

              if (decision.isSpeakable) {
                const finalAnswer = decision.speakableAnswer;
                state.setCurrentAnswer(finalAnswer);
                state.setAnswerConfidence(res.confidence);
                state.setAnswerValidationStatus(decision.outcome);
                state.setIsAnswerValidated(decision.outcome === 'VALIDATED');
                state.setGroundingResult(res.groundingScore ?? 100, res.groundingViolations ?? []);
                state.enqueueSentences(decision.speakableQueue);
                state.setTechnicalGuidance(null);
                state.setBlockedReason(null);
                state.setPipelineStage('answer_ready');

                DiagnosticLoggerService.getInstance().recordEvent({
                  requestId: res.requestId,
                  pipelineStage: 'answer_ready',
                  finalOutcome: 'SUCCESS',
                  receivedTokenCount: finalAnswer?.length,
                  message: `Answer validated and ready (${res.confidence} confidence)`,
                });

                const currentQ = state.currentQuestion;
                if (currentQ && finalAnswer) {
                  state.addToConversationHistory({
                    question: currentQ,
                    answer: finalAnswer.slice(0, 300),
                    category: res.detectedCategory,
                  });
                }
              } else {
                // BLOCKED, FAILED, or ABORTED: keep speakable queue strictly empty
                state.setCurrentAnswer(null);
                state.setIsAnswerValidated(false);
                state.setAnswerValidationStatus(decision.outcome);
                state.setGroundingResult(0, res.groundingViolations ?? []);
                state.enqueueSentences([]);
                state.setTechnicalGuidance(decision.technicalGuidance || null);
                const genError = (res as any).error;
                state.setBlockedReason(genError || decision.blockedReason || 'Blocked by factual grounding gate');
                state.setPipelineStage('failed');

                DiagnosticLoggerService.getInstance().recordEvent({
                  requestId: res.requestId,
                  pipelineStage: 'failed',
                  finalOutcome: 'BLOCKED',
                  message: decision.blockedReason || genError || 'Blocked by factual grounding gate',
                });

                if (decision.outcome === 'FAILED' && genError) {
                  state.setToast(`⚠️ Generation Error: ${genError}`);
                }
              }

              state.setPredictedFollowUps(res.predictedFollowUps || []);
              state.setRecitalState('listening');
              state.setStatus('ready');
            },
            onError: (err, rId) => {
              if (rId !== activeRequestId || useAppStore.getState().generationId !== currentGen) return;
              console.error('[InterviewEngine] Generation stream error:', err);
              const state = useAppStore.getState();
              state.clearDraft();
              state.enqueueSentences([]);
              state.setCurrentAnswer(null);
              state.setIsAnswerValidated(false);
              state.setAnswerValidationStatus('FAILED');
              state.setRecitalState('listening');
              state.setBlockedReason(err.message || String(err));
              state.setToast(`⚠️ AI Generation Error: ${err.message || err}`);

              const isRateLimited = Boolean(
                (err as any).isRateLimited ||
                (err as any).rateLimit?.isRateLimited ||
                String(err?.message || err).includes('429') ||
                String(err?.message || err).includes('RATE_LIMIT_EXCEEDED') ||
                String(err?.message || err).includes('TPM')
              );

              if (isRateLimited) {
                state.setPipelineStage('waiting_quota_reset');
              } else {
                state.setPipelineStage('failed');
              }

              if ((err as any).partialText) {
                state.setRecoveredPartialAnswer((err as any).partialText);
              }

              DiagnosticLoggerService.getInstance().recordEvent({
                requestId: rId,
                pipelineStage: isRateLimited ? 'waiting_quota_reset' : 'failed',
                finalOutcome: isRateLimited ? 'RATE_LIMITED' : 'FAILED',
                httpStatus: (err as any).status || (isRateLimited ? 429 : 500),
                message: err.message || String(err),
              });

              state.updateDiagnostics({
                whisperStatus: 'gen error: ' + (err.message || String(err)),
              });
              state.setStatus('error');
              setTimeout(() => {
                if (useAppStore.getState().status === 'error') {
                  useAppStore.getState().setStatus('listening');
                }
              }, 3000);
            },
          }
        );
        break;
      }

      case 'SCREEN_PROBLEM_DETECTED': {
        globalLatencyTracker.mark('questionDetected');

        if (store.currentQuestion && store.currentQuestion.trim() !== '') {
          store.pushToQuestionHistory({
            question: store.currentQuestion,
            answer: store.currentAnswer,
            confidence: store.answerConfidence,
          });
        }

        InterviewEngine.abortActiveGeneration();

        activeAbortController = new AbortController();
        const requestId = event.requestId || 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        activeRequestId = requestId;

        store.incrementGenerationId();
        const screenGen = useAppStore.getState().generationId;

        store.clearAnswerQueue();

        const cleanedOcr = cleanExtractedOcrText(event.rawText || event.text || '');
        const classification = TaskClassificationService.classify(cleanedOcr, {
          userSelectedRegion: event.mode === 'snip',
        });
        store.setTaskClassification(classification);

        const currentStore = useAppStore.getState();

        // Check if captured content represents an application form, questionnaire, or vendor evaluation
        if (
          classification.category === 'JOB_APPLICATION_FORM' ||
          classification.category === 'PROFESSIONAL_QUESTIONNAIRE' ||
          classification.category === 'VENDOR_EVALUATION' ||
          classification.category === 'GENERAL_FORM'
        ) {
          const matchedJob = ApplicationFormAssistanceService.matchJobApplication(cleanedOcr);
          const extractedQuestions = ApplicationFormAssistanceService.extractQuestions(cleanedOcr);
          const kb = currentStore.resumeText
            ? new CandidateKnowledgeBase(currentStore.resumeText)
            : CandidateKnowledgeBase.getActiveKnowledgeBase();

          const answers: Record<string, any> = {};
          extractedQuestions.forEach((q) => {
            answers[q.id] = ApplicationFormAssistanceService.generateTruthfulAnswer(q, kb, matchedJob);
          });

          const formSession: ApplicationFormSession = {
            id: `app_session_${Date.now()}`,
            timestamp: Date.now(),
            rawOcrText: cleanedOcr,
            category: classification.category,
            associatedJobId: matchedJob?.id,
            associatedJobTitle: matchedJob?.role,
            associatedCompany: matchedJob?.company,
            questions: extractedQuestions,
            answers,
            activeQuestionIndex: 0,
          };

          store.setApplicationSession(formSession);
          store.setResponseMode('application');
          store.setCurrentQuestion(`📝 [${classification.category.replace(/_/g, ' ')}] ${extractedQuestions[0]?.questionText || 'Application Form'}`);
          store.setCurrentAnswer(extractedQuestions[0] ? answers[extractedQuestions[0].id]?.conciseAnswer : '');
          store.setAnswerValidationStatus('VALIDATED');
          store.setIsAnswerValidated(true);
          store.setStatus('ready');
          store.setToast(
            `✨ Extracted ${extractedQuestions.length} application question${extractedQuestions.length === 1 ? '' : 's'} — Application Assistance Active!`
          );
          return;
        }

        const headline = extractProblemHeadline(cleanedOcr);
        const lang = detectLanguageHint(cleanedOcr);

        const titlePrefix = lang.isNonEnglish
          ? `📸 [Screen - ${lang.languageName} ${lang.flag} ➔ English]`
          : `📸 [Screen]`;

        store.setCurrentQuestion(`${titlePrefix} ${headline}`);
        store.setCurrentAnswer('');
        store.setActiveRequestId(requestId);
        store.setAnswerValidationStatus('PENDING');
        store.setIsAnswerValidated(false);
        store.setGroundingResult(null, []);
        store.setStatus('analyzing');
        store.setRecitalState('listening');

        if (lang.isNonEnglish) {
          store.setToast(
            `🌐 Detected ${lang.languageName} ${lang.flag} on screen! Translating to English & solving with 0-hallucination verification...`
          );
        } else {
          store.setToast(
            `📸 Screen Question Detected: "${headline.slice(0, 45)}..." — Solving with 0-hallucination verification!`
          );
        }

        globalLatencyTracker.mark('generationStart');
        const activeStore = useAppStore.getState();

        await answerService.generateAnswer(
          {
            requestId,
            type: 'screen',
            text: headline,
            rawText: event.rawText || event.text || '',
            provider: activeStore.settings?.aiProvider || 'groq',
            model: activeStore.settings?.aiModel,
            preferredLanguage: activeStore.settings?.preferredLanguage || 'Java',
            responseMode: 'coding',
            resumeText: activeStore.resumeText,
            jobDescriptionText: activeStore.jobDescriptionText,
            targetRole: activeStore.targetRole,
            signal: activeAbortController.signal,
          },
          {
            onToken: (token, rId) => {
              if (rId !== activeRequestId || useAppStore.getState().generationId !== screenGen) return;
              useAppStore.getState().appendDraftToken(token);
              if (useAppStore.getState().status !== 'generating') {
                useAppStore.getState().setStatus('generating');
              }
            },
            onSentence: (sentence, rId) => {
              if (rId !== activeRequestId || useAppStore.getState().generationId !== screenGen) return;
              const currentDraftQueue = useAppStore.getState().draftQueue;
              useAppStore.getState().enqueueDraftSentences([...currentDraftQueue, sentence]);
            },
            onComplete: (res) => {
              const state = useAppStore.getState();
              if (res.requestId !== activeRequestId || res.requestId !== state.activeRequestId || state.generationId !== screenGen) {
                console.warn('[InterviewEngine] Discarded stale screen result:', res.requestId);
                return;
              }
              globalLatencyTracker.mark('generationEnd');
              state.clearDraft();

              const decision: SpeakingDecision =
                (res as any).speakingDecision ||
                FactualGroundingValidator.evaluateSpeakingDecision(
                  res.cleanAnswer || '',
                  res.cleanAnswer,
                  res.validationResult,
                  currentStore.resumeText ? new CandidateKnowledgeBase(currentStore.resumeText) : CandidateKnowledgeBase.getActiveKnowledgeBase()
                );

              if (decision.isSpeakable) {
                const finalAnswer = decision.speakableAnswer;
                state.setCurrentAnswer(finalAnswer);
                state.setAnswerValidationStatus(decision.outcome);
                state.setIsAnswerValidated(decision.outcome === 'VALIDATED');
                state.setGroundingResult(res.groundingScore ?? 100, res.groundingViolations ?? []);
                state.enqueueSentences(decision.speakableQueue);
                state.setTechnicalGuidance(null);
                state.setBlockedReason(null);
              } else {
                state.setCurrentAnswer(null);
                state.setIsAnswerValidated(false);
                state.setAnswerValidationStatus(decision.outcome);
                state.setGroundingResult(0, res.groundingViolations ?? []);
                state.enqueueSentences([]);
                state.setTechnicalGuidance(decision.technicalGuidance || null);
                state.setBlockedReason(decision.blockedReason || 'Blocked by factual grounding gate');
              }

              state.setRecitalState('listening');
              state.setStatus('ready');
            },
            onError: (err, rId) => {
              if (rId !== activeRequestId || useAppStore.getState().generationId !== screenGen) return;
              console.error('[InterviewEngine] Screen Solver Failed:', err.message);
              const state = useAppStore.getState();
              state.clearDraft();
              state.enqueueSentences([]);
              state.setCurrentAnswer(null);
              state.setIsAnswerValidated(false);
              state.setAnswerValidationStatus('FAILED');
              state.updateDiagnostics({
                whisperStatus: 'solver error: ' + (err.message || String(err)),
              });
              state.setStatus('error');
            },
          }
        );
        break;
      }

      case 'REGENERATE_ACTIVE_ANSWER': {
        const q = store.currentQuestion;
        if (q && q.trim()) {
          await InterviewEngine.handleEvent({
            type: 'QUESTION_DETECTED',
            text: q.replace(/^📸\s*\[.*?\]\s*/, ''),
          });
        }
        break;
      }

      case 'CANCEL_ACTIVE_REQUEST': {
        InterviewEngine.cancelAllActiveWork();
        store.clearAnswerQueue();
        store.clearDraft();
        store.setStatus(audioService.getCaptureState() === 'active' ? 'listening' : 'idle');
        store.setToast('Active request cancelled.');
        break;
      }

      case 'STOP_LISTENING': {
        InterviewEngine.abortActiveTranscription();
        await audioService.stop(false); // Discard in-progress chunks cleanly

        // Decouple audio capture stop from active AI answer generation:
        // If an answer is currently generating or analyzing, do NOT abort generation!
        const currentStatus = useAppStore.getState().status;
        if (currentStatus !== 'generating' && currentStatus !== 'analyzing') {
          useAppStore.getState().setStatus('idle');
          useAppStore.getState().setRecitalState('idle');
        }
        useAppStore.getState().setToast('⏹️ Audio recording stopped.');
        break;
      }
    }
  }
}
