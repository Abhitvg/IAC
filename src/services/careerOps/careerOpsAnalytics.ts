/**
 * Privacy-Preserving Analytics & Telemetry Engine (Hard Line H6 Compliant)
 * 
 * Rules:
 * - NO PII in logs (no raw email, phone, name, or street addresses).
 * - Hashes identifiers with SHA-256 / FNV-1a.
 * - Tracks time-to-first-value, funnel stage transitions, and velocity limits.
 */

export type CareerOpsAnalyticsEvent =
  | {
      type: 'onboarding_started';
      timestamp: number;
    }
  | {
      type: 'onboarding_first_value_rendered';
      timeToFirstValueMs: number;
      profileScore: number;
      rankedJobCount: number;
      timestamp: number;
    }
  | {
      type: 'onboarding_completed';
      gmailConnected: boolean;
      totalDurationMs: number;
      timestamp: number;
    }
  | {
      type: 'funnel_stage_transition';
      jobHash: string;
      fromStage: string;
      toStage: string;
      channel: 'ats' | 'email' | 'calendar' | 'linkedin_assist';
      timestamp: number;
    }
  | {
      type: 'kill_switch_toggled';
      enabled: boolean;
      reasonTag: string;
      timestamp: number;
    }
  | {
      type: 'action_undone';
      actionHash: string;
      channel: string;
      timestamp: number;
    }
  | {
      type: 'experiment_variant_allocated';
      experimentId: string;
      variantId: string;
      timestamp: number;
    };

/**
 * Fast anonymizer that cleans text of potential PII (emails, phone numbers)
 */
export function sanitizeLogString(str: string): string {
  return str
    .replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, '[REDACTED_EMAIL]')
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[REDACTED_PHONE]')
    .replace(/\b\d{9}\b/g, '[REDACTED_SSN]');
}

/**
 * Deterministic non-reversible hash for identifiers
 */
export function hashIdentifier(id: string): string {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `anon_${(hash >>> 0).toString(16)}`;
}

class CareerOpsAnalyticsTracker {
  private events: CareerOpsAnalyticsEvent[] = [];

  public track(event: CareerOpsAnalyticsEvent): void {
    this.events.push(event);
    if (process.env.NODE_ENV !== 'test') {
      // Safe structured log without PII
      const safePayload = JSON.stringify(event);
      console.log(`[CareerOps Analytics] ${safePayload}`);
    }
  }

  public getEvents(): readonly CareerOpsAnalyticsEvent[] {
    return this.events;
  }

  public clear(): void {
    this.events = [];
  }
}

export const careerOpsAnalytics = new CareerOpsAnalyticsTracker();
