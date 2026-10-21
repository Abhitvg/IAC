import { DeliveryMetrics } from "./types";

const COMMON_FILLERS = [
  "um",
  "uh",
  "er",
  "ah",
  "like",
  "basically",
  "actually",
  "you know",
  "sort of",
  "kind of",
  "i mean",
  "right",
];

export class DeliveryCoach {
  /**
   * Analyzes an answer transcript and timing metrics to produce speech & delivery insights.
   */
  public static analyze(
    transcript: string,
    durationSeconds: number,
    timeToFirstSentenceSeconds: number = 1.5
  ): DeliveryMetrics {
    const cleanText = (transcript || "").trim();
    if (!cleanText || durationSeconds <= 0) {
      return {
        durationSeconds: Math.max(1, durationSeconds),
        wordCount: 0,
        speakingPaceWpm: 0,
        paceCategory: "slow",
        fillerWordsCount: 0,
        fillerPercentage: 0,
        fillerBreakdown: {},
        timeToFirstSentenceSeconds,
        isRambling: false,
        deliveryScore: 3,
        deliveryFeedback: "No speech detected in answer.",
      };
    }

    const words = cleanText.split(/\s+/).filter((w) => w.length > 0);
    const wordCount = words.length;

    // Calculate pace (WPM)
    const effectiveMinutes = Math.max(durationSeconds / 60, 0.1);
    const speakingPaceWpm = Math.round(wordCount / effectiveMinutes);

    let paceCategory: "slow" | "optimal" | "fast" = "optimal";
    if (speakingPaceWpm < 115) {
      paceCategory = "slow";
    } else if (speakingPaceWpm > 165) {
      paceCategory = "fast";
    }

    // Detect filler words
    const fillerBreakdown: Record<string, number> = {};
    let fillerWordsCount = 0;

    for (const filler of COMMON_FILLERS) {
      // Regex for whole word match
      const regex = new RegExp(`\\b${filler}\\b`, "gi");
      const matches = cleanText.match(regex);
      if (matches && matches.length > 0) {
        fillerBreakdown[filler] = matches.length;
        fillerWordsCount += matches.length;
      }
    }

    const fillerPercentage =
      wordCount > 0 ? Number(((fillerWordsCount / wordCount) * 100).toFixed(1)) : 0;
    const isRambling = durationSeconds > 120; // Flags answers longer than 2 minutes

    // Scoring heuristic (1.0 to 5.0)
    let score = 5;

    // Deduct for pace extremes
    if (paceCategory === "fast") score -= 0.8;
    if (paceCategory === "slow") score -= 0.5;

    // Deduct for fillers
    if (fillerPercentage > 6.0) score -= 1.5;
    else if (fillerPercentage > 3.5) score -= 0.8;
    else if (fillerPercentage > 1.5) score -= 0.3;

    // Deduct for rambling
    if (durationSeconds > 180) score -= 1.5;
    else if (durationSeconds > 120) score -= 0.8;

    // Deduct for long hesitation before starting
    if (timeToFirstSentenceSeconds > 5.0) score -= 0.6;

    const deliveryScore = Math.max(1, Math.min(5, Math.round(score * 10) / 10));

    // Construct clear, actionable feedback summary
    const feedbackParts: string[] = [];

    feedbackParts.push(
      `Pace: ${speakingPaceWpm} WPM (${paceCategory === "optimal" ? "ideal conversational range" : paceCategory === "fast" ? "rushed, consider breathing pauses" : "deliberate, but could pick up tempo"}).`
    );

    if (fillerWordsCount > 0) {
      const topFillers = Object.entries(fillerBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([w, c]) => `"${w}" (${c}x)`)
        .join(", ");
      feedbackParts.push(
        `Filler words: ${fillerWordsCount} (${fillerPercentage}% of speech), most frequent: ${topFillers}.`
      );
    } else {
      feedbackParts.push("Clean articulation: 0 filler words detected.");
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

    return {
      durationSeconds: Math.round(durationSeconds * 10) / 10,
      wordCount,
      speakingPaceWpm,
      paceCategory,
      fillerWordsCount,
      fillerPercentage,
      fillerBreakdown,
      timeToFirstSentenceSeconds: Math.round(timeToFirstSentenceSeconds * 10) / 10,
      isRambling,
      deliveryScore,
      deliveryFeedback: feedbackParts.join(" "),
    };
  }
}
