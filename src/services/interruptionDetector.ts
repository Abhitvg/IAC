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
  | 'EMPTY';

export interface UtteranceClassification {
  type: UtteranceClassificationType;
  confidence: number;
  reason: string;
  questionText?: string;
  overlapScore?: number;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'were', 'will', 'with', 'i', 'we', 'you', 'they', 'our',
  'my', 'me', 'us', 'so', 'yeah', 'yes', 'right', 'ok', 'okay', 'like',
  'well', 'just', 'also', 'then', 'there', 'this', 'these', 'those',
  'um', 'uh', 'ah', 'er'
]);

/** Extract meaningful lowercase word tokens */
export function extractTokens(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

/** Extract 2-gram word pairs for phrase similarity */
export function extractBigrams(tokens: string[]): Set<string> {
  const bigrams = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return bigrams;
}

/** Calculate token and n-gram overlap between heard speech and teleprompter text */
export function calculateOverlap(heardText: string, referenceText: string): {
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
  const compositeScore = (tokenOverlap * 0.7) + (bigramOverlap * 0.3);
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
  /\b(what was the|which tool|which framework|which database)\b/i
];

/** First-person phrasing typically spoken by the candidate answering */
const CANDIDATE_NARRATIVE_PATTERNS = [
  /\b(in my previous|in my last|in my current|in my experience|at my previous)\b/i,
  /\b(my role was|my responsibility|i was responsible for|i designed|i built|i led)\b/i,
  /\b(what we did|we implemented|we deployed|we migrated|we architected)\b/i,
  /\b(our team|our infrastructure|our pipeline|our microservices)\b/i,
  /\b(the approach i took|the reason i chose|so basically|to answer that)\b/i
];

/** Short conversational fillers that shouldn't trigger questions */
const FILLER_PATTERNS = [
  /^(yeah|yes|yep|right|ok|okay|sure|got it|cool|i see|uh huh|hmm|yup|alright|understood)[.!?]?$/i,
  /^(yeah exactly|yes exactly|okay sure|got it thanks|right exactly|understood thank you)[.!?]?$/i,
  /^(let me see|let me think|give me a second)[.!?]?$/i
];

/**
 * Classifies an incoming speech utterance from Whisper
 */
export function classifyUtterance(
  heardText: string,
  currentAnswer: string | null,
  teleprompterQueue: string[] = []
): UtteranceClassification {
  const trimmed = (heardText || '').trim();
  if (!trimmed) {
    return { type: 'EMPTY', confidence: 1, reason: 'Empty utterance' };
  }

  // 1. Check for conversational fillers
  for (const pattern of FILLER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        type: 'CONVERSATIONAL_FILLER',
        confidence: 0.95,
        reason: `Conversational acknowledgment ("${trimmed}")`
      };
    }
  }

  // Combine full answer content and queue for reference
  const fullReferenceText = [
    currentAnswer || '',
    ...(teleprompterQueue || [])
  ].filter(Boolean).join(' ');

  const hasActiveAnswer = fullReferenceText.trim().length > 15;

  // 2. Interruption Check: Did the interviewer use an interruption cue?
  for (const pattern of INTERRUPTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        type: 'INTERVIEWER_INTERRUPTION',
        confidence: 0.95,
        reason: `Interruption marker matched: ${pattern}`,
        questionText: trimmed
      };
    }
  }

  // 3. When an answer is active on the teleprompter:
  if (hasActiveAnswer) {
    const { tokenOverlap, compositeScore } = calculateOverlap(trimmed, fullReferenceText);

    // A. Direct candidate recital: high token overlap with teleprompter answer
    if (compositeScore >= 0.22 || tokenOverlap >= 0.25) {
      return {
        type: 'CANDIDATE_RECITAL',
        confidence: Math.min(0.99, compositeScore + 0.3),
        overlapScore: compositeScore,
        reason: `Words match ${Math.round(compositeScore * 100)}% of teleprompted answer`
      };
    }

    // B. First-person narrative phrasing without questions = Candidate speaking/answering
    const isFirstPersonNarrative = CANDIDATE_NARRATIVE_PATTERNS.some(p => p.test(trimmed));
    const hasQuestionSign = trimmed.includes('?') || /^(what|why|how|who|when|where|which|can|could|would)\b/i.test(trimmed);

    if (isFirstPersonNarrative && !hasQuestionSign) {
      return {
        type: 'CANDIDATE_RECITAL',
        confidence: 0.85,
        overlapScore: compositeScore,
        reason: `Candidate first-person narrative statement`
      };
    }

    // C. If the speech has interrogative structure and does NOT match the answer = Interruption!
    if (hasQuestionSign) {
      return {
        type: 'INTERVIEWER_INTERRUPTION',
        confidence: 0.9,
        reason: `Third person asked question with low overlap (${Math.round(compositeScore * 100)}%)`,
        questionText: trimmed,
        overlapScore: compositeScore
      };
    }

    // D. Low overlap (> 4 words, < 12% overlap) that isn't first person -> Third person speaking
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount >= 4 && compositeScore < 0.12 && !isFirstPersonNarrative) {
      return {
        type: 'INTERVIEWER_INTERRUPTION',
        confidence: 0.8,
        reason: `Third person speech with ${Math.round(compositeScore * 100)}% overlap to current answer`,
        questionText: trimmed,
        overlapScore: compositeScore
      };
    }

    // Fallback while answer is active: default to candidate reciting to avoid ruining teleprompter
    return {
      type: 'CANDIDATE_RECITAL',
      confidence: 0.65,
      overlapScore: compositeScore,
      reason: `Defaulting to candidate speech while answer is active (overlap ${Math.round(compositeScore * 100)}%)`
    };
  }

  // 4. No active answer: Any interview utterance is an interviewer prompt/question
  return {
    type: 'INTERVIEWER_QUESTION',
    confidence: 0.9,
    reason: 'New question detected from interviewer',
    questionText: trimmed
  };
}
