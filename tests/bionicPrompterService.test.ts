import { describe, expect, it } from 'vitest';
import { getBionicAnswerPresentation } from '../src/services/teleprompter/bionicAnswerPresentation';

describe('Bionic answer presentation', () => {
  it('uses glanceable bullets for ordinary prose', () => {
    const presentation = getBionicAnswerPresentation(
      'Use PostgreSQL for durable relational storage.'
    );
    expect(presentation.bullets.length).toBeGreaterThan(0);
    expect(presentation.fallbackText).toBeNull();
  });

  it('preserves code-only answers when no glanceable prose can be extracted', () => {
    const fence = String.fromCharCode(96).repeat(3);
    const answer = [fence + 'typescript', 'const answer = 42;', fence].join('\n');
    expect(getBionicAnswerPresentation(answer)).toEqual({
      bullets: [],
      fallbackText: answer,
    });
  });

  it('preserves heading-only and sparse historical answers', () => {
    const fence = String.fromCharCode(96).repeat(3);
    const answer = ['# Implementation', '', fence + 'sql', 'SELECT 1;', fence].join('\n');
    expect(getBionicAnswerPresentation(answer)).toEqual({
      bullets: [],
      fallbackText: answer,
    });
  });

  it('does not render fallback content for an empty answer', () => {
    expect(getBionicAnswerPresentation('   ')).toEqual({
      bullets: [],
      fallbackText: null,
    });
  });
});
