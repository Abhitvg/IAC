/**
 * Conversation scroll policy shared by both live-interview answer modes.
 */
export const CONVERSATION_AUTO_FOLLOW_THRESHOLD_PX = 160;

export function isConversationNearBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  threshold = CONVERSATION_AUTO_FOLLOW_THRESHOLD_PX
): boolean {
  return scrollHeight - scrollTop - clientHeight < threshold;
}

export function shouldAutoFollowConversation(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  autoFollowEnabled: boolean,
  threshold = CONVERSATION_AUTO_FOLLOW_THRESHOLD_PX
): boolean {
  return (
    autoFollowEnabled && isConversationNearBottom(scrollHeight, scrollTop, clientHeight, threshold)
  );
}

export function getConversationScrollTarget(
  scrollHeight: number,
  savedScrollTop: number,
  shouldAutoFollow: boolean
): number {
  return shouldAutoFollow ? scrollHeight : Math.max(0, savedScrollTop);
}
