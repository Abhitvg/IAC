import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INTERVIEW_SHORTCUTS,
  RESERVED_INTERVIEW_SHORTCUTS,
  formatInterviewShortcut,
  matchesInterviewShortcut,
  resolveInterviewShortcutBindings,
} from '../src/services/teleprompter/interviewShortcuts';

function keyboardEvent(
  values: Partial<
    Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>
  >
): KeyboardEvent {
  return {
    key: '',
    code: '',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...values,
  } as KeyboardEvent;
}

describe('live interview shortcut bindings', () => {
  it('provides stable defaults for all supported actions', () => {
    expect(resolveInterviewShortcutBindings()).toEqual(DEFAULT_INTERVIEW_SHORTCUTS);
  });

  it('uses configured bindings and falls back for missing or blank values', () => {
    expect(
      resolveInterviewShortcutBindings({
        bionicHud: 'Alt+B',
        listening: '',
      })
    ).toEqual({
      ...DEFAULT_INTERVIEW_SHORTCUTS,
      bionicHud: 'Alt+B',
    });
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

  it('formats platform-neutral shortcut labels', () => {
    expect(formatInterviewShortcut('CmdOrCtrl+Shift+H')).toMatch(/(⌘|Ctrl)\+⇧\+H/);
    expect(formatInterviewShortcut('Space')).toBe('Space');
  });
});
