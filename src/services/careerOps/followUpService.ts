/**
 * CareerOps Automated Follow-Up Cadence & Timeline Engine
 *
 * Implements high-conversion timing cadences:
 * - Day 3: Recruiter LinkedIn check-in (<= 300 chars)
 * - Day 7: Hiring Manager technical value note (<= 300 chars)
 * - Day 14: Pipeline assessment / respectful check-in email
 */

export interface FollowUpMilestone {
  dayOffset: number;
  targetAudience: 'recruiter' | 'hiring_manager' | 'talent_team';
  channel: 'linkedin' | 'email';
  title: string;
  draftText: string;
  dueDate: number;
  isDue: boolean;
  isOverdue: boolean;
  daysRemaining: number;
}

const MS_PER_DAY = 86400000;

export function calculateFollowUpTimeline(
  appliedTimestamp: number,
  company: string,
  role: string,
  strategicAngle: string = 'distributed systems & reliability'
): FollowUpMilestone[] {
  const now = Date.now();
  const elapsedDays = Math.floor((now - appliedTimestamp) / MS_PER_DAY);

  const milestones: FollowUpMilestone[] = [
    {
      dayOffset: 3,
      targetAudience: 'recruiter',
      channel: 'linkedin',
      title: 'Day 3 Recruiter Check-In',
      draftText: `Hi! I applied for the ${role} opening at ${company} 3 days ago. With background in ${strategicAngle}, I wanted to quickly confirm my application reached your review queue and see if you have any questions. Best regards!`.slice(0, 298),
      dueDate: appliedTimestamp + 3 * MS_PER_DAY,
      isDue: elapsedDays >= 3 && elapsedDays < 7,
      isOverdue: elapsedDays >= 7,
      daysRemaining: Math.max(0, 3 - elapsedDays),
    },
    {
      dayOffset: 7,
      targetAudience: 'hiring_manager',
      channel: 'linkedin',
      title: 'Day 7 Hiring Manager Value Note',
      draftText: `Hi! Noticed you lead engineering for ${role} at ${company}. Having engineered equivalent ${strategicAngle} solutions, I applied last week and would love to follow your team's architecture updates. Hope you have a great week!`.slice(0, 298),
      dueDate: appliedTimestamp + 7 * MS_PER_DAY,
      isDue: elapsedDays >= 7 && elapsedDays < 14,
      isOverdue: elapsedDays >= 14,
      daysRemaining: Math.max(0, 7 - elapsedDays),
    },
    {
      dayOffset: 14,
      targetAudience: 'talent_team',
      channel: 'email',
      title: 'Day 14 Respectful Application Check-In',
      draftText: `Subject: Follow-up: Application for ${role} (${company})\n\nHi ${company} Recruiting Team,\n\nI hope your week is off to a great start. I wanted to follow up on my application submitted two weeks ago for the ${role} position.\n\nGiven my experience delivering high-reliability systems and scalable architectures, I remain very enthusiastic about contributing to ${company}. Please let me know if any additional work samples or references would be helpful as you evaluate candidate profiles.\n\nThank you for your time and guidance.\n\nBest regards,\nCandidate`,
      dueDate: appliedTimestamp + 14 * MS_PER_DAY,
      isDue: elapsedDays >= 14,
      isOverdue: elapsedDays >= 21,
      daysRemaining: Math.max(0, 14 - elapsedDays),
    },
  ];

  return milestones;
}

export function getNextDueFollowUp(
  appliedTimestamp: number,
  company: string,
  role: string
): FollowUpMilestone | null {
  const timeline = calculateFollowUpTimeline(appliedTimestamp, company, role);
  return timeline.find((m) => m.isDue) || timeline.find((m) => m.daysRemaining > 0) || null;
}
