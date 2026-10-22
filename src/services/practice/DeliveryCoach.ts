import { DeliveryMetrics } from './types';

const COMMON_FILLERS = [
  'um',
  'uh',
  'er',
  'ah',
  'like',
  'basically',
  'actually',
  'you know',
  'sort of',
  'kind of',
  'i mean',
  'right',
];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface DeliveryTimingData {
  timeToFirstWordSeconds?: number;
  longestPauseSeconds?: number;
  segments?: Array<{ start: number; end: number; text?: string }>;
}

export class DeliveryCoach {
  /**
   * Computes time-to-first-word and longest pause directly from Whisper / VAD segment timestamps.
   * Never uses hardcoded default values.
   */
  public static computeTimestampsFromSegments(
    segments: Array<{ start: number; end: number; text?: string }> = []
  ): { timeToFirstWordSeconds: number; longestPauseSeconds: number } {
    if (!segments || segments.length === 0) {
      return { timeToFirstWordSeconds: 0, longestPauseSeconds: 0 };
    }

    const valid = segments.filter((s) => s.text === undefined || s.text.trim().length > 0);

    if (valid.length === 0) {
      return { timeToFirstWordSeconds: 0, longestPauseSeconds: 0 };
    }

    const timeToFirstWordSeconds = Math.max(0, valid[0].start);
    let longestPauseSeconds = 0;

    for (let i = 1; i < valid.length; i++) {
      const pause = Math.max(0, valid[i].start - valid[i - 1].end);
      if (pause > longestPauseSeconds) {
        longestPauseSeconds = pause;
      }
    }

    return {
      timeToFirstWordSeconds: Math.round(timeToFirstWordSeconds * 100) / 100,
      longestPauseSeconds: Math.round(longestPauseSeconds * 100) / 100,
    };
  }

  /**
   * Computes time-to-first-word and longest pause from VAD speech intervals.
   */
  public static computeTimestampsFromVAD(
    speechIntervals: Array<{ start: number; end: number }> = [],
    sessionStartTimestamp: number = 0
  ): { timeToFirstWordSeconds: number; longestPauseSeconds: number } {
    if (!speechIntervals || speechIntervals.length === 0) {
      return { timeToFirstWordSeconds: 0, longestPauseSeconds: 0 };
    }

    const firstStart = Math.max(0, (speechIntervals[0].start - sessionStartTimestamp) / 1000);
    let longestPause = 0;

    for (let i = 1; i < speechIntervals.length; i++) {
      const pause = Math.max(0, (speechIntervals[i].start - speechIntervals[i - 1].end) / 1000);
      if (pause > longestPause) {
        longestPause = pause;
      }
    }

    return {
      timeToFirstWordSeconds: Math.round(firstStart * 100) / 100,
      longestPauseSeconds: Math.round(longestPause * 100) / 100,
    };
  }

  /**
   * Analyzes an answer transcript and timing metrics to produce speech & delivery insights.
   * Word boundaries are safely escaped to prevent regex injection or double-escaping bugs.
   * Timing data is computed from VAD/Whisper timestamps without hardcoded fallbacks.
   */
  public static analyze(
    transcript: string,
    durationSeconds: number,
    timingInput?: number | DeliveryTimingData
  ): DeliveryMetrics {
    let timeToFirstWordSeconds = 0;
    let longestPauseSeconds = 0;

    if (typeof timingInput === 'number') {
      timeToFirstWordSeconds = Math.max(0, timingInput);
    } else if (timingInput) {
      if (timingInput.segments && timingInput.segments.length > 0) {
        const computed = this.computeTimestampsFromSegments(timingInput.segments);
        timeToFirstWordSeconds = computed.timeToFirstWordSeconds;
        longestPauseSeconds = computed.longestPauseSeconds;
      } else {
        timeToFirstWordSeconds = Math.max(0, timingInput.timeToFirstWordSeconds || 0);
        longestPauseSeconds = Math.max(0, timingInput.longestPauseSeconds || 0);
      }
    }

    const cleanText = (transcript || '').trim();
    if (!cleanText || durationSeconds <= 0) {
      return {
        durationSeconds: Math.max(0, durationSeconds),
        wordCount: 0,
        speakingPaceWpm: 0,
        paceCategory: 'slow',
        fillerWordsCount: 0,
        fillerPercentage: 0,
        fillerBreakdown: {},
        timeToFirstSentenceSeconds: timeToFirstWordSeconds,
        isRambling: false,
        deliveryScore: 3,
        deliveryFeedback: 'No speech detected in answer.',
      };
    }

    const words = cleanText.split(/\s+/).filter((w) => w.length > 0);
    const wordCount = words.length;

    // Calculate pace (WPM)
    const effectiveMinutes = durationSeconds / 60;
    const speakingPaceWpm = effectiveMinutes > 0 ? Math.round(wordCount / effectiveMinutes) : 0;

    let paceCategory: 'slow' | 'optimal' | 'fast' = 'optimal';
    if (speakingPaceWpm < 115) {
      paceCategory = 'slow';
    } else if (speakingPaceWpm > 165) {
      paceCategory = 'fast';
    }

    // Detect filler words using properly escaped single-slash word boundaries
    const fillerBreakdown: Record<string, number> = {};
    let fillerWordsCount = 0;

    for (const filler of COMMON_FILLERS) {
      const escaped = escapeRegex(filler);
      // Valid word boundary regex, works for single words and multiword phrases
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      const matches = cleanText.match(regex);
      if (matches && matches.length > 0) {
        fillerBreakdown[filler] = matches.length;
        fillerWordsCount += matches.length;
      }
    }

    const fillerPercentage =
      wordCount > 0 ? Number(((fillerWordsCount / wordCount) * 100).toFixed(1)) : 0;
    // Rambling flag at the 120-second boundary
    const isRambling = durationSeconds > 120;

    // Scoring heuristic (1.0 to 5.0)
    let score = 5;

    // Deduct for pace extremes
    if (paceCategory === 'fast') score -= 0.8;
    if (paceCategory === 'slow') score -= 0.5;

    // Deduct for fillers
    if (fillerPercentage > 6.0) score -= 1.5;
    else if (fillerPercentage > 3.5) score -= 0.8;
    else if (fillerPercentage > 1.5) score -= 0.3;

    // Deduct for rambling
    if (durationSeconds > 180) score -= 1.5;
    else if (durationSeconds > 120) score -= 0.8;

    // Deduct for long hesitation before starting
    if (timeToFirstWordSeconds > 5.0) score -= 0.6;

    const deliveryScore = Math.max(1, Math.min(5, Math.round(score * 10) / 10));

    // Construct clear, actionable feedback summary
    const feedbackParts: string[] = [];

    feedbackParts.push(
      `Pace: ${speakingPaceWpm} WPM (${
        paceCategory === 'optimal'
          ? 'ideal conversational range'
          : paceCategory === 'fast'
            ? 'rushed, consider breathing pauses'
            : 'deliberate, but could pick up tempo'
      }).`
    );

    if (fillerWordsCount > 0) {
      const topFillers = Object.entries(fillerBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([w, c]) => `"${w}" (${c}x)`)
        .join(', ');
      feedbackParts.push(
        `Filler words: ${fillerWordsCount} (${fillerPercentage}% of speech), most frequent: ${topFillers}.`
      );
    } else {
      feedbackParts.push('Clean articulation: 0 filler words detected.');
    }

    if (isRambling) {
      const mins = Math.floor(durationSeconds / 60);
      const secs = Math.round(durationSeconds % 60);
      feedbackParts.push(
        `Answer length was ${mins}m ${secs}s (exceeded the 2-minute target mark). Focus on structuring with early headlines to avoid rambling.`
      );
    } else {
      feedbackParts.push(`Duration: ${Math.round(durationSeconds)}s (crisp and concise).`);
    }

    if (timeToFirstWordSeconds > 0) {
      feedbackParts.push(`Time to first word: ${timeToFirstWordSeconds.toFixed(1)}s.`);
    }

    if (longestPauseSeconds > 3.0) {
      feedbackParts.push(`Longest pause: ${longestPauseSeconds.toFixed(1)}s (felt noticeable).`);
    }

    return {
      durationSeconds: Math.round(durationSeconds * 10) / 10,
      wordCount,
      speakingPaceWpm,
      paceCategory,
      fillerWordsCount,
      fillerPercentage,
      fillerBreakdown,
      timeToFirstSentenceSeconds: Math.round(timeToFirstWordSeconds * 10) / 10,
      isRambling,
      deliveryScore,
      deliveryFeedback: feedbackParts.join(' '),
    };
  }
}
