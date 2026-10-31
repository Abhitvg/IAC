/**
 * responseStyle.ts
 *
 * Core response style configuration, question intent classifier, and conversational
 * prompt builder for the Live Copilot answer generation pipeline (IAC 2.0).
 *
 * Enforces natural, spoken English that sounds like a knowledgeable software engineer
 * conversing with another engineer during a technical interview.
 * Grounded in implementation-depth mechanisms without superficial corporate buzzwords.
 */

export type QuestionIntent =
  | 'definition'
  | 'conceptual'
  | 'comparison'
  | 'implementation'
  | 'troubleshooting'
  | 'coding'
  | 'system_design'
  | 'distributed_systems'
  | 'databases_sql'
  | 'os_networking'
  | 'runtime_internals'
  | 'cloud_devops'
  | 'testing_reliability'
  | 'security'
  | 'behavioral'
  | 'resume'
  | 'quiz'
  | 'follow_up';

export interface LengthTarget {
  minWords: number;
  maxWords: number;
  targetDescription: string;
  recommendedMaxTokens: number;
}

export const LENGTH_TARGETS: Record<QuestionIntent, LengthTarget> = {
  definition: {
    minWords: 30,
    maxWords: 50,
    targetDescription: '30–50 words (direct definition + essential purpose)',
    recommendedMaxTokens: 300,
  },
  conceptual: {
    minWords: 50,
    maxWords: 90,
    targetDescription: '50–90 words (direct answer + core mechanism + 1 practical example)',
    recommendedMaxTokens: 450,
  },
  comparison: {
    minWords: 60,
    maxWords: 100,
    targetDescription: '60–100 words (direct contrast + trade-offs / when to choose which)',
    recommendedMaxTokens: 500,
  },
  implementation: {
    minWords: 70,
    maxWords: 130,
    targetDescription: '70–130 words (concrete data structures, lifecycle, and operational mechanism)',
    recommendedMaxTokens: 600,
  },
  troubleshooting: {
    minWords: 70,
    maxWords: 130,
    targetDescription: '70–130 words (practical diagnostic sequence + root-cause isolation)',
    recommendedMaxTokens: 600,
  },
  system_design: {
    minWords: 100,
    maxWords: 180,
    targetDescription: '100–180 words (high-level components, data flow, key bottlenecks/trade-offs)',
    recommendedMaxTokens: 900,
  },
  distributed_systems: {
    minWords: 100,
    maxWords: 180,
    targetDescription: '100–180 words (consensus, partitioning, retries, idempotency boundaries)',
    recommendedMaxTokens: 900,
  },
  databases_sql: {
    minWords: 60,
    maxWords: 120,
    targetDescription: '60–120 words (indexes, transactions, isolation levels, write costs)',
    recommendedMaxTokens: 550,
  },
  os_networking: {
    minWords: 50,
    maxWords: 100,
    targetDescription: '50–100 words (concurrency, memory models, protocol semantics)',
    recommendedMaxTokens: 500,
  },
  runtime_internals: {
    minWords: 60,
    maxWords: 110,
    targetDescription: '60–110 words (event loop phases, memory management, thread-safety)',
    recommendedMaxTokens: 550,
  },
  cloud_devops: {
    minWords: 50,
    maxWords: 100,
    targetDescription: '50–100 words (infrastructure boundaries, deployments, observability)',
    recommendedMaxTokens: 500,
  },
  testing_reliability: {
    minWords: 60,
    maxWords: 120,
    targetDescription: '60–120 words (invariants, regression tests, flaky failure diagnosis)',
    recommendedMaxTokens: 550,
  },
  security: {
    minWords: 60,
    maxWords: 120,
    targetDescription: '60–120 words (threat vectors, token boundaries, encryption at rest/transit)',
    recommendedMaxTokens: 550,
  },
  behavioral: {
    minWords: 80,
    maxWords: 140,
    targetDescription: '80–140 words (grounded in verified candidate resume experience via concise STAR)',
    recommendedMaxTokens: 650,
  },
  resume: {
    minWords: 80,
    maxWords: 140,
    targetDescription: '80–140 words (grounded strictly in provided resume background, zero fabrication)',
    recommendedMaxTokens: 650,
  },
  follow_up: {
    minWords: 30,
    maxWords: 70,
    targetDescription: '30–70 words (focused, direct elaboration referencing prior answer context)',
    recommendedMaxTokens: 350,
  },
  coding: {
    minWords: 40,
    maxWords: 80,
    targetDescription: 'Complete verified code block + 40–80 words concise verbal walkthrough',
    recommendedMaxTokens: 3500,
  },
  quiz: {
    minWords: 30,
    maxWords: 60,
    targetDescription: '30–60 words (lead with correct option + plain reasoning)',
    recommendedMaxTokens: 400,
  },
};

/**
 * Classifies the intent of a question using pattern matching and active UI mode.
 */
export function classifyQuestionIntent(
  question: string,
  activeMode: 'coding' | 'interview' | 'quiz' = 'interview',
  hasPriorContext: boolean = false
): QuestionIntent {
  const q = (question || '').trim();
  const lowerQ = q.toLowerCase();

  // 1. Explicit Quiz / MCQ detection
  if (
    activeMode === 'quiz' ||
    /\b(which of the following|choose the correct|select the correct|select one option|which statement is true|which statement is false)\b/i.test(lowerQ) ||
    /(?:^|\n)\s*[A-D]\)\s+/i.test(q) ||
    /\bOption\s+[A-D]\b/i.test(q)
  ) {
    return 'quiz';
  }

  // 2. Behavioral questions (STAR method)
  if (
    /\b(tell me about a time|give me an example of|describe a situation|how do you handle conflict|most challenging project|tell me about a challenging|time you failed|biggest mistake|proudest accomplishment|disagreement with a coworker|faced a tight deadline)\b/i.test(
      lowerQ
    )
  ) {
    return 'behavioral';
  }

  // 3. Resume / candidate background questions
  if (
    /\b(walk me through your resume|tell me about your background|what did you do at|your experience with|your role at|tell me about yourself|describe your current role)\b/i.test(
      lowerQ
    )
  ) {
    return 'resume';
  }

  // 4. System Design & Distributed Systems
  const isDistributed =
    /\b(distributed systems?|idempotenc[ye]|consensus|raft|paxos|cap theorem|event-driven|message queue|kafka|rabbitmq|sharding|split brain|two phase commit|2pc|saga pattern)\b/i.test(
      lowerQ
    );

  const isSystemDesign =
    /\b(design a\b|design an\b|how would you design|system design|architecture for|scale to \d+|architect a\b|high-level architecture)\b/i.test(
      lowerQ
    );

  if (isSystemDesign) {
    return 'system_design';
  }
  if (isDistributed) {
    return 'distributed_systems';
  }

  // 5. Troubleshooting & Debugging
  if (
    /\b(how (?:do you|would you|to) (?:debug|troubleshoot|diagnose)|production incident|memory leak|high cpu usage|investigate an issue|root cause analysis|fix a bug in production)\b/i.test(
      lowerQ
    )
  ) {
    if (/\b(flaky tests?|test suite|ci failure|ci\/cd|pipeline)\b/i.test(lowerQ)) {
      return 'testing_reliability';
    }
    return 'troubleshooting';
  }

  // 6. Security questions
  if (
    /\b(oauth|jwt|csrf|xss|sql injection|zero trust|authentication vs authorization|mtls|encryption at rest|cors policy|rate limit security)\b/i.test(
      lowerQ
    )
  ) {
    return 'security';
  }

  // 7. Testing & Reliability
  if (
    /\b(flaky tests?|property-based tests?|stress tests?|load tests?|integration tests? vs unit tests?|chaos engineering|test invariants?|mock vs stub|ci\/cd|ci pipeline)\b/i.test(
      lowerQ
    )
  ) {
    return 'testing_reliability';
  }

  // 8. Databases & SQL (Specific mechanisms: MVCC, indexes, isolation levels, query plans)
  if (
    /\b(acid properties|mvcc|b-tree index|postgresql|mysql|database isolation levels?|optimistic locking|pessimistic locking|foreign key constraint|query plan|explain analyze)\b/i.test(
      lowerQ
    )
  ) {
    if (/^what is\b|^define\b/i.test(lowerQ) && lowerQ.length < 40) {
      return 'definition';
    }
    return 'databases_sql';
  }

  // 9. Language & Runtime Internals
  if (
    /\b(event loop|microtasks?|garbage collection|jvm memory|java memory model|volatile|synchronized|atomicreference|happens-before|goroutine|v8 engine|thread pool in node)\b/i.test(
      lowerQ
    )
  ) {
    if (/^what is\b|^define\b/i.test(lowerQ) && lowerQ.length < 40) {
      return 'definition';
    }
    return 'runtime_internals';
  }

  // 10. OS & Networking
  if (
    /\b(deadlock|virtual memory|page fault|semaphore vs mutex|tcp handshake|tcp vs udp|dns resolution|socket buffer|context switch)\b/i.test(
      lowerQ
    )
  ) {
    if (/^what is\b|^define\b/i.test(lowerQ) && lowerQ.length < 40) {
      return 'definition';
    }
    return 'os_networking';
  }

  // 11. Comparison questions
  if (
    /\b(difference between|differences between|vs\.?|versus|compare and contrast|how does .+ differ from|when would you (use|choose) .+ (over|instead of))\b/i.test(
      lowerQ
    )
  ) {
    return 'comparison';
  }

  // 12. Implementation questions
  if (
    /\b(operational transformation|crdt|how do you implement|how does .+ work under the hood|how does .+ handle|lifecycle of|how is .+ implemented)\b/i.test(
      lowerQ
    )
  ) {
    return 'implementation';
  }

  // 13. Coding questions
  const hasExplicitCodeRequest =
    /\b(write a function|write code|implement a|solve this|write an algorithm|find the|given an array|given a string|given a tree|given two|leetcode|two sum|reverse a|merge two|binary search algorithm|depth first search implementation)\b/i.test(
      lowerQ
    );

  if (activeMode === 'coding') {
    if (
      /\b(what is the time complexity|time complexity of|space complexity of|what is|define)\b/i.test(
        lowerQ
      ) &&
      !hasExplicitCodeRequest
    ) {
      return 'definition';
    }
    return 'coding';
  }

  if (activeMode === 'interview' && hasExplicitCodeRequest) {
    return 'coding';
  }

  // 14. Follow-up detection (short contextual probe during ongoing interview)
  if (
    hasPriorContext &&
    (lowerQ.length < 45 ||
      /^(why\?|how so\?|what about|and then\?|can you elaborate|what if|how would that scale\?)/i.test(
        lowerQ
      ))
  ) {
    return 'follow_up';
  }

  // 15. Simple definition / Complexity check
  if (
    /^(what is\b|what are\b|define\b|what does .+ mean\b|meaning of\b|what is the time complexity of\b|time complexity of\b|space complexity of\b)/i.test(
      lowerQ
    )
  ) {
    return 'definition';
  }

  // 16. Default: conceptual explanation
  return 'conceptual';
}

/**
 * Builds the conversational response prompt guidelines for the active interaction mode and intent.
 */
export function buildConversationalPromptSection(
  intent: QuestionIntent,
  mode: 'coding' | 'interview' | 'quiz',
  preferredLanguage: string = 'Java'
): string {
  const target = LENGTH_TARGETS[intent] || LENGTH_TARGETS.conceptual;

  if (mode === 'quiz' || intent === 'quiz') {
    return `════════════ ACTIVE MODE: QUIZ & MULTIPLE CHOICE ASSESSMENT (MCQ) ════════════
Deliver the answer with immediate, crystal-clear precision:
Target word count: ${target.minWords}–${target.maxWords} words.

✅ CORRECT ANSWER:
**Option [A / B / C / D]: [Exact Text of Correct Option]**

💡 DIRECT PROOF & REASONING:
[1-2 sentences explaining why this option is correct in plain, direct English]

❌ WHY OTHER OPTIONS ARE INCORRECT:
- [Option]: [Brief 1-phrase explanation of why it is incorrect or misleading]`;
  }

  if (mode === 'coding' || intent === 'coding') {
    return `════════════ ACTIVE MODE: CODING CHALLENGE (${preferredLanguage}) ════════════
CRITICAL TECHNICAL ACCURACY & CONVERSATIONAL DELIVERY MANDATE:
1. COMPLETE, RUNNABLE CODE BLOCK:
   - Provide the complete, compilable solution in ${preferredLanguage} inside a single markdown code block (\`\`\`${preferredLanguage.toLowerCase()} ... \`\`\`).
   - ZERO PLACEHOLDERS: NEVER use '// TODO', '...', or omit helper methods. Every function must be 100% implemented.
   - ONLINE ASSESSMENT READY: Include all necessary imports, class wrapper (e.g. 'class Solution'), boundary checks (null, empty, bounds, integer overflow).
   - State Time Complexity O(...) and Space Complexity O(...) upfront with a brief mathematical justification.

2. CONVERSATIONAL SPOKEN EXPLANATION (${target.minWords}–${target.maxWords} words):
   - Provide a crisp, natural verbal walkthrough suitable for speaking to an interviewer while coding.
   - Answer directly in the first sentence with the core intuition and chosen optimal pattern.
   - Do NOT recite boilerplate or mention unrelated patterns. Keep it natural, conversational, and direct.`;
  }

  // Interview mode: Conversational spoken responses
  return `════════════ CONVERSATIONAL SPOKEN INTERVIEW RESPONSE STYLE ════════════
You are an experienced software engineer answering an interview question verbally.
The teleprompter shows your response to be spoken aloud naturally.

DEFAULT 5-STEP SPOKEN RESPONSE FRAMEWORK (Adapt to question complexity):
1. DIRECT ANSWER: ANSWER DIRECTLY IN SENTENCE 1. State the core idea or principle immediately.
2. MECHANISM: Explain how the underlying data structures, protocol, or runtime operates in clear English.
3. CONCRETE EXAMPLE: Give ONE PRACTICAL REAL-WORLD EXAMPLE demonstrating the mechanism.
4. TRADE-OFF: Address the primary cost, operational bottleneck, or design alternative ("The trade-off is...").
5. CLOSE: Finish with a practical concluding thought.
(Note: A simple definition may only need steps 1 and 3; do not pad artificially.)

PRIMARY SPOKEN DIRECTIVES:
- NATURAL SPOKEN ENGLISH: Sound like a competent engineer explaining something to a peer over coffee. Use natural contractions ("it's", "you'd", "we've", "I'd").
- Short, varied sentences (10 to 20 words each) that are easy to say aloud.
- Use natural transitional connectors ("For example,", "The main benefit is", "The trade-off is", "In practice,").
- Prefer ONE PRACTICAL REAL-WORLD EXAMPLE over long laundry lists of services or definitions.

STRICT PROHIBITIONS:
- NO textbook-style bullet lists or numbered lists in spoken interview answers (weave points into natural conversational prose).
- NO markdown headers (#, ##, ###) or bold wall-of-text in spoken responses.
- NO corporate buzzwords, NO cliché AI filler ("It is important to note", "In today's rapidly evolving landscape", "In conclusion").
- NO emojis in spoken teleprompter text.
- NO FABRICATION: Never invent companies, job titles, responsibilities, project metrics, or personal experiences not verified in the candidate background. Speak in the first person ("I", "in my approach") when explaining personal decisions or verified experience; explain general technical concepts objectively and conversationally.

TARGET WORD COUNT CALIBRATION:
- Detected Question Type: ${intent.toUpperCase()}
- Target Length: ${target.minWords}–${target.maxWords} words (${target.targetDescription}).
- Keep answers punchy so the interview remains a dialogue, not an exhausting monologue.

════════════ IMPLEMENTATION-DEPTH EXAMPLES & BENCHMARKS ════════════
Example 1: "What is AWS?"
Target Spoken Answer:
"AWS is Amazon's cloud platform that provides on-demand computing, storage, and networking without managing physical data centers. For example, instead of racking a server, you spin up an EC2 instance or deploy to S3 in minutes. The trade-off is that cloud costs can escalate quickly if architecture and auto-scaling aren't actively monitored."

Example 2: "How do you handle duplicate requests in a distributed system?"
Target Spoken Answer:
"I'd use an idempotency key for operations that must not execute twice. For example, when a payment request times out, the client can retry using the same key. The server checks whether that key already has a stored result in Redis or PostgreSQL and returns the existing result instead of charging the customer again. The key and result need to be persisted atomically with the operation, and the system must define a sensible TTL like 24 hours."

Example 3: "What is the difference between volatile and synchronized in Java?"
Target Spoken Answer:
"Volatile guarantees visibility and ordering across threads, while synchronized guarantees both visibility and mutual exclusion. When a variable is volatile, writes are immediately flushed to main memory and reads bypass CPU caches using memory barriers, but compound operations like count++ are still not atomic. Synchronized uses a monitor lock so only one thread executes the block at a time, protecting compound state transitions at the cost of thread contention overhead."`;
}
