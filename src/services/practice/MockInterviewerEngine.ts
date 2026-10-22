import {
  MockSessionState,
  MockRoundType,
  RehearsalPhase,
  InterviewPersona,
  TieredHint,
  RubricEvaluation,
  DeliveryMetrics,
  InterviewPressure,
  ExtractedWeakness,
  FeedbackRecord,
} from './types';
import { WeaknessMap } from './feedback/WeaknessMap';
import { RubricScorer } from './RubricScorer';
import { DeliveryCoach } from './DeliveryCoach';
import { CoachingEngine } from './CoachingEngine';
import { QuestionBank } from './QuestionBank';

export class MockInterviewerEngine {
  /**
   * Initializes a new Mock Practice Session state.
   */
  public static createSession(
    roundType: MockRoundType,
    persona: InterviewPersona = 'strict_big_tech',
    interruptionEnabled: boolean = false,
    topicMasteries?: any[],
    pressure: InterviewPressure = 'normal',
    feedbackRecords?: FeedbackRecord[]
  ): MockSessionState {
    const totalTimeSeconds = roundType === 'dress_rehearsal' ? 45 * 60 : 30 * 60;
    const initialCategory = this.getCategoryForRound(roundType, 'icebreaker');
    const initialEntry = QuestionBank.selectAdaptiveQuestion({
      type: initialCategory as 'coding' | 'system_design' | 'behavioral',
      currentDifficulty: roundType === 'dress_rehearsal' ? 2 : 3,
      topicMasteries,
    });
    const initialQuestion = initialEntry.prompt;
    const targetWeakness = this.findMatchingWeakness(
      initialQuestion,
      initialCategory,
      feedbackRecords,
      initialEntry.tags
    );

    return {
      isActive: true,
      roundType,
      rehearsalPhase: roundType === 'dress_rehearsal' ? 'icebreaker' : undefined,
      persona,
      pressure,
      feedbackRecords,
      totalTimeSeconds,
      timeRemainingSeconds: totalTimeSeconds,
      interruptionEnabled,
      isInterviewerSpeaking: false,
      interviewerThinkingSeconds: 0,
      currentQuestion: initialQuestion,
      questionHistory: [
        {
          question: initialQuestion,
          category: this.getCategoryForRound(roundType, 'icebreaker'),
          isFollowUp: false,
          candidateTranscript: '',
          hintsUsed: [],
          interruptionCount: 0,
          probeCount: 0,
          targetWeakness,
          questionId: initialEntry.id,
        },
      ],
    };
  }

  /**
   * Simulates the 2-4 second thoughtful pause real interviewers take before responding.
   */
  public static getInterviewerThinkingDelay(
    persona: InterviewPersona,
    pressure: InterviewPressure = 'normal'
  ): number {
    let base: number;
    switch (persona) {
      case 'strict_big_tech':
        base = 3.5; // Takes thorough notes
        break;
      case 'startup_pragmatist':
        base = 2.0; // Fast cadence
        break;
      case 'friendly_recruiter':
        base = 2.5;
        break;
      default:
        base = 3.0;
    }

    if (pressure === 'high') {
      // Rapid cadence under high pressure: 1.0s to 1.4s
      return Math.max(1.0, Math.round(base * 0.4 * 10) / 10);
    }
    if (pressure === 'low') {
      // Relaxed pause under low pressure: 3.0s to 5.2s
      return Math.round(base * 1.5 * 10) / 10;
    }
    return base;
  }

  /**
   * Generates a mid-answer interruption when the candidate is speaking.
   * Cuts in with targeted challenges like "Can you be more specific?"
   */
  public static checkInterruptionTrigger(
    speakingSeconds: number,
    candidateCurrentTranscript: string,
    persona: InterviewPersona,
    alreadyInterrupted: boolean = false
  ): { shouldInterrupt: boolean; promptText: string } {
    if (alreadyInterrupted) {
      return { shouldInterrupt: false, promptText: '' };
    }
    const clean = (candidateCurrentTranscript || '').trim();
    const lower = clean.toLowerCase();

    // Minimum 30 seconds of speech before first interruption and at most one interruption per answer
    if (speakingSeconds >= 30 && clean.split(/\s+/).length >= 10) {
      if (lower.includes('cache') && !lower.includes('invalidation')) {
        return {
          shouldInterrupt: true,
          promptText:
            'Sorry to cut in—can you be more specific about what your cache invalidation strategy looks like there?',
        };
      }
      if (lower.includes('we decided') || lower.includes('our team decided')) {
        return {
          shouldInterrupt: true,
          promptText:
            'Can I pause you there? What was your specific role in that decision versus the rest of the team?',
        };
      }
      if (lower.includes('microservices') || lower.includes('service')) {
        return {
          shouldInterrupt: true,
          promptText:
            'Hold on a second—what happens if one of those downstream services becomes unresponsive or times out?',
        };
      }
      if (lower.includes('optimal') || lower.includes('efficient')) {
        return {
          shouldInterrupt: true,
          promptText: 'Can you be more specific on the exact Big-O runtime that gives you?',
        };
      }

      // Default persona-specific interruption
      if (persona === 'strict_big_tech') {
        return {
          shouldInterrupt: true,
          promptText: 'Can you be more specific? Walk me through the exact failure boundary there.',
        };
      } else {
        return {
          shouldInterrupt: true,
          promptText:
            'Could you pause right there and give me a concrete example of how that worked?',
        };
      }
    }

    return { shouldInterrupt: false, promptText: '' };
  }

  /**
   * REVERSED FOLLOW-UP ENGINE: Probes the weakest part of what the candidate actually said.
   * Real interviews are decided on the 2nd and 3rd follow-up.
   */

  /**
   * Identifies if a question or topic has a recorded depth or concreteness weakness from past feedback.
   */
  public static findMatchingWeakness(
    questionText: string,
    category: string,
    feedbackRecords?: FeedbackRecord[],
    questionTags: string[] = []
  ): ExtractedWeakness | undefined {
    if (!feedbackRecords || feedbackRecords.length === 0) {
      return undefined;
    }

    const qTextLower = (questionText || '').toLowerCase();
    const candidateWeaknesses: ExtractedWeakness[] = [];

    for (const record of feedbackRecords) {
      for (const w of record.weaknesses || []) {
        if (w.skill !== 'depth' && w.skill !== 'concreteness') {
          continue;
        }

        const topicLower = (w.topic || '').trim().toLowerCase();
        if (!topicLower) continue;

        // Check 1: direct substring in question text
        if (qTextLower.includes(topicLower)) {
          candidateWeaknesses.push(w);
          continue;
        }

        // Check 2: Word boundary matching for short acronyms like 'OT'
        if (topicLower.length <= 4) {
          const regex = new RegExp(`\\b${topicLower}\\b`, 'i');
          if (regex.test(questionText)) {
            candidateWeaknesses.push(w);
            continue;
          }
        }

        // Check 3: Check question tags
        if (questionTags.some((tag) => tag.toLowerCase() === topicLower)) {
          candidateWeaknesses.push(w);
          continue;
        }

        // Check 4: Check topic aliases (e.g. 'OT' -> 'ot' / 'collaborative_editing.ot')
        const resolved = WeaknessMap.resolveTopic(w.topic);
        const matchAlias = resolved.mappedTags.some(
          (tag) =>
            qTextLower.includes(tag.toLowerCase()) ||
            questionTags.some((qt) => qt.toLowerCase() === tag.toLowerCase())
        );
        if (matchAlias) {
          candidateWeaknesses.push(w);
          continue;
        }

        // Check 5: Common expansions
        if (
          topicLower === 'ot' &&
          (qTextLower.includes('operational transformation') ||
            qTextLower.includes('collaborative'))
        ) {
          candidateWeaknesses.push(w);
          continue;
        }
      }
    }

    if (candidateWeaknesses.length === 0) {
      return undefined;
    }

    // Sort by severity (highest first) then by presence of requestedFix
    candidateWeaknesses.sort((a, b) => {
      const fixA = a.requestedFix ? 1 : 0;
      const fixB = b.requestedFix ? 1 : 0;
      if (fixB !== fixA) return fixB - fixA;
      return (b.severity || 1) - (a.severity || 1);
    });

    return candidateWeaknesses[0];
  }

  /**
   * Generates a probe targeting a recorded depth or concreteness weakness,
   * directly referencing the candidate's own words and asking for the requested fix.
   */
  public static generateTargetedWeaknessProbe(
    candidateTranscript: string,
    targetWeakness: { topic?: string; skill?: string; requestedFix?: string }
  ): { spoken: string; evidence: string } {
    const transcript = (candidateTranscript || '').trim();
    const lowerTranscript = transcript.toLowerCase();

    // 1. Find verbatim evidence from candidate's answer
    let evidence = '';
    const topic = (targetWeakness.topic || '').trim();
    if (topic) {
      const idx = lowerTranscript.indexOf(topic.toLowerCase());
      if (idx !== -1) {
        evidence = transcript.slice(idx, idx + topic.length);
      }
    }

    if (!evidence && topic.toLowerCase() === 'ot') {
      const idx = lowerTranscript.indexOf('operational transformation');
      if (idx !== -1) {
        evidence = transcript.slice(idx, idx + 'operational transformation'.length);
      }
    }

    if (!evidence) {
      // Find prominent technical terms mentioned in the answer
      const commonTerms = [
        'operational transformation',
        'caching',
        'cache',
        'redis',
        'event loop',
        'database',
        'microservices',
        'concurrency',
        'replication',
        'partitioning',
        'indexes',
        'transactions',
        'websockets',
      ];
      for (const term of commonTerms) {
        const idx = lowerTranscript.indexOf(term);
        if (idx !== -1) {
          evidence = transcript.slice(idx, idx + term.length);
          break;
        }
      }
    }

    if (!evidence) {
      const words = transcript.split(/\s+/).filter(Boolean);
      evidence = words.slice(0, Math.min(4, words.length)).join(' ');
    }

    // 2. Determine the requested fix requirement
    const fixLower = (targetWeakness.requestedFix || '').toLowerCase();
    let ask: string;

    if (fixLower.includes('example') || fixLower.includes('concrete')) {
      ask =
        'Could you walk me through a concrete worked example showing step-by-step how that behaves in practice?';
    } else if (
      fixLower.includes('number') ||
      fixLower.includes('metric') ||
      fixLower.includes('threshold') ||
      fixLower.includes('latency') ||
      fixLower.includes('quantit')
    ) {
      ask =
        'What specific numbers, throughput thresholds, or latency limits did you design for or measure?';
    } else if (
      fixLower.includes('tool') ||
      fixLower.includes('technolog') ||
      fixLower.includes('librar')
    ) {
      ask =
        'What specific tools or technologies did you select for that component, and what were the key trade-offs?';
    } else if (
      fixLower.includes('state') ||
      fixLower.includes('data model') ||
      fixLower.includes('schema')
    ) {
      ask = 'Can you describe the specific state design and data models representing that flow?';
    } else if (
      fixLower.includes('failure') ||
      fixLower.includes('crash') ||
      fixLower.includes('fault') ||
      fixLower.includes('error')
    ) {
      ask =
        'How does your architecture handle failure handling and node recovery when that component crashes?';
    } else if (
      fixLower.includes('order') ||
      fixLower.includes('sequence') ||
      fixLower.includes('concurrent')
    ) {
      ask =
        'What ordering guarantees and synchronization mechanisms do you enforce to handle concurrent mutations?';
    } else if (targetWeakness.requestedFix) {
      ask = `Could you provide a concrete worked example addressing: ${targetWeakness.requestedFix}?`;
    } else {
      ask =
        'Could you walk me through a concrete worked example with specific numbers and failure handling?';
    }

    const spoken = evidence ? `You mentioned "${evidence}". ${ask}` : ask;

    return { spoken, evidence };
  }

  public static generateWeaknessProbe(
    candidateTranscript: string,
    currentQuestion: string,
    category: string,
    targetWeakness?: ExtractedWeakness | { topic?: string; skill?: string; requestedFix?: string }
  ): string {
    if (
      targetWeakness &&
      (targetWeakness.skill === 'depth' || targetWeakness.skill === 'concreteness')
    ) {
      const targeted = this.generateTargetedWeaknessProbe(candidateTranscript, targetWeakness);
      return targeted.spoken;
    }

    const lower = (candidateTranscript || '').toLowerCase();

    // 1. CODING / DSA PROBES
    if (category === 'coding' || category === 'dsa_coding') {
      if (lower.includes('cache') || lower.includes('memo')) {
        return 'You mentioned memoization/caching. How does that impact your auxiliary space complexity, and how do you handle memory limits?';
      }
      if ((lower.includes('o(n') || lower.includes('linear')) && !lower.includes('space')) {
        return 'You mentioned the time complexity is O(N). What is your auxiliary space complexity on the call stack?';
      }
      if (!lower.includes('empty') && !lower.includes('null') && !lower.includes('single')) {
        return 'What happens to your pointer logic if the input array is completely empty or has all duplicate values?';
      }
      if (lower.includes('hash map') || lower.includes('hash table')) {
        return 'You chose a hash map here. How does hash collision affect your worst-case lookup time, and is an in-place sort preferable?';
      }
      return 'Walk me through how your solution behaves if the input contains negative numbers or integers exceeding 32-bit limits.';
    }

    // 2. SYSTEM DESIGN PROBES
    if (category === 'system_design') {
      if (lower.includes('cache') && !lower.includes('invalidation')) {
        return 'You mentioned Redis caching. What is your exact invalidation strategy—write-through, write-back, or write-around—and how do you prevent cache stampedes?';
      }
      if (lower.includes('database') && !lower.includes('index')) {
        return 'You mentioned querying the database. What exact indexing or partitioning key will you use to avoid full table scans under 10k QPS?';
      }
      if (
        !lower.includes('spof') &&
        !lower.includes('single point of failure') &&
        !lower.includes('crash')
      ) {
        return 'What is the single point of failure in this architecture right now, and what happens when the primary master node dies?';
      }
      if (lower.includes('kafka') || lower.includes('queue')) {
        return 'You placed a message queue in the write path. How do you guarantee idempotent message processing if a consumer crashes halfway through?';
      }
      return 'How does your system degrade gracefully under a sudden 10x traffic spike when downstream APIs start failing?';
    }

    // 3. BEHAVIORAL PROBES
    if (category === 'behavioral') {
      const words = lower.split(/\s+/);
      const weCount = words.filter((w) => w === 'we' || w === 'our').length;
      const iCount = words.filter((w) => w === 'i' || w === 'my').length;

      if (weCount > iCount) {
        return "You mentioned 'we decided' and 'our team solved it'. Can you isolate what you personally proposed, and what resistance you faced from peers?";
      }
      if (!/\b\d+(%|ms|k|m|users|dollars)?\b/i.test(lower)) {
        return 'You explained the process, but what was the hard quantified outcome? What metric changed, and by what percentage?';
      }
      if (!lower.includes('wrong') && !lower.includes('mistake') && !lower.includes('retrospect')) {
        return 'Looking back at that project now, what is the single biggest mistake you made, and how would you architect it differently today?';
      }
      return 'Tell me about who disagreed with your approach on that project, and how you earned their trust.';
    }

    return 'Can you elaborate on the trade-offs of that approach versus the standard alternative?';
  }

  /**
   * Advances the mock session when candidate finishes an answer.
   * Performs rubric evaluation, delivery coaching, and decides follow-up vs next round phase.
   */
  public static processAnswerSubmission(
    session: MockSessionState,
    candidateTranscript: string,
    durationSeconds: number,
    hintsUsed: TieredHint[]
  ): MockSessionState {
    const activeItem = session.questionHistory[session.questionHistory.length - 1];
    activeItem.candidateTranscript = candidateTranscript;
    activeItem.hintsUsed = [...hintsUsed];

    // Compute evidence-based rubric evaluation
    const category = (activeItem.category || 'behavioral') as
      'coding' | 'system_design' | 'behavioral';
    const evaluation = RubricScorer.evaluate({
      category,
      question: activeItem.question,
      candidateAnswer: candidateTranscript,
    });

    // Deduct points for hints used
    const hintPenalty = CoachingEngine.calculatePenalty(hintsUsed);
    evaluation.overallScore = Math.max(
      1.0,
      Math.round((evaluation.overallScore - hintPenalty) * 10) / 10
    );
    evaluation.percentage = Math.round((evaluation.overallScore / 5.0) * 100);

    // Compute speech & delivery metrics
    const delivery = DeliveryCoach.analyze(candidateTranscript, durationSeconds);

    activeItem.evaluation = evaluation;
    activeItem.delivery = delivery;

    // Count how many probes have occurred for the current root question
    let currentProbesCount = 0;
    for (let i = session.questionHistory.length - 1; i >= 0; i--) {
      if (session.questionHistory[i].isFollowUp) {
        currentProbesCount++;
      } else {
        break;
      }
    }

    const pressure = session.pressure || 'normal';
    let shouldProbe = false;

    // Strict cap: probe at most twice per question
    if (currentProbesCount < 2) {
      if (currentProbesCount === 0) {
        if (pressure === 'low') {
          shouldProbe = evaluation.overallScore < 2.4 || Boolean(activeItem.targetWeakness);
        } else if (pressure === 'normal') {
          shouldProbe = evaluation.overallScore < 4.8 || Boolean(activeItem.targetWeakness);
        } else {
          // High pressure: probe aggressively
          shouldProbe = evaluation.overallScore < 4.95 || Boolean(activeItem.targetWeakness);
        }
      } else if (currentProbesCount === 1) {
        // Second probe
        if (pressure === 'low') {
          shouldProbe = false; // Low pressure never asks a second probe
        } else if (pressure === 'normal') {
          shouldProbe = evaluation.overallScore < 4.0;
        } else {
          shouldProbe = evaluation.overallScore < 4.8;
        }
      }
    }

    let nextQuestion = '';
    let nextPhase = session.rehearsalPhase;

    if (shouldProbe) {
      let targetWeakness = activeItem.targetWeakness;
      if (!targetWeakness && currentProbesCount === 0) {
        targetWeakness = this.findMatchingWeakness(
          activeItem.question,
          category,
          session.feedbackRecords
        );
      }

      nextQuestion = this.generateWeaknessProbe(
        candidateTranscript,
        activeItem.question,
        category,
        currentProbesCount === 0 ? targetWeakness : undefined
      );

      session.questionHistory.push({
        question: nextQuestion,
        category: activeItem.category,
        isFollowUp: true,
        candidateTranscript: '',
        hintsUsed: [],
        probeCount: currentProbesCount + 1,
        targetWeakness,
      });
    } else {
      // Transition to next phase in dress rehearsal or next question
      if (session.roundType === 'dress_rehearsal') {
        const usedIds = session.questionHistory.map((q: any) => q.questionId).filter(Boolean);
        const progression = this.advanceRehearsalPhase(
          session.rehearsalPhase,
          usedIds,
          evaluation.overallScore
        );
        nextPhase = progression.nextPhase;
        nextQuestion = progression.question;

        if (nextPhase === 'wrapup') {
          // Rehearsal complete! Compile consolidated scorecard
          session.isActive = false;
          session.overallScorecard = this.generateConsolidatedScorecard(session);
        } else {
          const nextTargetWeakness = this.findMatchingWeakness(
            nextQuestion,
            progression.category,
            session.feedbackRecords
          );
          session.questionHistory.push({
            question: nextQuestion,
            category: progression.category,
            isFollowUp: false,
            candidateTranscript: '',
            hintsUsed: [],
            probeCount: 0,
            targetWeakness: nextTargetWeakness,
            questionId: progression.questionId,
          });
        }
      } else {
        // Single round completed
        session.isActive = false;
        session.overallScorecard = this.generateConsolidatedScorecard(session);
      }
    }

    return {
      ...session,
      rehearsalPhase: nextPhase,
      currentQuestion: nextQuestion || session.currentQuestion,
      interviewerThinkingSeconds: this.getInterviewerThinkingDelay(
        session.persona,
        session.pressure || 'normal'
      ),
    };
  }

  /**
   * Generates consolidated final scorecard across all answered questions.
   */
  public static generateConsolidatedScorecard(session: MockSessionState) {
    const evals = session.questionHistory
      .map((q) => q.evaluation)
      .filter(Boolean) as RubricEvaluation[];
    const deliveries = session.questionHistory
      .map((q) => q.delivery)
      .filter(Boolean) as DeliveryMetrics[];

    const avgScore =
      evals.length > 0
        ? Math.round((evals.reduce((sum, e) => sum + e.overallScore, 0) / evals.length) * 10) / 10
        : 3.0;

    const avgDeliveryScore =
      deliveries.length > 0
        ? Math.round(
            (deliveries.reduce((sum, d) => sum + d.deliveryScore, 0) / deliveries.length) * 10
          ) / 10
        : 3.5;

    let finalRating: 'Strong No Hire' | 'No Hire' | 'Leaning Hire' | 'Hire' | 'Strong Hire';
    if (avgScore >= 4.5 && avgDeliveryScore >= 4.0) finalRating = 'Strong Hire';
    else if (avgScore >= 3.8 && avgDeliveryScore >= 3.5) finalRating = 'Hire';
    else if (avgScore >= 3.0) finalRating = 'Leaning Hire';
    else if (avgScore >= 2.0) finalRating = 'No Hire';
    else finalRating = 'Strong No Hire';

    const allFixes = evals.flatMap((e) => e.topLeverageFixes);
    const topImprovementPriorities = Array.from(new Set(allFixes)).slice(0, 3);

    return {
      finalRating,
      averageScore: avgScore,
      deliveryScore: avgDeliveryScore,
      keyStrengths: [
        avgScore >= 3.5
          ? 'Demonstrated clear technical vocabulary'
          : 'Maintained professional composure',
        avgDeliveryScore >= 3.5
          ? 'Good conversational pace without excessive fillers'
          : 'Kept within answer time limits',
      ],
      topImprovementPriorities:
        topImprovementPriorities.length > 0
          ? topImprovementPriorities
          : ['Practice explicitly stating Big-O Time & Auxiliary Space before typing code.'],
    };
  }

  // ─────────────────────────────────────────────────────────────
  // REHEARSAL SEQUENCE HELPERS
  // ─────────────────────────────────────────────────────────────
  private static getInitialQuestion(roundType: MockRoundType): string {
    switch (roundType) {
      case 'dress_rehearsal':
        return "Hi there, thanks for coming in today. To kick things off, could you give me a brief overview of your background and what you've been working on recently?";
      case 'dsa_coding':
        return "Given an array of integers 'nums' and an integer 'target', return indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution, and you may not use the same element twice. How would you approach this?";
      case 'system_design':
        return 'Design a scalable URL shortening service like TinyURL. It should handle 100M new URLs per day with low latency redirection and 99.99% availability. How would you start?';
      case 'behavioral':
        return 'Tell me about a time you had a technical disagreement with another engineer or product manager. How did you handle it and what was the resolution?';
      case 'role_specific':
        return 'Can you describe the architectural anatomy of a high-concurrency Node.js / React application and how you debug memory leaks or event loop blockages?';
    }
  }

  private static getCategoryForRound(roundType: MockRoundType, phase?: RehearsalPhase): string {
    if (roundType === 'dress_rehearsal') {
      if (phase === 'icebreaker' || phase === 'behavioral') return 'behavioral';
      if (phase === 'technical') return 'coding';
      return 'behavioral';
    }
    if (roundType === 'dsa_coding') return 'coding';
    if (roundType === 'system_design') return 'system_design';
    return 'behavioral';
  }

  public static advanceRehearsalPhase(
    currentPhase?: RehearsalPhase,
    excludedIds: string[] = [],
    previousScore?: number,
    topicMasteries?: any[]
  ): {
    nextPhase: RehearsalPhase;
    question: string;
    category: string;
    questionId: string;
  } {
    switch (currentPhase) {
      case 'icebreaker': {
        const q = QuestionBank.selectAdaptiveQuestion({
          type: 'behavioral',
          previousScore,
          excludedIds,
          topicMasteries,
        });
        return {
          nextPhase: 'behavioral',
          question: q.prompt,
          category: 'behavioral',
          questionId: q.id,
        };
      }
      case 'behavioral': {
        const q = QuestionBank.selectAdaptiveQuestion({
          type: 'coding',
          previousScore,
          excludedIds,
          topicMasteries,
        });
        return {
          nextPhase: 'technical',
          question: q.prompt,
          category: 'coding',
          questionId: q.id,
        };
      }
      case 'technical': {
        const q = QuestionBank.selectAdaptiveQuestion({
          type: 'system_design',
          previousScore,
          excludedIds,
          topicMasteries,
        });
        return {
          nextPhase: 'candidate_qa',
          question: q.prompt,
          category: 'system_design',
          questionId: q.id,
        };
      }
      case 'candidate_qa':
      default:
        return {
          nextPhase: 'wrapup',
          question:
            "That concludes our 45-minute dress rehearsal. Let's review your overall rubric breakdown.",
          category: 'behavioral',
          questionId: 'wrapup',
        };
    }
  }

  private static _legacyAdvance(currentPhase?: RehearsalPhase) {
    switch (currentPhase) {
      case 'icebreaker':
        return {
          nextPhase: 'behavioral',
          question:
            'Tell me about a time you led a challenging engineering initiative that carried high ambiguity or production risk. What was your specific action and what was the result?',
          category: 'behavioral',
        };
      case 'behavioral':
        return {
          nextPhase: 'technical',
          question:
            "Let's move into our technical evaluation. Design a real-time collaborative document editing system (like Google Docs or Notion). What are the functional requirements, scale estimates, and conflict resolution strategy you would employ?",
          category: 'system_design',
        };
      case 'technical':
        return {
          nextPhase: 'candidate_qa',
          question:
            'We have about 5 minutes left. What questions do you have for me about our engineering architecture, team culture, or roadmap?',
          category: 'behavioral',
        };
      case 'candidate_qa':
      default:
        return {
          nextPhase: 'wrapup',
          question:
            "Thank you for the thorough discussion today! Let's review your performance scorecard and delivery diagnostics.",
          category: 'behavioral',
        };
    }
  }
}
