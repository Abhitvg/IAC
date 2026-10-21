import { BehavioralStory, BehavioralCompetency } from "./types";

export interface CompetencyCoverageReport {
  coverage: Record<BehavioralCompetency, number>;
  totalStories: number;
  missingCompetencies: BehavioralCompetency[];
  coveragePercentage: number;
  gapAlerts: string[];
}

export class StoryBank {
  public static readonly ALL_COMPETENCIES: BehavioralCompetency[] = [
    "leadership",
    "conflict",
    "failure_postmortem",
    "ambiguity",
    "high_impact_scale",
  ];

  /**
   * Automatically parses resume text to extract candidate STAR stories with competency tags.
   */
  public static extractStoriesFromResume(resumeText: string): BehavioralStory[] {
    const stories: BehavioralStory[] = [];
    if (!resumeText || resumeText.trim().length === 0) {
      return stories;
    }

    // Split resume by lines or bullet points
    const lines = resumeText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 20);

    let currentCompanyOrProject = "Core Experience";
    let storyCounter = 1;

    for (const line of lines) {
      // Check if line indicates a role/company header
      if (
        (line.toUpperCase() === line && line.length < 50) ||
        line.includes("Company") ||
        line.includes("Engineer") ||
        line.includes("Developer") ||
        line.includes("Project:") ||
        line.includes("Lead")
      ) {
        currentCompanyOrProject = line.replace(/^[#*\-]+\s*/, "").slice(0, 45);
        continue;
      }

      // Check if line looks like an impactful bullet point
      const isBullet =
        line.startsWith("-") ||
        line.startsWith("•") ||
        line.startsWith("*") ||
        /^(Led|Built|Implemented|Architected|Engineered|Reduced|Accelerated|Designed|Resolved|Scaled)\b/i.test(line);

      if (isBullet && line.length > 40) {
        const cleanBullet = line.replace(/^[•*\-\s]+/, "");
        const lower = cleanBullet.toLowerCase();

        // Detect competencies
        const competencies: BehavioralCompetency[] = [];
        if (
          lower.includes("led") ||
          lower.includes("mentored") ||
          lower.includes("spearheaded") ||
          lower.includes("founded") ||
          lower.includes("coordinated") ||
          lower.includes("cross-functional")
        ) {
          competencies.push("leadership");
        }

        if (
          lower.includes("conflict") ||
          lower.includes("disagreed") ||
          lower.includes("pushback") ||
          lower.includes("consensus") ||
          lower.includes("trade-off") ||
          lower.includes("negotiated") ||
          lower.includes("aligned stakeholders")
        ) {
          competencies.push("conflict");
        }

        if (
          lower.includes("outage") ||
          lower.includes("incident") ||
          lower.includes("bug") ||
          lower.includes("root cause") ||
          lower.includes("postmortem") ||
          lower.includes("recovered") ||
          lower.includes("fixed crash")
        ) {
          competencies.push("failure_postmortem");
        }

        if (
          lower.includes("ambiguity") ||
          lower.includes("prototype") ||
          lower.includes("0 to 1") ||
          lower.includes("mvp") ||
          lower.includes("uncertain") ||
          lower.includes("exploratory") ||
          lower.includes("unstructured")
        ) {
          competencies.push("ambiguity");
        }

        if (
          lower.includes("scale") ||
          lower.includes("reduced latency") ||
          lower.includes("increased") ||
          lower.includes("improved") ||
          lower.includes("saved") ||
          lower.includes("high-throughput") ||
          /\b\d+(%|x|ms|s|k|m|users|dollars)?\b/i.test(lower)
        ) {
          competencies.push("high_impact_scale");
        }

        // If no explicit competency matched, default to high_impact_scale or leadership based on verbs
        if (competencies.length === 0) {
          competencies.push(lower.includes("built") || lower.includes("designed") ? "high_impact_scale" : "leadership");
        }

        // Extract metrics
        const metricsMatches = cleanBullet.match(/\b\d+[%a-zA-Z$]*\b/g) || [];
        const metrics = metricsMatches.filter((m) =>
          /%|ms|s|k|m|b|gb|tb|\$|users|engineers|teams/i.test(m)
        );

        // Derive STAR components from bullet point
        const situation = `At ${currentCompanyOrProject}, needed to address critical operational requirements in: ${cleanBullet.slice(0, 60)}...`;
        const task = `Responsible for designing and delivering robust execution without disrupting live users.`;
        const action = `I personally led: ${cleanBullet}`;
        const result = metrics.length > 0
          ? `Delivered measurable outcome achieving ${metrics.join(", ")} improvement.`
          : "Successfully delivered to production with zero regressions and received positive stakeholder feedback.";

        stories.push({
          id: `story-${storyCounter++}`,
          title: cleanBullet.slice(0, 50) + "...",
          companyProject: currentCompanyOrProject,
          situation,
          task,
          action,
          result,
          metrics,
          competencies,
          lastUsedTimestamp: undefined,
        });
      }
    }

    return stories;
  }

  /**
   * Audits competency coverage across candidate's stories and surfaces critical gaps.
   */
  public static analyzeCoverage(stories: BehavioralStory[]): CompetencyCoverageReport {
    const coverage: Record<BehavioralCompetency, number> = {
      leadership: 0,
      conflict: 0,
      failure_postmortem: 0,
      ambiguity: 0,
      high_impact_scale: 0,
    };

    for (const story of stories) {
      for (const comp of story.competencies) {
        if (coverage[comp] !== undefined) {
          coverage[comp]++;
        }
      }
    }

    const missingCompetencies: BehavioralCompetency[] = this.ALL_COMPETENCIES.filter(
      (comp) => coverage[comp] === 0
    );

    const gapAlerts: string[] = [];
    if (coverage.conflict === 0) {
      gapAlerts.push(
        "Critical Gap: 0 stories for 'Conflict / Disagreement'. You are at high risk of rambling or sounding defensive when asked: 'Tell me about a disagreement with a peer or tech lead.'"
      );
    }
    if (coverage.failure_postmortem === 0) {
      gapAlerts.push(
        "Critical Gap: 0 stories for 'Failure & Postmortem'. Interviewers probe for humility and ownership: 'Tell me about a time a project failed or went wrong.'"
      );
    }
    if (coverage.ambiguity === 0) {
      gapAlerts.push(
        "Moderate Gap: 0 stories for 'Ambiguity'. Big tech & top startups screen heavily for moving forward without a formal spec."
      );
    }
    if (coverage.leadership === 0) {
      gapAlerts.push(
        "Gap: 0 stories for 'Leadership & Influence without Authority'."
      );
    }
    if (coverage.high_impact_scale === 0) {
      gapAlerts.push(
        "Gap: 0 stories demonstrating quantified business scale ($ savings, latency drop %, or DAU)."
      );
    }

    const coveredCount = this.ALL_COMPETENCIES.length - missingCompetencies.length;
    const coveragePercentage = Math.round((coveredCount / this.ALL_COMPETENCIES.length) * 100);

    return {
      coverage,
      totalStories: stories.length,
      missingCompetencies,
      coveragePercentage,
      gapAlerts,
    };
  }

  /**
   * Matches an interview question to the most applicable candidate story in the bank.
   */
  public static matchStory(question: string, stories: BehavioralStory[]): BehavioralStory | null {
    if (!stories || stories.length === 0) return null;
    const qLower = (question || "").toLowerCase();

    // Map question intent to competency
    let targetCompetency: BehavioralCompetency = "high_impact_scale";
    if (qLower.includes("disagree") || qLower.includes("conflict") || qLower.includes("pushback") || qLower.includes("persuade")) {
      targetCompetency = "conflict";
    } else if (qLower.includes("fail") || qLower.includes("mistake") || qLower.includes("wrong") || qLower.includes("regret") || qLower.includes("postmortem")) {
      targetCompetency = "failure_postmortem";
    } else if (qLower.includes("ambigu") || qLower.includes("unclear") || qLower.includes("uncertain") || qLower.includes("pivot")) {
      targetCompetency = "ambiguity";
    } else if (qLower.includes("lead") || qLower.includes("mentor") || qLower.includes("initiative") || qLower.includes("proud")) {
      targetCompetency = "leadership";
    }

    // Find candidate stories tagged with this competency
    const matchingStories = stories.filter((s) => s.competencies.includes(targetCompetency));
    if (matchingStories.length > 0) {
      // Pick least recently used or first
      return matchingStories[0];
    }

    // Fallback: return the story with the most metrics
    const sortedByMetrics = [...stories].sort((a, b) => b.metrics.length - a.metrics.length);
    return sortedByMetrics[0];
  }
}
