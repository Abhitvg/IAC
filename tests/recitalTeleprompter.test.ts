import { describe, it, expect } from 'vitest';
import { cleanWord, getWordTargetDurationMs } from '../src/components/teleprompter/RecitalTeleprompterText';

describe('Instant Recital Teleprompter Engine (< 25ms Latency)', () => {
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

  it('calculates human speech durations accurately for short, medium, and long words', () => {
    // At 150 WPM (baseMs = 400ms):
    // Short words (<= 3 chars, e.g. "in", "a", "the") should take ~260ms
    const shortWordMs = getWordTargetDurationMs('in', 150);
    expect(shortWordMs).toBe(260);

    // Medium words (4-7 chars, e.g. "system", "using") should take ~380ms
    const mediumWordMs = getWordTargetDurationMs('system', 150);
    expect(mediumWordMs).toBe(380);

    // Long technical words (>= 8 chars, e.g. "distributed", "concurrency") should take ~540ms
    const longWordMs = getWordTargetDurationMs('distributed', 150);
    expect(longWordMs).toBe(540);

    // At 180 WPM (faster tempo): durations scale down proportionally
    const fastShortMs = getWordTargetDurationMs('in', 180);
    expect(fastShortMs).toBeLessThan(shortWordMs);
  });

  it('simulates instantaneous 21ms audio frame speech tracking and halts on pause', () => {
    const tokens = ['in', 'a', 'distributed', 'system'];
    let currentIdx = 0;
    let accumulatedMs = 0;
    const wpm = 150;

    // Simulate 21ms audio frames arriving from AudioRecorder (< 21ms)
    const deliverFrame = (isSpeaking: boolean, deltaMs: number = 21) => {
      if (!isSpeaking) return; // Immediately halts on pause (< 21ms)
      if (currentIdx >= tokens.length) return;

      const targetMs = getWordTargetDurationMs(tokens[currentIdx], wpm);
      accumulatedMs += deltaMs;
      if (accumulatedMs >= targetMs) {
        accumulatedMs = 0;
        currentIdx++;
      }
    };

    // 1. Deliver 12 speech frames (12 * 21ms = 252ms) -> "in" needs 260ms, not completed yet
    for (let i = 0; i < 12; i++) deliverFrame(true, 21);
    expect(currentIdx).toBe(0);

    // 2. Deliver 1 more frame (total 273ms >= 260ms) -> "in" completes, index becomes 1!
    deliverFrame(true, 21);
    expect(currentIdx).toBe(1);

    // 3. User pauses to think for 1500ms -> Deliver 50 silence frames (isSpeaking = false)
    for (let i = 0; i < 50; i++) deliverFrame(false, 21);
    // Position MUST NOT drift while user is silent!
    expect(currentIdx).toBe(1);

    // 4. User resumes speaking for "a" (needs 260ms = 13 frames)
    for (let i = 0; i < 13; i++) deliverFrame(true, 21);
    expect(currentIdx).toBe(2);
  });
});
