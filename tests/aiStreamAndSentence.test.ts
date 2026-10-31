import { describe, it, expect } from 'vitest';
import { AIStreamParser } from '../src/services/AIStreamParser';
import { SentenceBuffer } from '../src/services/SentenceBuffer';

describe('AIStreamParser Suite', () => {
  it('strips <think>...</think> tags and returns only clean candidate text', () => {
    const parser = new AIStreamParser();
    const chunk1 = '<think>Analyzing question complexity and candidate role...</think>To solve this problem, ';
    const chunk2 = 'we can use a two-pointer approach.';

    const out1 = parser.parseChunk(chunk1);
    const out2 = parser.parseChunk(chunk2);

    expect(out1).toBe('To solve this problem, ');
    expect(out2).toBe('we can use a two-pointer approach.');
    expect(parser.getCleanText()).toBe('To solve this problem, we can use a two-pointer approach.');
  });

  it('handles reasoning tags split across streaming chunk boundaries', () => {
    const parser = new AIStreamParser();

    // Opening tag split across chunks
    expect(parser.parseChunk('Hello. <th')).toBe('Hello. ');
    expect(parser.parseChunk('ink>Inside reasoning thought process')).toBe('');
    // Closing tag split across chunks
    expect(parser.parseChunk('</th')).toBe('');
    expect(parser.parseChunk('ink>Here is the answer.')).toBe('Here is the answer.');

    expect(parser.getCleanText()).toBe('Hello. Here is the answer.');
  });

  it('supports alternative reasoning tags: <thought>, <reasoning>, [reasoning]', () => {
    const parser = new AIStreamParser();

    const t1 = parser.parseChunk('<thought>Internal deliberation</thought>Output 1. ');
    const t2 = parser.parseChunk('<reasoning>Deep reasoning</reasoning>Output 2. ');
    const t3 = parser.parseChunk('[reasoning]More deliberation[/reasoning]Output 3.');

    expect(t1).toBe('Output 1. ');
    expect(t2).toBe('Output 2. ');
    expect(t3).toBe('Output 3.');
    expect(parser.getCleanText()).toBe('Output 1. Output 2. Output 3.');
  });

  it('discards unclosed reasoning block if stream aborts or finishes inside reasoning', () => {
    const parser = new AIStreamParser();
    parser.parseChunk('Starting response. <think>Unfinished thought process...');
    const flushed = parser.flush();

    expect(flushed).toBe('');
    expect(parser.getCleanText()).toBe('Starting response. ');
  });

  it('emits non-tag candidate buffer if end of stream turns out not to be a tag', () => {
    const parser = new AIStreamParser();
    const out = parser.parseChunk('Value is < 5 and ');
    expect(out).toBe('Value is < 5 and ');
    expect(parser.flush()).toBe('');
  });

  it('completely resets parser state between requests', () => {
    const parser = new AIStreamParser();
    parser.parseChunk('<think>Incomplete');
    expect(parser.isInsideReasoning()).toBe(true);

    parser.reset();
    expect(parser.isInsideReasoning()).toBe(false);
    expect(parser.getCleanText()).toBe('');
  });
});

describe('SentenceBuffer Suite', () => {
  it('segments sentences accurately on period, exclamation, and question mark', () => {
    const buffer = new SentenceBuffer();
    const s1 = buffer.push('Hello interviewer! How are you doing? I am ready for the technical questions. ');
    expect(s1).toEqual([
      'Hello interviewer!',
      'How are you doing?',
      'I am ready for the technical questions.',
    ]);
  });

  it('does NOT split sentences on decimal numbers', () => {
    const buffer = new SentenceBuffer();
    const s1 = buffer.push('The constant pi is approximately 3.14159 in Euclidean geometry. ');
    expect(s1).toEqual(['The constant pi is approximately 3.14159 in Euclidean geometry.']);
  });

  it('does NOT split sentences on technical abbreviations (Node.js, e.g., i.e., vs.)', () => {
    const buffer = new SentenceBuffer();
    const s1 = buffer.push('We used Node.js for backend services. Next, we optimized latency. ');
    expect(s1).toEqual([
      'We used Node.js for backend services.',
      'Next, we optimized latency.',
    ]);
  });

  it('preserves code blocks without corrupting syntax into sentences', () => {
    const buffer = new SentenceBuffer();
    const input = 'Here is the implementation:\n```java\npublic int sum(int a, int b) {\n    return a + b;\n}\n```\nThis runs in O(1) time.';

    const sentences = buffer.push(input);
    expect(sentences.length).toBeGreaterThan(0);
    expect(sentences.some((s) => s.includes('```'))).toBe(true);
  });

  it('flushes incomplete trailing sentence at completion', () => {
    const buffer = new SentenceBuffer();
    buffer.push('This is an incomplete thought');
    const flushed = buffer.flush();
    expect(flushed).toEqual(['This is an incomplete thought']);
  });

  it('reset discards incomplete buffer without emitting on cancellation', () => {
    const buffer = new SentenceBuffer();
    buffer.push('Cancelled statement that should never be shown');
    buffer.reset();
    expect(buffer.flush()).toEqual([]);
  });
});
