import { describe, expect, it } from 'vitest';
import {
  getLinkedInCharacterLimit,
  humanizeLinkedInText,
  scoreLinkedInText,
} from '../src/services/careerOps/linkedinContentQuality';

describe('LinkedIn content quality', () => {
  it('normalizes selected invisible characters and typography without changing URLs', () => {
    const input = 'A\u200B robust post — see https://example.com/a—b and “quotes”…';
    const result = humanizeLinkedInText(input);
    expect(result.text).toContain('https://example.com/a—b');
    expect(result.text).not.toContain('\u200B');
    expect(result.text).toContain('"quotes"...');
  });

  it('does not rewrite URL query text or email addresses', () => {
    const input =
      'Use leverage in this note. https://example.com/?q=leverage test@example.com';
    const result = humanizeLinkedInText(input);
    expect(result.text).toContain('https://example.com/?q=leverage');
    expect(result.text).toContain('test@example.com');
    expect(result.replacements).toContainEqual({ find: 'leverage', replace: 'use', count: 1 });
    expect(result.text).toContain('Use use in this note.');
  });

  it('marks short samples as insufficient rather than inventing a score', () => {
    const report = scoreLinkedInText('Thanks for sharing.', 'comment');
    expect(report.verdict).toBe('INSUFFICIENT_TEXT');
    expect(report.overall).toBeNull();
    expect(report.checks.voice.score).toBeNull();
  });

  it('flags known structural patterns for manual review', () => {
    const result = humanizeLinkedInText("It's not just a tool, it's a system.");
    expect(result.structuralFlags).toContain('"It\'s not just X, it\'s Y"');
  });

  it('preserves joiner characters used by emoji and Indic scripts', () => {
    const input = '👩‍💻 हिन्दी क्‍षि';
    const result = humanizeLinkedInText(input);
    expect(result.text).toContain('👩‍💻');
    expect(result.text).toContain('क्‍षि');
  });

  it('does not claim lexical cleanup when only typography changed', () => {
    const result = humanizeLinkedInText('A useful note — with clean typography.');
    expect(result.changes).toContain('Normalized selected invisible characters and typography');
    expect(result.replacements).toHaveLength(0);
  });

  it('uses separate character targets for connection invites and DMs', () => {
    expect(getLinkedInCharacterLimit('invite')).toBe(200);
    expect(getLinkedInCharacterLimit('dm')).toBe(300);
    expect(getLinkedInCharacterLimit('post')).toBeNull();
  });

  it('calculates a weighted writing heuristic and reports the weakest signal', () => {
    const text = [
      'I built a hiring workflow for Sheetal Electrotech last year.',
      'It cut manual review time from 45 minutes to 12 minutes.',
      'I learned that the hardest part was agreeing on the input data.',
      'The team now checks the evidence before acting.',
      'That made the process easier to explain and maintain.',
    ].join(' ');
    const report = scoreLinkedInText(text, 'post');
    expect(report.verdict).not.toBe('INSUFFICIENT_TEXT');
    expect(report.overall).not.toBeNull();
    expect(report.weakestCheck).toBeTruthy();
    expect(
      Object.values(report.checks).every(
        (check) => check.score === null || (check.score >= 0 && check.score <= 100)
      )
    ).toBe(true);
  });
});
