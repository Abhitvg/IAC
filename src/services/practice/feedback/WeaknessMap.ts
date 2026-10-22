import topicAliasesData from '../../../data/topicAliases.json';
import { QuestionBank } from '../QuestionBank';
import { FeedbackRecord, FeedbackSkill, RankedWeakness, WeaknessMapResult } from '../types';

export class WeaknessMap {
  private static readonly HALF_LIFE_DAYS = 60;

  /**
   * Resolves a raw topic string to known question bank tags and canonical topic name using topicAliases.json.
   */
  public static resolveTopic(rawTopic: string): {
    canonicalTopic: string;
    mappedTags: string[];
    hasMatchingQuestions: boolean;
  } {
    const trimmed = (rawTopic || '').trim();
    const lower = trimmed.toLowerCase();
    const aliases = topicAliasesData as Record<string, string | string[]>;

    const tagsSet = new Set<string>();

    // 1. Direct or partial alias match
    for (const [aliasKey, mappedVal] of Object.entries(aliases)) {
      const aliasLower = aliasKey.toLowerCase();
      if (lower === aliasLower || lower.includes(aliasLower) || aliasLower.includes(lower)) {
        if (Array.isArray(mappedVal)) {
          mappedVal.forEach((t) => tagsSet.add(t));
        } else if (typeof mappedVal === 'string') {
          tagsSet.add(mappedVal);
        }
      }
    }

    // 2. Fallback tags from words
    if (tagsSet.size === 0) {
      const words = lower.split(/[^a-z0-9_]+/).filter((w) => w.length > 2);
      words.forEach((w) => tagsSet.add(w));
    }

    const mappedTags = Array.from(tagsSet);

    // 3. Check if QuestionBank has any questions matching these tags or topic
    const allQuestions = QuestionBank.getAllQuestions();
    const hasMatch = allQuestions.some((q) => {
      const qTopicLower = q.topic.toLowerCase();
      const qTagsLower = (q.tags || []).map((t) => t.toLowerCase());

      if (qTopicLower.includes(lower) || lower.includes(qTopicLower)) {
        return true;
      }
      return mappedTags.some((tag) => qTagsLower.includes(tag.toLowerCase()));
    });

    return {
      canonicalTopic: trimmed,
      mappedTags,
      hasMatchingQuestions: hasMatch,
    };
  }

  /**
   * Aggregates all FeedbackRecords into a ranked list of weaknesses by (topic, skill).
   * Weighting formula:
   *   mentionWeight = severity * (0.5 ^ (deltaDays / 60))
   *   totalWeight = sum(mentionWeight)
   *   rankScore = totalWeight * (1 + (reportCount - 1) * 1.5)
   * Recurring flag: reportCount >= 2 independent reports.
   */
  public static aggregateFeedback(
    records: FeedbackRecord[],
    options?: { now?: number }
  ): WeaknessMapResult {
    const now = options?.now ?? Date.now();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    // Grouping structure: Map keyed by `${normalizedTopic}::${skill}`
    interface GroupAccumulator {
      canonicalTopic: string;
      rawTopics: Set<string>;
      skill: FeedbackSkill;
      severities: number[];
      reportIds: Set<string>;
      reportDates: number[];
      evidenceList: string[];
      requestedFixList: string[];
      latestDate: number;
    }

    const groups = new Map<string, GroupAccumulator>();
    const missingTopicsSet = new Set<string>();
    const skillCounts: Record<FeedbackSkill, number> = {
      knowledge: 0,
      structure: 0,
      concreteness: 0,
      depth: 0,
      delivery: 0,
      other: 0,
    };

    for (const record of records) {
      const reportDateMs = record.date ? new Date(record.date).getTime() : record.createdAt;
      const validDateMs = isNaN(reportDateMs) ? record.createdAt : reportDateMs;

      for (const w of record.weaknesses || []) {
        skillCounts[w.skill] = (skillCounts[w.skill] || 0) + 1;

        const normalizedTopic = (w.topic || 'General Technical').trim().toLowerCase();
        const key = `${normalizedTopic}::${w.skill}`;

        let group = groups.get(key);
        if (!group) {
          group = {
            canonicalTopic: (w.topic || 'General Technical').trim(),
            rawTopics: new Set<string>([w.topic]),
            skill: w.skill,
            severities: [],
            reportIds: new Set<string>(),
            reportDates: [],
            evidenceList: [],
            requestedFixList: [],
            latestDate: validDateMs,
          };
          groups.set(key, group);
        }

        group.rawTopics.add(w.topic);
        group.severities.push(w.severity || 1);
        group.reportIds.add(record.id);
        group.reportDates.push(validDateMs);
        if (validDateMs > group.latestDate) {
          group.latestDate = validDateMs;
        }
        if (w.evidence) {
          group.evidenceList.push(w.evidence);
        }
        if (w.requestedFix) {
          group.requestedFixList.push(w.requestedFix);
        }
      }
    }

    // Rank each group
    const rankedWeaknesses: RankedWeakness[] = [];

    for (const [key, group] of groups.entries()) {
      const reportCount = group.reportIds.size;
      const isRecurring = reportCount >= 2;

      let totalWeight = 0;
      for (let i = 0; i < group.severities.length; i++) {
        const severity = group.severities[i];
        const dateMs = group.reportDates[i];
        const deltaDays = Math.max(0, (now - dateMs) / MS_PER_DAY);
        const recencyFactor = Math.pow(0.5, deltaDays / this.HALF_LIFE_DAYS);
        totalWeight += severity * recencyFactor;
      }

      // Weight by report frequency multiplier
      const frequencyMultiplier = 1 + (reportCount - 1) * 1.5;
      const score = Math.round(totalWeight * frequencyMultiplier * 100) / 100;

      const { mappedTags, hasMatchingQuestions } = this.resolveTopic(group.canonicalTopic);

      if (!hasMatchingQuestions) {
        missingTopicsSet.add(group.canonicalTopic);
      }

      const maxSeverity = Math.max(...group.severities);

      rankedWeaknesses.push({
        id: key,
        topic: group.canonicalTopic,
        rawTopics: Array.from(group.rawTopics),
        skill: group.skill,
        severity: maxSeverity,
        score,
        reportCount,
        isRecurring,
        lastReportedDate: group.latestDate,
        evidenceQuotes: group.evidenceList,
        requestedFixes: group.requestedFixList,
        mappedQuestionTags: mappedTags,
        hasMatchingQuestions,
      });
    }

    // Sort descending by score, tie-break by reportCount, then lastReportedDate, then topic
    rankedWeaknesses.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.reportCount !== a.reportCount) return b.reportCount - a.reportCount;
      if (b.lastReportedDate !== a.lastReportedDate) return b.lastReportedDate - a.lastReportedDate;
      return a.topic.localeCompare(b.topic);
    });

    const recurringWeaknesses = rankedWeaknesses.filter((w) => w.isRecurring);

    return {
      rankedWeaknesses,
      recurringWeaknesses,
      missingContentTopics: Array.from(missingTopicsSet),
      skillBreakdown: skillCounts,
      totalReportsAnalyzed: records.length,
    };
  }
}
