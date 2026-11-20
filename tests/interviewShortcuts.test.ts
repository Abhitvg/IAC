import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INTERVIEW_SHORTCUTS,
  RESERVED_INTERVIEW_SHORTCUTS,
  canonicalizeInterviewShortcut,
  formatInterviewShortcut,
  isReservedInterviewShortcut,
  matchesInterviewShortcut,
  resolveInterviewShortcutBindings,
} from '../src/services/teleprompter/interviewShortcuts';

function keyboardEvent(
  values: Partial<
    Pick<
      KeyboardEvent,
      | 'key'
      | 'code'
      | 'metaKey'
      | 'ctrlKey'
      | 'shiftKey'
      | 'altKey'
      | 'repeat'
      | 'isComposing'
      | 'keyCode'
    >
  >
): KeyboardEvent {
  return {
    key: '',
    code: '',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    isComposing: false,
    keyCode: 0,
    ...values,
  } as KeyboardEvent;
}

describe('live interview shortcut bindings', () => {
  it('provides stable defaults for all supported actions', () => {
    expect(resolveInterviewShortcutBindings()).toEqual(DEFAULT_INTERVIEW_SHORTCUTS);
  });

  it('uses configured bindings and falls back for missing, blank, or unsafe values', () => {
    expect(
      resolveInterviewShortcutBindings({
        bionicHud: 'Alt+B',
        listening: '',
        solveScreen: 'S',
      })
    ).toEqual({
      ...DEFAULT_INTERVIEW_SHORTCUTS,
      bionicHud: 'Alt+B',
    });
  });

  it('canonicalizes modifier order and common platform aliases', () => {
    expect(canonicalizeInterviewShortcut('Shift+CommandOrControl+h')).toBe(
      'CmdOrCtrl+Shift+H'
    );
    expect(canonicalizeInterviewShortcut('Alt+Ctrl+k')).toBe('CmdOrCtrl+Alt+K');
  });

  it('rejects ambiguous or unsafe shortcut definitions', () => {
    expect(canonicalizeInterviewShortcut('H')).toBeNull();
    expect(canonicalizeInterviewShortcut('Shift+Shift+H')).toBeNull();
    expect(canonicalizeInterviewShortcut('CmdOrCtrl+Alt')).toBeNull();
    expect(isReservedInterviewShortcut('Shift+Alt+S')).toBe(true);
    expect(isReservedInterviewShortcut('Escape')).toBe(true);
    expect(isReservedInterviewShortcut('Alt+Q')).toBe(false);
  });

  it('matches command/control shortcuts with exact modifiers', () => {
    expect(
      matchesInterviewShortcut(
        keyboardEvent({ key: 'h', code: 'KeyH', metaKey: true, shiftKey: true }),
        'CmdOrCtrl+Shift+H'
      )
    ).toBe(true);
    expect(
      matchesInterviewShortcut(
        keyboardEvent({ key: 'h', code: 'KeyH', ctrlKey: true, shiftKey: true }),
        'CmdOrCtrl+Shift+H'
      )
    ).toBe(true);
    expect(
      matchesInterviewShortcut(
        keyboardEvent({ key: 'h', code: 'KeyH', metaKey: true }),
        'CmdOrCtrl+Shift+H'
      )
    ).toBe(false);
  });

  it('does not match when unexpected modifiers are held', () => {
    expect(
      matchesInterviewShortcut(
        keyboardEvent({ key: 'k', code: 'KeyK', metaKey: true, shiftKey: true }),
        'CmdOrCtrl+K'
      )
    ).toBe(false);
  });

  it('matches Space only as the dedicated finish-answer binding', () => {
    expect(matchesInterviewShortcut(keyboardEvent({ key: ' ', code: 'Space' }), 'Space')).toBe(
      true
    );
    expect(
      matchesInterviewShortcut(keyboardEvent({ key: ' ', code: 'Space', ctrlKey: true }), 'Space')
    ).toBe(false);
  });

  it('identifies reserved controls so user bindings cannot shadow them', () => {
    expect(RESERVED_INTERVIEW_SHORTCUTS).toContain('CmdOrCtrl+Shift+Space');
    expect(RESERVED_INTERVIEW_SHORTCUTS).toContain('CmdOrCtrl+\\');
    expect(RESERVED_INTERVIEW_SHORTCUTS).toContain('Alt+H');
    expect(RESERVED_INTERVIEW_SHORTCUTS).toContain('Alt+Shift+S');
    expect(RESERVED_INTERVIEW_SHORTCUTS).toContain('Alt+C');
  });

  it('ignores repeated and IME-composition key events', () => {
    expect(
      matchesInterviewShortcut(
        keyboardEvent({ key: 'h', code: 'KeyH', ctrlKey: true, shiftKey: true, repeat: true }),
        'CmdOrCtrl+Shift+H'
      )
    ).toBe(false);
    expect(
      matchesInterviewShortcut(
        keyboardEvent({ key: 'h', code: 'KeyH', ctrlKey: true, shiftKey: true, isComposing: true }),
        'CmdOrCtrl+Shift+H'
      )
    ).toBe(false);
  });

  it('does not accept simultaneous Meta and Control as one CmdOrCtrl modifier', () => {
    expect(
      matchesInterviewShortcut(
        keyboardEvent({ key: 'h', code: 'KeyH', metaKey: true, ctrlKey: true, shiftKey: true }),
        'CmdOrCtrl+Shift+H'
      )
    ).toBe(false);
  });

  it('formats platform-neutral shortcut labels', () => {
    expect(formatInterviewShortcut('CmdOrCtrl+Shift+H')).toMatch(/(⌘|Ctrl)\+⇧\+H/);
    expect(formatInterviewShortcut('Space')).toBe('Space');
  });
});
