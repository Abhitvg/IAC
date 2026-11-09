import { describe, expect, it, vi } from 'vitest';
import {
  buildAutoTypeAppleScript,
  getScreenCaptureCommands,
  getTesseractCommands,
  runNativeCommandFallback,
} from '../electron/services/nativeCommandRunner';

describe('Shell-free native command execution', () => {
  it('builds macOS screenshot commands with separate arguments', () => {
    expect(getScreenCaptureCommands('darwin', 'snip', '/tmp/a file.jpg')).toEqual([
      {
        file: 'screencapture',
        args: ['-i', '-x', '/tmp/a file.jpg'],
      },
    ]);
    expect(getScreenCaptureCommands('darwin', 'fullscreen', '/tmp/a file.jpg')).toEqual([
      {
        file: 'screencapture',
        args: ['-x', '/tmp/a file.jpg'],
      },
    ]);
  });

  it('builds Linux screenshot fallback candidates without shell operators', () => {
    expect(getScreenCaptureCommands('linux', 'snip', '/tmp/a file.jpg')).toEqual([
      { file: 'maim', args: ['-s', '/tmp/a file.jpg'] },
      { file: 'scrot', args: ['-s', '/tmp/a file.jpg'] },
      { file: 'import', args: ['/tmp/a file.jpg'] },
    ]);
    expect(getScreenCaptureCommands('linux', 'fullscreen', '/tmp/a file.jpg')).toEqual([
      { file: 'maim', args: ['/tmp/a file.jpg'] },
      { file: 'scrot', args: ['/tmp/a file.jpg'] },
      { file: 'import', args: ['-window', 'root', '/tmp/a file.jpg'] },
    ]);
  });

  it('builds Tesseract fallback candidates without shell pipelines', () => {
    expect(getTesseractCommands('/tmp/input image.png')).toEqual([
      {
        file: 'tesseract',
        args: ['/tmp/input image.png', 'stdout', '--oem', '1', '-l', 'eng'],
      },
      {
        file: 'tesseract',
        args: ['/tmp/input image.png', 'stdout'],
      },
    ]);
  });

  it('runs the first available command and passes the path unchanged as one argument', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('maim missing'))
      .mockResolvedValueOnce({ stdout: 'captured' });

    const result = await runNativeCommandFallback(
      getScreenCaptureCommands('linux', 'snip', '/tmp/space ; $(touch nope).jpg'),
      run
    );

    expect(result).toEqual({ stdout: 'captured' });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(1, 'maim', ['-s', '/tmp/space ; $(touch nope).jpg']);
    expect(run).toHaveBeenNthCalledWith(2, 'scrot', ['-s', '/tmp/space ; $(touch nope).jpg']);
  });

  it('throws the final native command error when every fallback fails', async () => {
    const run = vi.fn().mockRejectedValue(new Error('OCR binary unavailable'));
    await expect(
      runNativeCommandFallback(getTesseractCommands('/tmp/ocr input.png'), run)
    ).rejects.toThrow('OCR binary unavailable');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('passes the auto-type file path through argv rather than embedding it in script text', () => {
    const script = buildAutoTypeAppleScript(2000);
    expect(script).toContain('on run argv');
    expect(script).toContain('set f to item 1 of argv');
    expect(script).toContain('delay 2');
    expect(script).not.toContain('/tmp/');
    expect(script).not.toContain('set f to "');
  });

  it('bounds the auto-type delay before placing it into script text', () => {
    expect(buildAutoTypeAppleScript(0)).toContain('delay 1.5');
    expect(buildAutoTypeAppleScript(999999)).toContain('delay 30');
  });
});
