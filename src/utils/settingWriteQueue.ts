export interface SettingWriteQueue<T> {
  queue: Promise<void>;
  confirmedValue: T;
  version: number;
}

export function createSettingWriteQueue<T>(initialValue: T): SettingWriteQueue<T> {
  return {
    queue: Promise.resolve(),
    confirmedValue: initialValue,
    version: 0,
  };
}

/**
 * Serialize writes for one setting key and roll back only when the latest
 * write fails. Earlier failures must not overwrite a newer optimistic value.
 */
export function enqueueSettingWrite<T>(
  state: SettingWriteQueue<T>,
  value: T,
  persist: (value: T) => Promise<unknown>,
  onLatestFailure: (confirmedValue: T, error: unknown) => void
): void {
  const version = ++state.version;

  state.queue = state.queue
    .catch(() => undefined)
    .then(() => persist(value))
    .then(() => {
      state.confirmedValue = value;
    })
    .catch((error: unknown) => {
      if (version === state.version) {
        onLatestFailure(state.confirmedValue, error);
      }
    });
}
