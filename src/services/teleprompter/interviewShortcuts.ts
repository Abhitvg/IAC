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

const COMMAND_MODIFIERS = new Set([
  'cmdorctrl',
  'commandorcontrol',
  'cmd',
  'command',
  'ctrl',
  'control',
  'meta',
]);
const MODIFIER_ORDER = ['CmdOrCtrl', 'Alt', 'Shift'] as const;

function normalizeKeyName(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  if (trimmed === ' ') return 'Space';
  const lower = trimmed.toLowerCase();
  if (['shift', 'control', 'ctrl', 'meta', 'alt'].includes(lower)) return null;
  if (lower === 'space' || lower === 'spacebar') return 'Space';
  if (lower === 'esc') return 'Escape';
  if (/^[a-z]$/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^[0-9]$/.test(trimmed)) return trimmed;
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

/**
 * Converts a user- or settings-provided binding into one stable representation.
 * Unmodified letters and numbers are rejected so a stale or hand-edited setting
 * cannot turn ordinary typing into an application command.
 */
export function canonicalizeInterviewShortcut(binding: string): string | null {
  if (typeof binding !== 'string' || !binding.trim()) return null;
  const parts = binding
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return null;

  const modifierSet = new Set<string>();
  const keyParts: string[] = [];

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (COMMAND_MODIFIERS.has(lower)) {
      if (modifierSet.has('CmdOrCtrl')) return null;
      modifierSet.add('CmdOrCtrl');
    } else if (lower === 'alt' || lower === 'shift') {
      const normalized = lower === 'alt' ? 'Alt' : 'Shift';
      if (modifierSet.has(normalized)) return null;
      modifierSet.add(normalized);
    } else {
      keyParts.push(part);
    }
  }

  if (keyParts.length !== 1) return null;
  const key = normalizeKeyName(keyParts[0]);
  if (!key || ['Dead', 'Unidentified', 'Process'].includes(key)) return null;
  if (!modifierSet.size && /^[a-z0-9]$/i.test(key)) return null;

  const modifiers = MODIFIER_ORDER.filter((modifier) => modifierSet.has(modifier));
  return [...modifiers, key].join('+');
}

export function isReservedInterviewShortcut(binding: string): boolean {
  const canonical = canonicalizeInterviewShortcut(binding);
  if (!canonical) return true;
  const key = canonical.split('+').pop();
  if (key === 'Escape') return true;
  return RESERVED_INTERVIEW_SHORTCUTS.some(
    (reserved) => canonicalizeInterviewShortcut(reserved) === canonical
  );
}

export function matchesInterviewShortcut(event: KeyboardEvent, binding: string): boolean {
  if (event.repeat || event.isComposing || event.keyCode === 229) return false;
  const canonical = canonicalizeInterviewShortcut(binding);
  if (!canonical) return false;

  const parts = canonical.split('+');
  const key = parts[parts.length - 1].toLowerCase();
  const modifiers = new Set(parts.slice(0, -1));
  const wantsCommand = modifiers.has('CmdOrCtrl');
  const wantsShift = modifiers.has('Shift');
  const wantsAlt = modifiers.has('Alt');
  const hasCommand = event.metaKey || event.ctrlKey;

  // CmdOrCtrl is one logical modifier, not a request to hold both keys at once.
  if (event.metaKey && event.ctrlKey) return false;
  if (hasCommand !== wantsCommand) return false;
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
  'Escape',
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
    Object.entries(DEFAULT_INTERVIEW_SHORTCUTS).map(([action, fallback]) => {
      const candidate = configured?.[action as InterviewShortcutAction];
      const canonical =
        typeof candidate === 'string' ? canonicalizeInterviewShortcut(candidate) : null;
      return [
        action,
        canonical && !isReservedInterviewShortcut(canonical) ? canonical : fallback,
      ];
    })
  ) as Record<InterviewShortcutAction, string>;
}
