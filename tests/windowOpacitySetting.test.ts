import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../src/store/useAppStore';

describe('Live Interview background transparency preference', () => {
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

  it('clamps the background alpha without changing native window opacity', () => {
    useAppStore.getState().setWindowOpacity(1.5);
    expect(useAppStore.getState().windowOpacity).toBe(1);
    expect(setNativeOpacity).not.toHaveBeenCalled();

    useAppStore.getState().setWindowOpacity(-0.5);
    expect(useAppStore.getState().windowOpacity).toBe(0.12);
    expect(setNativeOpacity).not.toHaveBeenCalled();
  });

  it('falls back to the readable background alpha when the supplied value is not finite', () => {
    useAppStore.getState().setWindowOpacity(Number.NaN);
    expect(useAppStore.getState().windowOpacity).toBe(0.35);
    expect(setNativeOpacity).not.toHaveBeenCalled();
  });
});
