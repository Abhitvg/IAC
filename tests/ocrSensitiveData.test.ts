import { describe, expect, it } from 'vitest';
import { stitchSanitizedOcrTexts } from '../electron/services/ocrStitcher';

describe('Sensitive-data redaction in appended OCR captures', () => {
  it('redacts secrets from both the previous capture and newly appended text', () => {
    const groqKey = 'gsk_' + 'G'.repeat(32);
    const openAiKey = 'sk-proj-' + 'O'.repeat(30);
    const bearerToken = 'Bearer ' + 'T'.repeat(32);

    const stitched = stitchSanitizedOcrTexts(
      'Previous screen content: ' + groqKey,
      'Scrolled screen content: ' + openAiKey + '\nAuthorization: ' + bearerToken
    );

    expect(stitched).toContain('[REDACTED_GROQ_KEY]');
    expect(stitched).toContain('[REDACTED_OPENAI_KEY]');
    expect(stitched).toContain('Bearer [REDACTED_AUTH_TOKEN]');
    expect(stitched).not.toContain(groqKey);
    expect(stitched).not.toContain(openAiKey);
    expect(stitched).not.toContain(bearerToken);
  });

  it('redacts previously buffered OCR even when the appended capture is empty', () => {
    const groqKey = 'gsk_' + 'S'.repeat(32);
    const stitched = stitchSanitizedOcrTexts('Captured: ' + groqKey, '');

    expect(stitched).toContain('[REDACTED_GROQ_KEY]');
    expect(stitched).not.toContain(groqKey);
  });
});
