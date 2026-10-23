import { describe, it, expect } from 'vitest';
import { cleanWord } from '../src/components/teleprompter/RecitalTeleprompterText';

describe('Recital Teleprompter Word Normalization & Matching Logic', () => {
  it('normalizes punctuation and casing from speech words', () => {
    expect(cleanWord('Distributed!')).toBe('distributed');
    expect(cleanWord('API-gateway...')).toBe('apigateway');
    expect(cleanWord('"Microservices,"')).toBe('microservices');
    expect(cleanWord('(Kafka/RabbitMQ)')).toBe('kafkarabbitmq');
    expect(cleanWord('O(N*logN)')).toBe('onlogn');
  });

  it('handles empty and special character strings cleanly', () => {
    expect(cleanWord('')).toBe('');
    expect(cleanWord('   ')).toBe('');
    expect(cleanWord('***')).toBe('');
    expect(cleanWord('#1')).toBe('1');
  });

  it('verifies token matching simulation for progressive teleprompter tracking', () => {
    const rawAnswer = "In a distributed system, we prioritize partition tolerance using Raft.";
    const tokens = rawAnswer
      .split(/\s+/)
      .map(w => cleanWord(w))
      .filter(Boolean);

    expect(tokens).toEqual([
      'in',
      'a',
      'distributed',
      'system',
      'we',
      'prioritize',
      'partition',
      'tolerance',
      'using',
      'raft'
    ]);

    // Simulate speech stream progressing
    const spokenUtterance = "in a distributed system";
    const spokenWords = spokenUtterance.split(/\s+/).map(cleanWord).filter(Boolean);

    let progressIndex = 0;
    for (const spoken of spokenWords) {
      for (let searchIdx = progressIndex; searchIdx < Math.min(progressIndex + 5, tokens.length); searchIdx++) {
        if (tokens[searchIdx] === spoken) {
          progressIndex = searchIdx + 1;
          break;
        }
      }
    }

    // 4 words spoken ("in a distributed system"), progressIndex should be 4
    expect(progressIndex).toBe(4);
    expect(tokens.slice(0, progressIndex)).toEqual(['in', 'a', 'distributed', 'system']);
    expect(tokens[progressIndex]).toBe('we'); // Active upcoming word
  });
});
