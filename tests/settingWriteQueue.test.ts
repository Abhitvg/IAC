import { describe, expect, it, vi } from 'vitest';
import { createSettingWriteQueue, enqueueSettingWrite } from '../src/utils/settingWriteQueue';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('per-setting persistence queue', () => {
  it(
    'serializes rapid writes and does not let an earlier failure roll back a newer value',
    async () => {
    const state = createSettingWriteQueue('initial');
    const first = deferred<void>();
    const second = deferred<void>();
    const calls: string[] = [];
    const rollback = vi.fn();

    enqueueSettingWrite(
      state,
      'first',
      async () => {
        calls.push('first');
        await first.promise;
      },
      rollback
    );
    enqueueSettingWrite(
      state,
      'second',
      async () => {
        calls.push('second');
        await second.promise;
      },
      rollback
    );

    await Promise.resolve();
    expect(calls).toEqual(['first']);

    first.reject(new Error('first write failed'));
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['first', 'second']);

    second.resolve();
    await state.queue;

      expect(state.confirmedValue).toBe('second');
      expect(rollback).not.toHaveBeenCalled();
    }
  );

  it('rolls back the latest failed write to the last persisted value', async () => {
    const state = createSettingWriteQueue('initial');
    const rollback = vi.fn();

    enqueueSettingWrite(state, 'saved', async () => undefined, rollback);
    await state.queue;
    expect(state.confirmedValue).toBe('saved');

    enqueueSettingWrite(
      state,
      'rejected',
      async () => {
        throw new Error('IPC validation rejected the value');
      },
      rollback
    );
    await state.queue;

    expect(state.confirmedValue).toBe('saved');
    expect(rollback).toHaveBeenCalledOnce();
    expect(rollback).toHaveBeenCalledWith(
      'saved',
      expect.objectContaining({ message: 'IPC validation rejected the value' })
    );
  });

  it('rolls back to the original value when consecutive writes both fail', async () => {
    const state = createSettingWriteQueue('original');
    const rollback = vi.fn();

    enqueueSettingWrite(
      state,
      'first-invalid',
      async () => {
        throw new Error('first failed');
      },
      rollback
    );
    enqueueSettingWrite(
      state,
      'second-invalid',
      async () => {
        throw new Error('second failed');
      },
      rollback
    );
    await state.queue;

    expect(state.confirmedValue).toBe('original');
    expect(rollback).toHaveBeenCalledOnce();
    expect(rollback).toHaveBeenCalledWith(
      'original',
      expect.objectContaining({ message: 'second failed' })
    );
  });
});
