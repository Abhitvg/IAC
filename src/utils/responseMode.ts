export type InterviewResponseMode = 'coding' | 'interview' | 'quiz' | 'application';

/**
 * A fresh live-interview workspace must not silently inherit Coding mode.
 * Keep an explicit saved mode, but use Interview as the safe default for new
 * installs and for stale or unknown persisted values.
 */
export function resolveInterviewResponseMode(value: unknown): InterviewResponseMode {
  switch (value) {
    case 'coding':
    case 'interview':
    case 'quiz':
    case 'application':
      return value;
    default:
      return 'interview';
  }
}
