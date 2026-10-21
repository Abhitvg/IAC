import { describe, it, expect } from "vitest";
import { DeliveryCoach } from "../../src/services/practice/DeliveryCoach";
import * as fs from "fs";
import * as path from "path";

describe("DeliveryCoach Correctness", () => {
  it("calculates exact word counts correctly handling whitespace and punctuation", () => {
    const text = "This is a simple seven word sentence.";
    const result = DeliveryCoach.analyze(text, 10);
    expect(result.wordCount).toBe(7);

    const multilineText = "One   two\n\nthree\tfour    five.";
    const multilineResult = DeliveryCoach.analyze(multilineText, 10);
    expect(multilineResult.wordCount).toBe(5);
  });

  it("handles empty or whitespace-only transcripts gracefully", () => {
    const emptyResult = DeliveryCoach.analyze("", 0);
    expect(emptyResult.wordCount).toBe(0);
    expect(emptyResult.speakingPaceWpm).toBe(0);
    expect(emptyResult.fillerWordsCount).toBe(0);
    expect(emptyResult.isRambling).toBe(false);
    expect(emptyResult.timeToFirstSentenceSeconds).toBe(0);
    expect(emptyResult.deliveryFeedback).toContain("No speech detected");

    const whitespaceResult = DeliveryCoach.analyze("   \n\t   ", 45);
    expect(whitespaceResult.wordCount).toBe(0);
    expect(whitespaceResult.speakingPaceWpm).toBe(0);
    expect(whitespaceResult.fillerWordsCount).toBe(0);
    expect(whitespaceResult.isRambling).toBe(false);
  });

  it("calculates WPM accurately from known durations", () => {
    // 120 words in 60 seconds = 120 WPM
    const words120 = new Array(120).fill("word").join(" ");
    const result60s = DeliveryCoach.analyze(words120, 60);
    expect(result60s.speakingPaceWpm).toBe(120);
    expect(result60s.paceCategory).toBe("optimal");

    // 90 words in 45 seconds = 120 WPM (90 / 0.75m)
    const words90 = new Array(90).fill("word").join(" ");
    const result45s = DeliveryCoach.analyze(words90, 45);
    expect(result45s.speakingPaceWpm).toBe(120);

    // 80 words in 60 seconds = 80 WPM (slow)
    const words80 = new Array(80).fill("word").join(" ");
    const resultSlow = DeliveryCoach.analyze(words80, 60);
    expect(resultSlow.speakingPaceWpm).toBe(80);
    expect(resultSlow.paceCategory).toBe("slow");

    // 180 words in 60 seconds = 180 WPM (fast)
    const words180 = new Array(180).fill("word").join(" ");
    const resultFast = DeliveryCoach.analyze(words180, 60);
    expect(resultFast.speakingPaceWpm).toBe(180);
    expect(resultFast.paceCategory).toBe("fast");
  });

  it("counts single and multiword fillers accurately", () => {
    // Contains "um" (1), "you know" (2), "like" (1), "basically" (1)
    const transcript =
      "Um, I think that, you know, we should basically, like, use a hash map because, you know, it is O(1).";
    const result = DeliveryCoach.analyze(transcript, 30);

    expect(result.fillerBreakdown["um"]).toBe(1);
    expect(result.fillerBreakdown["you know"]).toBe(2);
    expect(result.fillerBreakdown["like"]).toBe(1);
    expect(result.fillerBreakdown["basically"]).toBe(1);
    expect(result.fillerWordsCount).toBe(5);
    expect(result.fillerPercentage).toBeGreaterThan(0);
  });

  it("flags rambling strictly at the 120 second boundary", () => {
    const text = "Testing duration rambling boundary with sufficient content.";

    // At 119 seconds: not rambling
    const under = DeliveryCoach.analyze(text, 119);
    expect(under.isRambling).toBe(false);

    // Exactly at 120 seconds: not rambling (threshold is > 120)
    const exact = DeliveryCoach.analyze(text, 120);
    expect(exact.isRambling).toBe(false);

    // At 120.1 seconds: rambling
    const overPointOne = DeliveryCoach.analyze(text, 120.1);
    expect(overPointOne.isRambling).toBe(true);

    // At 125 seconds: rambling
    const over = DeliveryCoach.analyze(text, 125);
    expect(over.isRambling).toBe(true);
  });

  describe("Word Boundary Regex & Double-Escape Regression", () => {
    it("matches fillers surrounded by punctuation and does not match substrings inside other words", () => {
      // "dislike" should NOT count as "like"
      // "yum" should NOT count as "um"
      // "socket" should NOT count as "so"
      // "rightly" should NOT count as "right"
      const nonFillers = "I dislike socket programming because yum soup was eaten rightly.";
      const nonFillerResult = DeliveryCoach.analyze(nonFillers, 30);
      expect(nonFillerResult.fillerWordsCount).toBe(0);

      // Punctuation boundaries should match cleanly
      const punctuated = "(Um), I think... like! You know? Right; basically: yes.";
      const punctResult = DeliveryCoach.analyze(punctuated, 30);
      expect(punctResult.fillerBreakdown["um"]).toBe(1);
      expect(punctResult.fillerBreakdown["like"]).toBe(1);
      expect(punctResult.fillerBreakdown["you know"]).toBe(1);
      expect(punctResult.fillerBreakdown["right"]).toBe(1);
      expect(punctResult.fillerBreakdown["basically"]).toBe(1);
    });

    it("does not suffer from double-escaped regex string instantiation bug", () => {
      // In older implementations: new RegExp(`\\\\b${filler}\\\\b`) resulted in matching literal '\\b' characters
      // instead of word boundaries.
      const testSentence = "you know this is a test";
      const result = DeliveryCoach.analyze(testSentence, 10);
      expect(result.fillerBreakdown["you know"]).toBe(1);
      expect(result.fillerWordsCount).toBe(1);
    });
  });

  describe("Timestamp and Pause Calculations Without Hardcoded Defaults", () => {
    it("computes time-to-first-word and longest pause from Whisper segments", () => {
      const segments = [
        { start: 2.4, end: 4.1, text: "I started by" },
        { start: 7.2, end: 9.0, text: "identifying the bottleneck" }, // 3.1s pause (7.2 - 4.1)
        { start: 10.0, end: 12.5, text: "in the database queries." }, // 1.0s pause (10.0 - 9.0)
      ];

      const timing = DeliveryCoach.computeTimestampsFromSegments(segments);
      expect(timing.timeToFirstWordSeconds).toBe(2.4);
      expect(timing.longestPauseSeconds).toBe(3.1);

      const result = DeliveryCoach.analyze(
        "I started by identifying the bottleneck in the database queries.",
        15,
        { segments }
      );
      expect(result.timeToFirstSentenceSeconds).toBe(2.4);
      expect(result.deliveryFeedback).toContain("Time to first word: 2.4s");
      expect(result.deliveryFeedback).toContain("Longest pause: 3.1s");
    });

    it("computes time-to-first-word and longest pause from VAD speech intervals", () => {
      const speechIntervals = [
        { start: 1800, end: 4000 }, // start at 1.8s
        { start: 8200, end: 11000 }, // pause = (8200 - 4000) / 1000 = 4.2s
      ];

      const timing = DeliveryCoach.computeTimestampsFromVAD(speechIntervals, 0);
      expect(timing.timeToFirstWordSeconds).toBe(1.8);
      expect(timing.longestPauseSeconds).toBe(4.2);
    });

    it("handles empty segment arrays without throwing or using hardcoded defaults", () => {
      const timing = DeliveryCoach.computeTimestampsFromSegments([]);
      expect(timing.timeToFirstWordSeconds).toBe(0);
      expect(timing.longestPauseSeconds).toBe(0);

      const result = DeliveryCoach.analyze("Quick answer", 10);
      // Notice timeToFirstSentenceSeconds is 0 when no timing data is provided, NOT 1.5
      expect(result.timeToFirstSentenceSeconds).toBe(0);
    });

    it("verifies no hardcoded timing default exists in DeliveryCoach source code", () => {
      const filePath = path.resolve(__dirname, "../../src/services/practice/DeliveryCoach.ts");
      const content = fs.readFileSync(filePath, "utf-8");
      // Check that timing default parameter was completely removed
      expect(content).not.toContain("timeToFirstSentenceSeconds: number = 1.5");
      expect(content).not.toContain("timeToFirstWordSeconds = 1.5");
      expect(content).not.toMatch(/timeToFirst\w*\s*[:=]\s*(number\s*=\s*)?1\.5/);
    });
  });
});
