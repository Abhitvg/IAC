import { describe, expect, it } from 'vitest';
import { MessageRateLimiter, parseBrowserContextMessage } from '../../electron/services/browserContextValidation';

describe('browser extension context validation', () => {
  const validMessage = () => ({
    type: 'selected-text',
    content: 'How does a hash map work?',
    source: 'example.com',
    timestamp: new Date().toISOString(),
  });

  it('accepts a valid selected-text payload and strips unknown fields', () => {
    const parsed = parseBrowserContextMessage({ ...validMessage(), extra: 'ignored' });
    expect(parsed).toEqual(validMessage());
    expect(parsed).not.toHaveProperty('extra');
  });

  it('rejects unsupported message types and malformed payloads', () => {
    expect(parseBrowserContextMessage({ ...validMessage(), type: 'arbitrary' })).toBeNull();
    expect(parseBrowserContextMessage({ ...validMessage(), source: 'https://evil.test' })).toBeNull();
    expect(parseBrowserContextMessage({ ...validMessage(), content: '' })).toBeNull();
    expect(parseBrowserContextMessage({ ...validMessage(), content: 'x'.repeat(10_001) })).toBeNull();
    expect(parseBrowserContextMessage({ ...validMessage(), timestamp: 'not-a-date' })).toBeNull();
  });

  it('rejects stale and excessively future-dated payloads', () => {
    expect(parseBrowserContextMessage({ ...validMessage(), timestamp: new Date(Date.now() - 11 * 60_000).toISOString() })).toBeNull();
    expect(parseBrowserContextMessage({ ...validMessage(), timestamp: new Date(Date.now() + 3 * 60_000).toISOString() })).toBeNull();
  });

  it('limits each connection to 30 messages per minute', () => {
    const limiter = new MessageRateLimiter(2, 60_000);
    expect(limiter.allow(1_000)).toBe(true);
    expect(limiter.allow(2_000)).toBe(true);
    expect(limiter.allow(3_000)).toBe(false);
    expect(limiter.allow(61_001)).toBe(true);
  });
});
