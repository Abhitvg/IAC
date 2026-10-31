import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyToClipboard } from '../src/utils/clipboard';

describe('copyToClipboard Utility', () => {
  const originalElectronAPI = (globalThis as any).window?.electronAPI;
  const originalDocument = (globalThis as any).document;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalElectronAPI !== undefined) {
      (globalThis as any).window.electronAPI = originalElectronAPI;
    } else if ((globalThis as any).window) {
      delete (globalThis as any).window.electronAPI;
    }

    if (originalDocument !== undefined) {
      (globalThis as any).document = originalDocument;
    } else {
      delete (globalThis as any).document;
    }
  });

  it('1. Copies using native electronAPI.copyToClipboard when available', async () => {
    const mockCopy = vi.fn().mockResolvedValue({ success: true });
    (globalThis as any).window = {
      ...(globalThis as any).window,
      electronAPI: {
        copyToClipboard: mockCopy,
      },
    };

    const result = await copyToClipboard('const x = 42;');

    expect(mockCopy).toHaveBeenCalledWith('const x = 42;');
    expect(result).toBe(true);
  });

  it('2. Falls back to navigator.clipboard.writeText when electronAPI is not present', async () => {
    delete (globalThis as any).window.electronAPI;

    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        clipboard: {
          writeText: mockWriteText,
        },
      },
      configurable: true,
      writable: true,
    });

    const result = await copyToClipboard('console.log("hello");');

    expect(mockWriteText).toHaveBeenCalledWith('console.log("hello");');
    expect(result).toBe(true);
  });

  it('3. Falls back to execCommand when navigator.clipboard.writeText throws NotAllowedError or Document not focused', async () => {
    delete (globalThis as any).window.electronAPI;

    const mockWriteText = vi.fn().mockRejectedValue(new Error('Document is not focused'));
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        clipboard: {
          writeText: mockWriteText,
        },
      },
      configurable: true,
      writable: true,
    });

    const mockTextArea = {
      value: '',
      style: {},
      setAttribute: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
    };

    const mockExecCommand = vi.fn().mockReturnValue(true);
    (globalThis as any).document = {
      createElement: vi.fn().mockReturnValue(mockTextArea),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      execCommand: mockExecCommand,
    };

    const result = await copyToClipboard('fallback copy text');

    expect(mockWriteText).toHaveBeenCalled();
    expect(mockExecCommand).toHaveBeenCalledWith('copy');
    expect(result).toBe(true);
  });

  it('4. Handles non-string input safely without throwing', async () => {
    const mockCopy = vi.fn().mockResolvedValue({ success: true });
    (globalThis as any).window = {
      ...(globalThis as any).window,
      electronAPI: {
        copyToClipboard: mockCopy,
      },
    };

    const result = await copyToClipboard(12345 as any);

    expect(mockCopy).toHaveBeenCalledWith('12345');
    expect(result).toBe(true);
  });
});
