import { describe, it, expect } from 'vitest';
import {
  classifyUtterance,
  extractTokens,
  calculateOverlap,
} from '../src/services/interruptionDetector';

describe('interruptionDetector & Utterance Classification', () => {
  const referenceAnswer = `
    Amazon Elastic Kubernetes Service (EKS) is a managed container service to run and scale Kubernetes applications in the cloud or on-premises.
    EKS automatically manages the availability and scalability of the Kubernetes control plane nodes responsible for scheduling containers,
    managing service availability, storing cluster data, and other key tasks.
  `;

  describe('extractTokens with Unicode & Technical Words', () => {
    it('extracts English words without stop words', () => {
      const tokens = extractTokens('Kafka ensures message ordering across partitions');
      expect(tokens).toContain('kafka');
      expect(tokens).toContain('ensures');
      expect(tokens).toContain('ordering');
      expect(tokens).toContain('partitions');
      expect(tokens).not.toContain('across');
    });

    it('preserves multilingual and non-ASCII characters without stripping them', () => {
      const tokens = extractTokens('AWS के fundamentals के बारे में कुछ बताओ');
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.some((t) => t.includes('fundamentals'))).toBe(true);
    });
  });

  describe('calculateOverlap', () => {
    it('returns high overlap when candidate recites answer text', () => {
      const speech = 'Amazon Elastic Kubernetes Service is a managed container service';
      const overlap = calculateOverlap(speech, referenceAnswer);
      expect(overlap.compositeScore).toBeGreaterThan(0.25);
    });

    it('returns near-zero overlap for a completely different question', () => {
      const speech = 'What is Apache Kafka and how does it guarantee message order?';
      const overlap = calculateOverlap(speech, referenceAnswer);
      expect(overlap.compositeScore).toBeLessThan(0.08);
    });
  });

  describe('classifyUtterance', () => {
    it('classifies empty or blank speech as EMPTY', () => {
      expect(classifyUtterance('', null).type).toBe('EMPTY');
      expect(classifyUtterance('   ', null).type).toBe('EMPTY');
    });

    it('classifies conversational fillers correctly', () => {
      expect(classifyUtterance('Yeah', referenceAnswer).type).toBe('CONVERSATIONAL_FILLER');
      expect(classifyUtterance('Okay sure', referenceAnswer).type).toBe('CONVERSATIONAL_FILLER');
      expect(classifyUtterance('Understood thank you.', referenceAnswer).type).toBe(
        'CONVERSATIONAL_FILLER'
      );
    });

    it('classifies direct reciting of teleprompter as CANDIDATE_RECITAL', () => {
      const candidateSpeech =
        'EKS automatically manages the availability and scalability of Kubernetes control plane';
      const res = classifyUtterance(candidateSpeech, referenceAnswer);
      expect(res.type).toBe('CANDIDATE_RECITAL');
    });

    it('classifies candidate first-person narrative statements as CANDIDATE_RECITAL', () => {
      const speech =
        'In my previous project at my last company, our team migrated our microservices to Kubernetes';
      const res = classifyUtterance(speech, referenceAnswer);
      expect(res.type).toBe('CANDIDATE_RECITAL');
    });

    it('classifies distinct questions with zero overlap as INTERVIEWER_INTERRUPTION during solo testing', () => {
      const speech = 'Explain how Kafka consumer groups rebalance partitions.';
      const res = classifyUtterance(speech, referenceAnswer);
      expect(res.type).toBe('INTERVIEWER_INTERRUPTION');
    });

    it('classifies multilingual Hinglish prompt as INTERVIEWER_INTERRUPTION', () => {
      const speech = 'AWS के fundamentals के बारे में कुछ बताओ';
      const res = classifyUtterance(speech, referenceAnswer);
      expect(res.type).toBe('INTERVIEWER_INTERRUPTION');
    });

    it('classifies question with question mark as INTERVIEWER_INTERRUPTION', () => {
      const speech = 'What about latency and replication lag?';
      const res = classifyUtterance(speech, referenceAnswer);
      expect(res.type).toBe('INTERVIEWER_INTERRUPTION');
    });

    it('classifies any valid speech as INTERVIEWER_QUESTION when no answer is active', () => {
      const speech = 'Tell me about your experience with distributed systems.';
      const res = classifyUtterance(speech, null);
      expect(res.type).toBe('INTERVIEWER_QUESTION');
    });
  });
});
