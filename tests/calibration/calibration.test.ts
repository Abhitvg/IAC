import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { LLMScorer } from "../../src/services/practice/scoring/LLMScorer";
import { TieredHint } from "../../src/services/practice/types";

interface CalibrationFixture {
  id: string;
  type: "coding" | "system_design" | "behavioral";
  tier: "weak" | "average" | "strong" | "adversarial";
  question: {
    id: string;
    type: "coding" | "system_design" | "behavioral";
    prompt: string;
    expectedPoints?: string[];
    commonMistakes?: string[];
    rubricHooks?: string[];
  };
  transcript: string;
  hints: TieredHint[];
  expectedScoreRanges: Record<string, [number, number]>;
  notes: string;
  recordedLLMResponse: string;
}

const fixturesDir = path.resolve(__dirname, "./fixtures");

function loadFixtures(): CalibrationFixture[] {
  const files = fs.readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));
  return files.map((file) => {
    const raw = fs.readFileSync(path.join(fixturesDir, file), "utf8");
    return JSON.parse(raw) as CalibrationFixture;
  });
}

describe("Calibration Harness - Recorded Response Suite", () => {
  const fixtures = loadFixtures();
  const standardFixtures = fixtures.filter((f) => f.tier !== "adversarial");
  const adversarialFixtures = fixtures.filter((f) => f.tier === "adversarial");

  it("verifies that at least 18 labeled standard fixtures and 3 adversarial fixtures exist", () => {
    expect(standardFixtures.length).toBeGreaterThanOrEqual(18);
    expect(adversarialFixtures.length).toBeGreaterThanOrEqual(3);

    const coding = standardFixtures.filter((f) => f.type === "coding");
    const sysDesign = standardFixtures.filter((f) => f.type === "system_design");
    const behavioral = standardFixtures.filter((f) => f.type === "behavioral");

    expect(coding.length).toBeGreaterThanOrEqual(6);
    expect(sysDesign.length).toBeGreaterThanOrEqual(6);
    expect(behavioral.length).toBeGreaterThanOrEqual(6);
  });

  describe("Fixture Dimension Range Calibration", () => {
    for (const fixture of standardFixtures) {
      it(`calibrates fixture [${fixture.id}] within expected ranges (+/- 1 point)`, async () => {
        const caller = async () => fixture.recordedLLMResponse;
        const report = await LLMScorer.evaluate({
          transcript: fixture.transcript,
          question: fixture.question,
          hintsUsed: fixture.hints || [],
          llmCaller: caller,
        });

        expect(report.questions.length).toBeGreaterThanOrEqual(1);
        const qDims = report.questions[0].dimensions;

        for (const [dimName, [minExpected, maxExpected]] of Object.entries(
          fixture.expectedScoreRanges
        )) {
          const dimResult = qDims[dimName];
          expect(
            dimResult,
            `Expected dimension [${dimName}] in report for fixture ${fixture.id}`
          ).toBeDefined();

          const score = dimResult.score;
          // Fail if score falls outside range by more than 1 point
          const minTolerance = Math.max(1, minExpected - 1.0);
          const maxTolerance = Math.min(5, maxExpected + 1.0);

          expect(
            score,
            `Fixture ${fixture.id} dim ${dimName}: score ${score} outside [${minTolerance}, ${maxTolerance}]`
          ).toBeGreaterThanOrEqual(minTolerance);
          expect(
            score,
            `Fixture ${fixture.id} dim ${dimName}: score ${score} outside [${minTolerance}, ${maxTolerance}]`
          ).toBeLessThanOrEqual(maxTolerance);
        }
      });
    }
  });

  describe("Tier Separation: Strong outscores Weak on every type", () => {
    const types: Array<"coding" | "system_design" | "behavioral"> = [
      "coding",
      "system_design",
      "behavioral",
    ];

    for (const t of types) {
      it(`ensures strong ${t} answers outscore weak ${t} answers`, async () => {
        const weakList = standardFixtures.filter(
          (f) => f.type === t && f.tier === "weak"
        );
        const strongList = standardFixtures.filter(
          (f) => f.type === t && f.tier === "strong"
        );

        expect(weakList.length).toBeGreaterThanOrEqual(2);
        expect(strongList.length).toBeGreaterThanOrEqual(2);

        let weakTotal = 0;
        for (const w of weakList) {
          const rep = await LLMScorer.evaluate({
            transcript: w.transcript,
            question: w.question,
            hintsUsed: w.hints || [],
            llmCaller: async () => w.recordedLLMResponse,
          });
          weakTotal += rep.overall.score;
        }
        const weakAvg = weakTotal / weakList.length;

        let strongTotal = 0;
        for (const s of strongList) {
          const rep = await LLMScorer.evaluate({
            transcript: s.transcript,
            question: s.question,
            hintsUsed: s.hints || [],
            llmCaller: async () => s.recordedLLMResponse,
          });
          strongTotal += rep.overall.score;
        }
        const strongAvg = strongTotal / strongList.length;

        expect(
          strongAvg,
          `Strong avg (${strongAvg.toFixed(2)}) should strictly outscore weak avg (${weakAvg.toFixed(2)}) for ${t}`
        ).toBeGreaterThan(weakAvg);
        // Margin should be significant (> 1.5 points difference)
        expect(strongAvg - weakAvg).toBeGreaterThan(1.5);
      });
    }
  });

  describe("Determinism and Consistency", () => {
    it("running the same recorded transcript twice yields scores within 1 point per dimension", async () => {
      const target = standardFixtures.find((f) => f.id === "coding_avg_1")!;
      expect(target).toBeDefined();

      const run1 = await LLMScorer.evaluate({
        transcript: target.transcript,
        question: target.question,
        hintsUsed: target.hints || [],
        llmCaller: async () => target.recordedLLMResponse,
      });

      const run2 = await LLMScorer.evaluate({
        transcript: target.transcript,
        question: target.question,
        hintsUsed: target.hints || [],
        llmCaller: async () => target.recordedLLMResponse,
      });

      const dims1 = run1.questions[0].dimensions;
      const dims2 = run2.questions[0].dimensions;

      for (const key of Object.keys(dims1)) {
        const diff = Math.abs(dims1[key].score - dims2[key].score);
        expect(
          diff,
          `Dimension ${key} varied by ${diff} between consecutive evaluations`
        ).toBeLessThanOrEqual(1.0);
      }
      expect(Math.abs(run1.overall.score - run2.overall.score)).toBeLessThanOrEqual(
        1.0
      );
    });
  });

  describe("Adversarial Robustness", () => {
    it("resists keyword stuffing: caps correctness and complexity at <= 2.0", async () => {
      const keywordFix = adversarialFixtures.find(
        (f) => f.id === "adversarial_keyword_stuffing"
      )!;
      expect(keywordFix).toBeDefined();

      const report = await LLMScorer.evaluate({
        transcript: keywordFix.transcript,
        question: keywordFix.question,
        hintsUsed: [],
        llmCaller: async () => keywordFix.recordedLLMResponse,
      });

      const dims = report.questions[0].dimensions;
      expect(dims.correctness.score).toBeLessThanOrEqual(2.0);
      expect(dims.complexity.score).toBeLessThanOrEqual(2.0);
      expect(report.overall.score).toBeLessThanOrEqual(2.0);
    });

    it("resists prompt injection: treats transcript as data, does not award 5/5 or Hire verdict", async () => {
      const injectionFix = adversarialFixtures.find(
        (f) => f.id === "adversarial_prompt_injection"
      )!;
      expect(injectionFix).toBeDefined();

      const report = await LLMScorer.evaluate({
        transcript: injectionFix.transcript,
        question: injectionFix.question,
        hintsUsed: [],
        llmCaller: async () => injectionFix.recordedLLMResponse,
      });

      expect(report.verdict).not.toBe("Strong Hire");
      expect(report.verdict).not.toBe("Hire");
      const dims = report.questions[0].dimensions;
      for (const dim of Object.values(dims)) {
        expect(dim.score).toBeLessThanOrEqual(2.0);
      }
    });

    it("handles very short answer: caps dimensions at <= 2 and sets uncertainty field", async () => {
      const shortFix = adversarialFixtures.find(
        (f) => f.id === "adversarial_very_short"
      )!;
      expect(shortFix).toBeDefined();

      const report = await LLMScorer.evaluate({
        transcript: shortFix.transcript,
        question: shortFix.question,
        hintsUsed: [],
        llmCaller: async () => shortFix.recordedLLMResponse,
      });

      expect(report.overall.score).toBeLessThanOrEqual(2.0);
      expect(report.uncertainty).toBeTruthy();
      expect(report.uncertainty.length).toBeGreaterThan(5);
    });
  });

  describe.skipIf(!process.env.LIVE_CALIBRATION_TEST)(
    "Live LLM Calibration Mode (Optional Env Flag)",
    () => {
      it("scores a representative transcript live against configured provider", async () => {
        const fixture = standardFixtures[0];
        const report = await LLMScorer.evaluate({
          transcript: fixture.transcript,
          question: fixture.question,
          hintsUsed: [],
        });
        expect(report.overall.score).toBeGreaterThanOrEqual(1.0);
        expect(report.overall.score).toBeLessThanOrEqual(5.0);
      });
    }
  );
});
