import {
  buildInterviewerPrompt,
  InterviewerResponseSchema,
  BuildInterviewerPromptParams,
} from './prompts/interviewer';
import { MockInterviewerEngine } from './MockInterviewerEngine';

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

    if (!llmCaller) {
      return InterviewerService.generateOfflineFallback(params);
    }

    try {
      const prompt = buildInterviewerPrompt(params);
      const rawResponse = await llmCaller(prompt, 'llama-3.3-70b-versatile');

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
  }): InterviewerTurnResult {
    const questionText =
      typeof params.question_json === 'string'
        ? params.question_json
        : params.question_json?.prompt || '';

    const fallbackSpoken = MockInterviewerEngine.generateWeaknessProbe(
      params.lastAnswer,
      questionText,
      params.interview_type
    );

    return {
      action: 'probe',
      spoken: fallbackSpoken,
      reason: 'Generated via offline heuristic weakness detector.',
      evidence: '',
      isOffline: true,
    };
  }
}
