/**
 * Accessibility (a11y) Standards & WCAG 2.1 AA Compliance Specifications
 */

export interface AccessibilityAuditResult {
  isAccessible: boolean;
  violations: string[];
  recommendations: string[];
}

export class AccessibilityAuditor {
  /**
   * Audits component HTML markup or attributes against WCAG 2.1 AA guidelines.
   */
  public auditComponentMarkup(html: string): AccessibilityAuditResult {
    const violations: string[] = [];
    const recommendations: string[] = [];

    // Check images have alt text
    const imgRegex = /<img(?![^>]*\balt=)[^>]*>/gi;
    if (imgRegex.test(html)) {
      violations.push('WCAG 1.1.1 Non-text Content: <img> tags found without an alt attribute.');
      recommendations.push('Provide descriptive alt text for images or alt="" if decorative.');
    }

    // Check form inputs have associated labels or aria-label
    const inputWithoutLabelRegex = /<input(?![^>]*\b(aria-label|aria-labelledby|id=))[^>]*>/gi;
    if (inputWithoutLabelRegex.test(html)) {
      violations.push('WCAG 1.3.1 Info and Relationships: Form inputs must have an associated label or aria-label.');
      recommendations.push('Add aria-label or <label for="..."> to all form inputs.');
    }

    // Check buttons have accessible names
    const emptyButtonRegex = /<button[^>]*>\s*<\/button>/gi;
    if (emptyButtonRegex.test(html)) {
      violations.push('WCAG 4.1.2 Name, Role, Value: <button> element must have an accessible name or text content.');
      recommendations.push('Include visible text or aria-label inside button elements.');
    }

    // Check live regions have aria-live
    if (html.includes('activity-feed') && !html.includes('aria-live')) {
      violations.push('WCAG 4.1.3 Status Messages: Real-time activity feeds should define aria-live="polite".');
      recommendations.push('Add aria-live="polite" and aria-atomic="true" to dynamic feed containers.');
    }

    return {
      isAccessible: violations.length === 0,
      violations,
      recommendations,
    };
  }

  /**
   * Generates standard WCAG 2.1 AA accessible props for Assist Queue buttons.
   */
  public getAssistQueueButtonProps(actionName: string, recipientName: string) {
    return {
      role: 'button',
      tabIndex: 0,
      'aria-label': `${actionName} for ${recipientName} (requires manual one-click user action)`,
      'data-user-gesture-required': 'true',
    };
  }
}

