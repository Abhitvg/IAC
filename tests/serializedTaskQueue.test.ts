import { describe, expect, it } from 'vitest';
import { SerializedTaskQueue } from '../src/services/serializedTaskQueue';

describe('SerializedTaskQueue', () => {
  it('runs tasks one at a time and preserves insertion order', async () => {
    const queue = new SerializedTaskQueue(3);
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;
    let releaseFirst: (() => void) | undefined;

    const first = queue.enqueue(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push('first:start');
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      order.push('first:end');
      active -= 1;
    });

    const second = queue.enqueue(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push('second:start');
      active -= 1;
    });

    expect(order).toEqual(['first:start']);
    releaseFirst?.();
    await Promise.all([first, second]);

    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
    expect(maxActive).toBe(1);
    expect(queue.pendingCount).toBe(0);
  });

  it('skips queued tasks invalidated before they start', async () => {
    const queue = new SerializedTaskQueue(3);
    let releaseFirst: (() => void) | undefined;
    let secondRan = false;

    const first = queue.enqueue(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        })
    );
    const second = queue.enqueue(() => {
      secondRan = true;
    });

    queue.clear();
    releaseFirst?.();
    await Promise.all([first, second]);

    expect(secondRan).toBe(false);
    expect(queue.pendingCount).toBe(0);
  });

  it('bounds queued work and reports overload explicitly', async () => {
    const queue = new SerializedTaskQueue(1);
    let releaseFirst: (() => void) | undefined;

    const first = queue.enqueue(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        })
    );

    await expect(queue.enqueue(() => undefined)).rejects.toThrow('UTTERANCE_QUEUE_FULL');

    releaseFirst?.();
    await first;
    expect(queue.pendingCount).toBe(0);
  });
});
