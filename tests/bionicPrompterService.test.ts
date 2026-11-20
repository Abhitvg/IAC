import { describe, expect, it } from 'vitest';
import { getBionicAnswerPresentation } from '../src/services/teleprompter/bionicPrompterService';

describe('Bionic answer presentation', () => {
  it('uses glanceable bullets for ordinary prose', () => {
    const presentation = getBionicAnswerPresentation('Use PostgreSQL for durable relational storage.');
    expect(presentation.bullets.length).toBeGreaterThan(0);
    expect(presentation.fallbackText).toBeNull();
  });

  it('preserves code-only answers when no glanceable prose can be extracted', () => {
    const answer = '\`\`\`typescript\nconst answer = 42;\n\`\`\`';
    expect(getBionicAnswerPresentation(answer)).toEqual({ bullets: [], fallbackText: answer });
  });

  it('preserves heading-only and sparse historical answers', () => {
    const answer = '# Implementation\n\n\`\`\`sql\nSELECT 1;\n\`\`\`';
    expect(getBionicAnswerPresentation(answer)).toEqual({ bullets: [], fallbackText: answer });
  });

  it('does not render fallback content for an empty answer', () => {
    expect(getBionicAnswerPresentation('   ')).toEqual({ bullets: [], fallbackText: null });
  });
});
