export type PendingQuestionContinuationDecision = 'append' | 'ignore' | 'new-question';

const FILLER_UTTERANCE =
  /^(?:yeah|yes|no|okay|ok|right|sure|thanks|thank you|great|fine|alright|uh|um|hmm|hello|hi|bye|got it|makes sense)[.!?\s]*$/i;

const CANDIDATE_NARRATION_START =
  /^(?:i(?:\s|['’])|we(?:\s|['’])|my\b|our\b|first(?:ly)?\b|the\s+(?:first|next|main)\s+(?:thing|step|action|approach)\b|(?:what|why|how)\s+i(?:\s|['’])|in my experience\b|the approach i\b|from my perspective\b)/i;

const NEW_QUESTION_START =
  /^(?:(?:and|but|also)\s+)?(?:what|why|how|when|where|who|which|whose|whom|tell me|explain|describe|compare|differentiate|walk me through|talk me through)\b/i;

const AUXILIARY_QUESTION_START =
  /^(?:can|could|would|should|will|do|does|did|is|are|was|were|have|has|had)\s+(?:you|we|i|it|they|he|she|this|that|the|a|an)\b/i;

const CANDIDATE_LEAD_IN =
  /^(?:yeah|yes|no|okay|ok|right|sure|well|so)(?:[,;:]?\s+(?:so|well))?[,;:]?\s+(?:i|we|my|our)\b/i;

/**
 * Decides whether a transcript arriving during the short incomplete-question
 * window is a continuation, unrelated candidate/filler speech, or a new
 * interviewer question. Speaker identity is not inferred.
 */
export function resolvePendingQuestionContinuation(
  transcript: string
): PendingQuestionContinuationDecision {
  const text = transcript.trim().replace(/\s+/g, ' ');
  if (!text || FILLER_UTTERANCE.test(text)) return 'ignore';

  if (CANDIDATE_NARRATION_START.test(text) || CANDIDATE_LEAD_IN.test(text)) {
    return 'ignore';
  }

  if (NEW_QUESTION_START.test(text) || AUXILIARY_QUESTION_START.test(text)) {
    return 'new-question';
  }

  return 'append';
}
