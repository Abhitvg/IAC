import { describe, it, expect } from "vitest";
import { DeliveryCoach } from "../../src/services/practice/DeliveryCoach";
import { RubricScorer } from "../../src/services/practice/RubricScorer";
import { CoachingEngine } from "../../src/services/practice/CoachingEngine";
import { StoryBank } from "../../src/services/practice/StoryBank";
import { SpacedScheduler } from "../../src/services/practice/SpacedScheduler";
import { CompanyPlanGenerator } from "../../src/services/practice/CompanyPlanGenerator";
import { MockInterviewerEngine } from "../../src/services/practice/MockInterviewerEngine";

describe("DeliveryCoach", () => {
  it("accurately detects speaking pace, filler words, and rambling", () => {
    // 130 words, 60 seconds -> ~130 WPM (optimal)
    const transcript =
      "Um, so basically I think we should, you know, use a hash map here. " +
      "Actually, if we iterate through the list, like, we can find the complement in O(1) time. " +
      "Um, the overall time complexity is O(N) and space is O(N).";

    const metrics = DeliveryCoach.analyze(transcript, 60, 2.0);

    expect(metrics.wordCount).toBeGreaterThan(20);
    expect(metrics.speakingPaceWpm).toBeGreaterThan(0);
    expect(metrics.fillerWordsCount).toBeGreaterThanOrEqual(4); // 'um', 'basically', 'you know', 'actually', 'like'
    expect(metrics.fillerBreakdown["um"]).toBeGreaterThanOrEqual(2);
    expect(metrics.isRambling).toBe(false);
    expect(metrics.deliveryScore).toBeLessThanOrEqual(5);
    expect(metrics.deliveryScore).toBeGreaterThanOrEqual(1);
  });

  it("flags rambling when answer duration exceeds 120 seconds", () => {
    const metrics = DeliveryCoach.analyze("Short answer with excessive time", 135, 1.0);
    expect(metrics.isRambling).toBe(true);
    expect(metrics.deliveryFeedback).toContain("exceeded the 2-minute target mark");
  });
});

describe("RubricScorer", () => {
  it("grades Coding answers with evidence quotes and catches missing Big-O space", () => {
    const question = "Two Sum: find two numbers that add up to target.";
    const transcript =
      "First, let me clarify constraints: can the array be empty or negative? " +
      "A brute force approach would be O(N^2), but an optimal approach uses a hash map to store seen numbers. " +
      "The time complexity is O(N) linear time.";

    const evalResult = RubricScorer.evaluate({
      category: "coding",
      question,
      candidateAnswer: transcript,
    });

    expect(evalResult.dimensions.length).toBe(5);
    expect(evalResult.overallScore).toBeGreaterThan(2.5);

    // Should catch problem understanding with verbatim quote
    const understandingDim = evalResult.dimensions.find((d) => d.name.includes("Understanding"));
    expect(understandingDim?.evidenceQuote).toContain("clarify constraints");

    // Should flag missing auxiliary space complexity
    const complexityDim = evalResult.dimensions.find((d) => d.name.includes("Complexity"));
    expect(complexityDim?.missingAspect).toContain("auxiliary space");
    expect(evalResult.diffMissingPoints.some((p) => p.includes("space"))).toBe(true);
  });

  it("grades System Design answers with scale math and failure mode checks", () => {
    const question = "Design a distributed URL shortener.";
    const transcript =
      "For scale estimations, 100M writes per day equals roughly 1,200 QPS with 91 TB storage over 5 years. " +
      "We will use Redis for caching and handle cache invalidation with a write-around strategy. " +
      "To avoid single points of failure, we use circuit breaker failover.";

    const evalResult = RubricScorer.evaluate({
      category: "system_design",
      question,
      candidateAnswer: transcript,
    });

    expect(evalResult.overallScore).toBeGreaterThanOrEqual(3.5);
    expect(evalResult.dimensions.some((d) => d.name.includes("Scale Estimation"))).toBe(true);
    expect(evalResult.dimensions.some((d) => d.name.includes("Failure Modes"))).toBe(true);
  });

  it("grades Behavioral answers with STAR and flags excessive 'we' over 'I'", () => {
    const question = "Tell me about a challenging project.";
    const transcript =
      "We decided to rebuild the entire platform. Our team thought it was good. " +
      "We implemented everything together and we launched it.";

    const evalResult = RubricScorer.evaluate({
      category: "behavioral",
      question,
      candidateAnswer: transcript,
    });

    const ownershipDim = evalResult.dimensions.find((d) => d.name.includes("Ownership"));
    expect(ownershipDim?.score).toBeLessThan(3.0);
    expect(ownershipDim?.missingAspect).toContain("personal decision");
  });
});

describe("CoachingEngine", () => {
  it("provides 3 tiers of hints with increasing penalties", () => {
    const hints = CoachingEngine.getTieredHints("Two sum target pair in array", "coding");
    expect(hints.length).toBe(3);
    expect(hints[0].tier).toBe(1);
    expect(hints[0].penaltyPoints).toBe(0.5);
    expect(hints[1].tier).toBe(2);
    expect(hints[1].penaltyPoints).toBe(1.0);
    expect(hints[2].tier).toBe(3);
    expect(hints[2].penaltyPoints).toBe(2.0);

    const totalPenalty = CoachingEngine.calculatePenalty(hints);
    expect(totalPenalty).toBe(3.5);
  });

  it("generates side-by-side model answer comparison highlighting omissions", () => {
    const comparison = CoachingEngine.compareWithModelAnswer(
      "Two Sum",
      "coding",
      "I will use nested for loops to check every pair."
    );

    expect(comparison.keyOmissions.length).toBeGreaterThan(0);
    expect(comparison.modelAnswer).toContain("Clarify constraints");
    expect(comparison.suggestedPhrasing).toBeDefined();
  });
});

describe("StoryBank", () => {
  it("extracts candidate stories from resume and flags missing competencies", () => {
    const sampleResume = `
ABHISHEK SINGH
Staff Software Engineer
- Led cross-functional team of 8 engineers to migrate monolith to microservices.
- Built real-time analytics pipeline processing 25k events/sec, reducing latency by 45%.
- Resolved production outage caused by memory leak in Node.js event loop under 30 minutes.
`;

    const stories = StoryBank.extractStoriesFromResume(sampleResume);
    expect(stories.length).toBeGreaterThanOrEqual(2);

    const coverageReport = StoryBank.analyzeCoverage(stories);
    expect(coverageReport.totalStories).toBe(stories.length);
    // Notice sampleResume has no conflict bullet point
    expect(coverageReport.coverage.conflict).toBe(0);
    expect(coverageReport.missingCompetencies).toContain("conflict");
    expect(coverageReport.gapAlerts.some((a) => a.includes("Conflict"))).toBe(true);
  });
});

describe("SpacedScheduler (SM-2)", () => {
  it("progresses review interval and mastery score on good performance", () => {
    const initialTopics = SpacedScheduler.initializeDefaults();
    expect(initialTopics.length).toBeGreaterThan(5);

    const topic = initialTopics[0];
    const updated = SpacedScheduler.recordAttempt(topic, 5); // Quality 5/5

    expect(updated.repetitions).toBe(1);
    expect(updated.intervalDays).toBe(1);
    expect(updated.masteryScore).toBeGreaterThan(0);
    expect(updated.nextReviewDate).toBeGreaterThan(Date.now());
  });

  it("resets repetitions when score drops below 3", () => {
    const topic = {
      ...SpacedScheduler.initializeDefaults()[0],
      repetitions: 3,
      intervalDays: 15,
      masteryScore: 80,
    };

    const failed = SpacedScheduler.recordAttempt(topic, 2); // Score 2/5 (struggled)
    expect(failed.repetitions).toBe(0);
    expect(failed.intervalDays).toBe(1);
  });

  it("prioritizes weakest gaps in daily practice queue", () => {
    const topics = SpacedScheduler.initializeDefaults();
    topics[0].masteryScore = 90;
    topics[1].masteryScore = 15; // Weakest
    topics[2].masteryScore = 40;

    const queue = SpacedScheduler.getDailyPracticeQueue(topics, 2);
    expect(queue.length).toBe(2);
    expect(queue[0].masteryScore).toBeLessThanOrEqual(queue[1].masteryScore);
  });
});

describe("CompanyPlanGenerator", () => {
  it("extracts tech stack, gap analysis, and 7-day study plan", () => {
    const jd = "Looking for a Senior Backend Engineer proficient in Python, Go, Kafka, Redis, and Kubernetes.";
    const resume = "Experienced in Python, Postgres, Redis, and Docker.";

    const plan = CompanyPlanGenerator.generatePlan("Stripe", "Senior Backend Engineer", jd, resume, 7);

    expect(plan.extractedStack).toContain("Python");
    expect(plan.extractedStack).toContain("Kafka");
    expect(plan.seniority).toBe("Senior");
    expect(plan.resumeGapAnalysis.missingCompetencies).toContain("Kafka");
    expect(plan.dailyDrills.length).toBe(7);
  });
});

describe("MockInterviewerEngine", () => {
  it("creates a 45-minute dress rehearsal session with initial icebreaker", () => {
    const session = MockInterviewerEngine.createSession("dress_rehearsal", "strict_big_tech", true);

    expect(session.totalTimeSeconds).toBe(45 * 60);
    expect(session.rehearsalPhase).toBe("icebreaker");
    expect(session.currentQuestion).toContain("background");
    expect(session.interruptionEnabled).toBe(true);
  });

  it("reverses follow-up prediction to probe candidate weakness on caching", () => {
    const candidateAnswer = "I will put a Redis cache in front of the database.";
    const probe = MockInterviewerEngine.generateWeaknessProbe(candidateAnswer, "Design URL shortener", "system_design");

    expect(probe).toContain("invalidation");
  });

  it("triggers mid-answer interruption when candidate speaks without specifics", () => {
    const result = MockInterviewerEngine.checkInterruptionTrigger(
      25,
      "We decided to use microservices and we put a cache everywhere to make it optimal and fast.",
      "strict_big_tech"
    );

    expect(result.shouldInterrupt).toBe(true);
    expect(result.promptText).toContain("specific");
  });
});
