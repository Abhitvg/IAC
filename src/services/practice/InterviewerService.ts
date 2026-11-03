import {
  buildInterviewerPrompt,
  InterviewerResponseSchema,
  InterviewerAction,
  BuildInterviewerPromptParams,
} from './prompts/interviewer';
import { MockInterviewerEngine } from './MockInterviewerEngine';
import { ExtractedWeakness, FeedbackRecord, InterviewPressure } from './types';
import { resolveOrMigrateModel, AIProviderId } from '../models/modelRegistry';
import { CurriculumCatalogService } from '../../data/curriculum/CurriculumCatalog';

export interface InterviewerTurnResult {
  action: InterviewerAction;
  spoken: string;
  reason: string;
  evidence: string;
  isOffline: boolean;
}

export class InterviewerService {
  /**
   * Validates that evidence cited in a probe, challenge, or clarify action is a
   * case- and whitespace-normalized substring of the candidate's actual last answer.
   * Never accepts empty or whitespace-only evidence.
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
   * Generates the next interviewer turn using the configured LLM or offline fallback.
   * Applies conditional evidence validation:
   * - "ask": evidence is not required.
   * - "probe": requires a verifiable quote from the candidate's last response.
   * - "challenge": requires verifiable evidence of the specific claim being challenged.
   * - "clarify": requires verifiable evidence of ambiguous terminology.
   * - "move_on" / "wrap_up": evidence is optional.
   */
  public static async generateTurn(
    params: BuildInterviewerPromptParams & {
      lastAnswer: string;
      currentProbesCount?: number;
      targetWeakness?:
        | ExtractedWeakness
        | { topic?: string; skill?: string; requestedFix?: string };
      feedbackRecords?: FeedbackRecord[];
      pressure?: InterviewPressure;
      curriculumTopicId?: string;
    },
    llmCaller?: (prompt: string, model: string) => Promise<string>
  ): Promise<InterviewerTurnResult> {
    const probesCount = params.currentProbesCount ?? 0;

    // Enforce interview pacing rule: at most 2 probes per question.
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
        curriculumTopicId:
          params.curriculumTopicId ||
          (typeof params.question_json === 'object'
            ? params.question_json?.curriculumTopicId
            : undefined),
      };

      const prompt = buildInterviewerPrompt(promptParams);
      const targetModel = resolveOrMigrateModel(
        ((params as any).provider || 'groq') as AIProviderId,
        (params as any).model,
        'llm'
      ).resolvedModel;

      const rawResponse = await llmCaller(prompt, targetModel);

      // Strip potential markdown code fences from JSON
      const cleanJson = rawResponse
        .replace(/```(?:json)?/gi, '')
        .replace(/```/g, '')
        .trim();

      const parsed = InterviewerResponseSchema.parse(JSON.parse(cleanJson));

      // Conditional evidence validation
      if (
        parsed.action === 'probe' ||
        parsed.action === 'challenge' ||
        parsed.action === 'clarify'
      ) {
        const isVerifiable = InterviewerService.validateEvidence(
          parsed.evidence,
          params.lastAnswer
        );

        if (!isVerifiable) {
          // If cited evidence was fabricated or absent from the candidate's last answer,
          // drop the probe/challenge/clarify to avoid hallucinated confrontation.
          const actionLabel =
            parsed.action === 'probe'
              ? 'Probe'
              : parsed.action === 'challenge'
              ? 'Challenge'
              : 'Clarify';

          return {
            action: 'move_on',
            spoken: "Understood. Let's move on to the next question.",
            reason: `${actionLabel} dropped: cited evidence was not a verifiable substring of candidate's last answer.`,
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
   * Deterministic offline fallback using curriculum-grounded heuristics and weakness detectors.
   * Returns action marked with isOffline: true for UI transparency.
   */
  public static generateOfflineFallback(params: {
    lastAnswer: string;
    question_json: any;
    interview_type: string;
    currentProbesCount?: number;
    targetWeakness?: ExtractedWeakness | { topic?: string; skill?: string; requestedFix?: string };
    feedbackRecords?: FeedbackRecord[];
    curriculumTopicId?: string;
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

    // 1. Weakness-targeted probe
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
        reason: `Targeted ${targetWeakness.skill} probe for requested fix: ${
          targetWeakness.requestedFix || 'more depth'
        }`,
        evidence: targeted.evidence,
        isOffline: true,
      };
    }

    // 2. Curriculum-grounded challenge if candidate answer hits common misconceptions
    const topicId =
      params.curriculumTopicId ||
      (typeof params.question_json === 'object'
        ? params.question_json?.curriculumTopicId
        : undefined);

    if (topicId) {
      try {
        const topic = CurriculumCatalogService.getInstance().getTopic(topicId);
        if (topic && topic.commonMisconceptions.length > 0) {
          const answerLower = (params.lastAnswer || '').toLowerCase();
          for (const misconception of topic.commonMisconceptions) {
            const keywords = misconception
              .toLowerCase()
              .split(/\s+/)
              .filter((w) => w.length > 4);
            const matches = keywords.filter((kw) => answerLower.includes(kw));
            if (matches.length >= 2) {
              const words = (params.lastAnswer || '').trim().split(/\s+/).filter(Boolean);
              const matchedPhrase =
                words.find((w) => matches.some((kw) => w.toLowerCase().includes(kw))) || words[0] || '';
              return {
                action: 'challenge',
                spoken: `You mentioned "${matchedPhrase}". How does that reconcile with the edge-case where ${misconception.toLowerCase()}?`,
                reason: `Curriculum-grounded challenge on common misconception: ${misconception}`,
                evidence: matchedPhrase,
                isOffline: true,
              };
            }
          }
        }
      } catch (_e) {
        // Fall through to general fallback
      }
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
