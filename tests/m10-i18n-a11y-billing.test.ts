import { describe, expect, it } from 'vitest';
import { I18nEngine } from '../packages/cloud-core/src/i18n/locale';
import { AccessibilityAuditor } from '../packages/cloud-core/src/a11y/standards';
import { TierEnforcer } from '../packages/cloud-core/src/billing/tier-enforcer';

describe('Milestone M10 - i18n, Accessibility (a11y) & Billing Quotas', () => {
  it('translates core system terms and formats numbers/dates across 5 supported locales', () => {
    // English
    expect(I18nEngine.getTranslation('sprint_mode', 'en-US')).toBe('Sprint Mode');

    // French
    expect(I18nEngine.getTranslation('sprint_mode', 'fr-FR')).toBe('Mode Sprint');
    expect(I18nEngine.getTranslation('truthfulness_gate', 'fr-FR')).toBe('Portail de Vérification de Vérité');

    // German
    expect(I18nEngine.getTranslation('sprint_mode', 'de-DE')).toBe('Sprint-Modus');

    // Hindi
    expect(I18nEngine.getTranslation('sprint_mode', 'hi-IN')).toBe('स्प्रिंट मोड');
    expect(I18nEngine.getTranslation('truthfulness_gate', 'hi-IN')).toBe('सत्यता सत्यापन गेट');

    // Formatter checks
    const formattedUsd = I18nEngine.formatCurrency(150000, 'USD', 'en-US');
    expect(formattedUsd).toContain('150,000');

    const formattedEur = I18nEngine.formatCurrency(120000, 'EUR', 'fr-FR');
    expect(formattedEur).toContain('120');
  });

  it('audits component markup against WCAG 2.1 AA accessibility standards', () => {
    const auditor = new AccessibilityAuditor();

    // Inaccessible markup: missing alt on image, unlabeled input, empty button
    const badMarkup = `
      <div>
        <img src="/logo.png" />
        <input type="text" />
        <button></button>
      </div>
    `;

    const badResult = auditor.auditComponentMarkup(badMarkup);
    expect(badResult.isAccessible).toBe(false);
    expect(badResult.violations.length).toBe(3);
    expect(badResult.violations[0]).toContain('WCAG 1.1.1 Non-text Content');
    expect(badResult.violations[1]).toContain('WCAG 1.3.1 Info and Relationships');
    expect(badResult.violations[2]).toContain('WCAG 4.1.2 Name, Role, Value');

    // Accessible markup
    const goodMarkup = `
      <div>
        <img src="/logo.png" alt="CareerOps Brand Logo" />
        <input type="text" id="target-role" aria-label="Target Role Title" />
        <button aria-label="Execute One-Click Send">Send</button>
      </div>
    `;

    const goodResult = auditor.auditComponentMarkup(goodMarkup);
    expect(goodResult.isAccessible).toBe(true);
    expect(goodResult.violations).toHaveLength(0);
  });

  it('enforces tier quotas: starter vs sprint_pro vs enterprise', () => {
    // Starter: max 1 concurrent sprint, max 30 applications/mo
    const starterUsage = {
      activeSprintsCount: 1,
      applicationsThisMonth: 30,
      outreachEmailsThisMonth: 45,
    };

    const sprintCheck = TierEnforcer.checkQuota('starter', starterUsage, 'start_sprint');
    expect(sprintCheck.allowed).toBe(false);
    expect(sprintCheck.reason).toContain('Active sprint limit reached (1/1) for starter tier');

    const applyCheck = TierEnforcer.checkQuota('starter', starterUsage, 'apply');
    expect(applyCheck.allowed).toBe(false);
    expect(applyCheck.reason).toContain('Monthly application limit reached (30/30) for starter tier');

    // Sprint Pro allows multiple sprints and higher limits
    const proUsage = {
      activeSprintsCount: 1,
      applicationsThisMonth: 120,
      outreachEmailsThisMonth: 200,
    };

    const proSprintCheck = TierEnforcer.checkQuota('sprint_pro', proUsage, 'start_sprint');
    expect(proSprintCheck.allowed).toBe(true);
    expect(proSprintCheck.remainingQuota).toBe(2); // 3 - 1 = 2
  });
});
