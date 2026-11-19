import { describe, it, expect } from 'vitest';
import { LinkedInHumanizerService } from '../src/services/careerOps/linkedinHumanizerService';
import { generateLinkedInDmSequence } from '../src/services/careerOps/linkedinOutreachService';

describe('LinkedIn Humanizer & Anti-AI Slop Service (avi691/linkedin-agent-skill)', () => {
  const service = LinkedInHumanizerService.getInstance();

  it('strips invisible Unicode format and zero-width characters', () => {
    // Text containing zero-width space (\u200B), BOM (\uFEFF), soft hyphen (\u00AD)
    const dirty = 'Hello\u200B world!\uFEFF This has a soft\u00ADhyphen.';
    const result = service.humanize(dirty);

    expect(result.cleanText).toBe('Hello world! This has a softhyphen.');
    expect(result.report.invisibleHits.length).toBeGreaterThan(0);
  });

  it('normalizes typographic machine tells like em dashes and curly quotes', () => {
    const dirty = 'We scale systems — fast and reliably – with “real” telemetry…';
    const result = service.humanize(dirty);

    expect(result.cleanText).not.toContain('—');
    expect(result.cleanText).not.toContain('“');
    expect(result.cleanText).not.toContain('”');
    expect(result.cleanText).not.toContain('…');
    expect(result.cleanText).toContain('with "real" telemetry...');
    expect(result.report.typographicHits.length).toBeGreaterThan(0);
  });

  it('replaces stock corporate AI buzzwords with plain, direct English', () => {
    const slopText = 'In today\'s fast-paced world, we delve into how to leverage robust architectures to seamlessly streamline engineering.';
    const result = service.humanize(slopText);

    expect(result.cleanText).not.toContain('delve into');
    expect(result.cleanText).not.toContain('leverage');
    expect(result.cleanText).not.toContain('robust');
    expect(result.cleanText).not.toContain('seamlessly');
    expect(result.cleanText).not.toContain("In today's fast-paced world");
    expect(result.report.lexicalHits.length).toBeGreaterThan(0);
  });

  it('flags structural tells such as rule-of-three, not-just-X-its-Y, and emoji walls', () => {
    const structuralText = "It's not just a tool, it's a paradigm shift. 🚀🔥✨ We optimize speed, scale, and cost.";
    const tells = service.scanStructuralTells(structuralText);

    expect(tells.some((t) => t.id === 'not-just' || t.name.includes("It's not just"))).toBe(true);
    expect(tells.some((t) => t.id === 'rocket' || t.name.includes('emoji'))).toBe(true);
  });

  it('scores human text on a 0-100 scale across the 5 heuristics', () => {
    const cleanHumanDraft =
      "I built a high-throughput ingestion worker in Go last month. We processed 14,000 events/sec without queue lag. The bottleneck wasn't the database. It was JSON parsing.";
    const report = service.scoreHumanText(cleanHumanDraft);

    expect(report.overallScore).toBeGreaterThanOrEqual(50);
    expect(report.fingerprint.score).toBe(100);
    expect(report.slopDensity.score).toBe(100);

    // Test a terrible AI slop draft
    const badSlopDraft =
      "In today's fast-paced world, we leverage seamless paradigms — unlocking robust synergies. Let that sink in.";
    const badReport = service.scoreHumanText(badSlopDraft);
    expect(badReport.overallScore).toBeLessThan(report.overallScore);
    expect(badReport.verdict).toBe('FLAGGED');
  });

  it('provides 21 proven hook formulas and 100-point profile rubric from the repository', () => {
    const hooks = service.getHookFormulas();
    expect(hooks).toHaveLength(21);
    expect(hooks[0].name).toBe('Contrarian Take');

    const rubric = service.getProfileRubric();
    expect(rubric.length).toBeGreaterThanOrEqual(10);
    const totalPoints = rubric.reduce((sum, item) => sum + item.points, 0);
    expect(totalPoints).toBe(100);
  });

  it('generates the 3-step high-converting DM sequence with < 200 char invite note', () => {
    const seq = generateLinkedInDmSequence({
      tier: 'hiring_manager',
      company: 'Datadog',
      role: 'Staff Infrastructure Engineer',
      personName: 'Rachel Kim',
      techHook: 'Kafka consumer groups and distributed caching',
    });

    expect(seq.inviteNote.length).toBeLessThanOrEqual(200);
    expect(seq.inviteNote).toContain('Datadog');
    expect(seq.day1Acceptance).toContain('Rachel');
    expect(seq.day4FollowUp).toContain('Datadog');
    expect(seq.day10CloseTheLoop).toContain('close the loop');
  });
});
