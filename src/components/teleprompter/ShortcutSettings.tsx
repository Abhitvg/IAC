import React, { useEffect, useState } from 'react';
import {
  INTERVIEW_SHORTCUT_LABELS,
  formatInterviewShortcut,
} from '../../services/teleprompter/interviewShortcuts';
import type { InterviewShortcutAction } from '../../services/teleprompter/interviewShortcuts';

export function ShortcutSettings({
  bindings,
  onChange,
}: {
  bindings: Record<InterviewShortcutAction, string>;
  onChange: (action: InterviewShortcutAction, binding: string) => void;
}) {
  const [capturing, setCapturing] = useState<InterviewShortcutAction | null>(null);
  const [captureError, setCaptureError] = useState('');
  const isMacPlatform =
    typeof window !== 'undefined' && window.electronAPI?.platform === 'darwin';

  useEffect(() => {
    if (!capturing) return;

    const handleCapture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.repeat || event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        setCapturing(null);
        setCaptureError('');
        return;
      }
      if (['Shift', 'Control', 'Meta', 'Alt'].includes(event.key)) return;

      const modifiers: string[] = [];
      if (event.metaKey && event.ctrlKey) {
        setCaptureError('Do not hold Command and Control together.');
        return;
      }
      if (event.metaKey || event.ctrlKey) modifiers.push('CmdOrCtrl');
      if (event.altKey) modifiers.push('Alt');
      if (event.shiftKey) modifiers.push('Shift');

      if (!modifiers.length && event.code !== 'Space') {
        setCaptureError('Use at least one modifier for letter/number shortcuts.');
        return;
      }

      const key =
        event.code === 'Space'
          ? 'Space'
          : event.key.length === 1
            ? event.key.toUpperCase()
            : event.key;
      onChange(capturing, [...modifiers, key].join('+'));
      setCapturing(null);
      setCaptureError('');
    };

    window.addEventListener('keydown', handleCapture, true);
    return () => window.removeEventListener('keydown', handleCapture, true);
  }, [capturing, onChange]);

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
      {(Object.keys(INTERVIEW_SHORTCUT_LABELS) as InterviewShortcutAction[]).map((action) => (
        <div
          key={action}
          className="shortcut-settings-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: '#cbd5e1', fontSize: 12, flex: '1 1 150px' }}>
            {INTERVIEW_SHORTCUT_LABELS[action]}
          </span>
          <button
            type="button"
            onClick={() => {
              setCaptureError('');
              setCapturing(action);
            }}
            aria-label={`Change ${INTERVIEW_SHORTCUT_LABELS[action]} shortcut`}
            aria-pressed={capturing === action}
            style={{
              minWidth: 118,
              border: '1px solid rgba(148,163,184,0.25)',
              borderRadius: 7,
              padding: '6px 9px',
              background: capturing === action ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)',
              color: '#e5eaf2',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            {capturing === action ? 'Press shortcut…' : formatInterviewShortcut(bindings[action])}
          </button>
        </div>
      ))}
      <div
        style={{
          marginTop: 8,
          padding: '10px 11px',
          borderRadius: 8,
          border: '1px solid rgba(148,163,184,0.16)',
          background: 'rgba(255,255,255,0.025)',
          display: 'grid',
          gap: 6,
        }}
      >
        <div style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 700 }}>
          System-wide controls · {isMacPlatform ? 'macOS' : 'Windows / Linux'}
        </div>
        <div style={{ color: '#aeb9c8', fontSize: 11, lineHeight: 1.55 }}>
          <strong>{isMacPlatform ? '⌘\\' : 'Ctrl+\\'}</strong> or <strong>{isMacPlatform ? '⌘⇧Space' : 'Ctrl+Shift+Space'}</strong> show / hide · <strong>{isMacPlatform ? '⌘⌥←' : 'Ctrl+Alt+←'}</strong> left
          corner · <strong>{isMacPlatform ? '⌘⌥→' : 'Ctrl+Alt+→'}</strong> right corner
        </div>
        <div style={{ color: '#8492a6', fontSize: 10, lineHeight: 1.5 }}>
          Also available: {isMacPlatform ? '⌘⌥⇧H / ⌥H' : 'Ctrl+Alt+Shift+H / Alt+H'} show or hide, {isMacPlatform ? '⌥⇧S' : 'Alt+Shift+S'} solve screen, {isMacPlatform ? '⌘⇧A' : 'Ctrl+Shift+A'} append capture, {isMacPlatform ? '⌥V' : 'Alt+V'} auto-type
          code, {isMacPlatform ? '⌥T' : 'Alt+T'} auto-type answer. Global bindings are fixed and may be unavailable if another application has claimed them.
        </div>
        <div style={{ color: '#8492a6', fontSize: 10 }}>
          The macOS Dock or Windows / Linux system-tray icon remains available to reopen the assistant.
        </div>
      </div>
      <div
        style={{
          padding: '10px 11px',
          borderRadius: 8,
          border: '1px solid rgba(148,163,184,0.16)',
          background: 'rgba(255,255,255,0.025)',
          display: 'grid',
          gap: 6,
        }}
      >
        <div style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 700 }}>
          Built-in conversation controls · {isMacPlatform ? 'macOS' : 'Windows / Linux'}
        </div>
        <div style={{ color: '#aeb9c8', fontSize: 11, lineHeight: 1.55 }}>
          <strong>⌘Z</strong> / <strong>⌘[</strong> restore · <strong>⌘⇧Z</strong> /{' '}
          <strong>⌘Y</strong> /<strong>⌘]</strong> redo · <strong>⌥C</strong> mark incomplete
        </div>
        <div style={{ color: '#8492a6', fontSize: 10, lineHeight: 1.5 }}>
          <strong>{isMacPlatform ? '⌘⌫' : 'Ctrl+Backspace'}</strong> new question · <strong>{isMacPlatform ? '⌘1' : 'Ctrl+1'}</strong> Coding · <strong>{isMacPlatform ? '⌘2' : 'Ctrl+2'}</strong>{' '}
          Interview · <strong>{isMacPlatform ? '⌘3' : 'Ctrl+3'}</strong> Quiz · <strong>{isMacPlatform ? '⌘J' : 'Ctrl+J'}</strong> auto-follow ·{' '}
          <strong>Esc</strong> close overlay.
        </div>
      </div>
      {capturing && (
        <div style={{ color: '#a5b4fc', fontSize: 11 }}>
          Press the key combination for {INTERVIEW_SHORTCUT_LABELS[capturing]}. Esc cancels.
        </div>
      )}
      {captureError && (
        <div role="status" style={{ color: '#fbbf24', fontSize: 11 }}>
          {captureError}
        </div>
      )}
    </div>
  );
}
