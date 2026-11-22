import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_AUTO_FOLLOW_THRESHOLD_PX,
  getConversationScrollTarget,
  isConversationNearBottom,
  shouldAutoFollowConversation,
} from '../src/services/teleprompter/conversationScroll';

describe('conversation scroll policy', () => {
  it('auto-follows only when the reader is within the bottom threshold', () => {
    expect(isConversationNearBottom(1000, 700, 160)).toBe(true);
    expect(isConversationNearBottom(1000, 679, 160)).toBe(false);
  });

  it('respects the manual auto-follow toggle while preserving the near-bottom rule', () => {
    expect(shouldAutoFollowConversation(1000, 700, 160, true)).toBe(true);
    expect(shouldAutoFollowConversation(1000, 700, 160, false)).toBe(false);
    expect(shouldAutoFollowConversation(1000, 400, 160, true)).toBe(false);
  });

  it('uses the documented default threshold', () => {
    expect(isConversationNearBottom(1000, 681, 160)).toBe(true);
    expect(CONVERSATION_AUTO_FOLLOW_THRESHOLD_PX).toBe(160);
  });

  it('restores the saved reading position when the reader scrolled up', () => {
    expect(getConversationScrollTarget(1800, 420, false)).toBe(420);
  });

  it('moves to the latest content when auto-follow is enabled', () => {
    expect(getConversationScrollTarget(1800, 420, true)).toBe(1800);
  });

  it('never returns a negative restored scroll position', () => {
    expect(getConversationScrollTarget(1800, -20, false)).toBe(0);
  });
});
