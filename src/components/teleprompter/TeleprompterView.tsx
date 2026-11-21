import { copyToClipboard } from '../../utils/clipboard';
import { detectLanguageHint } from '../../services/screenSolver';
import { readAndParseFile } from '../../services/resume';
import { CandidateRagService } from '../../services/rag';
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useAppStore, TeleprompterFontSize } from '../../store/useAppStore';
import { InterviewEngine } from '../../services/InterviewEngine';
import { DiagnosticLoggerService } from '../../services/diagnosticLogger';
import {
  getConversationScrollTarget,
  isConversationNearBottom,
} from '../../services/teleprompter/conversationScroll';
import { ApplicationAssistanceView } from './ApplicationAssistanceView';
import {
  extractGlanceableGazeBullets,
  formatBionicWord,
  BionicGazeBullet,
} from '../../services/teleprompter/bionicPrompterService';
import { getBionicAnswerPresentation } from '../../services/teleprompter/bionicAnswerPresentation';
import {
  INTERVIEW_SHORTCUT_LABELS,
  canonicalizeInterviewShortcut,
  formatInterviewShortcut,
  isReservedInterviewShortcut,
  matchesInterviewShortcut,
  resolveInterviewShortcutBindings,
} from '../../services/teleprompter/interviewShortcuts';
import type { InterviewShortcutAction } from '../../services/teleprompter/interviewShortcuts';
import {
  Play,
  Pause,
  RotateCcw,
  Undo2,
  Redo2,
  Clock,
  Hourglass,
  Mic,
  MicOff,
  Copy,
  Sparkles,
  Loader2,
  Send,
  Target,
  FileUp,
  Shield,
  CheckCircle2,
  Volume2,
  Camera,
  FilePlus,
  Zap,
  MessageSquare,
  Crop,
  ScanText,
  Check,
  Terminal,
  Eye,
  EyeOff,
  Keyboard,
  SlidersHorizontal,
  X,
  Power,
  Settings as SettingsIcon,
} from 'lucide-react';

interface CodeBlockCardProps {
  language: string;
  code: string;
  index: number;
  onCopy: (code: string, index: number) => void;
  isCopied: boolean;
  onAutoType?: (code: string) => void;
}

// Dedicated High-Contrast MCQ / Quiz Answer Card
function QuizAnswerCard({
  answerText,
  onCopy,
}: {
  answerText: string;
  onCopy: (text: string) => void;
}) {
  const match = answerText.match(
    /(?:✅\s*)?CORRECT ANSWER:\s*(?:[*_]*Option\s*[*_]*)?([A-D0-9][^\r\n*_]*)/i
  );
  const correctOptionText = match ? match[1].replace(/[*_]/g, '').trim() : '';

  const proofMatch = answerText.match(
    /(?:💡\s*)?(?:DIRECT PROOF|CONCISE PROOF|PROOF)[^\r\n]*:?\s*([\s\S]*?)(?=(?:❌|WHY OTHER|OTHER OPTIONS|$))/i
  );
  const proofText = proofMatch ? proofMatch[1].trim() : '';

  const distractorsMatch = answerText.match(
    /(?:❌\s*)?(?:WHY OTHER OPTIONS ARE|WHY OTHER|OTHER OPTIONS)[^\r\n]*:?\s*([\s\S]*?)$/i
  );
  const distractorsText = distractorsMatch ? distractorsMatch[1].trim() : '';

  return (
    <div
      style={{
        margin: '12px 0 16px 0',
        padding: '16px',
        background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.55), rgba(15, 23, 42, 0.85))',
        border: '1.5px solid rgba(52, 211, 153, 0.6)',
        borderRadius: '10px',
        boxShadow: '0 8px 28px rgba(6, 78, 59, 0.4)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>🎯</span>
          <span
            style={{
              fontSize: '14px',
              fontWeight: 800,
              color: '#a7f3d0',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}
          >
            Verified Correct Option
          </span>
        </div>
        {correctOptionText && (
          <button
            onClick={() => onCopy(correctOptionText)}
            title="Copy correct option immediately to clipboard"
            style={{
              background: 'rgba(16, 185, 129, 0.3)',
              color: '#6ee7b7',
              border: '1px solid rgba(52, 211, 153, 0.6)',
              borderRadius: '5px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Copy size={12} />
            <span>Copy Option</span>
          </button>
        )}
      </div>

      {correctOptionText && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(16, 185, 129, 0.22)',
            border: '1px solid rgba(52, 211, 153, 0.45)',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: 750,
            color: '#ecfdf5',
            marginBottom: '12px',
          }}
        >
          {correctOptionText}
        </div>
      )}

      {proofText && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#34d399', marginBottom: '4px' }}>
            💡 Core Proof & Verification:
          </div>
          <div style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: '1.55' }}>{proofText}</div>
        </div>
      )}

      {distractorsText && (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#f87171', marginBottom: '4px' }}>
            ❌ Why Other Options Are Wrong:
          </div>
          <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.5' }}>
            {distractorsText}
          </div>
        </div>
      )}
    </div>
  );
}

// Bionic Glanceable Prompter & Eye-Contact HUD
function BionicGazeHUD({ bullets, sourceText }: { bullets: BionicGazeBullet[]; sourceText?: string }) {
  return (
    <div
      style={{
        margin: '8px 0 16px 0',
        padding: '16px',
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(10, 15, 30, 0.98))',
        border: '1.5px solid rgba(16, 185, 129, 0.5)',
        borderRadius: '12px',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(16, 185, 129, 0.2)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      {/* Webcam Eye-Line Reticle */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          paddingBottom: '8px',
          borderBottom: '1px dashed rgba(16, 185, 129, 0.35)',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#10b981',
            boxShadow: '0 0 8px #10b981',
            display: 'inline-block',
          }}
        />
        <span
          style={{
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#6ee7b7',
          }}
        >
          Optimal Webcam Eye-Contact Zone · Glance Naturally
        </span>
      </div>

      {/* Glanceable Centered Bullets */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        {bullets.map((b, i) => (
          <div
            key={b.id || i}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              maxWidth: '90%',
              textAlign: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#34d399', opacity: 0.85 }}>
              {i + 1}.
            </span>

            {/* Bionic Formatted Text */}
            <span
              style={{
                fontSize: '16px',
                lineHeight: 1.4,
                color: '#f8fafc',
                letterSpacing: '0.01em',
              }}
            >
              {b.text.split(' ').map((word, wIdx) => {
                const { bold, normal } = formatBionicWord(word);
                return (
                  <span key={wIdx} style={{ marginRight: '4px' }}>
                    <strong style={{ fontWeight: 800, color: '#ffffff' }}>{bold}</strong>
                    <span style={{ color: '#cbd5e1', fontWeight: 400 }}>{normal}</span>
                  </span>
                );
              })}
            </span>

            {/* Metric / Complexity Pill */}
            {b.metricChip && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.25)',
                  color: '#a7f3d0',
                  border: '1px solid rgba(52, 211, 153, 0.5)',
                  boxShadow: '0 0 10px rgba(16, 185, 129, 0.2)',
                }}
              >
                ⚡ {b.metricChip}
              </span>
            )}
          </div>
        ))}
      </div>
      {sourceText && (
        <details style={{ width: '100%', marginTop: 4, color: '#cbd5e1' }}>
          <summary style={{ cursor: 'pointer', fontSize: 11, color: '#a7f3d0' }}>
            Show complete answer and code
          </summary>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: 'inherit', fontSize: 12, lineHeight: 1.6, marginTop: 10 }}>
            {sourceText}
          </pre>
        </details>
      )}
    </div>
  );
}

interface ConversationSearchResult {
  id: string;
  label: string;
  question: string;
  answer: string;
}

function ShortcutSettings({
  bindings,
  onChange,
}: {
  bindings: Record<InterviewShortcutAction, string>;
  onChange: (action: InterviewShortcutAction, binding: string) => void;
}) {
  const [capturing, setCapturing] = useState<InterviewShortcutAction | null>(null);
  const [captureError, setCaptureError] = useState('');

  useEffect(() => {
    if (!capturing) return;

    const handleCapture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        setCapturing(null);
        setCaptureError('');
        return;
      }
      if (['Shift', 'Control', 'Meta', 'Alt'].includes(event.key)) return;

      const modifiers: string[] = [];
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
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <span style={{ color: '#cbd5e1', fontSize: 12 }}>
            {INTERVIEW_SHORTCUT_LABELS[action]}
          </span>
          <button
            type="button"
            onClick={() => {
              setCaptureError('');
              setCapturing(action);
            }}
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
// prettier-ignore
function ConversationSearchOverlay({
  query,
  onQueryChange,
  results,
  onClose,
  onSelect,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  results: ConversationSearchResult[];
  onClose: () => void;
  onSelect: (result: ConversationSearchResult) => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search interview conversation"
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 100,
        display: 'grid',
        placeItems: 'start center',
        padding: 24,
        background: 'rgba(0,0,0,0.76)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(100%, 620px)',
          maxHeight: 'min(78vh, 680px)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 12,
          border: '1px solid rgba(148,163,184,0.22)',
          background: '#0b111b',
          color: '#e5eaf2',
          boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
        }}
      >
        <div style={{ padding: 14, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <input
            autoFocus
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search previous interview questions and answers…"
            aria-label="Search conversation history"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '11px 12px',
              borderRadius: 8,
              border: '1px solid rgba(148,163,184,0.25)',
              outline: 'none',
              background: 'rgba(255,255,255,0.06)',
              color: '#f8fafc',
              fontSize: 13,
            }}
          />
          <div style={{ marginTop: 7, color: '#8290a3', fontSize: 11 }}>
            {query.trim()
              ? results.length + ' matching conversation item(s)'
              : 'Recent conversation history'}{' '}
            · Esc to close
          </div>
        </div>
        <div
          style={{
            overflowY: 'auto',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
          }}
        >
          {results.length ? (
            results.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => onSelect(result)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: 11,
                  textAlign: 'left',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.035)',
                  color: '#e5eaf2',
                  cursor: 'pointer',
                }}
                title="Jump to this question in the conversation"
              >
                <span
                  style={{
                    display: 'block',
                    color: '#93a4ba',
                    fontSize: 10,
                    marginBottom: 5,
                  }}
                >
                  {result.label} · jump to message
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 13,
                    lineHeight: 1.45,
                    fontWeight: 650,
                  }}
                >
                  {result.question}
                </span>
                {result.answer && (
                  <span
                    style={{
                      display: 'block',
                      marginTop: 5,
                      color: '#aab5c4',
                      fontSize: 11,
                      lineHeight: 1.45,
                    }}
                  >
                    {result.answer.slice(0, 240)}
                    {result.answer.length > 240 ? '…' : ''}
                  </span>
                )}
              </button>
            ))
          ) : (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: '#8290a3',
                fontSize: 12,
              }}
            >
              No matching questions or answers found.
            </div>
          )}
        </div>
        <div
          style={{
            padding: '10px 14px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            textAlign: 'right',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 0,
              borderRadius: 7,
              padding: '7px 12px',
              background: '#273449',
              color: '#e5eaf2',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══ Layer 4.8: Factual Grounding Badge ═══ */
function GroundingBadge({
  validationStatus,
  isValidated,
  score,
  violationsCount,
  isGenerating,
  hasProviderError,
}: {
  validationStatus?:
    | 'PENDING'
    | 'VALIDATED'
    | 'FLAGGED'
    | 'FLAGGED_BUT_QUALIFIED'
    | 'BLOCKED'
    | 'FAILED'
    | 'ABORTED';
  isValidated: boolean;
  score: number | null;
  violationsCount: number;
  isGenerating: boolean;
  hasProviderError?: boolean;
}) {
  if (isGenerating || validationStatus === 'PENDING') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 700,
          color: '#60a5fa',
          background: 'rgba(59, 130, 246, 0.12)',
          border: '1px solid rgba(96, 165, 250, 0.35)',
        }}
        title="Streaming live token stream. Factual grounding validation occurs upon completion."
      >
        ⚡ Live Stream (Validation Pending)
      </span>
    );
  }

  if (validationStatus === 'BLOCKED') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 700,
          color: '#f87171',
          background: 'rgba(239, 68, 68, 0.2)',
          border: '1px solid rgba(239, 68, 68, 0.6)',
        }}
        title="Candidate claims in this answer could not be safely verified or qualified; answer is blocked from speaking queue."
      >
        🚫 Speaking Blocked (Ungrounded Claims)
      </span>
    );
  }

  if (validationStatus === 'ABORTED') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 700,
          color: '#9ca3af',
          background: 'rgba(156, 163, 175, 0.15)',
          border: '1px solid rgba(156, 163, 175, 0.4)',
        }}
        title="Generation was aborted."
      >
        ⏹️ Generation Aborted
      </span>
    );
  }

  if (validationStatus === 'FAILED') {
    if (hasProviderError) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 700,
            color: '#f87171',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
          }}
          title="AI generation encountered a provider or stream error. Click Retry Answer below."
        >
          ⚠️ AI Provider Error
        </span>
      );
    }
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 700,
          color: '#ef4444',
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
        }}
        title="Validation failed closed: unsafe or unvalidated answer blocked."
      >
        ❌ Factual Grounding: FAILED
      </span>
    );
  }

  if (!isValidated && !validationStatus) {
    return null;
  }

  const isClean = isValidated && validationStatus === 'VALIDATED';
  if (isClean) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 700,
          color: '#10b981',
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(52, 211, 153, 0.35)',
        }}
        title="100% grounded in verified candidate facts without unsupported technical claims."
      >
        🛡️ Factual Grounding: Verified
      </span>
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 700,
        color: '#fbbf24',
        background: 'rgba(245, 158, 11, 0.15)',
        border: '1px solid rgba(245, 158, 11, 0.45)',
      }}
      title={`${violationsCount} ungrounded claims neutralized and qualified for speaking safety.`}
    >
      ⚠️ Grounding: Qualified ({violationsCount} Claim{violationsCount > 1 ? 's' : ''} Neutralized)
    </span>
  );
}

/* ═══ Layer 5: Answer Confidence Badge ═══ */
function ConfidenceBadge({ confidence }: { confidence: 'high' | 'medium' | 'low' | null }) {
  if (!confidence) return null;

  const config = {
    high: {
      emoji: '🟢',
      label: 'High Confidence',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.15)',
      border: 'rgba(52, 211, 153, 0.4)',
    },
    medium: {
      emoji: '🟡',
      label: 'Verified',
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.15)',
      border: 'rgba(251, 191, 36, 0.4)',
    },
    low: {
      emoji: '🔴',
      label: 'Best Effort',
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.15)',
      border: 'rgba(248, 113, 113, 0.4)',
    },
  }[confidence];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 700,
        color: config.color,
        background: config.bg,
        border: `1px solid ${config.border}`,
        letterSpacing: '0.3px',
      }}
    >
      {config.emoji} {config.label}
    </span>
  );
}

/* ═══ Layer 6: Follow-Up Predictions Panel ═══ */
function FollowUpPredictions({
  followUps,
  onSelect,
}: {
  followUps: string[];
  onSelect: (q: string) => void;
}) {
  if (!followUps || followUps.length === 0) return null;

  return (
    <div
      style={{
        margin: '10px 0',
        padding: '10px 14px',
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(139, 92, 246, 0.08))',
        border: '1px solid rgba(129, 140, 248, 0.25)',
        borderRadius: '8px',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#a5b4fc',
          marginBottom: '6px',
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
        }}
      >
        🔮 Predicted Follow-Ups
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {followUps.map((fu, i) => (
          <button
            key={i}
            onClick={() => onSelect(fu)}
            style={{
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(129, 140, 248, 0.2)',
              borderRadius: '6px',
              padding: '5px 10px',
              color: '#c7d2fe',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.background = 'rgba(99, 102, 241, 0.25)';
              (e.target as HTMLElement).style.borderColor = 'rgba(129, 140, 248, 0.5)';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.background = 'rgba(99, 102, 241, 0.1)';
              (e.target as HTMLElement).style.borderColor = 'rgba(129, 140, 248, 0.2)';
            }}
          >
            <span style={{ color: '#818cf8', marginRight: '6px' }}>→</span>
            {fu}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══ Conversation Memory Indicator ═══ */
function MemoryIndicator({ historyCount }: { historyCount: number }) {
  if (historyCount === 0) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        padding: '2px 7px',
        borderRadius: '10px',
        fontSize: '10px',
        fontWeight: 600,
        color: '#a78bfa',
        background: 'rgba(139, 92, 246, 0.12)',
        border: '1px solid rgba(139, 92, 246, 0.25)',
      }}
    >
      🧠 {historyCount}/5 Context
    </span>
  );
}

function extractChatExplanation(answer: string | null | undefined): string {
  if (!answer) return '';
  const spokenMatch = answer.match(
    /(?:🗣️\s*(?:SPOKEN CANDIDATE SCRIPT|VERBAL EXPLANATION|Spoken script)[:\s]*)([\s\S]*?)(?:$|\n#{1,3}\s|\n\d+\.\s+(?:🎯|⚡|📦|🧪|🗣️))/iu
  );
  if (spokenMatch && spokenMatch[1].trim()) {
    return spokenMatch[1].replace(/^[*-]\s+/gm, '').trim();
  }
  const stripped = answer
    .replace(/^#+\s.*$/gm, '')
    .replace(/^=+\s*$/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^[*-]\s+/gm, '')
    .trim();
  return stripped;
}

function extractCodeBlocksFromAnswer(
  answer: string | null | undefined,
  defaultLang: string = 'Java'
) {
  if (!answer) return [];
  const segments: Array<{ language: string; code: string }> = [];
  const codeBlockRegex = /```([a-zA-Z0-9_#+-]*)[^\n\r]*\r?\n([\s\S]*?)(?:```|$)/g;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(answer)) !== null) {
    const lang = match[1] || defaultLang;
    const code = match[2] || '';
    if (code.trim()) {
      segments.push({ language: lang, code: code.trim() });
    }
  }
  return segments;
}

function CodeBlockCard({ language, code, index, onCopy, isCopied }: CodeBlockCardProps) {
  const cleanCode = code.trim();
  const lines = cleanCode.split('\n');
  const lineCount = lines.length;
  const displayLang = (language || 'code').toUpperCase();
  const isTypeableMinimal = lineCount <= 14 || /⚡|TYPEABLE|Shortest/i.test(cleanCode.slice(0, 80));

  const [typeStatus, setTypeStatus] = useState<'idle' | 'counting' | 'typing' | 'done'>('idle');
  const [countdown, setCountdown] = useState(2);

  const handleStartAutoType = async () => {
    if (typeStatus !== 'idle') return;
    setTypeStatus('counting');
    setCountdown(2);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setTypeStatus('typing');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      const res = await window.electronAPI?.autoTypeCode?.(cleanCode, 2000);
      clearInterval(timer);
      setTypeStatus('done');
      if (res?.method === 'clipboard-fallback') {
        onCopy(cleanCode, index);
      }
      setTimeout(() => setTypeStatus('idle'), 3000);
    } catch {
      clearInterval(timer);
      setTypeStatus('idle');
    }
  };

  return (
    <div
      style={{
        margin: '14px 0',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid rgba(99, 102, 241, 0.4)',
        background: '#080c16',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7)',
        fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
      }}
    >
      {/* Code Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '7px 12px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '11px',
          color: '#94a3b8',
          flexWrap: 'wrap',
          gap: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#38bdf8',
              boxShadow: '0 0 8px #38bdf8',
            }}
          />
          <span style={{ fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.5px' }}>
            {displayLang}
          </span>
          <span style={{ color: '#64748b', fontSize: '10px' }}>
            ({lineCount} {lineCount === 1 ? 'line' : 'lines'})
          </span>
          {isTypeableMinimal && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '1px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700,
                background: 'rgba(245, 158, 11, 0.18)',
                color: '#fde68a',
                border: '1px solid rgba(245, 158, 11, 0.35)',
              }}
            >
              ⚡ ~35s Typeable
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={handleStartAutoType}
            title="Auto-type code into active editor to bypass platform copy-paste restrictions (Shortcut: Option+V)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              background:
                typeStatus === 'counting' || typeStatus === 'typing'
                  ? 'rgba(234, 88, 12, 0.35)'
                  : typeStatus === 'done'
                    ? 'rgba(16, 185, 129, 0.3)'
                    : 'linear-gradient(135deg, rgba(6, 182, 212, 0.35), rgba(14, 165, 233, 0.45))',
              color:
                typeStatus === 'counting' || typeStatus === 'typing'
                  ? '#fdba74'
                  : typeStatus === 'done'
                    ? '#6ee7b7'
                    : '#e0f2fe',
              border:
                typeStatus === 'done'
                  ? '1px solid rgba(52, 211, 153, 0.7)'
                  : '1px solid rgba(56, 189, 248, 0.5)',
              borderRadius: '5px',
              padding: '4px 9px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {typeStatus === 'counting' ? (
              <>
                <Loader2 size={12} className="spin" />
                <span>Focus Editor: {countdown}s...</span>
              </>
            ) : typeStatus === 'typing' ? (
              <>
                <Keyboard size={12} className="spin" />
                <span>Typing...</span>
              </>
            ) : typeStatus === 'done' ? (
              <>
                <Check size={12} />
                <span>✓ Auto-Typed!</span>
              </>
            ) : (
              <>
                <Zap size={12} />
                <span>⚡ Auto-Type (⌥V)</span>
              </>
            )}
          </button>

          <button
            onClick={() => onCopy(cleanCode, index)}
            title="Copy ONLY this clean code directly to clipboard (ready to paste into LeetCode / HackerRank / Editor)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              background: isCopied
                ? 'rgba(16, 185, 129, 0.3)'
                : 'linear-gradient(135deg, rgba(99, 102, 241, 0.4), rgba(79, 70, 229, 0.5))',
              color: isCopied ? '#6ee7b7' : '#e0e7ff',
              border: isCopied
                ? '1px solid rgba(52, 211, 153, 0.7)'
                : '1px solid rgba(129, 140, 248, 0.5)',
              borderRadius: '5px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: isCopied ? '0 0 10px rgba(16, 185, 129, 0.4)' : 'none',
            }}
          >
            {isCopied ? <Check size={12} /> : <Copy size={12} />}
            <span>{isCopied ? '✓ Copied Code!' : '📋 Copy Code Only'}</span>
          </button>
        </div>
      </div>

      {/* Code Body with Line Numbers */}
      <div
        style={{
          display: 'flex',
          overflowX: 'auto',
          padding: '10px 0',
          fontSize: '13px',
          lineHeight: '1.65',
          tabSize: 4,
        }}
      >
        {/* Line numbers column */}
        <div
          style={{
            padding: '0 12px 0 14px',
            color: '#475569',
            textAlign: 'right',
            userSelect: 'none',
            borderRight: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: '12px',
            lineHeight: '1.65',
          }}
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Code Content column */}
        <pre
          style={{
            margin: 0,
            padding: '0 16px',
            color: '#f8fafc',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            lineHeight: 'inherit',
            whiteSpace: 'pre',
            userSelect: 'text',
            flex: 1,
          }}
        >
          {cleanCode}
        </pre>
      </div>
    </div>
  );
}

/**
 * Real presentation selector: returns speakable candidate answer text
 * only if factual grounding validation has passed or been appropriately flagged and qualified.
 * Raw or unneutralized BLOCKED, FAILED, or ABORTED answers strictly return null.
 */
export function selectSpeakableCandidateAnswer(state: {
  currentAnswer: string | null;
  isAnswerValidated: boolean;
  answerValidationStatus: string;
}): string | null {
  if (state.isAnswerValidated || state.answerValidationStatus === 'FLAGGED_BUT_QUALIFIED') {
    return state.currentAnswer;
  }
  return null;
}

/**
 * Presentation selector for general impersonal technical guidance.
 * Available for reference when personal candidate experience cannot be safely verified.
 */
export function selectTechnicalGuidance(state: {
  technicalGuidance?: string | null;
}): string | null {
  return state.technicalGuidance || null;
}

export default function TeleprompterView() {
  const {
    currentQuestion,
    currentAnswer,
    draftAnswer,
    technicalGuidance,
    blockedReason,
    status,
    isAnswerValidated,
    answerValidationStatus,
    groundingScore,
    groundingViolations,
    diagnosticState,
    isRecording,
    isInterviewFocusMode,
    setInterviewFocusMode,
    toggleInterviewFocusMode,
    teleprompterFontSize,
    setTeleprompterFontSize,
    isAutoScrolling,
    setIsAutoScrolling,
    scrollSpeed,
    setScrollSpeed,
    windowOpacity,
    setWindowOpacity,
    toggleRecording,
    copyAnswer,
    copyCodeOnly,
    clearAndResetToListen,
    responseMode,
    setResponseMode,
    applicationSession,
    setApplicationSession,
    taskClassification,
    teleprompterViewMode,
    setTeleprompterViewMode,
    targetRole,
    setResumeModalOpen,
    setResumeText,
    setJobDescriptionText,
    setToast,
    recitalState,
    lastInterruption,
    doneAnswering,
    settings,
    updateSetting,
    answerConfidence,
    predictedFollowUps,
    conversationHistory,
    questionHistory,
    redoQuestionHistory,
    isIncompleteQuestionMode,
    speechPauseTolerance,
    restorePreviousQuestion,
    redoQuestion,
    setIsIncompleteQuestionMode,
    markQuestionIncomplete,
    setSpeechPauseTolerance,
    pipelineStage,
    recoveredPartialAnswer,
    rateLimitCooldown,
    generateAnswerFromTranscript,
  } = useAppStore();

  const isListening =
    status === 'listening' ||
    status === 'transcribing' ||
    status === 'analyzing' ||
    status === 'generating';
  const isGenerating = status === 'analyzing' || status === 'generating';

  const [manualInput, setManualInput] = useState('');
  const [copiedCodeIndices, setCopiedCodeIndices] = useState<Record<number, boolean>>({});
  const [copiedPrimary, setCopiedPrimary] = useState(false);

  const handleCopyCodeBlock = async (code: string, index: number) => {
    await copyToClipboard(code);
    setCopiedCodeIndices((prev) => ({ ...prev, [index]: true }));
    setToast('💻 Clean code copied to clipboard!');
    setTimeout(() => {
      setCopiedCodeIndices((prev) => ({ ...prev, [index]: false }));
    }, 2500);
  };

  const handleCopyPrimaryCode = async () => {
    const success = await copyCodeOnly();
    if (success) {
      setCopiedPrimary(true);
      setTimeout(() => setCopiedPrimary(false), 2500);
    }
  };

  const isLinux = typeof window !== 'undefined' && window.electronAPI?.platform === 'linux';
  const [isStealthActive, setIsStealthActive] = useState(!isLinux);

  const handleToggleStealth = async () => {
    if (isLinux) {
      setToast(
        '🛡️ Linux Stealth: In Zoom/Google Meet/Teams, share your Code Editor or Browser Window directly instead of your Entire Screen! Because IAC runs as a separate window, it remains 100% invisible to interviewers. (Press Esc or Ctrl+Shift+H to panic-hide)'
      );
      return;
    }
    const next = !isStealthActive;
    setIsStealthActive(next);
    await window.electronAPI?.setContentProtection?.(next);
    setToast(
      next
        ? '🛡️ Screen Stealth ON: Window is completely invisible in screen share (Zoom, Meet, Teams)'
        : '⚠️ Screen Stealth OFF: Window is now visible in screen share'
    );
  };

  const [isScreenReading, setIsScreenReading] = useState(false);
  const [isBionicGazeMode, setIsBionicGazeMode] = useState(() => {
    try {
      return localStorage.getItem('interview_bionic_hud') === 'true';
    } catch {
      return false;
    }
  });
  const conversationScrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollConversationRef = useRef(true);
  const conversationScrollTopRef = useRef(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showControlsPopover, setShowControlsPopover] = useState(false);
  const [showConversationSearch, setShowConversationSearch] = useState(false);
  const [conversationSearchQuery, setConversationSearchQuery] = useState('');
  const shortcutBindings = useMemo(
    () => resolveInterviewShortcutBindings(settings?.shortcuts),
    [settings?.shortcuts]
  );
  const handleShortcutChange = useCallback(
    (action: InterviewShortcutAction, binding: string) => {
      const canonical = canonicalizeInterviewShortcut(binding);
      if (!canonical) {
        setToast('That key combination is not supported. Choose a valid shortcut.');
        return;
      }
      if (isReservedInterviewShortcut(canonical)) {
        setToast('That shortcut is reserved by another application control.');
        return;
      }
      const duplicate = (Object.keys(shortcutBindings) as InterviewShortcutAction[]).find(
        (candidate) =>
          candidate !== action &&
          canonicalizeInterviewShortcut(shortcutBindings[candidate]) === canonical
      );
      if (duplicate) {
        setToast(
          'That shortcut is already assigned to ' + INTERVIEW_SHORTCUT_LABELS[duplicate] + '.'
        );
        return;
      }
      updateSetting('shortcuts', { ...(settings?.shortcuts || {}), [action]: canonical });
      setToast(
        INTERVIEW_SHORTCUT_LABELS[action] +
          ' shortcut updated to ' +
          formatInterviewShortcut(canonical) +
          '.'
      );
    },
    [shortcutBindings, settings?.shortcuts, updateSetting, setToast]
  );
  const conversationSearchResults = useMemo<ConversationSearchResult[]>(() => {
    const entries: ConversationSearchResult[] = questionHistory.map((item, index) => ({
      id: 'history-' + String(item.timestamp || 'untimestamped') + '-' + String(index),
      label: 'Previous answer ' + String(index + 1),
      question: item.question,
      answer: item.answer || '',
    }));

    if (currentQuestion) {
      entries.push({
        id: 'current-conversation',
        label: 'Current question',
        question: currentQuestion,
        answer: currentAnswer || draftAnswer || '',
      });
    }

    const normalizedQuery = conversationSearchQuery.trim().toLocaleLowerCase();
    const matching = normalizedQuery
      ? entries.filter((entry) =>
          (entry.question + '\\n' + entry.answer).toLocaleLowerCase().includes(normalizedQuery)
        )
      : entries;

    return matching.slice(-30).reverse();
  }, [questionHistory, currentQuestion, currentAnswer, draftAnswer, conversationSearchQuery]);

  const jumpToConversationResult = useCallback(
    (result: ConversationSearchResult) => {
      setShowConversationSearch(false);
      window.requestAnimationFrame(() => {
        const target = Array.from(
          document.querySelectorAll<HTMLElement>('[data-conversation-id]')
        ).find((element) => element.dataset.conversationId === result.id);
        if (!target) {
          setToast('That conversation item is no longer in the visible history.');
          return;
        }
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const previousOutline = target.style.outline;
        target.style.outline = '2px solid rgba(129, 140, 248, 0.9)';
        target.style.outlineOffset = '5px';
        window.setTimeout(() => {
          target.style.outline = previousOutline;
          target.style.outlineOffset = '';
        }, 1400);
      });
    },
    [setToast]
  );

  useEffect(() => {
    try {
      localStorage.setItem('interview_bionic_hud', String(isBionicGazeMode));
    } catch {
      /* optional preference */
    }
  }, [isBionicGazeMode]);

  useEffect(() => {
    const element = conversationScrollRef.current;
    if (!element) return;
    if (shouldAutoScrollConversationRef.current) {
      element.scrollTo({ top: element.scrollHeight, behavior: 'auto' });
    }
  }, [currentQuestion, currentAnswer, draftAnswer, status, isBionicGazeMode]);

  // The two answer modes render different DOM trees. Preserve the reader's position
  // when switching modes unless they were already following the newest content.
  useEffect(() => {
    const element = conversationScrollRef.current;
    if (!element) return;
    const target = getConversationScrollTarget(
      element.scrollHeight,
      conversationScrollTopRef.current,
      shouldAutoScrollConversationRef.current
    );
    if (!shouldAutoScrollConversationRef.current) {
      element.scrollTo({ top: target, behavior: 'auto' });
    }
  }, [isBionicGazeMode]);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 900
  );
  const [windowHeight, setWindowHeight] = useState(
    typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 720
  );

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isCompact = windowWidth < 920;
  const isUltraCompact = windowWidth < 660;
  const isCompactHeight = windowHeight < 380;
  const isRibbonMode = isInterviewFocusMode || isCompactHeight;

  useEffect(() => {
    const unsubCapture = window.electronAPI?.onTriggerScreenCapture?.(() => {
      handleScreenCapture('fullscreen');
    });
    const unsubAppend = window.electronAPI?.onTriggerAppendScreenCapture?.(() => {
      handleAppendScreenCapture('fullscreen');
    });
    const unsubAutoType = window.electronAPI?.onTriggerAutoType?.(() => {
      handleTriggerAutoType();
    });
    const unsubAutoTypeText = window.electronAPI?.onTriggerAutoTypeText?.(() => {
      handleTriggerAutoTypeText();
    });
    return () => {
      unsubCapture?.();
      unsubAppend?.();
      unsubAutoType?.();
      unsubAutoTypeText?.();
    };
  }, []);

  const handleSteerAnswer = (instruction: string) => {
    if (!currentQuestion) return;
    const combinedPrompt = `[Follow-up on: "${currentQuestion}"]\nRequirement: ${instruction}\nProvide an immediate, focused, production-grade response.`;
    handleTriggerQuestion(combinedPrompt);
    setToast('✨ Refining answer with targeted focus...');
  };

  const handleRegenerateCurrentAnswer = () => {
    if (!currentQuestion) return;
    handleTriggerQuestion(currentQuestion);
    setToast('🔄 Regenerating answer from scratch...');
  };

  const handleScreenCapture = async (mode: 'fullscreen' | 'snip' = 'fullscreen') => {
    if (isScreenReading) return;
    setIsScreenReading(true);
    setToast(
      mode === 'snip'
        ? '✂️ Snip Active: Drag a rectangle directly over the question or code on screen'
        : '📸 Reading interviewer screen via Apple Vision Neural OCR...'
    );

    try {
      const res = await window.electronAPI?.captureScreenAndOCR?.(mode);
      if (res?.cancelled) {
        setToast('Screen capture cancelled.');
        setIsScreenReading(false);
        return;
      }
      if (!res?.success || !res?.text) {
        setToast(res?.error || 'No readable text or code found on screen.');
        setIsScreenReading(false);
        return;
      }

      const lang = detectLanguageHint(res.text);
      if (lang.isNonEnglish) {
        setToast(
          `🌐 Screen is in ${lang.languageName} ${lang.flag}! Translating to English & solving...`
        );
      } else {
        setToast('🧠 Problem extracted from screen! Generating 100% verified solution...');
      }
      InterviewEngine.handleEvent({
        type: 'SCREEN_PROBLEM_DETECTED',
        rawText: res.text,
        mode,
      });
    } catch (err: any) {
      console.error('[TeleprompterView] Screen capture error:', err);
      setToast('Screen capture error: ' + (err?.message || err));
    } finally {
      setIsScreenReading(false);
    }
  };

  const handleAppendScreenCapture = async (mode: 'fullscreen' | 'snip' = 'fullscreen') => {
    if (isScreenReading) return;
    setIsScreenReading(true);
    setToast(
      mode === 'snip'
        ? '✂️ Snip Scrolled Page: Drag over the continuation/constraints on screen'
        : '📄 Capturing scrolled page & stitching with top question...'
    );

    try {
      const res = await window.electronAPI?.appendScreenCaptureAndOCR?.(mode);
      if (res?.cancelled) {
        setToast('Append capture cancelled.');
        setIsScreenReading(false);
        return;
      }
      if (!res?.success || !res?.text) {
        setToast(res?.error || 'No readable text or code found on scrolled screen.');
        setIsScreenReading(false);
        return;
      }

      setToast(
        '🧩 Stitched 2-page question! Regenerating 100% verified solution with full constraints...'
      );
      InterviewEngine.handleEvent({
        type: 'SCREEN_PROBLEM_DETECTED',
        rawText: res.text,
        mode,
      });
    } catch (err: any) {
      console.error('[TeleprompterView] Append screen capture error:', err);
      setToast('Append error: ' + (err?.message || err));
    } finally {
      setIsScreenReading(false);
    }
  };

  const handleTriggerAutoType = async () => {
    const codeBlocks = extractCodeBlocksFromAnswer(
      useAppStore.getState().currentAnswer,
      settings?.preferredLanguage || 'Java'
    );
    if (!codeBlocks.length) {
      setToast('⚠️ No code block found in the current answer to auto-type.');
      return;
    }

    const preferred =
      codeBlocks.find(
        (b) => b.code.split('\n').length <= 15 || /⚡|TYPEABLE|Shortest/i.test(b.code)
      ) || codeBlocks[0];

    const cleanCode = preferred.code;
    setToast('⌨️ Auto-Type Code activated! Click inside your code editor now: 2... 1...');
    try {
      const res = await window.electronAPI?.autoTypeCode?.(cleanCode, 2000);
      if (res?.success) {
        setToast('✓ Code auto-typed into editor! (Bypassed copy-paste restrictions)');
      } else {
        setToast('Auto-type note: ' + (res?.warning || res?.error || 'Copied to clipboard'));
      }
    } catch (err: any) {
      setToast('Auto-type error: ' + (err?.message || err));
    }
  };

  const handleTriggerAutoTypeText = async (customText?: string) => {
    let cleanText = (customText || '').trim();
    if (!cleanText) {
      cleanText = extractChatExplanation(useAppStore.getState().currentAnswer);
    }
    if (!cleanText) {
      setToast('⚠️ No explanation text found to auto-type.');
      return;
    }

    setToast('💬 Auto-Type Text activated! Click inside chat/input box now: 2... 1...');
    try {
      const res = await window.electronAPI?.autoTypeCode?.(cleanText, 2000);
      if (res?.success) {
        setToast('✓ Text auto-typed into chat/input field! (Bypassed restrictions)');
      } else {
        setToast('Auto-type note: ' + (res?.warning || res?.error || 'Copied to clipboard'));
      }
    } catch (err: any) {
      setToast('Auto-type error: ' + (err?.message || err));
    }
  };

  const [isWindowDragging, setIsWindowDragging] = useState(false);

  const handleWindowDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsWindowDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'].includes(ext || '')) {
      try {
        setToast(`📸 Reading ${file.name} with Apple Vision Neural OCR...`);
        const res = await window.electronAPI?.ocrImageFile?.((file as any).path);
        if (res?.success && res.text) {
          const lang = detectLanguageHint(res.text);
          if (lang.isNonEnglish) {
            setToast(
              `🌐 Detected ${lang.languageName} ${lang.flag} in ${file.name}! Translating to English & solving...`
            );
          } else {
            setToast(
              `🧠 Extracted problem from ${file.name}! Solving with 0-hallucination verification...`
            );
          }
          InterviewEngine.handleEvent({
            type: 'SCREEN_PROBLEM_DETECTED',
            rawText: res.text,
            mode: 'fullscreen',
          });
          return;
        } else {
          setToast(res?.error || 'No readable text found in dropped image.');
          return;
        }
      } catch (err: any) {
        console.error('Image OCR error:', err);
        setToast('Image OCR error: ' + (err?.message || err));
        return;
      }
    }

    try {
      setToast(`Reading ${file.name}...`);
      const text = await readAndParseFile(file);
      if (!text || !text.trim()) {
        setToast(`Could not extract text from ${file.name}`);
        return;
      }

      const lower = file.name.toLowerCase();
      if (lower.includes('jd') || lower.includes('job') || lower.includes('description')) {
        setJobDescriptionText(text.trim());
        setToast(`🎯 Loaded ${file.name} as Target Job Description!`);
      } else {
        setResumeText(text.trim());
        setToast(`📄 Loaded ${file.name} as Candidate Resume!`);
      }
    } catch (err: any) {
      console.error('File drop error:', err);
      setToast(`Error parsing file: ${err?.message || err}`);
    }
  };

  const [seconds, setSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(true);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!isAutoScrolling || isHovered) return;
    const el = scrollRef.current;
    if (!el) return;

    const interval = setInterval(() => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) return;
      el.scrollTop += 0.8 * scrollSpeed;
    }, 30);

    return () => clearInterval(interval);
  }, [isAutoScrolling, scrollSpeed, isHovered]);

  useEffect(() => {
    if (currentQuestion) {
      setSeconds(0);
      setTimerRunning(true);
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [currentQuestion]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showShortcuts || showControlsPopover || showConversationSearch) {
          e.preventDefault();
          setShowShortcuts(false);
          setShowControlsPopover(false);
          setShowConversationSearch(false);
          return;
        }
      }
      const target = e.target as HTMLElement | null;
      const isTyping = Boolean(
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.isContentEditable ||
          target.closest('[contenteditable="true"], [role="textbox"]'))
      );
      if (isTyping) return;
      if (matchesInterviewShortcut(e, shortcutBindings.bionicHud)) {
        e.preventDefault();
        const scrollElement = conversationScrollRef.current;
        if (scrollElement) conversationScrollTopRef.current = scrollElement.scrollTop;
        setIsBionicGazeMode((value) => !value);
        return;
      }
      if (matchesInterviewShortcut(e, shortcutBindings.listening)) {
        e.preventDefault();
        toggleRecording();
        return;
      }
      // Panic stealth shortcuts remain separate from the Bionic HUD toggle.
      if (
        ((e.metaKey || e.ctrlKey) && (e.code === 'Backslash' || e.key === '\\')) ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'Space')
      ) {
        e.preventDefault();
        window.electronAPI?.toggleVisibility?.();
        return;
      }

      // Undo / Restore Previous Question (Cmd+Z or Cmd+[)
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        (e.code === 'KeyZ' ||
          e.key.toLowerCase() === 'z' ||
          e.code === 'BracketLeft' ||
          e.key === '[')
      ) {
        e.preventDefault();
        restorePreviousQuestion();
        return;
      }

      // Redo to Next Question (Cmd+Shift+Z or Cmd+Y or Cmd+])
      if (
        ((e.metaKey || e.ctrlKey) &&
          e.shiftKey &&
          (e.code === 'KeyZ' || e.key.toLowerCase() === 'z')) ||
        ((e.metaKey || e.ctrlKey) &&
          (e.code === 'KeyY' ||
            e.key.toLowerCase() === 'y' ||
            e.code === 'BracketRight' ||
            e.key === ']'))
      ) {
        e.preventDefault();
        redoQuestion();
        return;
      }

      // Tell AI Question is Still Not Completed / Waiting for Continuation (Alt+C)
      if (e.altKey && (e.code === 'KeyC' || e.key.toLowerCase() === 'c')) {
        e.preventDefault();
        markQuestionIncomplete();
        return;
      }

      // Search retained interview history; do not mutate the active question or answer.
      if (matchesInterviewShortcut(e, shortcutBindings.searchConversation)) {
        e.preventDefault();
        setConversationSearchQuery('');
        setShowConversationSearch(true);
        setShowShortcuts(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
        e.preventDefault();
        clearAndResetToListen();
        return;
      }

      if (matchesInterviewShortcut(e, shortcutBindings.solveScreen)) {
        e.preventDefault();
        handleScreenCapture('fullscreen');
        return;
      }
      if (matchesInterviewShortcut(e, shortcutBindings.snipScreen)) {
        e.preventDefault();
        handleScreenCapture('snip');
        return;
      }

      // Mode switching shortcuts
      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        setResponseMode('coding');
        setToast('Mode: 💻 Coding');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        setResponseMode('interview');
        setToast('Mode: 🎙️ Interview');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '3') {
        e.preventDefault();
        setResponseMode('quiz');
        setToast('Mode: 📝 Quiz');
        return;
      }

      // Auto-scroll toggle: Cmd+J
      if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyJ' || e.key.toLowerCase() === 'j')) {
        e.preventDefault();
        setIsAutoScrolling(!isAutoScrolling);
        setToast(!isAutoScrolling ? '📜 Auto-Scroll: Resumed' : '⏸️ Auto-Scroll: Paused');
        return;
      }

      if (
        matchesInterviewShortcut(e, shortcutBindings.finishAnswer) &&
        currentAnswer &&
        !showShortcuts &&
        !showControlsPopover &&
        !showConversationSearch
      ) {
        const focusedInteractive = Boolean(
          target?.closest('button, a, [role="button"], [role="menuitem"]')
        );
        if (shortcutBindings.finishAnswer === 'Space' && focusedInteractive) return;
        e.preventDefault();
        doneAnswering();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentAnswer,
    doneAnswering,
    restorePreviousQuestion,
    redoQuestion,
    markQuestionIncomplete,
    showShortcuts,
    showControlsPopover,
    showConversationSearch,
    isAutoScrolling,
    toggleRecording,
    shortcutBindings,
    clearAndResetToListen,
    handleScreenCapture,
    setResponseMode,
    setToast,
  ]);

  const handleToggleCompactWindow = async () => {
    if (typeof window !== 'undefined' && window.electronAPI?.setWindowSize) {
      const size = await window.electronAPI.getWindowSize?.();
      if (size && (size.width <= 750 || size.height <= 380)) {
        await window.electronAPI.setWindowSize(1024, 720);
      } else {
        await window.electronAPI.setWindowSize(680, 240);
      }
    }
  };

  const handleRestartScrolling = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const fontSizes: Record<TeleprompterFontSize, { label: string; size: string; line: string }> = {
    small: { label: 'Small', size: '15px', line: '1.7' },
    medium: { label: 'Medium', size: '18px', line: '1.75' },
    large: { label: 'Large', size: '23px', line: '1.8' },
    xlarge: { label: 'XL', size: '28px', line: '1.85' },
  };

  const handleExit = () => {
    if (typeof window !== 'undefined' && window.electronAPI?.quitApp) {
      window.electronAPI.quitApp();
    } else if (typeof window !== 'undefined' && window.electronAPI?.close) {
      window.electronAPI.close();
    } else {
      window.close();
    }
  };

  const handleTriggerQuestion = (q: string) => {
    if (!q || !q.trim()) return;
    InterviewEngine.handleEvent({
      type: 'QUESTION_DETECTED',
      text: q.trim(),
    });
  };

  const wordCount = currentAnswer ? currentAnswer.trim().split(/\s+/).filter(Boolean).length : 0;
  const estMinutes = (wordCount / 135).toFixed(1);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleTriggerQuestion(manualInput.trim());
    setManualInput('');
  };

  // Parse Answer into Structured Segments (Text vs. Code Blocks vs. Quiz Highlights)
  const parsedSegments = useMemo(() => {
    if (!currentAnswer) return [];

    const segments: Array<{
      type: 'text' | 'code';
      content?: string;
      language?: string;
      code?: string;
    }> = [];
    const codeBlockRegex = /```([a-zA-Z0-9_#+-]*)[^\n\r]*\r?\n([\s\S]*?)(?:```|$)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(currentAnswer)) !== null) {
      if (match.index > lastIndex) {
        const text = currentAnswer.slice(lastIndex, match.index).trim();
        if (text) {
          segments.push({ type: 'text', content: text });
        }
      }

      const lang = match[1] || settings?.preferredLanguage?.toLowerCase() || 'code';
      const code = match[2] || '';
      segments.push({
        type: 'code',
        language: lang,
        code: code,
      });

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < currentAnswer.length) {
      const remainingText = currentAnswer.slice(lastIndex).trim();
      if (remainingText) {
        segments.push({ type: 'text', content: remainingText });
      }
    }

    return segments;
  }, [currentAnswer, settings?.preferredLanguage]);

  const bionicGazeBullets = useMemo(() => {
    return extractGlanceableGazeBullets(currentAnswer || '');
  }, [currentAnswer]);

  const hasCodeBlock = useMemo(() => {
    return parsedSegments.some((s) => s.type === 'code' && s.code && s.code.trim().length > 0);
  }, [parsedSegments]);

  const toggleBionicHud = () => {
    const element = conversationScrollRef.current;
    if (element) conversationScrollTopRef.current = element.scrollTop;
    setIsBionicGazeMode((value) => !value);
  };

  return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          minHeight: 0,
          overflow: 'hidden',
          color: '#f8fafc',
          background: 'rgba(5, 7, 11, 0.82)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <header
          className="teleprompter-draggable"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '10px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.09)',
            background: 'rgba(9,12,18,0.78)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <strong style={{ fontSize: 14, whiteSpace: 'nowrap' }}>Live Interview</strong>
            <span
              style={{
                fontSize: 11,
                color: '#8f9bad',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {status === 'generating' || status === 'analyzing'
                ? 'Preparing answer'
                : status === 'transcribing'
                  ? 'Transcribing'
                  : isListening
                    ? 'Listening'
                    : 'Paused'}
            </span>
          </div>
          <div
            className="teleprompter-nodrag"
            style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}
          >
            <button
              type="button"
              onClick={toggleBionicHud}
              title={isBionicGazeMode ? "Switch to standard answer presentation (⌘⇧H)" : "Switch to Bionic HUD answer presentation (⌘⇧H)"}
              style={{
                border: '1px solid rgba(129,140,248,0.55)',
                background: 'rgba(99,102,241,0.16)',
                color: '#c7d2fe',
                borderRadius: 7,
                padding: '6px 10px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {isBionicGazeMode ? <EyeOff size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} /> : <Eye size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />}
              Bionic HUD · {isBionicGazeMode ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={() => setShowShortcuts(true)}
              title="Keyboard shortcuts"
              style={{
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
                color: '#cbd5e1',
                borderRadius: 7,
                padding: '6px 9px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              <Keyboard size={13} />
            </button>
            <button
              type="button"
              onClick={handleExit}
              title="Quit"
              style={{
                border: '1px solid rgba(248,113,113,0.35)',
                background: 'rgba(127,29,29,0.22)',
                color: '#fecaca',
                borderRadius: 7,
                padding: '6px 9px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              <Power size={13} />
            </button>
          </div>
        </header>
        <div
          ref={conversationScrollRef}
          onScroll={(event) => {
            const element = event.currentTarget;
            conversationScrollTopRef.current = element.scrollTop;
            shouldAutoScrollConversationRef.current = isConversationNearBottom(
              element.scrollHeight,
              element.scrollTop,
              element.clientHeight
            );
          }}
          role="log"
          aria-live="polite"
          aria-label="Interview conversation"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '22px clamp(14px, 5vw, 56px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            overscrollBehavior: 'contain',
          }}
        >
          {questionHistory.map((item, index) => (
            <React.Fragment key={item.timestamp || index}>
              <div
                data-conversation-id={
                  'history-' + String(item.timestamp || 'untimestamped') + '-' + String(index)
                }
                style={{ display: 'flex', justifyContent: 'flex-end' }}
              >
                <div
                  style={{
                    maxWidth: '88%',
                    background: 'rgba(39,50,67,0.82)',
                    border: '1px solid rgba(148,163,184,0.14)',
                    borderRadius: '16px 16px 4px 16px',
                    padding: '11px 14px',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.55,
                    fontSize: 14,
                  }}
                >
                  {item.question}
                </div>
              </div>
              {item.answer &&
                (isBionicGazeMode ? (
                  (() => {
                    const presentation = getBionicAnswerPresentation(item.answer);
                    return presentation.bullets.length > 0 ? (
                      <BionicGazeHUD bullets={presentation.bullets} sourceText={item.answer} />
                    ) : (
                      <div style={{ alignSelf: 'flex-start', maxWidth: '96%', color: '#e5eaf2', whiteSpace: 'pre-wrap', lineHeight: 1.72, fontSize: 14 }}>
                        {presentation.fallbackText}
                      </div>
                    );
                  })()
                ) : (
                  <div style={{ alignSelf: 'flex-start', maxWidth: '96%', color: '#e5eaf2', whiteSpace: 'pre-wrap', lineHeight: 1.72, fontSize: 14 }}>
                    {item.answer}
                  </div>
                ))}
            </React.Fragment>
          ))}
          {currentQuestion && (
            <div
              data-conversation-id="current-conversation"
              style={{ display: 'flex', justifyContent: 'flex-end' }}
            >
              <div
                style={{
                  maxWidth: '88%',
                  background: 'rgba(39,50,67,0.82)',
                  border: '1px solid rgba(148,163,184,0.14)',
                  borderRadius: '16px 16px 4px 16px',
                  padding: '11px 14px',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.55,
                  fontSize: 14,
                }}
              >
                {currentQuestion}
              </div>
            </div>
          )}
          {(currentAnswer || draftAnswer || isGenerating) && (
            <div
              style={{
                alignSelf: 'flex-start',
                width: '100%',
                maxWidth: 900,
                color: '#e5eaf2',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.72,
                fontSize: 14,
              }}
            >
              {isBionicGazeMode && (currentAnswer || draftAnswer) ? (() => {
                const answerText = currentAnswer || draftAnswer;
                const presentation = getBionicAnswerPresentation(answerText);
                return presentation.bullets.length > 0 ? (
                  <BionicGazeHUD bullets={presentation.bullets} sourceText={answerText} />
                ) : (
                  presentation.fallbackText
                );
              })() : currentAnswer || draftAnswer || 'Preparing an answer…'}
              {blockedReason && (
                <div role="alert" style={{ color: '#fca5a5', fontSize: 12, marginTop: 10 }}>
                  {blockedReason}
                </div>
              )}
              {(answerValidationStatus === 'BLOCKED' || answerValidationStatus === 'FAILED') && (
                <div style={{ color: '#fbbf24', fontSize: 11, marginTop: 8 }}>
                  Answer is not approved for speaking. Review before using it.
                </div>
              )}
              {currentAnswer && (
                <button
                  type="button"
                  onClick={copyAnswer}
                  style={{
                    display: 'block',
                    marginTop: 9,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'transparent',
                    color: '#cbd5e1',
                    borderRadius: 6,
                    padding: '5px 9px',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  <Copy size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} />
                  Copy answer
                </button>
              )}
            </div>
          )}
          {draftAnswer && (
            <div style={{ marginBottom: 8, color: '#fbbf24', fontSize: 11, fontWeight: 600 }}>
              🛡️ Live Generation Draft — Grounding validation in progress
            </div>
          )}
          {answerValidationStatus === 'BLOCKED' && (
            <div
              role="alert"
              style={{ marginBottom: 10, color: '#fca5a5', fontSize: 12, lineHeight: 1.5 }}
            >
              <div style={{ fontWeight: 700 }}>
                Candidate Recital Blocked (Factual Grounding Safety Gate)
              </div>
              {technicalGuidance && (
                <div style={{ marginTop: 8, color: '#cbd5e1' }}>
                  <div style={{ color: '#93c5fd', fontWeight: 600 }}>
                    Impersonal Technical Guidance
                  </div>
                  {technicalGuidance}
                </div>
              )}
            </div>
          )}
          {isAnswerValidated && answerValidationStatus === 'VALIDATED' && (
            <div style={{ marginBottom: 8, color: '#6ee7b7', fontSize: 11 }}>
              🛡️ Factual Grounding: Verified
            </div>
          )}
          {answerValidationStatus === 'FLAGGED_BUT_QUALIFIED' && (
            <div style={{ marginBottom: 8, color: '#fbbf24', fontSize: 11 }}>
              ⚠️ Grounding: Qualified
            </div>
          )}
          {!questionHistory.length &&
            !currentQuestion &&
            !currentAnswer &&
            !draftAnswer && (
              <div style={{ margin: 'auto', textAlign: 'center', color: '#7f8b9d', fontSize: 13 }}>
                Your interview conversation will appear here.
              </div>
            )}
        </div>
        <footer
          className="teleprompter-nodrag"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.09)',
            background: 'rgba(8,11,16,0.88)',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
          }}
        >
          <form onSubmit={handleFormSubmit} style={{ display: 'flex', gap: 8, width: '100%' }}>
            <input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Type or paste an interview question…"
              aria-label="Enter interview question"
              style={{
                flex: 1,
                minWidth: 0,
                background: 'rgba(255,255,255,0.055)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                padding: '10px 12px',
                color: '#f8fafc',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!manualInput.trim()}
              style={{
                border: 0,
                borderRadius: 8,
                padding: '0 15px',
                color: '#fff',
                background: manualInput.trim() ? '#4f46e5' : '#303746',
                cursor: manualInput.trim() ? 'pointer' : 'not-allowed',
                fontSize: 12,
              }}
            >
              Send
            </button>
          </form>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={toggleRecording}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 0,
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: '#fff',
                  background: isListening ? '#7f1d1d' : '#4f46e5',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {isListening ? <MicOff size={14} /> : <Mic size={14} />}{' '}
                {isListening ? 'Pause listening' : 'Start listening'}
              </button>
              <span style={{ color: '#8d9bad', fontSize: 11 }}>
                {isGenerating
                  ? 'Generating…'
                  : status === 'transcribing'
                    ? 'Transcribing…'
                    : isListening
                      ? 'Microphone ready'
                      : 'Mic paused'}
              </span>
            </div>
            {currentAnswer && (
              <button
                type="button"
                onClick={clearAndResetToListen}
                style={{
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 7,
                  padding: '7px 10px',
                  background: 'transparent',
                  color: '#cbd5e1',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                New question
              </button>
            )}
          </div>
        </footer>
        {showConversationSearch && (
          <ConversationSearchOverlay
            query={conversationSearchQuery}
            onQueryChange={setConversationSearchQuery}
            results={conversationSearchResults}
            onClose={() => setShowConversationSearch(false)}
            onSelect={jumpToConversationResult}
          />
        )}
        {showShortcuts && (
          <div
            onClick={() => setShowShortcuts(false)}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 90,
              background: 'rgba(0,0,0,0.72)',
              display: 'grid',
              placeItems: 'center',
              padding: 20,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(100%, 420px)',
                padding: 18,
                borderRadius: 12,
                background: '#101722',
                border: '1px solid #354155',
                color: '#e5eaf2',
              }}
            >
              <strong>Keyboard shortcuts</strong>
              <p style={{ fontSize: 11, lineHeight: 1.6, color: '#8290a3', marginBottom: 8 }}>
                Select a shortcut and press a new key combination. Changes are saved to your app
                settings.
              </p>
              <ShortcutSettings bindings={shortcutBindings} onChange={handleShortcutChange} />
              <button
                type="button"
                onClick={() => setShowShortcuts(false)}
                style={{
                  marginTop: 8,
                  border: 0,
                  borderRadius: 7,
                  padding: '7px 12px',
                  background: '#3730a3',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    );
}
