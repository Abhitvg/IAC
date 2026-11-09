export interface NativeCommand {
  file: string;
  args: string[];
}

/**
 * Returns the platform-specific screenshot capture commands in fallback order.
 * Each command is executed directly with argv; no shell parses the path.
 */
export function getScreenCaptureCommands(
  platform: NodeJS.Platform | string,
  mode: 'fullscreen' | 'snip',
  outputPath: string
): NativeCommand[] {
  if (platform === 'darwin') {
    return [
      {
        file: 'screencapture',
        args: mode === 'snip' ? ['-i', '-x', outputPath] : ['-x', outputPath],
      },
    ];
  }

  if (mode === 'snip') {
    return [
      { file: 'maim', args: ['-s', outputPath] },
      { file: 'scrot', args: ['-s', outputPath] },
      { file: 'import', args: [outputPath] },
    ];
  }

  return [
    { file: 'maim', args: [outputPath] },
    { file: 'scrot', args: [outputPath] },
    { file: 'import', args: ['-window', 'root', outputPath] },
  ];
}

/** Preferred Tesseract invocation, then a compatibility fallback. */
export function getTesseractCommands(imagePath: string): NativeCommand[] {
  return [
    {
      file: 'tesseract',
      args: [imagePath, 'stdout', '--oem', '1', '-l', 'eng'],
    },
    {
      file: 'tesseract',
      args: [imagePath, 'stdout'],
    },
  ];
}

/**
 * Runs commands in order without shell interpretation and returns the first
 * successful result. Throws the final command error if every candidate fails.
 */
export async function runNativeCommandFallback<T>(
  commands: NativeCommand[],
  run: (file: string, args: string[]) => Promise<T>
): Promise<T> {
  if (commands.length === 0) {
    throw new Error('No native command candidates were provided.');
  }

  let lastError: unknown;
  for (const command of commands) {
    try {
      return await run(command.file, command.args);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(lastError ? String(lastError) : 'All native command candidates failed.');
}

/** Script text contains no filesystem path; the path is supplied separately as argv[0]. */
export function buildAutoTypeAppleScript(delayMs: number): string {
  const safeDelaySeconds = Math.max(0.5, Math.min(30, (delayMs || 1500) / 1000));
  return `on run argv
  delay ${safeDelaySeconds}
  set f to item 1 of argv
  set theCode to read POSIX file f as «class utf8»
  tell application "System Events"
    keystroke theCode
  end tell
end run
`;
}
