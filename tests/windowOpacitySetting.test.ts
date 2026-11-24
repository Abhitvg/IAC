import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../src/store/useAppStore';

describe('Live Interview window transparency preference', () => {
  const setNativeOpacity = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    setNativeOpacity.mockClear();
    vi.stubGlobal('window', {
      electronAPI: { setWindowOpacity: setNativeOpacity },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clamps transparency changes to the supported native window opacity range', () => {
    useAppStore.getState().setWindowOpacity(1.5);
    expect(useAppStore.getState().windowOpacity).toBe(1);
    expect(setNativeOpacity).toHaveBeenLastCalledWith(1);

    useAppStore.getState().setWindowOpacity(-0.5);
    expect(useAppStore.getState().windowOpacity).toBe(0.12);
    expect(setNativeOpacity).toHaveBeenLastCalledWith(0.12);
  });

  it('uses a readable default when the supplied opacity is not finite', () => {
    useAppStore.getState().setWindowOpacity(Number.NaN);
    expect(useAppStore.getState().windowOpacity).toBe(0.35);
    expect(setNativeOpacity).toHaveBeenLastCalledWith(0.35);
  });
});
