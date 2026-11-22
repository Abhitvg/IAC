import { describe, expect, it } from 'vitest';
import { buildConversationalPromptSection } from '../src/services/responseStyle';

describe('natural spoken interview response guidance', () => {
  it('keeps simple answers direct and does not force a five-step template', () => {
    const prompt = buildConversationalPromptSection('definition', 'interview');
    expect(prompt).toContain('ANSWER DIRECTLY IN SENTENCE 1');
    expect(prompt).toContain('Simple questions should receive a short answer');
    expect(prompt).toContain('Do not force an example, trade-off, or five-part structure');
    expect(prompt).not.toContain('DEFAULT 5-STEP SPOKEN RESPONSE FRAMEWORK');
  });

  it('requires a clear boundary between verified experience and hypothetical approach', () => {
    const prompt = buildConversationalPromptSection('behavioral', 'interview');
    expect(prompt).toContain('NO FABRICATION');
    expect(prompt).toContain('Clearly distinguish what the candidate has done');
    expect(prompt).toContain('do not label the STAR steps');
  });

  it('makes follow-up answers concise and avoids repeating prior answers', () => {
    const prompt = buildConversationalPromptSection('follow_up', 'interview');
    expect(prompt).toContain('answer only what the interviewer just asked');
    expect(prompt).toContain('without repeating previous definitions');
  });

  it('preserves coding mode as a distinct response contract', () => {
    const prompt = buildConversationalPromptSection('coding', 'coding', 'Java');
    expect(prompt).toContain('one complete Java code block');
    expect(prompt).toContain('Never claim code was compiled or tested unless it actually was');
  });
});
