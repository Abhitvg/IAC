import { describe, expect, it } from 'vitest';
import { humanizeLinkedInText, scoreLinkedInText } from '../src/services/careerOps/linkedinContentQuality';

describe('LinkedIn content quality', () => {
  it('normalizes invisible characters and typography without changing URLs', () => {
    const input = 'A\u200B robust post — see https://example.com/a—b and “quotes”…';
    const result = humanizeLinkedInText(input);
    expect(result.text).toContain('https://example.com/a—b');
    expect(result.text).not.toContain('\u200B');
    expect(result.text).toContain('"quotes"...');
  });
  it('does not rewrite URL query text or email addresses', () => {
    const input = 'Use leverage in this note. https://example.com/?q=leverage test@example.com';
    const result = humanizeLinkedInText(input);
    expect(result.text).toContain('https://example.com/?q=leverage');
    expect(result.text).toContain('test@example.com');
    expect(result.text).toContain('Use use in this note.');
  });
  it('marks short comments as insufficient rather than inventing a score', () => {
    const report = scoreLinkedInText('Thanks for sharing.', 'comment');
    expect(report.verdict).toBe('INSUFFICIENT_TEXT');
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
    expect(result.changes).toContain('Normalized invisible characters and typography');
    expect(result.changes).not.toContain('Replaced stock phrases with plainer wording');
  });
});
