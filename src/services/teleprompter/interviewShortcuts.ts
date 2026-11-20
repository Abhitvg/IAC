export type InterviewShortcutAction =
  | 'bionicHud'
  | 'listening'
  | 'solveScreen'
  | 'snipScreen'
  | 'searchConversation'
  | 'finishAnswer';

export const DEFAULT_INTERVIEW_SHORTCUTS: Record<InterviewShortcutAction, string> = {
  bionicHud: 'CmdOrCtrl+Shift+H',
  listening: 'CmdOrCtrl+Shift+L',
  solveScreen: 'CmdOrCtrl+Shift+S',
  snipScreen: 'CmdOrCtrl+Shift+X',
  searchConversation: 'CmdOrCtrl+K',
  finishAnswer: 'Space',
};

export function matchesInterviewShortcut(event: KeyboardEvent, binding: string): boolean {
  const parts = binding
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return false;

  const key = parts[parts.length - 1].toLowerCase();
  const modifiers = new Set(parts.slice(0, -1).map((part) => part.toLowerCase()));
  const wantsCommand = modifiers.has('cmdorctrl');
  const wantsShift = modifiers.has('shift');
  const wantsAlt = modifiers.has('alt');

  if ((event.metaKey || event.ctrlKey) !== wantsCommand) return false;
  if (event.shiftKey !== wantsShift || event.altKey !== wantsAlt) return false;
  if (key === 'space') return event.code === 'Space';
  return event.key.toLowerCase() === key;
}

export function formatInterviewShortcut(binding: string): string {
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  return binding
    .replace(/CmdOrCtrl/gi, isMac ? '⌘' : 'Ctrl')
    .replace(/Shift/gi, '⇧')
    .replace(/Alt/gi, isMac ? '⌥' : 'Alt')
    .replace(/Space/gi, 'Space');
}

export const INTERVIEW_SHORTCUT_LABELS: Record<InterviewShortcutAction, string> = {
  bionicHud: 'Toggle Bionic HUD',
  listening: 'Pause / resume listening',
  solveScreen: 'Solve current screen',
  snipScreen: 'Snip screen region',
  searchConversation: 'Search conversation',
  finishAnswer: 'Finish current answer',
};

export const RESERVED_INTERVIEW_SHORTCUTS = [
  'CmdOrCtrl+Shift+Space',
  'CmdOrCtrl+Backspace',
  'CmdOrCtrl+Z',
  'CmdOrCtrl+Shift+Z',
  'CmdOrCtrl+Y',
  'CmdOrCtrl+1',
  'CmdOrCtrl+2',
  'CmdOrCtrl+3',
  'CmdOrCtrl+J',
  'CmdOrCtrl+\\',
  'CmdOrCtrl+Alt+Shift+H',
  'Alt+H',
  'Alt+Shift+S',
  'CmdOrCtrl+Shift+A',
  'Alt+V',
  'Alt+T',
  'Alt+C',
] as const;

export function resolveInterviewShortcutBindings(
  configured?: Partial<Record<InterviewShortcutAction, string>>
): Record<InterviewShortcutAction, string> {
  return Object.fromEntries(
    Object.entries(DEFAULT_INTERVIEW_SHORTCUTS).map(([action, fallback]) => [
      action,
      typeof configured?.[action as InterviewShortcutAction] === 'string' &&
      configured[action as InterviewShortcutAction]?.trim()
        ? configured[action as InterviewShortcutAction]!
        : fallback,
    ])
  ) as Record<InterviewShortcutAction, string>;
}
