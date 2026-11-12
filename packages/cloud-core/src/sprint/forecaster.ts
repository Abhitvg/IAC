/**
 * Calibrated Outcome Forecaster
 * Hard Line H6: No outcome guarantees anywhere in UI, emails, or marketing copy.
 * Forecasts are ranges with calibration notes.
 */

import { CalibratedForecast, SprintConfig, SprintMetrics } from './types';

export interface ForecasterInput {
  config: SprintConfig;
  currentMetrics?: Partial<SprintMetrics>;
  durationHoursRemaining?: number;
}

export class OutcomeForecaster {
  // Hard Line H6 statutory disclaimer
  public static readonly H6_DISCLAIMER =
    'HARD LINE H6 COMPLIANCE: CareerOps does not guarantee or promise any specific number of job offers, ' +
    'interviews, or employment outcomes. Forecasts are statistical estimates derived from historical ' +
    'population priors and candidate activity rates. Actual employer decisions depend entirely on employer discretion ' +
    'and macroeconomic labor market conditions.';

  // Population Bayesian Priors for Conversion to Interview:
  // Every prior is explicitly labeled with its source or "unvalidated" (M11 Item 5).
  public static readonly PRIOR_ATS = {
    alpha: 3,
    beta: 97,
    source: 'industry_ats_benchmark_2025',
  };
  public static readonly PRIOR_EMAIL = {
    alpha: 4,
    beta: 96,
    source: 'outreach_deliverability_index_2025',
  };
  public static readonly PRIOR_REFERRAL = {
    alpha: 20,
    beta: 80,
    source: 'employee_referral_survey_2024',
  };
  public static readonly UNVALIDATED_PRIOR = {
    alpha: 1,
    beta: 1,
    source: 'unvalidated',
  };

  /**
   * Generates a calibrated, range-based interview and application forecast.
   * Strictly enforces Hard Line H6: guarantees are forbidden by design.
   */
  public generateForecast(input: ForecasterInput): CalibratedForecast {
    const duration = input.durationHoursRemaining ?? input.config.targetDurationHours;
    const days = Math.max(1, duration / 24);

    const dailyAts = input.config.dailyAtsCap || 15;
    const dailyEmail = input.config.dailyEmailCap || 20;

    // Projected volumes over remaining sprint days
    let projectedAts = 0;
    if (input.config.enabledChannels.includes('ats')) {
      projectedAts = Math.round(dailyAts * days);
    }

    let projectedEmail = 0;
    if (input.config.enabledChannels.includes('email')) {
      projectedEmail = Math.round(dailyEmail * days);
    }

    let projectedReferrals = 0;
    if (input.config.enabledChannels.includes('referral')) {
      projectedReferrals = Math.round(3 * days); // conservative 3 warm referrals per day
    }

    // Bayesian updating using current tenant observations if available
    const observed = input.currentMetrics || {};
    const atsSubmitted = observed.atsApplicationsSubmitted || 0;
    const emailSent = observed.emailOutreachSent || 0;
    const currentInterviews = observed.interviewsScheduled || 0;

    // Update ATS posterior
    const atsAlpha = OutcomeForecaster.PRIOR_ATS.alpha + (atsSubmitted > 0 ? Math.min(atsSubmitted, currentInterviews) : 0);
    const atsBeta = OutcomeForecaster.PRIOR_ATS.beta + Math.max(0, atsSubmitted - currentInterviews);
    const atsMeanRate = atsAlpha / (atsAlpha + atsBeta);

    // Update Email posterior
    const emailAlpha = OutcomeForecaster.PRIOR_EMAIL.alpha + (emailSent > 0 ? Math.min(emailSent, currentInterviews) : 0);
    const emailBeta = OutcomeForecaster.PRIOR_EMAIL.beta + Math.max(0, emailSent - currentInterviews);
    const emailMeanRate = emailAlpha / (emailAlpha + emailBeta);

    const referralMeanRate = OutcomeForecaster.PRIOR_REFERRAL.alpha / (OutcomeForecaster.PRIOR_REFERRAL.alpha + OutcomeForecaster.PRIOR_REFERRAL.beta);

    // Expected total actions remaining + already completed
    const totalAts = atsSubmitted + projectedAts;
    const totalEmail = emailSent + projectedEmail;
    const totalReferrals = (observed.referralsInitiated || 0) + projectedReferrals;

    const expectedFromAts = totalAts * atsMeanRate;
    const expectedFromEmail = totalEmail * emailMeanRate;
    const expectedFromReferrals = totalReferrals * referralMeanRate;

    const totalExpectedInterviews = expectedFromAts + expectedFromEmail + expectedFromReferrals;

    // Calculate 80% credible range using approximate standard error
    // Min bound: lower quartile / 10th percentile
    // Max bound: upper quartile / 90th percentile
    const variance = (expectedFromAts * (1 - atsMeanRate)) +
                     (expectedFromEmail * (1 - emailMeanRate)) +
                     (expectedFromReferrals * (1 - referralMeanRate));
    const stdDev = Math.sqrt(Math.max(1, variance));

    // 80% credible interval (z ≈ 1.28)
    const rawMin = Math.max(currentInterviews, Math.floor(totalExpectedInterviews - 1.28 * stdDev));
    const rawMax = Math.max(rawMin + 1, Math.ceil(totalExpectedInterviews + 1.28 * stdDev));

    const calibrationNotes: string[] = [
      `Bayesian prior initialized from population baseline: ATS ~${(atsMeanRate * 100).toFixed(1)}% (source: "${OutcomeForecaster.PRIOR_ATS.source}"), Email ~${(emailMeanRate * 100).toFixed(1)}% (source: "${OutcomeForecaster.PRIOR_EMAIL.source}"), Referrals ~${(referralMeanRate * 100).toFixed(1)}% (source: "${OutcomeForecaster.PRIOR_REFERRAL.source}").`,
      atsSubmitted > 0 || emailSent > 0
        ? `Posterior calibrated with ${atsSubmitted} submitted ATS applications and ${emailSent} outreach emails.`
        : 'Posterior currently operating on historical population priors prior to wave execution.',
      `Target Sprint duration: ${input.config.targetDurationHours} hours (${days.toFixed(1)} days active).`,
      'Range spans an 80% credible interval based on binomial variance across enabled channels.',
    ];

    return {
      expectedInterviewsMin: rawMin,
      expectedInterviewsMax: rawMax,
      expectedApplicationsMin: Math.floor((totalAts + totalEmail) * 0.85),
      expectedApplicationsMax: Math.ceil((totalAts + totalEmail) * 1.15),
      confidenceInterval: '80% Bayesian credible interval',
      calibrationNotes,
      hardLineH6Notice: OutcomeForecaster.H6_DISCLAIMER,
    };
  }

  /**
   * Hard Line H6 text validator: ensures no marketing or UI string makes outcome guarantees.
   */
  public static validateNoOutcomeGuarantees(text: string): boolean {
    const forbiddenPhrases = [
      /guarantee(d|s)?/i,
      /promise(d|s)?/i,
      /ensure(s)? (you get|you will receive|an interview|a job)/i,
      /100%\s*(chance|success|placement)/i,
      /assured (interview|job|placement)/i,
    ];

    for (const pattern of forbiddenPhrases) {
      if (pattern.test(text)) {
        throw new Error(
          `Hard Line H6 Violation: Prohibited outcome guarantee phrase detected matching pattern "${pattern.source}".`
        );
      }
    }

    return true;
  }
}

