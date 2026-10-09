import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Minus, Square, X, Pin, Settings, History } from 'lucide-react';

export default function TitleBar() {
  const { setSettingsOpen, setSessionsOpen } = useAppStore();
  const [pinned, setPinned] = useState(false);

  const handlePin = async () => {
    window.electronAPI?.toggleAlwaysOnTop();
    const isOnTop = await window.electronAPI?.isAlwaysOnTop();
    setPinned(isOnTop ?? false);
  };

  return (
    <div className="title-bar">
      <div className="title-bar__left">
        <div className="title-bar__logo">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </div>
        <span className="title-bar__title">AI Interview Assistant</span>
      </div>

      <div className="title-bar__controls">
        <button
          className={`title-bar__btn title-bar__btn--pin ${pinned ? 'active' : ''}`}
          onClick={handlePin}
          title="Always on Top"
        >
          <Pin size={13} />
        </button>
        <button
          className="title-bar__btn"
          onClick={() => setSessionsOpen(true)}
          title="Session History"
        >
          <History size={13} />
        </button>
        <button
          className="title-bar__btn"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
        >
          <Settings size={13} />
        </button>
        <button
          className="title-bar__btn"
          onClick={() => window.electronAPI?.minimize()}
          title="Minimize"
        >
          <Minus size={13} />
        </button>
        <button
          className="title-bar__btn"
          onClick={() => window.electronAPI?.maximize()}
          title="Maximize"
        >
          <Square size={11} />
        </button>
        <button
          className="title-bar__btn"
          onClick={() => window.electronAPI?.close()}
          title="Close"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
