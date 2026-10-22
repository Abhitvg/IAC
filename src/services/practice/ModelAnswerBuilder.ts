import { BehavioralStory } from './types';

export interface ModelAnswerResult {
  content: string;
  isUserStory: boolean;
  sourceLabel: string;
}

export class ModelAnswerBuilder {
  /**
   * Generates a model answer that is strictly:
   * (a) a generic outline from the question bank, or
   * (b) built only from the user's own stories and resume text, clearly labeled "based on your story".
   * Never invents facts or personal experiences.
   */
  public static build(
    questionPrompt: string,
    category: 'coding' | 'system_design' | 'behavioral',
    genericOutline: string[] = [],
    userStories: BehavioralStory[] = []
  ): ModelAnswerResult {
    // For behavioral questions, check if user has an authentic matching story in their story bank
    if (category === 'behavioral' && userStories && userStories.length > 0) {
      const lower = (questionPrompt || '').toLowerCase();
      let matchedStory: BehavioralStory | undefined;

      if (lower.includes('conflict') || lower.includes('disagree') || lower.includes('difficult')) {
        matchedStory = userStories.find((s) => s.competencies?.includes('conflict'));
      } else if (
        lower.includes('fail') ||
        lower.includes('mistake') ||
        lower.includes('incident') ||
        lower.includes('outage')
      ) {
        matchedStory = userStories.find((s) => s.competencies?.includes('failure_postmortem'));
      } else if (
        lower.includes('lead') ||
        lower.includes('mentor') ||
        lower.includes('initiative')
      ) {
        matchedStory = userStories.find((s) => s.competencies?.includes('leadership'));
      } else if (
        lower.includes('scale') ||
        lower.includes('deadline') ||
        lower.includes('tight') ||
        lower.includes('pressure')
      ) {
        matchedStory = userStories.find((s) => s.competencies?.includes('high_impact_scale'));
      } else if (
        lower.includes('ambigu') ||
        lower.includes('unclear') ||
        lower.includes('direction')
      ) {
        matchedStory = userStories.find((s) => s.competencies?.includes('ambiguity'));
      }

      // Default to first story if no specific keyword matched
      if (!matchedStory && userStories.length > 0) {
        matchedStory = userStories[0];
      }

      if (matchedStory) {
        const body = [
          `[Based on your story: ${matchedStory.companyProject || (matchedStory as any).companyOrProject || 'Your Experience'}]`,
          `Situation: ${matchedStory.situation}`,
          `Task: ${matchedStory.task}`,
          `Action: ${matchedStory.action}`,
          `Result: ${matchedStory.result}`,
        ].join('\n');

        return {
          content: body,
          isUserStory: true,
          sourceLabel: `Based on your story (${matchedStory.companyProject || (matchedStory as any).companyOrProject || 'Verified Background'})`,
        };
      }
    }

    // Generic outline from question bank
    const points =
      genericOutline && genericOutline.length > 0
        ? genericOutline
        : [
            'Clarify input constraints, edge cases, and scale requirements',
            'Outline the high-level approach and compare trade-offs against alternatives',
            'Walk through the step-by-step logic and justify complexity bounds',
            'Verify with sample inputs, boundary tests, and failure scenarios',
          ];

    const outlineText = ['[Generic Framework Outline]', ...points.map((p) => `• ${p}`)].join('\n');

    return {
      content: outlineText,
      isUserStory: false,
      sourceLabel: 'Generic Question Outline',
    };
  }
}
