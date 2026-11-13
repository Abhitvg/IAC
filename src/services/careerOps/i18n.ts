/**
 * CareerOps Internationalization (i18n) String Table
 * Provides localized labels, plain-language scope descriptions, and accessibility strings.
 */

export const careerOpsTranslations = {
  en: {
    common: {
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      confirm: 'Confirm',
      back: 'Back',
      next: 'Next',
      close: 'Close',
      active: 'Active',
      paused: 'Paused',
      connected: 'Connected',
      disconnected: 'Disconnected',
    },
    today: {
      title: '☀️ Today Digest',
      subtitle: 'Recent autonomous actions, pending user reviews, and channel health.',
      emptyState: 'All systems clear. No urgent candidate actions pending.',
      referralHoldNotice: 'Held for referral wave (expires in {days} days)',
      undoAction: 'Undo ({seconds}s)',
    },
    controls: {
      title: 'Governance, Safety Caps & Privacy',
      killSwitchEngaged: 'EMERGENCY KILL SWITCH ACTIVE',
      killSwitchDesc: 'All automated applications, outreach emails, and queues are completely frozen.',
      resumeSystems: 'Resume Systems',
      emergencyStop: 'Emergency Stop (k)',
      dailyCaps: 'Daily Autonomous Velocity Caps',
      referralHold: 'Referral-First Hold Period',
      dsarTitle: 'Data Subject Portability (GDPR Art. 15 / CCPA)',
      erasureTitle: 'Permanent Erasure & Crypto-Shredding (GDPR Art. 17)',
      purgeConfirmationPrompt: 'DELETE MY ACCOUNT AND DATA',
    },
    onboarding: {
      step1Title: 'Confirm Your Candidate Identity',
      step2Title: 'Target Roles & Compensation Floor',
      step3Title: 'Instant Profile Audit & Top Matches Unlocked',
      step4Title: 'Connect Gmail (Transparent Scope Consent)',
      firstValueSubtext: 'First value generated in < 1s',
      skipButton: 'Skip for Now (Manual Mode)',
      connectGmailButton: 'Connect Gmail Account',
      finishButton: 'Enter CareerOps Workspace',
    },
    connectors: {
      gmailSend: 'Send confirmed application and outreach emails strictly within daily caps.',
      gmailReadonly: 'Detect incoming recruiter replies and interview invitations.',
      calendarEvents: 'Sync interview loops and auto-block preparation rehearsal sessions.',
      linkedinAssist: 'Local Assist Queue only. Zero headless automated bots (Hard Line H1).',
    },
  },
} as const;

export type TranslationKey = keyof typeof careerOpsTranslations['en'];

export function t(path: string, params?: Record<string, string | number>): string {
  const parts = path.split('.');
  let current: any = careerOpsTranslations.en;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return path; // Fallback to raw key if not found
    }
  }

  if (typeof current !== 'string') return path;

  if (params) {
    return Object.entries(params).reduce(
      (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
      current
    );
  }

  return current;
}

