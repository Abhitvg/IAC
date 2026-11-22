export type InterviewResponseMode = 'coding' | 'interview' | 'quiz';

/**
 * A fresh live-interview workspace must not silently inherit Coding mode.
 * Keep an explicit saved mode, but use Interview as the safe default for new
 * installs and for stale/unknown persisted values.
 */
export function resolveInterviewResponseMode(value: unknown): InterviewResponseMode {
  return value === 'coding' || value === 'interview' || value === 'quiz' ? value : 'interview';
}
