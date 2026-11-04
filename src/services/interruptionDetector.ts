/**
 * Interruption & Candidate Recital Detection Service
 *
 * Distinguishes between:
 * 1. CANDIDATE_RECITAL: The user (candidate) repeating/reciting the teleprompted answer
 *    -> Action: Pause mic processing / suppress echo so it does NOT re-trigger questions
 * 2. INTERVIEWER_INTERRUPTION: A third person (interviewer) interrupting with a question or objection
 *    -> Action: React automatically, abort previous answer, stream new response immediately
 * 3. INTERVIEWER_QUESTION: Fresh question when candidate is not reciting
 * 4. CONVERSATIONAL_FILLER: Short utterances like "yeah", "ok", "got it"
 */

export type UtteranceClassificationType =
  | 'CANDIDATE_RECITAL'
  | 'INTERVIEWER_INTERRUPTION'
  | 'INTERVIEWER_QUESTION'
  | 'CONVERSATIONAL_FILLER'
  | 'UNCLASSIFIED'
  | 'EMPTY';

export interface UtteranceClassification {
  type: UtteranceClassificationType;
  confidence: number;
  reason: string;
  questionText?: string;
  overlapScore?: number;
  isIncomplete?: boolean;
  needsConfirmation?: boolean;
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'that',
  'the',
  'to',
  'was',
  'were',
  'will',
  'with',
  'i',
  'we',
  'you',
  'they',
  'our',
  'my',
  'me',
  'us',
  'so',
  'yeah',
  'yes',
  'right',
  'ok',
  'okay',
  'like',
  'well',
  'just',
  'also',
  'then',
  'there',
  'this',
  'these',
  'those',
  'um',
  'uh',
  'ah',
  'er',
  'across',
]);

export const INCOMPLETE_CONNECTORS =
  /\b(and|or|because|so|with|that|to|if|while|as well as|such as|for instance|like|when|where|which|in terms of|regarding|about)$/i;

export function isIncompleteSentence(text: string): boolean {
  const trimmed = (text || '').trim();
  if (!trimmed) return false;
  if (INCOMPLETE_CONNECTORS.test(trimmed)) return true;
  // Trailing comma, dash, or ellipsis (2 or more dots) indicates incomplete utterance
  if (/(?:,|\.{2,4}|–|—|-)$/.test(trimmed)) return true;
  return false;
}

/** Extract meaningful lowercase word tokens */
export function extractTokens(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/** Extract 2-gram word pairs for phrase similarity */
export function extractBigrams(tokens: string[]): Set<string> {
  const bigrams = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return bigrams;
}

/** Calculate token and n-gram overlap between heard speech and reference answer text */
export function calculateOverlap(
  heardText: string,
  referenceText: string
): {
  tokenOverlap: number;
  bigramOverlap: number;
  compositeScore: number;
} {
  const heardTokens = extractTokens(heardText);
  if (heardTokens.length === 0) {
    return { tokenOverlap: 0, bigramOverlap: 0, compositeScore: 0 };
  }

  const refTokens = new Set(extractTokens(referenceText));
  let tokenMatches = 0;
  for (const token of heardTokens) {
    if (refTokens.has(token)) {
      tokenMatches++;
    }
  }
  const tokenOverlap = tokenMatches / heardTokens.length;

  const heardBigrams = extractBigrams(heardTokens);
  const refBigrams = extractBigrams(extractTokens(referenceText));
  let bigramMatches = 0;
  if (heardBigrams.size > 0) {
    for (const bg of heardBigrams) {
      if (refBigrams.has(bg)) {
        bigramMatches++;
      }
    }
  }
  const bigramOverlap = heardBigrams.size > 0 ? bigramMatches / heardBigrams.size : 0;

  // Composite: weighted combination giving high credit to phrase alignment
  const compositeScore = tokenOverlap * 0.7 + bigramOverlap * 0.3;
  return { tokenOverlap, bigramOverlap, compositeScore };
}

/** Explicit interruption cues indicating a third person cutting in */
const INTERRUPTION_PATTERNS = [
  /\b(wait|wait a minute|wait a second|hold on|hang on|hold up)\b/i,
  /\b(sorry to interrupt|can i interrupt|excuse me|can i stop you|let me stop you)\b/i,
  /\b(can you pause|one second|just a second|just a moment|pause there|hold that thought)\b/i,
  /\b(why did you|why would you|why not|why didn't)\b/i,
  /\b(how did you|how would you|how do you|how does that)\b/i,
  /\b(what about|what if|what happened|what happens if|what exactly)\b/i,
  /\b(can you explain|can you elaborate|can you clarify|can you give an example)\b/i,
  /\b(could you explain|could you elaborate|could you clarify|could you walk me through)\b/i,
  /\b(tell me more about|are you saying|do you mean|are you sure)\b/i,
  /\b(what was the|which tool|which framework|which database)\b/i,
  /\b(what is|what are|how to|tell me about|tell me something|difference between|compare|differentiate|define|explain to me)\b/i,
  /\b(kya hai|kaise|batao|samjhao|bataiye|samjhaiye|kuch batao)\b/i,
];

/** First-person phrasing typically spoken by the candidate answering */
const CANDIDATE_NARRATIVE_PATTERNS = [
  /\b(in my previous|in my last|in my current|in my experience|at my previous)\b/i,
  /\b(my role was|my responsibility|i was responsible for|i designed|i built|i led)\b/i,
  /\b(what we did|we implemented|we deployed|we migrated|we architected)\b/i,
  /\b(our team|our infrastructure|our pipeline|our microservices)\b/i,
  /\b(the approach i took|the reason i chose|so basically|to answer that)\b/i,
];

/** Short conversational fillers and courtesies that shouldn't trigger questions */
const FILLER_PATTERNS = [
  /^(yeah|yes|yep|right|ok|okay|sure|got it|cool|i see|uh huh|hmm|yup|alright|understood)[.!?]?$/i,
  /^(yeah exactly|yes exactly|okay sure|got it thanks|right exactly|understood thank you)[.!?]?$/i,
  /^(let me see|let me think|give me a second)[.!?]?$/i,
  /^(thank you|thanks|thank you very much|thanks a lot|thank you so much)[.!?]?$/i,
  /^(great thank you|okay thank you|perfect thank you|alright thank you|yes thank you|thanks again)[.!?]?$/i,
  /^(great|awesome|perfect|nice|good|sounds good|makes sense|no problem|you're welcome|anytime)[.!?]?$/i,
  /^(hello|hi|hey|good morning|good afternoon|good evening|can you hear me|am i audible)[.!?]?$/i,
];

/**
 * Detects question intent independently from speaker identity. Audio capture currently
 * has no diarization, so speaker attribution remains uncertain unless we see strong
 * recital evidence or an explicit interviewer turn cue.
 */
export function detectQuestionIntent(text: string): {
  plausibleQuestion: boolean;
  incomplete: boolean;
} {
  const trimmed = (text || '').trim();
  if (!trimmed) return { plausibleQuestion: false, incomplete: false };
  const hasExplicitInterruptionCue = INTERRUPTION_PATTERNS.some((pattern) =>
    pattern.test(trimmed)
  );
  const hasInterrogativeSyntax =
    hasExplicitInterruptionCue ||
    /[?]$/.test(trimmed) ||
    /^(what|why|how|who|when|where|which|whose|whom|can|could|would|should|do|does|did|is|are|was|were)\b/i.test(
      trimmed
    ) ||
    /^(please\s+)?(explain|describe|define|compare|implement|discuss|outline|elaborate)\b/i.test(
      trimmed
    ) ||
    /^(give me|tell me|walk me through)\b/i.test(trimmed) ||
    /^(kya|kaise|kyun|batao|samjhao|bataiye|samjhaiye)\b/i.test(trimmed) ||
    /(?:बताओ|समझाओ|बताइए|समझाइए)[.!?]?$/u.test(trimmed) ||
    /^(क्या|कैसे|क्यों)\b/u.test(trimmed);
  return {
    // Do not infer a question from length alone: that was incorrectly turning
    // ordinary candidate recital sentences into interviewer interruptions.
    plausibleQuestion: hasInterrogativeSyntax,
    incomplete: isIncompleteSentence(trimmed),
  };
}

export function classifyUtterance(
  heardText: string,
  currentAnswer: string | null,
  referenceSentenceQueue: string[] = []
): UtteranceClassification {
  const trimmed = (heardText || '').trim();
  if (!trimmed) return { type: 'EMPTY', confidence: 1, reason: 'Empty utterance' };

  for (const pattern of FILLER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        type: 'CONVERSATIONAL_FILLER',
        confidence: 0.95,
        reason: 'Conversational acknowledgment',
      };
    }
  }

  const fullReferenceText = [currentAnswer || '', ...(referenceSentenceQueue || [])]
    .filter(Boolean)
    .join(' ');
  const hasActiveAnswer = fullReferenceText.trim().length > 15;
  const intent = detectQuestionIntent(trimmed);
  const { tokenOverlap, compositeScore } = calculateOverlap(trimmed, fullReferenceText);

  // Explicit question/interruption cues outrank similarity to the answer. Questions
  // naturally reuse technical nouns from the answer they are following up on.
  if (hasActiveAnswer && intent.plausibleQuestion) {
    return {
      type: 'INTERVIEWER_INTERRUPTION',
      confidence: 0.86,
      reason: 'Question intent detected independently of speaker overlap',
      questionText: trimmed,
      overlapScore: compositeScore,
      isIncomplete: intent.incomplete,
    };
  }

  // First-person candidate narration is a stronger speaker cue than topical overlap.
  // Keep this rule narrow so ordinary declarative speech is not silently discarded.
  if (
    hasActiveAnswer &&
    !intent.plausibleQuestion &&
    CANDIDATE_NARRATIVE_PATTERNS.some((pattern) => pattern.test(trimmed))
  ) {
    return {
      type: 'CANDIDATE_RECITAL',
      confidence: 0.78,
      reason: 'First-person candidate narrative pattern detected',
      overlapScore: compositeScore,
    };
  }

  // Recital suppression is deliberately conservative: similarity alone is not speaker
  // evidence. Require close phrase alignment and avoid classifying likely questions.
  if (
    hasActiveAnswer &&
    !intent.plausibleQuestion &&
    compositeScore >= 0.72 &&
    tokenOverlap >= 0.75
  ) {
    return {
      type: 'CANDIDATE_RECITAL',
      confidence: Math.min(0.99, 0.7 + compositeScore * 0.29),
      overlapScore: compositeScore,
      reason: 'Strong phrase-level match to the active teleprompter answer',
    };
  }

  if (hasActiveAnswer) {
    return {
      type: 'UNCLASSIFIED',
      confidence: Math.max(0.25, 0.55 - compositeScore * 0.2),
      reason: 'Speaker cannot be reliably attributed without audio diarization',
      questionText: trimmed,
      overlapScore: compositeScore,
      isIncomplete: intent.incomplete,
      needsConfirmation: intent.plausibleQuestion,
    };
  }

  if (intent.plausibleQuestion) {
    return {
      type: 'INTERVIEWER_QUESTION',
      confidence: 0.86,
      reason: 'Question intent detected; speaker attribution unavailable',
      questionText: trimmed,
      isIncomplete: intent.incomplete,
    };
  }

  if (trimmed.split(/\s+/).filter(Boolean).length < 3) {
    return {
      type: 'CONVERSATIONAL_FILLER',
      confidence: 0.85,
      reason: 'Short non-question utterance',
    };
  }

  return {
    type: 'UNCLASSIFIED',
    confidence: 0.4,
    reason: 'Utterance intent and speaker are uncertain',
    questionText: trimmed,
  };
}
