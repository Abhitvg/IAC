import { describe, expect, it } from 'vitest';
import { OutcomeForecaster } from '../packages/cloud-core/src/sprint/forecaster';

describe('Milestone M9 - Outcome Forecaster & Hard Line H6 Enforcement', () => {
  const forecaster = new OutcomeForecaster();

  it('strictly enforces Hard Line H6: rejects any guarantee or promise copy', () => {
    // Prohibited marketing / UI phrases
    expect(() => {
      OutcomeForecaster.validateNoOutcomeGuarantees('We offer a 100% guarantee that you will receive offers.');
    }).toThrow(/Hard Line H6 Violation/);

    expect(() => {
      OutcomeForecaster.validateNoOutcomeGuarantees('Our service promises at least 5 interviews in 72 hours.');
    }).toThrow(/Hard Line H6 Violation/);

    expect(() => {
      OutcomeForecaster.validateNoOutcomeGuarantees('This sprint ensures you get an interview.');
    }).toThrow(/Hard Line H6 Violation/);

    expect(() => {
      OutcomeForecaster.validateNoOutcomeGuarantees('Guaranteed job placement after sprint completion.');
    }).toThrow(/Hard Line H6 Violation/);

    // Compliant statistical copy must pass
    expect(
      OutcomeForecaster.validateNoOutcomeGuarantees(
        'Sprint Mode optimizes outreach volume to maximize interview likelihood based on historical population priors.'
      )
    ).toBe(true);
  });

  it('generates probabilistic ranges with 80% credible interval and calibration notes', () => {
    const forecast = forecaster.generateForecast({
      config: {
        targetRoles: ['Senior Backend Engineer'],
        enabledChannels: ['ats', 'email', 'referral'],
        targetDurationHours: 72,
        dailyAtsCap: 15,
        dailyEmailCap: 20,
      },
    });

    expect(forecast.expectedInterviewsMin).toBeGreaterThanOrEqual(0);
    expect(forecast.expectedInterviewsMax).toBeGreaterThan(forecast.expectedInterviewsMin);
    expect(forecast.expectedApplicationsMin).toBeGreaterThan(20);
    expect(forecast.expectedApplicationsMax).toBeGreaterThan(forecast.expectedApplicationsMin);

    expect(forecast.confidenceInterval).toContain('80% Bayesian credible interval');
    expect(forecast.calibrationNotes.length).toBeGreaterThanOrEqual(3);
    expect(forecast.calibrationNotes[0]).toContain('Bayesian prior initialized from population baseline');
    expect(forecast.hardLineH6Notice).toContain('HARD LINE H6 COMPLIANCE');
    expect(forecast.hardLineH6Notice).toContain('does not guarantee or promise');
  });

  it('updates posterior rates when tenant observations are provided', () => {
    // Initial forecast (prior only)
    const priorForecast = forecaster.generateForecast({
      config: {
        targetRoles: ['Staff Software Engineer'],
        enabledChannels: ['email'],
        targetDurationHours: 72,
        dailyEmailCap: 20,
      },
    });

    // Posterior forecast after 40 emails and 3 interviews observed
    const posteriorForecast = forecaster.generateForecast({
      config: {
        targetRoles: ['Staff Software Engineer'],
        enabledChannels: ['email'],
        targetDurationHours: 72,
        dailyEmailCap: 20,
      },
      currentMetrics: {
        emailOutreachSent: 40,
        interviewsScheduled: 3,
      },
    });

    expect(posteriorForecast.calibrationNotes[1]).toContain('Posterior calibrated with');
    expect(posteriorForecast.calibrationNotes[1]).toContain('40 outreach emails');
    expect(posteriorForecast.expectedInterviewsMin).toBeGreaterThanOrEqual(3);
  });
});

