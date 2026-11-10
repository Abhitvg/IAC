/** Return the next queue index, or null when the current item is the final item. */
export function getNextTeleprompterIndex(currentIndex: number, queueLength: number): number | null {
  if (!Number.isInteger(currentIndex) || !Number.isInteger(queueLength)) return null;
  if (currentIndex < 0 || queueLength <= 0 || currentIndex >= queueLength - 1) return null;
  return currentIndex + 1;
}
