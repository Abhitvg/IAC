export type BrowserContextMessage = {
  type: 'selected-text' | 'page-url';
  content: string;
  source: string;
  timestamp: string;
};

const MAX_CONTENT_LENGTH = 10_000;
const MAX_SOURCE_LENGTH = 253;

export function parseBrowserContextMessage(value: unknown): BrowserContextMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const message = value as Record<string, unknown>;
  if (message.type !== 'selected-text' && message.type !== 'page-url') return null;
  if (typeof message.content !== 'string' || message.content.trim().length === 0) return null;
  if (message.content.length > MAX_CONTENT_LENGTH) return null;
  if (typeof message.source !== 'string' || message.source.length === 0 || message.source.length > MAX_SOURCE_LENGTH) return null;
  if (!/^[a-zA-Z0-9.-]+$/.test(message.source)) return null;
  if (typeof message.timestamp !== 'string' || message.timestamp.length > 40) return null;

  const timestamp = Date.parse(message.timestamp);
  if (!Number.isFinite(timestamp)) return null;
  // Reject stale/future timestamps outside a generous window; they are not needed for context.
  const ageMs = Date.now() - timestamp;
  if (ageMs > 10 * 60 * 1000 || ageMs < -2 * 60 * 1000) return null;

  return {
    type: message.type,
    content: message.content,
    source: message.source,
    timestamp: message.timestamp,
  };
}

export class MessageRateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly maxMessages = 30,
    private readonly windowMs = 60_000
  ) {}

  allow(now = Date.now()): boolean {
    this.timestamps = this.timestamps.filter((timestamp) => now - timestamp < this.windowMs);
    if (this.timestamps.length >= this.maxMessages) return false;
    this.timestamps.push(now);
    return true;
  }
}
