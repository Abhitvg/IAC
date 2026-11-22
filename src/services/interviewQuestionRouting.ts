/**
 * Routing policy for uncertain interview transcripts.
 *
 * Automatic routing is reserved for question-shaped speech. This prevents
 * uncertain filler or background conversation from triggering generation,
 * without adding a manual confirmation step.
 */
export interface InterviewTranscriptClassification {
  type: string;
  needsConfirmation?: boolean;
  confidence: number;
  questionText?: string;
}

const QUESTION_START =
  /^(?:please\s+)?(?:what|why|how|when|where|who|which|whose|whom|can|could|would|will|should|do|does|did|is|are|was|were|have|has|had|tell me|explain|describe|compare|differentiate|walk me through|talk me through|implement|write|code|design|debug|solve|build|create|find|calculate|give me|show me|list|name|state|prove|derive|trace|discuss|outline|elaborate|define|suppose|imagine)\b/i;

const FILLER_ONLY =
  /^(?:yeah|yes|no|okay|ok|right|sure|thanks|thank you|great|fine|alright|uh|um|hmm|hello|hi|bye|got it|makes sense)[.!\s]*$/i;

export function isQuestionShapedSpeech(text: string): boolean {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized || FILLER_ONLY.test(normalized)) return false;
  if (normalized.endsWith('?')) return true;
  return QUESTION_START.test(normalized);
}

export function shouldAutoRouteUncertainQuestion(
  classification: InterviewTranscriptClassification,
  transcriptText: string = ''
): boolean {
  const questionText = classification.questionText || transcriptText;
  if (!isQuestionShapedSpeech(questionText)) return false;

  if (classification.type === 'UNCLASSIFIED') {
    return Boolean(classification.needsConfirmation);
  }

  return (
    classification.type === 'INTERVIEWER_INTERRUPTION' &&
    (Boolean(classification.needsConfirmation) || classification.confidence < 0.7)
  );
}
