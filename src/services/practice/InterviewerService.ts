import {
  buildInterviewerPrompt,
  InterviewerResponseSchema,
  BuildInterviewerPromptParams,
} from './prompts/interviewer';
import { MockInterviewerEngine } from './MockInterviewerEngine';
import { ExtractedWeakness, FeedbackRecord, InterviewPressure } from './types';

export interface InterviewerTurnResult {
  action: 'ask' | 'probe' | 'move_on' | 'wrap_up';
  spoken: string;
  reason: string;
  evidence: string;
  isOffline: boolean;
}

export class InterviewerService {
  /**
   * Validates that evidence cited in a probe is a case- and whitespace-normalized substring
   * of the candidate's last answer.
   */
  public static validateEvidence(evidence: string, lastAnswer: string): boolean {
    if (!evidence || !evidence.trim()) {
      return false;
    }
    const cleanEvidence = evidence.trim().toLowerCase().replace(/\s+/g, ' ');
    const cleanAnswer = (lastAnswer || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return cleanAnswer.includes(cleanEvidence);
  }

  /**
   * Generates the next interviewer turn using the configured LLM.
   * If action is "probe", validates that evidence was actually spoken by the candidate.
   * If validation fails, drops the probe and advances to the next question.
   * Falls back to offline heuristic probe if LLM fails or is unavailable.
   */
  public static async generateTurn(
    params: BuildInterviewerPromptParams & {
      lastAnswer: string;
      currentProbesCount?: number;
      targetWeakness?:
        ExtractedWeakness | { topic?: string; skill?: string; requestedFix?: string };
      feedbackRecords?: FeedbackRecord[];
      pressure?: InterviewPressure;
    },
    llmCaller?: (prompt: string, model: string) => Promise<string>
  ): Promise<InterviewerTurnResult> {
    const probesCount = params.currentProbesCount ?? 0;

    // Enforce prompt rule: Probe at most twice per question.
    if (probesCount >= 2) {
      return {
        action: 'move_on',
        spoken: "Thank you for clarifying. Let's move on to the next question.",
        reason: 'Maximum 2 probes reached for this question.',
        evidence: '',
        isOffline: false,
      };
    }

    let targetWeakness = params.targetWeakness;
    if (!targetWeakness && probesCount === 0 && params.feedbackRecords) {
      const qText =
        typeof params.question_json === 'string'
          ? params.question_json
          : params.question_json?.prompt || '';
      targetWeakness = MockInterviewerEngine.findMatchingWeakness(
        qText,
        params.interview_type,
        params.feedbackRecords
      );
    }

    if (!llmCaller) {
      return InterviewerService.generateOfflineFallback({
        ...params,
        targetWeakness,
      });
    }

    try {
      const promptParams: BuildInterviewerPromptParams = {
        ...params,
        target_weakness:
          targetWeakness &&
          (targetWeakness.skill === 'depth' || targetWeakness.skill === 'concreteness')
            ? {
                topic: targetWeakness.topic || '',
                skill: targetWeakness.skill,
                requestedFix: targetWeakness.requestedFix,
              }
            : undefined,
        pressure: params.pressure,
      };
      const prompt = buildInterviewerPrompt(promptParams);
      const rawResponse = await llmCaller(prompt, 'openai/gpt-oss-120b');

      // Strip potential markdown code fences from JSON
      const cleanJson = rawResponse
        .replace(/```(?:json)?/gi, '')
        .replace(/```/g, '')
        .trim();

      const parsed = InterviewerResponseSchema.parse(JSON.parse(cleanJson));

      if (parsed.action === 'probe') {
        const isVerifiable = InterviewerService.validateEvidence(
          parsed.evidence,
          params.lastAnswer
        );

        if (!isVerifiable) {
          // Task 4: Validate that "evidence" in a probe is a substring of the candidate's last answer;
          // if not, drop the probe and ask the next question.
          return {
            action: 'move_on',
            spoken: "Understood. Let's move on to the next question.",
            reason:
              "Probe dropped: cited evidence was not a verifiable substring of candidate's last answer.",
            evidence: '',
            isOffline: false,
          };
        }
      }

      return {
        action: parsed.action,
        spoken: parsed.spoken,
        reason: parsed.reason || '',
        evidence: parsed.evidence || '',
        isOffline: false,
      };
    } catch (_err) {
      // Graceful offline fallback
      return InterviewerService.generateOfflineFallback(params);
    }
  }

  /**
   * Deterministic offline fallback using heuristic weakness detectors.
   * Clearly marked with isOffline: true for UI labeling.
   */
  public static generateOfflineFallback(params: {
    lastAnswer: string;
    question_json: any;
    interview_type: string;
    currentProbesCount?: number;
    targetWeakness?: ExtractedWeakness | { topic?: string; skill?: string; requestedFix?: string };
    feedbackRecords?: FeedbackRecord[];
  }): InterviewerTurnResult {
    const questionText =
      typeof params.question_json === 'string'
        ? params.question_json
        : params.question_json?.prompt || '';

    const probesCount = params.currentProbesCount ?? 0;
    let targetWeakness = params.targetWeakness;
    if (!targetWeakness && probesCount === 0 && params.feedbackRecords) {
      targetWeakness = MockInterviewerEngine.findMatchingWeakness(
        questionText,
        params.interview_type,
        params.feedbackRecords
      );
    }

    if (
      probesCount === 0 &&
      targetWeakness &&
      (targetWeakness.skill === 'depth' || targetWeakness.skill === 'concreteness')
    ) {
      const targeted = MockInterviewerEngine.generateTargetedWeaknessProbe(
        params.lastAnswer,
        targetWeakness
      );
      return {
        action: 'probe',
        spoken: targeted.spoken,
        reason: `Targeted ${targetWeakness.skill} probe for requested fix: ${targetWeakness.requestedFix || 'more depth'}`,
        evidence: targeted.evidence,
        isOffline: true,
      };
    }

    const fallbackSpoken = MockInterviewerEngine.generateWeaknessProbe(
      params.lastAnswer,
      questionText,
      params.interview_type,
      targetWeakness
    );

    const words = (params.lastAnswer || '').trim().split(/\s+/).filter(Boolean);
    const evidence = words.slice(0, Math.min(3, words.length)).join(' ');

    return {
      action: 'probe',
      spoken: fallbackSpoken,
      reason: 'Generated via offline heuristic weakness detector.',
      evidence,
      isOffline: true,
    };
  }
}
