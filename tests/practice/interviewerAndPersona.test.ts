import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { InterviewerService } from "../../src/services/practice/InterviewerService";
import { MockInterviewerEngine } from "../../src/services/practice/MockInterviewerEngine";
import { ModelAnswerBuilder } from "../../src/services/practice/ModelAnswerBuilder";
import { BehavioralStory } from "../../src/services/practice/types";

describe("Phase 3 - Authentic Content & Interviewer Engine Suite", () => {
  describe("Zero Fabricated Personal Specifics Guardrail", () => {
    it("greps src/ to guarantee no hardcoded personal specifics remain", () => {
      const srcDir = path.resolve(__dirname, "../../src");
      const forbiddenPatterns = [
        /\bATMA\b/,
        /35%\s+MongoDB/i,
        /99\.9%\s+uptime/i,
        /10K\+\s+users/i,
        /10,000\s+users/i,
      ];

      function scanDir(dir: string): { file: string; match: string }[] {
        const results: { file: string; match: string }[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            results.push(...scanDir(fullPath));
          } else if (
            entry.isFile() &&
            (entry.name.endsWith(".ts") ||
              entry.name.endsWith(".tsx") ||
              entry.name.endsWith(".js") ||
              entry.name.endsWith(".json"))
          ) {
            const content = fs.readFileSync(fullPath, "utf8");
            for (const pattern of forbiddenPatterns) {
              if (pattern.test(content)) {
                results.push({ file: fullPath, match: pattern.toString() });
              }
            }
          }
        }
        return results;
      }

      const violations = scanDir(srcDir);
      expect(
        violations,
        `Found forbidden fabricated strings in src/: ${JSON.stringify(violations, null, 2)}`
      ).toHaveLength(0);
    });
  });

  describe("InterviewerService - Substring Evidence Validation", () => {
    it("accepts a probe when evidence is a verbatim substring of candidate answer", async () => {
      const candidateAnswer =
        "To achieve constant time lookups, I implemented an LRU cache using a doubly linked list coupled with a hash map.";

      const mockCaller = async () =>
        JSON.stringify({
          action: "probe",
          spoken:
            "You mentioned a doubly linked list. How do you handle sentinel nodes during boundary evictions?",
          reason: "Probe boundary condition handling.",
          evidence: "doubly linked list",
        });

      const turn = await InterviewerService.generateTurn(
        {
          persona_name: "Jordan",
          persona_style: "rigorous",
          interview_type: "coding",
          question_json: { id: "q1", prompt: "Design an LRU cache." },
          rolling_transcript: `Candidate: ${candidateAnswer}`,
          lastAnswer: candidateAnswer,
          currentProbesCount: 0,
        },
        mockCaller
      );

      expect(turn.action).toBe("probe");
      expect(turn.spoken).toContain("doubly linked list");
      expect(turn.evidence).toBe("doubly linked list");
      expect(turn.isOffline).toBe(false);
    });

    it("drops probe and asks next question when evidence is NOT in candidate answer", async () => {
      const candidateAnswer =
        "I decided to use an array and sort it in place with quicksort.";

      // LLM hallucinates evidence the candidate never stated
      const mockCaller = async () =>
        JSON.stringify({
          action: "probe",
          spoken: "You mentioned using a distributed Raft consensus cluster. Why?",
          reason: "Probe consensus architecture.",
          evidence: "distributed Raft consensus cluster",
        });

      const turn = await InterviewerService.generateTurn(
        {
          persona_name: "Jordan",
          persona_style: "rigorous",
          interview_type: "coding",
          question_json: { id: "q1", prompt: "Sort an array." },
          rolling_transcript: `Candidate: ${candidateAnswer}`,
          lastAnswer: candidateAnswer,
          currentProbesCount: 0,
        },
        mockCaller
      );

      // Must drop probe and advance to next question
      expect(turn.action).toBe("move_on");
      expect(turn.spoken).toContain("Let's move on");
      expect(turn.reason).toContain("Probe dropped");
    });

    it("enforces a strict maximum of 2 probes per question", async () => {
      const candidateAnswer = "I added a binary search step.";

      const mockCaller = async () =>
        JSON.stringify({
          action: "probe",
          spoken: "Why binary search?",
          evidence: "binary search",
        });

      // With currentProbesCount = 2, it must not probe again
      const turn = await InterviewerService.generateTurn(
        {
          persona_name: "Jordan",
          persona_style: "rigorous",
          interview_type: "coding",
          question_json: { id: "q1", prompt: "Search target" },
          rolling_transcript: "",
          lastAnswer: candidateAnswer,
          currentProbesCount: 2,
        },
        mockCaller
      );

      expect(turn.action).toBe("move_on");
      expect(turn.spoken).toContain("Let's move on");
    });

    it("falls back gracefully to offline heuristic probe if LLM call fails", async () => {
      const candidateAnswer = "I put a cache in front of the database.";

      const failingCaller = async () => {
        throw new Error("Network timeout or LLM offline");
      };

      const turn = await InterviewerService.generateTurn(
        {
          persona_name: "Alex",
          persona_style: "friendly",
          interview_type: "system_design",
          question_json: { id: "q1", prompt: "Design rate limiter" },
          rolling_transcript: "",
          lastAnswer: candidateAnswer,
          currentProbesCount: 0,
        },
        failingCaller
      );

      expect(turn.action).toBe("probe");
      expect(turn.isOffline).toBe(true);
      expect(turn.spoken).toBeTruthy();
    });
  });

  describe("Mid-Answer Interruption Safeguards", () => {
    it("is disabled (OFF) by default in new sessions", () => {
      const session = MockInterviewerEngine.createSession("dsa_coding");
      expect(session.interruptionEnabled).toBe(false);
    });

    it("requires at least 30 seconds of candidate speech before triggering", () => {
      const transcript =
        "We decided to implement a cache to store user session tokens across multiple servers.";

      // 25s speech (< 30s) -> should NOT interrupt
      const triggerUnder30 = MockInterviewerEngine.checkInterruptionTrigger(
        25,
        transcript,
        "strict_big_tech",
        false
      );
      expect(triggerUnder30.shouldInterrupt).toBe(false);

      // 35s speech (>= 30s) -> should interrupt
      const triggerOver30 = MockInterviewerEngine.checkInterruptionTrigger(
        35,
        transcript,
        "strict_big_tech",
        false
      );
      expect(triggerOver30.shouldInterrupt).toBe(true);
      expect(triggerOver30.promptText).toBeTruthy();
    });

    it("enforces at most one interruption per answer", () => {
      const transcript =
        "We decided to implement a cache to store user session tokens across multiple servers.";

      // Already interrupted once -> must not interrupt again
      const trigger = MockInterviewerEngine.checkInterruptionTrigger(
        45,
        transcript,
        "strict_big_tech",
        true // alreadyInterrupted = true
      );
      expect(trigger.shouldInterrupt).toBe(false);
      expect(trigger.promptText).toBe("");
    });
  });

  describe("ModelAnswerBuilder - Generic Outlines vs User Verified Stories", () => {
    it("returns generic outline when user has no stories in story bank", () => {
      const result = ModelAnswerBuilder.build(
        "Design a URL shortener",
        "system_design",
        ["Gather QPS & capacity", "Base62 counter", "Redis cache"],
        []
      );

      expect(result.isUserStory).toBe(false);
      expect(result.content).toContain("[Generic Framework Outline]");
      expect(result.content).toContain("Base62 counter");
    });

    it("returns verified story labeled 'Based on your story' when matching competency exists", () => {
      const userStories: BehavioralStory[] = [
        {
          id: "story_1",
          title: "Production Outage Postmortem",
          companyProject: "RealCompany Checkout Engine",
          situation: "Checkout payment deadlock during flash sale",
          task: "Restore transaction flow and prevent lock recurrence",
          action: "Rolled back within 3 minutes and added CI migration linter",
          result: "Zero lock-induced outages over 18 months",
          metrics: ["3-minute rollback", "0 outages"],
          competencies: ["failure_postmortem"],
        },
      ];

      const result = ModelAnswerBuilder.build(
        "Tell me about a high-severity production incident you resolved",
        "behavioral",
        [],
        userStories
      );

      expect(result.isUserStory).toBe(true);
      expect(result.content).toContain("[Based on your story: RealCompany Checkout Engine]");
      expect(result.content).toContain("Rolled back within 3 minutes and added CI migration linter");
      expect(result.sourceLabel).toContain("Based on your story");
    });
  });
});
