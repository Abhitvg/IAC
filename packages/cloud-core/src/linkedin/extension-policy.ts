/**
 * LinkedIn Browser Extension Policy Gate (Milestone M11 Item 7)
 * Hard Line H1: Zero unattended LinkedIn automation; zero cookie/password storage.
 *
 * Requirements Enforced:
 * 1. Default workflow is copy-text + open-profile-link (no extension required).
 * 2. Page-reading extension is strictly opt-in (disabled by default).
 * 3. Documented policy-risk notice regarding LinkedIn Terms of Service (Section 8.2).
 * 4. User-gesture-only: Every single profile read must be triggered by an active user click.
 */

export const LINKEDIN_POLICY_RISK_NOTICE =
  'POLICY RISK NOTICE: LinkedIn User Agreement (Section 8.2) strictly prohibits the use of automated bots, ' +
  'scrapers, or unauthorized browser extensions that access or interact with LinkedIn web pages. ' +
  'Enabling browser extension page-reading carries an inherent risk of LinkedIn account restrictions, temporary ' +
  'suspensions, or permanent account bans. CareerOps strongly recommends using the safe, default "Copy Text + Open Profile Link" ' +
  'manual workflow, which carries zero extension risk. By explicitly opting in, you acknowledge that you have read ' +
  'this notice, accept full personal responsibility for your LinkedIn account standing, and confirm that all reads ' +
  'will be initiated strictly via direct user gestures.';

export interface ExtensionOptInState {
  tenantId: string;
  pageReadingEnabled: boolean; // default: false
  acknowledgedPolicyRisk: boolean;
  policyRiskNotice: string;
  optedInAt?: string;
  optedOutAt?: string;
}

export interface ExtensionReadProfileRequest {
  tenantId: string;
  url: string;
  rawDomExcerpt: string;
  userGesture: {
    hasUserGesture: boolean; // Must be true (Hard Line H1)
    gestureType: 'click' | 'hotkey';
    clientTimestamp: string;
  };
}

export interface ExtractedProfileData {
  name?: string;
  currentTitle?: string;
  currentCompany?: string;
  sourceUrl: string;
  extractedAt: string;
  sanitized: true;
}

export class LinkedInExtensionPolicyGate {
  private readonly optInStore = new Map<string, ExtensionOptInState>();

  /**
   * Returns current extension policy opt-in state for a tenant.
   * Default is pageReadingEnabled = false (opt-in only).
   */
  public getOptInState(tenantId: string): ExtensionOptInState {
    const existing = this.optInStore.get(tenantId);
    if (existing) {
      return existing;
    }

    return {
      tenantId,
      pageReadingEnabled: false,
      acknowledgedPolicyRisk: false,
      policyRiskNotice: LINKEDIN_POLICY_RISK_NOTICE,
    };
  }

  /**
   * Updates extension page-reading opt-in state.
   * Enabling page reading strictly requires acknowledgedPolicyRisk = true.
   */
  public setOptInState(
    tenantId: string,
    enabled: boolean,
    acknowledgedPolicyRisk = false
  ): ExtensionOptInState {
    if (enabled && !acknowledgedPolicyRisk) {
      throw new Error(
        'Policy Risk Notice Acknowledgment Required: Enabling LinkedIn page-reading requires explicit acknowledgment of the Terms of Service account restriction risks.'
      );
    }

    const now = new Date().toISOString();
    const updated: ExtensionOptInState = {
      tenantId,
      pageReadingEnabled: enabled,
      acknowledgedPolicyRisk: enabled ? acknowledgedPolicyRisk : false,
      policyRiskNotice: LINKEDIN_POLICY_RISK_NOTICE,
      optedInAt: enabled ? now : this.optInStore.get(tenantId)?.optedInAt,
      optedOutAt: !enabled ? now : undefined,
    };

    this.optInStore.set(tenantId, updated);
    return updated;
  }

  /**
   * Processes a profile page-read payload from the browser extension.
   * Fails closed if the tenant is not opted in or if the read was not initiated by a user gesture.
   */
  public processPageRead(request: ExtensionReadProfileRequest): ExtractedProfileData {
    const state = this.getOptInState(request.tenantId);

    // 1. Opt-In Requirement
    if (!state.pageReadingEnabled || !state.acknowledgedPolicyRisk) {
      throw new Error(
        'LinkedIn page-reading extension is disabled for this tenant. Default to "copy-text + open-profile-link" or explicitly opt-in with documented policy-risk acknowledgment.'
      );
    }

    // 2. User-Gesture-Only Invariant (Hard Line H1)
    if (!request.userGesture?.hasUserGesture) {
      throw new Error(
        'Hard Line H1 Violation: Background, timed, or automated LinkedIn page-reading is strictly forbidden. A direct user gesture (click) is required.'
      );
    }

    // 3. Target URL validation
    let parsed: URL;
    try {
      parsed = new URL(request.url);
    } catch {
      throw new Error('Invalid LinkedIn URL provided');
    }

    if (!parsed.hostname.includes('linkedin.com') || !parsed.pathname.includes('/in/')) {
      throw new Error('Restricted scope: Page-reading is permitted exclusively on individual linkedin.com/in/* profile pages.');
    }

    // 4. Extract basic defanged profile properties
    const dom = request.rawDomExcerpt ?? '';
    const nameMatch = dom.match(/<h1[^>]*>([^<]+)<\/h1>/i) || dom.match(/class=["'][^"']*text-heading[^"']*["'][^>]*>([^<]+)</i);
    const titleMatch = dom.match(/class=["'][^"']*text-body-medium[^"']*["'][^>]*>([^<]+)</i);
    const companyMatch = dom.match(/aria-label=["']Current company:\s*([^"']+)["']/i);

    return {
      name: nameMatch ? nameMatch[1].trim() : undefined,
      currentTitle: titleMatch ? titleMatch[1].trim() : undefined,
      currentCompany: companyMatch ? companyMatch[1].trim() : undefined,
      sourceUrl: request.url,
      extractedAt: new Date().toISOString(),
      sanitized: true,
    };
  }
}
