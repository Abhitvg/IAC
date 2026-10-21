import { z } from "zod";
import codingData from "../../data/questions/coding.json";
import systemDesignData from "../../data/questions/system_design.json";
import behavioralData from "../../data/questions/behavioral.json";
import { TopicMastery } from "./types";

export const QuestionEntrySchema = z.object({
  id: z.string().min(1),
  type: z.enum(["coding", "system_design", "behavioral"]),
  topic: z.string().min(1),
  tags: z.array(z.string()),
  difficulty: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  prompt: z.string().min(5),
  clarifyingInfo: z.string().optional().default(""),
  expectedPoints: z.array(z.string().min(1)).min(1),
  commonMistakes: z.array(z.string()).optional().default([]),
  followUps: z.array(z.string()).optional().default([]),
  rubricHooks: z.array(z.string()).optional().default([]),
  timeBudgetMinutes: z.number().min(1),
});

export type QuestionEntry = z.infer<typeof QuestionEntrySchema>;

export class QuestionBank {
  private static customQuestions: QuestionEntry[] = [];

  /**
   * Returns all loaded core questions from the question bank.
   */
  public static getCoreQuestions(): QuestionEntry[] {
    return [
      ...(codingData as QuestionEntry[]),
      ...(systemDesignData as QuestionEntry[]),
      ...(behavioralData as QuestionEntry[]),
    ];
  }

  /**
   * Returns all available questions including custom-imported packs.
   */
  public static getAllQuestions(): QuestionEntry[] {
    return [...this.getCoreQuestions(), ...this.customQuestions];
  }

  public static getQuestionById(id: string): QuestionEntry | undefined {
    return this.getAllQuestions().find((q) => q.id === id);
  }

  public static getQuestionsByType(
    type: "coding" | "system_design" | "behavioral"
  ): QuestionEntry[] {
    return this.getAllQuestions().filter((q) => q.type === type);
  }

  /**
   * Selects an adaptive question based on:
   * 1. No repeats: Excludes any IDs already used in the session.
   * 2. Difficulty adaptation: Adjusts target difficulty based on previous score.
   * 3. Topic mastery priority: Prioritizes topics with lowest mastery scores.
   */
  public static selectAdaptiveQuestion(params: {
    type: "coding" | "system_design" | "behavioral";
    previousScore?: number;
    currentDifficulty?: number;
    excludedIds?: string[];
    topicMasteries?: TopicMastery[];
  }): QuestionEntry {
    const candidates = this.getQuestionsByType(params.type).filter(
      (q) => !(params.excludedIds || []).includes(q.id)
    );

    if (candidates.length === 0) {
      // If all questions in type exhausted, fallback to any question of that type
      const fallbackList = this.getQuestionsByType(params.type);
      return fallbackList[0];
    }

    // Determine target difficulty
    let targetDifficulty = params.currentDifficulty || 3;
    if (params.previousScore !== undefined) {
      if (params.previousScore >= 4.0) {
        targetDifficulty = Math.min(5, targetDifficulty + 1);
      } else if (params.previousScore <= 2.5) {
        targetDifficulty = Math.max(1, targetDifficulty - 1);
      }
    }

    // Check for weak topics to prioritize in spaced learning
    const weakTopicNames = new Set(
      (params.topicMasteries || [])
        .filter((t) => t.masteryScore < 60)
        .sort((a, b) => a.masteryScore - b.masteryScore)
        .map((t) => t.topicName.toLowerCase())
    );

    // 1. Try matching both weak topic and exact target difficulty
    const weakAndTarget = candidates.filter(
      (q) =>
        q.difficulty === targetDifficulty &&
        (weakTopicNames.has(q.topic.toLowerCase()) ||
          q.tags.some((tag) => weakTopicNames.has(tag.toLowerCase())))
    );
    if (weakAndTarget.length > 0) {
      return weakAndTarget[0];
    }

    // 2. Try matching any question in weak topics
    const weakAny = candidates.filter(
      (q) =>
        weakTopicNames.has(q.topic.toLowerCase()) ||
        q.tags.some((tag) => weakTopicNames.has(tag.toLowerCase()))
    );
    if (weakAny.length > 0) {
      return weakAny[0];
    }

    // 3. Try matching exact target difficulty
    const targetDiffMatch = candidates.filter(
      (q) => q.difficulty === targetDifficulty
    );
    if (targetDiffMatch.length > 0) {
      return targetDiffMatch[0];
    }

    // 4. Fallback to closest available difficulty
    candidates.sort(
      (a, b) =>
        Math.abs(a.difficulty - targetDifficulty) -
        Math.abs(b.difficulty - targetDifficulty)
    );
    return candidates[0];
  }

  /**
   * Imports and validates a custom question pack (JSON string or object array).
   * Rejects invalid schemas, duplicate IDs, missing fields, or empty expectedPoints.
   */
  public static importCustomPack(
    rawPack: string | unknown[]
  ): { success: boolean; importedCount: number; errors?: string[] } {
    let rawItems: unknown[];

    try {
      if (typeof rawPack === "string") {
        rawItems = JSON.parse(rawPack);
      } else if (Array.isArray(rawPack)) {
        rawItems = rawPack;
      } else {
        return {
          success: false,
          importedCount: 0,
          errors: ["Custom pack must be a valid JSON array of questions."],
        };
      }
    } catch (e: any) {
      return {
        success: false,
        importedCount: 0,
        errors: [`JSON parse error: ${e.message}`],
      };
    }

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return {
        success: false,
        importedCount: 0,
        errors: ["Custom pack must contain at least one question."],
      };
    }

    const errors: string[] = [];
    const validQuestions: QuestionEntry[] = [];
    const seenIds = new Set(this.getAllQuestions().map((q) => q.id));

    rawItems.forEach((item, index) => {
      const parsed = QuestionEntrySchema.safeParse(item);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(", ");
        errors.push(`Question #${index + 1}: ${issues}`);
        return;
      }

      const q = parsed.data;
      if (seenIds.has(q.id)) {
        errors.push(`Question #${index + 1}: Duplicate question ID '${q.id}'`);
        return;
      }

      seenIds.add(q.id);
      validQuestions.push(q);
    });

    if (errors.length > 0) {
      return {
        success: false,
        importedCount: 0,
        errors,
      };
    }

    this.customQuestions.push(...validQuestions);
    return {
      success: true,
      importedCount: validQuestions.length,
    };
  }

  public static resetCustomQuestions(): void {
    this.customQuestions = [];
  }
}
