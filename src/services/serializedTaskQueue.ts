/**
 * Serializes finalized speech segments so a later pause cannot cancel an earlier
 * utterance while speech-to-text is still in flight.
 */
export class SerializedTaskQueue {
  private tail: Promise<void> = Promise.resolve();
  private generation = 0;
  private pending = 0;

  constructor(private readonly maxPending = 8) {
    if (!Number.isInteger(maxPending) || maxPending < 1) {
      throw new RangeError('maxPending must be a positive integer.');
    }
  }

  get pendingCount(): number {
    return this.pending;
  }

  enqueue<T>(task: () => Promise<T> | T): Promise<T | undefined> {
    if (this.pending >= this.maxPending) {
      return Promise.reject(new Error('UTTERANCE_QUEUE_FULL'));
    }

    const scheduledGeneration = this.generation;
    this.pending += 1;

    const operation = this.tail.then(async () => {
      if (scheduledGeneration !== this.generation) return undefined;
      return task();
    });

    this.tail = operation
      .then(
        () => undefined,
        () => undefined
      )
      .then(() => {
        this.pending = Math.max(0, this.pending - 1);
      });

    return operation;
  }

  /**
   * Invalidates tasks that have not started. The currently running task must be
   * cancelled separately through its AbortController.
   */
  clear(): void {
    this.generation += 1;
  }
}
