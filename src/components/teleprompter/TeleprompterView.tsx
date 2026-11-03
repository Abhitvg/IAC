import { copyToClipboard } from '../../utils/clipboard';
import { detectLanguageHint } from '../../services/screenSolver';
import { readAndParseFile } from '../../services/resume';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useAppStore, TeleprompterFontSize } from '../../store/useAppStore';
import { InterviewEngine } from '../../services/InterviewEngine';
import { ApplicationAssistanceView } from './ApplicationAssistanceView';
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
  EyeOff,
  Keyboard,
  SlidersHorizontal,
  X,
  Power,
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

/* ═══ Layer 4.8: Factual Grounding Badge ═══ */
function GroundingBadge({
  validationStatus,
  isValidated,
  score,
  violationsCount,
  isGenerating,
}: {
  validationStatus?: 'PENDING' | 'VALIDATED' | 'FLAGGED' | 'FLAGGED_BUT_QUALIFIED' | 'BLOCKED' | 'FAILED' | 'ABORTED';
  isValidated: boolean;
  score: number | null;
  violationsCount: number;
  isGenerating: boolean;
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

function extractCodeBlocksFromAnswer(answer: string | null | undefined, defaultLang: string = 'Java') {
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
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showControlsPopover, setShowControlsPopover] = useState(false);
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

      setToast('🧩 Stitched 2-page question! Regenerating 100% verified solution with full constraints...');
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
        (b) =>
          b.code.split('\n').length <= 15 ||
          /⚡|TYPEABLE|Shortest/i.test(b.code)
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
      // Instant Stealth Hide / Panic Shortcut: Escape or Cmd+Shift+H or Cmd+\ or Cmd+Shift+Space
      if (
        e.key === 'Escape' ||
        ((e.metaKey || e.ctrlKey) &&
          e.shiftKey &&
          (e.code === 'KeyH' || e.key.toLowerCase() === 'h')) ||
        ((e.metaKey || e.ctrlKey) && (e.code === 'Backslash' || e.key === '\\')) ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'Space')
      ) {
        const activeTag = document.activeElement?.tagName;
        if (e.key === 'Escape' && (activeTag === 'INPUT' || activeTag === 'TEXTAREA')) {
          (document.activeElement as HTMLElement)?.blur();
          return;
        }
        e.preventDefault();
        window.electronAPI?.toggleVisibility?.();
        return;
      }

      // Undo / Restore Previous Question (Cmd+Z or Cmd+[)
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        (e.code === 'KeyZ' || e.key.toLowerCase() === 'z' || e.code === 'BracketLeft' || e.key === '[')
      ) {
        e.preventDefault();
        restorePreviousQuestion();
        return;
      }

      // Redo to Next Question (Cmd+Shift+Z or Cmd+Y or Cmd+])
      if (
        ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.code === 'KeyZ' || e.key.toLowerCase() === 'z')) ||
        ((e.metaKey || e.ctrlKey) && (e.code === 'KeyY' || e.key.toLowerCase() === 'y' || e.code === 'BracketRight' || e.key === ']'))
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

      // Clear / Next Question Shortcut: Cmd+K or Cmd+Backspace
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'k' || e.key === 'Backspace')) {
        e.preventDefault();
        clearAndResetToListen();
        return;
      }

      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        (e.code === 'KeyS' || e.key.toLowerCase() === 's')
      ) {
        e.preventDefault();
        handleScreenCapture('fullscreen');
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

      // Quick Copy Code shortcut: Cmd+K
      if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyK' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        handleCopyPrimaryCode();
        return;
      }

      // Auto-scroll toggle: Cmd+J
      if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyJ' || e.key.toLowerCase() === 'j')) {
        e.preventDefault();
        setIsAutoScrolling(!isAutoScrolling);
        setToast(!isAutoScrolling ? '📜 Auto-Scroll: Resumed' : '⏸️ Auto-Scroll: Paused');
        return;
      }

      if (e.code === 'Space' && currentAnswer) {
        const activeTag = document.activeElement?.tagName;
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
          e.preventDefault();
          doneAnswering();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentAnswer, doneAnswering, restorePreviousQuestion, redoQuestion, markQuestionIncomplete]);

  
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

  const hasCodeBlock = useMemo(() => {
    return parsedSegments.some((s) => s.type === 'code' && s.code && s.code.trim().length > 0);
  }, [parsedSegments]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsWindowDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsWindowDragging(false);
        }
      }}
      onDrop={handleWindowDrop}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: `rgba(8, 10, 20, ${windowOpacity})`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        color: '#f8fafc',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '8px',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* Drag & Drop Overlay */}
      {isWindowDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 100,
            background: 'rgba(15, 15, 30, 0.94)',
            border: '2px dashed #818cf8',
            borderRadius: '10px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            color: '#f8fafc',
            pointerEvents: 'none',
          }}
        >
          <FileUp size={44} style={{ color: '#818cf8' }} />
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#e0e7ff' }}>
            Drop File to Load Resume, Job Description, or Question Image
          </div>
          <div style={{ fontSize: '12px', color: '#a5b4fc' }}>
            Supports PDF, Word DOCX, Text, and Screenshots (.png, .jpg, .webp, .pdf, .docx)
          </div>
        </div>
      )}

      {/* ════════════ TOP TELEPROMPTER CONTROL BAR ════════════ */}
      {!isRibbonMode && (
        <>
      <div
        className="teleprompter-draggable"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          background: `rgba(16, 18, 30, ${Math.min(0.72, windowOpacity * 0.75 + 0.15)})`,
          borderBottom: "1px solid rgba(255, 255, 255, 0.10)",
          gap: "8px",
          flexWrap: "nowrap",
          position: "relative",
        }}
      >
        {/* Left: Mode Selector Pills & Language */}
        <div
          className="teleprompter-nodrag"
          style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "rgba(0, 0, 0, 0.5)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "6px",
              padding: "2px",
              gap: "2px",
            }}
          >
            {[
              {
                id: "coding",
                label: "💻 Coding",
                title:
                  "Coding Mode: 100% verified compilable code, syntax card, Big-O & 1-click copy",
              },
              {
                id: "interview",
                label: "🎙️ Interview",
                title: "Interview Mode: Spoken STAR answers, eye-contact teleprompter flow",
              },
              {
                id: "quiz",
                label: "📝 Quiz",
                title: "Quiz / MCQ Mode: High-contrast correct answer banner + 1-sentence proof",
              },
            ].map((m) => {
              const active = responseMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setResponseMode(m.id as any);
                    setToast(`Mode switched to: ${m.label}`);
                  }}
                  title={m.title}
                  style={{
                    background: active
                      ? m.id === "coding"
                        ? "linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(79, 70, 229, 0.95))"
                        : m.id === "quiz"
                          ? "linear-gradient(135deg, rgba(16, 185, 129, 0.9), rgba(5, 150, 105, 0.95))"
                          : "linear-gradient(135deg, rgba(168, 85, 247, 0.9), rgba(147, 51, 234, 0.95))"
                      : "transparent",
                    color: active ? "#ffffff" : "#94a3b8",
                    border: active ? "1px solid rgba(255, 255, 255, 0.3)" : "1px solid transparent",
                    borderRadius: "4px",
                    padding: isUltraCompact ? "3px 6px" : "3px 8px",
                    fontSize: "11px",
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.15s ease",
                    boxShadow: active ? "0 2px 6px rgba(0, 0, 0, 0.4)" : "none",
                  }}
                >
                  {isUltraCompact ? m.label.split(" ")[0] : m.label}
                </button>
              );
            })}
          </div>

          {/* If in Coding Mode: Show Language Selector Dropdown */}
          {responseMode === "coding" && (
            <select
              value={settings?.preferredLanguage || "Java"}
              onChange={(e) => {
                updateSetting("preferredLanguage", e.target.value);
                setToast(`💻 Coding Language: ${e.target.value}`);
              }}
              title="Preferred programming language for coding challenge solutions"
              style={{
                background: "rgba(99, 102, 241, 0.25)",
                color: "#e0e7ff",
                border: "1px solid rgba(129, 140, 248, 0.45)",
                borderRadius: "4px",
                padding: "3px 6px",
                fontSize: "11px",
                fontWeight: 650,
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="Java" style={{ background: "#0f172a", color: "#fff" }}>☕ Java</option>
              <option value="Python" style={{ background: "#0f172a", color: "#fff" }}>🐍 Python</option>
              <option value="TypeScript" style={{ background: "#0f172a", color: "#fff" }}>🔷 TypeScript</option>
              <option value="JavaScript" style={{ background: "#0f172a", color: "#fff" }}>⚡ JavaScript</option>
              <option value="C++" style={{ background: "#0f172a", color: "#fff" }}>⚙️ C++</option>
              <option value="Go" style={{ background: "#0f172a", color: "#fff" }}>🐹 Go</option>
              <option value="SQL" style={{ background: "#0f172a", color: "#fff" }}>🗄️ SQL</option>
            </select>
          )}
        </div>

        {/* Center: Essential Session Controls */}
        <div
          className="teleprompter-nodrag"
          style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}
        >
          {/* Scroll / Pause */}
          <button
            onClick={() => setIsAutoScrolling(!isAutoScrolling)}
            title={isAutoScrolling ? "Pause auto-scroll" : "Resume auto-scroll"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: isAutoScrolling ? "#1e1b4b" : "rgba(255, 255, 255, 0.08)",
              color: isAutoScrolling ? "#a5b4fc" : "#e2e8f0",
              border: isAutoScrolling ? "1px solid #6366f1" : "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {isAutoScrolling ? <Pause size={11} /> : <Play size={11} />}
            <span>{isAutoScrolling ? "Pause" : "Scroll"}</span>
          </button>

          {/* Session Timer Badge */}
          <div
            onClick={() => setTimerRunning(!timerRunning)}
            title="Click to pause/resume session timer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "#1e1b4b",
              border: "1px solid #4338ca",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: 700,
              color: "#a5b4fc",
              letterSpacing: "0.5px",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <span>⏱️</span>
            <span>{formatTimer(seconds)}</span>
          </div>

          {/* Undo Disruption / Back Button */}
          {questionHistory && questionHistory.length > 0 && (
            <button
              onClick={restorePreviousQuestion}
              title={`Back: Restore previous question & answer (Shortcut: ⌘Z) [${questionHistory.length} in stack]`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                background: "rgba(99, 102, 241, 0.24)",
                color: "#c7d2fe",
                border: "1px solid rgba(129, 140, 248, 0.45)",
                borderRadius: "4px",
                padding: isUltraCompact ? "3px 5px" : "4px 7px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
            >
              <Undo2 size={11} />
              <span>Back ({questionHistory.length})</span>
            </button>
          )}

          {/* Quick Clear Button */}
          {currentAnswer && (
            <button
              onClick={clearAndResetToListen}
              title="Clear answer and listen for new question (Shortcut: ⌘K)"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                background: "rgba(239, 68, 68, 0.18)",
                border: "1px solid rgba(248, 113, 113, 0.4)",
                color: "#fca5a5",
                borderRadius: "4px",
                padding: "3px 7px",
                fontSize: "11px",
                fontWeight: 650,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
            >
              <span>✨ Clear (⌘K)</span>
            </button>
          )}

          {/* Word Count & Read Time Badge */}
          {currentAnswer && !isCompact && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "4px",
                padding: "4px 7px",
                fontSize: "11px",
                color: "#cbd5e1",
                whiteSpace: "nowrap",
              }}
              title="Target: ~380-430 words for a standard 3-minute spoken response"
            >
              <span>📊</span>
              <span>
                {wordCount}w (~{estMinutes}m)
              </span>
            </div>
          )}
        </div>

        {/* Right: Stealth, Progressive Controls Popover, Exit */}
        <div
          className="teleprompter-nodrag"
          style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}
        >
          {/* Stealth Toggle */}
          <button
            onClick={handleToggleStealth}
            title={
              isLinux
                ? "Linux Stealth: Share your IDE/Browser window in Zoom/Meet (IAC is a separate window and will remain 100% invisible). Press Esc or Ctrl+Shift+H to panic-hide."
                : isStealthActive
                ? "Screen Stealth ON: Teleprompter is 100% invisible to Zoom, Google Meet, Teams, Discord & recordings"
                : "Screen Stealth OFF: Teleprompter is visible to screen share"
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: isLinux
                ? "rgba(59, 130, 246, 0.16)"
                : isStealthActive
                ? "rgba(16, 185, 129, 0.16)"
                : "rgba(239, 68, 68, 0.16)",
              border: isLinux
                ? "1px solid rgba(59, 130, 246, 0.4)"
                : isStealthActive
                ? "1px solid rgba(52, 211, 153, 0.4)"
                : "1px solid rgba(239, 68, 68, 0.4)",
              color: isLinux ? "#93c5fd" : isStealthActive ? "#6ee7b7" : "#fca5a5",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
            }}
          >
            <Shield size={12} style={{ color: isLinux ? "#60a5fa" : isStealthActive ? "#34d399" : "#f87171" }} />
            {!isUltraCompact && (
              <span>{isLinux ? "Linux Stealth: Window Share" : isStealthActive ? "Stealth ON" : "Stealth OFF"}</span>
            )}
          </button>

          {/* Progressive Disclosure: Controls & Display Popover Trigger */}
          <button
            onClick={() => setShowControlsPopover(!showControlsPopover)}
            title="Display, Font Size, Opacity & Session Settings"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: showControlsPopover
                ? "rgba(99, 102, 241, 0.35)"
                : "rgba(255, 255, 255, 0.08)",
              color: showControlsPopover ? "#ffffff" : "#cbd5e1",
              border: showControlsPopover
                ? "1px solid rgba(129, 140, 248, 0.6)"
                : "1px solid rgba(255, 255, 255, 0.14)",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
            }}
          >
            <SlidersHorizontal size={12} />
            <span>Controls</span>
          </button>

          {/* Quit Button */}
          <button
            type="button"
            onClick={handleExit}
            title="Quit Application (⌘Q)"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "#e11d48",
              color: "#ffffff",
              border: "none",
              borderRadius: "4px",
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: 650,
              cursor: "pointer",
              transition: "background 0.15s ease",
            }}
          >
            <Power size={11} />
            <span>Quit</span>
          </button>
        </div>
      </div>

      {/* ════════════ PROGRESSIVE CONTROLS FLOATING POPOVER ════════════ */}
      {showControlsPopover && (
        <div
          className="teleprompter-nodrag glass-popover-panel"
          style={{
            position: "absolute",
            top: "44px",
            right: "12px",
            zIndex: 100,
            width: "320px",
            borderRadius: "12px",
            padding: "14px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            color: "#e2e8f0",
            fontSize: "11px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.12)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: "12px", color: "#f8fafc", display: "flex", alignItems: "center", gap: "6px" }}>
              <SlidersHorizontal size={13} style={{ color: "#818cf8" }} />
              Display &amp; Session Controls
            </span>
            <button
              onClick={() => setShowControlsPopover(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                padding: "2px",
              }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Font Size Selector */}
          <div>
            <div style={{ color: "#94a3b8", marginBottom: "5px", fontWeight: 600, fontSize: "10px", textTransform: "uppercase" }}>
              Teleprompter Font Size
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" }}>
              {(["small", "medium", "large", "xlarge"] as TeleprompterFontSize[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setTeleprompterFontSize(f)}
                  style={{
                    background: teleprompterFontSize === f ? "#3730a3" : "rgba(255, 255, 255, 0.06)",
                    color: teleprompterFontSize === f ? "#ffffff" : "#94a3b8",
                    border: teleprompterFontSize === f ? "1px solid #6366f1" : "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "4px",
                    padding: "4px 6px",
                    fontSize: "10px",
                    fontWeight: teleprompterFontSize === f ? 700 : 500,
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.15s ease",
                  }}
                >
                  {fontSizes[f].label}
                </button>
              ))}
            </div>
          </div>

          {/* Opacity Selector */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#94a3b8", marginBottom: "5px", fontWeight: 600, fontSize: "10px", textTransform: "uppercase" }}>
              <span>Window Transparency</span>
              <span style={{ color: "#818cf8", fontWeight: 700 }}>{Math.round(windowOpacity * 100)}%</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                onClick={() => setWindowOpacity(Math.max(0.15, Math.round((windowOpacity - 0.1) * 100) / 100))}
                title="More transparent"
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  color: "#e2e8f0",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "4px",
                  padding: "2px 8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                -
              </button>
              <input
                type="range"
                min="0.15"
                max="0.98"
                step="0.05"
                value={windowOpacity}
                onChange={(e) => setWindowOpacity(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: "#6366f1", cursor: "pointer" }}
              />
              <button
                onClick={() => setWindowOpacity(Math.min(0.98, Math.round((windowOpacity + 0.1) * 100) / 100))}
                title="Less transparent"
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  color: "#e2e8f0",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "4px",
                  padding: "2px 8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                +
              </button>
            </div>
            <div style={{ display: "flex", gap: "4px", marginTop: "6px" }}>
              {[
                { label: "Clear", val: 0.25 },
                { label: "Frosted", val: 0.5 },
                { label: "Deep", val: 0.75 },
                { label: "Solid", val: 0.98 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setWindowOpacity(preset.val)}
                  style={{
                    flex: 1,
                    background: Math.abs(windowOpacity - preset.val) < 0.1 ? "rgba(99, 102, 241, 0.3)" : "rgba(255, 255, 255, 0.05)",
                    color: Math.abs(windowOpacity - preset.val) < 0.1 ? "#c7d2fe" : "#94a3b8",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "4px",
                    padding: "2px 4px",
                    fontSize: "9px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-Scroll Speed & Restart */}
          <div>
            <div style={{ color: "#94a3b8", marginBottom: "5px", fontWeight: 600, fontSize: "10px", textTransform: "uppercase" }}>
              Auto-Scroll Speed &amp; Top Reset
            </div>
            <div style={{ display: "flex", gap: "4px" }}>
              {[0.7, 1.0, 1.5, 2.0].map((s) => (
                <button
                  key={s}
                  onClick={() => setScrollSpeed(s)}
                  style={{
                    flex: 1,
                    background: scrollSpeed === s ? "#3730a3" : "rgba(255, 255, 255, 0.06)",
                    color: scrollSpeed === s ? "#ffffff" : "#94a3b8",
                    border: scrollSpeed === s ? "1px solid #6366f1" : "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "4px",
                    padding: "4px 6px",
                    fontSize: "10px",
                    fontWeight: scrollSpeed === s ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {s}x
                </button>
              ))}
              <button
                onClick={handleRestartScrolling}
                title="Restart scrolling from the top"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "2px",
                  background: "rgba(255, 255, 255, 0.06)",
                  color: "#e2e8f0",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "4px",
                  padding: "4px 6px",
                  fontSize: "10px",
                  cursor: "pointer",
                }}
              >
                <RotateCcw size={10} /> Top
              </button>
            </div>
          </div>

          {/* Speech Pause Tolerance */}
          <div>
            <div style={{ color: "#94a3b8", marginBottom: "5px", fontWeight: 600, fontSize: "10px", textTransform: "uppercase" }}>
              Interviewer Pause Tolerance
            </div>
            <select
              value={speechPauseTolerance || 1000}
              onChange={(e) => setSpeechPauseTolerance(Number(e.target.value))}
              style={{
                width: "100%",
                background: "rgba(255, 255, 255, 0.06)",
                color: "#e2e8f0",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "4px",
                padding: "4px 8px",
                fontSize: "10px",
                fontWeight: 600,
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value={700} style={{ background: "#0f172a", color: "#fff" }}>⚡ 0.7s Fast (Rapid fire)</option>
              <option value={1000} style={{ background: "#0f172a", color: "#fff" }}>⏱️ 1.0s Normal (Balanced)</option>
              <option value={1500} style={{ background: "#0f172a", color: "#fff" }}>🧘 1.5s Patient (Allows thinking pauses)</option>
              <option value={2000} style={{ background: "#0f172a", color: "#fff" }}>⏳ 2.0s Long (Deliberate)</option>
            </select>
          </div>

          {/* Actions: Target Role, Shortcuts, Instant Hide */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingTop: "4px", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <button
              onClick={() => {
                setResumeModalOpen(true);
                setShowControlsPopover(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "5px 8px",
                background: "rgba(168, 85, 247, 0.15)",
                border: "1px solid rgba(168, 85, 247, 0.3)",
                borderRadius: "4px",
                color: "#e9d5ff",
                cursor: "pointer",
                fontSize: "10px",
                fontWeight: 600,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <Target size={11} style={{ color: "#c084fc" }} />
                Target Role &amp; Resume Context
              </span>
              <span>{targetRole ? (targetRole.length > 12 ? targetRole.slice(0, 12) + "..." : targetRole) : "Not Set"} &rarr;</span>
            </button>

            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => {
                  setShowShortcuts(!showShortcuts);
                  setShowControlsPopover(false);
                }}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                  padding: "5px 8px",
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "4px",
                  color: "#cbd5e1",
                  cursor: "pointer",
                  fontSize: "10px",
                  fontWeight: 600,
                }}
              >
                <Keyboard size={11} />
                Shortcuts
              </button>

              <button
                onClick={() => window.electronAPI?.toggleVisibility?.()}
                title="Instant Stealth Toggle — Shortcut: Cmd+Shift+H"
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                  padding: "5px 8px",
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "4px",
                  color: "#cbd5e1",
                  cursor: "pointer",
                  fontSize: "10px",
                  fontWeight: 600,
                }}
              >
                <EyeOff size={11} />
                Hide (⌘⇧H)
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {/* ════════════ MIDDLE TELEPROMPTER BODY ════════════ */}
      <div
        ref={scrollRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: isRibbonMode ? '6px 12px' : isUltraCompact ? '12px 14px' : '20px 28px',
          scrollBehavior: 'smooth',
          userSelect: 'text',
        }}
      >
                {/* Minimal Distraction-Free Interview HUD Pill */}
        {isRibbonMode && (
          <div
            className="teleprompter-draggable flex items-center justify-between px-3 py-1.5 mb-2 floating-hud-pill mx-auto w-full select-none"
            style={{ cursor: 'grab' }}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleRecording}
                className="card-interactive px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition"
                style={{
                  background: isRecording ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                  color: isRecording ? '#f87171' : '#cbd5e1',
                  border: isRecording ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255, 255, 255, 0.12)',
                }}
                title="Toggle Microphone (Shortcut: R)"
              >
                <span className={'w-2 h-2 rounded-full ' + (isRecording ? 'bg-rose-500 animate-ping' : 'bg-slate-400')} />
                <span>{isRecording ? 'Listening' : 'Mic Off (R)'}</span>
              </button>
              <span className="text-[11px] font-mono text-slate-300 font-semibold px-2 py-0.5 rounded bg-white/10 flex items-center gap-1">
                ⏱️ {formatTimer(seconds)}
                {wordCount > 0 && <span className="opacity-60 ml-0.5 font-normal">· {wordCount}w</span>}
              </span>
            </div>

            <div className="hidden md:flex items-center gap-1 text-[10px] text-slate-400 font-medium opacity-60">
              <span>⋮⋮ Drag</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleScreenCapture('fullscreen')}
                disabled={isScreenReading}
                className="card-interactive px-2 py-1 rounded-lg text-[11px] font-bold bg-emerald-600/80 hover:bg-emerald-500 text-white border border-emerald-400/40 flex items-center gap-1 shadow-sm"
                title="Capture & Solve Interviewer's Screen (⌘⇧S)"
              >
                {isScreenReading ? <Loader2 size={11} className="spin" /> : <Camera size={11} />}
                <span className="hidden sm:inline">Snip (⌘⇧S)</span>
              </button>

              <button
                type="button"
                onClick={() => handleAppendScreenCapture('fullscreen')}
                disabled={isScreenReading}
                className="card-interactive px-2 py-1 rounded-lg text-[11px] font-bold bg-cyan-600/80 hover:bg-cyan-500 text-white border border-cyan-400/40 flex items-center gap-1 shadow-sm"
                title="Scroll down & append lower section/constraints (⌘⇧A)"
              >
                {isScreenReading ? <Loader2 size={11} className="spin" /> : <FilePlus size={11} />}
                <span className="hidden sm:inline">+ Page (⌘⇧A)</span>
              </button>

              <button
                type="button"
                onClick={() => handleTriggerAutoTypeText()}
                className="card-interactive px-2 py-1 rounded-lg text-[11px] font-bold bg-purple-600/80 hover:bg-purple-500 text-white border border-purple-400/40 flex items-center gap-1 shadow-sm"
                title="Auto-type verbal explanation / chat response into interviewer's chat box (⌥T)"
              >
                <MessageSquare size={11} />
                <span className="hidden sm:inline">Type Chat (⌥T)</span>
              </button>

              <button
                type="button"
                onClick={copyAnswer}
                className="card-interactive px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10 flex items-center gap-1"
                title="Copy Answer to Clipboard (Shortcut: C)"
              >
                <Copy size={11} />
                <span className="hidden sm:inline">Copy (C)</span>
              </button>

              <button
                type="button"
                onClick={clearAndResetToListen}
                className="card-interactive px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-600/90 hover:bg-indigo-500 text-white border border-indigo-400/30 flex items-center gap-1 shadow-sm"
                title="Next Question / Clear Answer (Shortcut: Space or ⌘K)"
              >
                <Sparkles size={11} />
                <span>Next (Space)</span>
              </button>

              <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    const sizes: TeleprompterFontSize[] = ['small', 'medium', 'large', 'xlarge'];
                    const idx = sizes.indexOf(teleprompterFontSize);
                    if (idx > 0) setTeleprompterFontSize(sizes[idx - 1]);
                  }}
                  className="px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-white"
                  title="Decrease Font Size"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sizes: TeleprompterFontSize[] = ['small', 'medium', 'large', 'xlarge'];
                    const idx = sizes.indexOf(teleprompterFontSize);
                    if (idx < sizes.length - 1) setTeleprompterFontSize(sizes[idx + 1]);
                  }}
                  className="px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-white"
                  title="Increase Font Size"
                >
                  A+
                </button>
              </div>

              <button
                type="button"
                onClick={handleToggleCompactWindow}
                className="card-interactive px-2 py-1 rounded-lg text-[10px] font-bold bg-white/10 hover:bg-white/15 text-slate-300 border border-white/10 flex items-center gap-1"
                title={isCompactHeight ? "Restore full studio window (1024x720)" : "Switch to compact ribbon (680x240)"}
              >
                <SlidersHorizontal size={11} />
                <span className="hidden sm:inline">{isCompactHeight ? 'Expand' : 'Ribbon'}</span>
              </button>

              <button
                type="button"
                onClick={toggleInterviewFocusMode}
                className="card-interactive px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1"
                title={isInterviewFocusMode ? "Exit Focus Mode (Show full studio controls)" : "Enter Focus Mode (Hide clutter)"}
              >
                <span>{isInterviewFocusMode ? '👁️ Full' : '🎯 Focus'}</span>
              </button>

              <button
                type="button"
                onClick={() => window.electronAPI?.toggleVisibility?.()}
                className="card-interactive p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                title="Instant Stealth Vanish (Esc or ⌘\)"
              >
                <EyeOff size={11} />
              </button>

              <button
                type="button"
                onClick={handleExit}
                className="card-interactive px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 border border-rose-500/40 flex items-center gap-1 transition"
                title="Quit Application (⌘Q)"
              >
                <Power size={11} />
                <span className="hidden sm:inline">Quit</span>
              </button>
            </div>
          </div>
        )}
        {/* Active Detected Question Header & Done Answering Button */}
        {!isRibbonMode && currentQuestion && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '6px',
              flexWrap: 'wrap',
            }}
          >
            <ConfidenceBadge confidence={answerConfidence} />
            <GroundingBadge
              validationStatus={answerValidationStatus}
              isValidated={isAnswerValidated}
              score={groundingScore}
              violationsCount={(groundingViolations || []).length}
              isGenerating={status === 'generating'}
            />
            <MemoryIndicator historyCount={(conversationHistory || []).length} />
          </div>
        )}
        {isAnswerValidated && (groundingViolations || []).length > 0 && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '6px',
              padding: '6px 10px',
              marginBottom: '8px',
              fontSize: '11px',
              color: '#fca5a5',
            }}
          >
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
              <span>⚠️ Factual Guardrail Notice:</span>
              <span>{(groundingViolations || []).length} unsupported claim(s) flagged & qualified</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '14px', lineHeight: '1.35' }}>
              {(groundingViolations || []).map((v, idx) => (
                <li key={idx}>{v}</li>
              ))}
            </ul>
          </div>
        )}
        {currentQuestion && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              background: 'rgba(99, 102, 241, 0.22)',
              border: '1px solid rgba(129, 140, 248, 0.4)',
              borderRadius: '6px',
              padding: isUltraCompact ? '6px 8px' : '6px 12px',
              marginBottom: '10px',
              color: '#e0e7ff',
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '0.2px',
              flexWrap: isUltraCompact ? 'wrap' : 'nowrap',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flex: isUltraCompact ? '1 1 100%' : 1,
                minWidth: 0,
                overflow: 'hidden',
              }}
            >
              <Sparkles size={13} style={{ color: '#818cf8', flexShrink: 0 }} />
              <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: isUltraCompact ? 'normal' : 'nowrap', wordBreak: 'break-word' }}>
                Q: {currentQuestion}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: isUltraCompact ? 'auto' : undefined }}>
              {/* Back / Undo button right on Question Card */}
              <button
                onClick={restorePreviousQuestion}
                disabled={!questionHistory || questionHistory.length === 0}
                title="Disrupted by background speech? Restore previous question & answer (Shortcut: ⌘Z)"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  background:
                    !questionHistory || questionHistory.length === 0
                      ? 'rgba(255, 255, 255, 0.05)'
                      : 'rgba(99, 102, 241, 0.28)',
                  border:
                    !questionHistory || questionHistory.length === 0
                      ? '1px solid rgba(255, 255, 255, 0.1)'
                      : '1px solid rgba(129, 140, 248, 0.5)',
                  color: !questionHistory || questionHistory.length === 0 ? '#64748b' : '#c7d2fe',
                  borderRadius: '4px',
                  padding: '3px 7px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: !questionHistory || questionHistory.length === 0 ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <Undo2 size={11} />
                <span>Back</span>
              </button>

              {/* Still Speaking / Question Not Completed Button */}
              <button
                onClick={markQuestionIncomplete}
                title="Interviewer paused mid-thought? Click to tell AI the question is not completed yet (Shortcut: Alt+C). The next speech will append automatically."
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  background: isIncompleteQuestionMode ? 'rgba(245, 158, 11, 0.38)' : 'rgba(245, 158, 11, 0.2)',
                  border: '1px solid rgba(245, 158, 11, 0.55)',
                  color: '#fde68a',
                  borderRadius: '4px',
                  padding: '3px 7px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <Hourglass size={11} />
                <span>⏳ Still Asking (Append)</span>
              </button>

              {currentAnswer && (
                <button
                  onClick={doneAnswering}
                  title="Mark answer complete and listen for next question (or press Space)"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(34, 197, 94, 0.2)',
                    border: '1px solid rgba(74, 222, 128, 0.5)',
                    color: '#86efac',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  <CheckCircle2 size={12} />
                  <span>Done (Space)</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Incomplete Question Continuation Banner */}
        {isIncompleteQuestionMode && currentQuestion && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              background: 'linear-gradient(135deg, rgba(180, 83, 9, 0.38), rgba(120, 53, 15, 0.48))',
              border: '1.5px solid rgba(245, 158, 11, 0.7)',
              borderRadius: '6px',
              padding: '8px 12px',
              marginBottom: '12px',
              boxShadow: '0 4px 16px rgba(180, 83, 9, 0.35)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fef3c7', fontSize: '12px', fontWeight: 600 }}>
              <Hourglass size={15} style={{ color: '#fbbf24', flexShrink: 0 }} />
              <span>
                <strong>Question Not Completed:</strong> AI is waiting for interviewer to finish. Next spoken words will automatically append to this question.
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <button
                onClick={() => {
                  setIsIncompleteQuestionMode(false);
                  if (currentQuestion) {
                    InterviewEngine.handleEvent({ type: 'QUESTION_DETECTED', text: currentQuestion });
                  }
                }}
                title="Interviewer is done — solve now"
                style={{
                  background: '#f59e0b',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✨ Solve Now
              </button>
              <button
                onClick={() => setIsIncompleteQuestionMode(false)}
                title="Cancel continuation mode"
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fde68a',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Floating Quick Action: Copy Code 1-Click Banner (When Code is Detected) */}
        {hasCodeBlock && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              background:
                'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.2))',
              border: '1px solid rgba(129, 140, 248, 0.45)',
              borderRadius: '6px',
              padding: '6px 12px',
              marginBottom: '12px',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: '#c7d2fe',
                fontWeight: 600,
              }}
            >
              <Terminal size={14} style={{ color: '#818cf8' }} />
              <span>
                💻 Optimal Compilable Code Solution Ready ({settings?.preferredLanguage || 'Java'})
              </span>
            </div>

            <button
              onClick={handleCopyPrimaryCode}
              title="Copy the code solution directly to clipboard (ready for LeetCode / HackerRank / IDE)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: copiedPrimary
                  ? 'rgba(16, 185, 129, 0.35)'
                  : 'linear-gradient(135deg, #4f46e5, #4338ca)',
                color: copiedPrimary ? '#6ee7b7' : '#ffffff',
                border: copiedPrimary ? '1px solid #10b981' : '1px solid #6366f1',
                borderRadius: '5px',
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(79, 70, 229, 0.4)',
                transition: 'all 0.15s ease',
              }}
            >
              {copiedPrimary ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedPrimary ? '✓ Code Copied!' : '📋 Copy Code (1-Click)'}</span>
            </button>
          </div>
        )}

        {/* Dynamic Recital / Interruption Banner */}
        {recitalState === 'reciting' && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(59, 130, 246, 0.18)',
              border: '1px solid rgba(96, 165, 250, 0.4)',
              borderRadius: '6px',
              padding: '6px 12px',
              marginBottom: '14px',
              color: '#93c5fd',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <Volume2 size={13} style={{ color: '#60a5fa' }} />
            <span>
              🗣️ Reciting Answer: Mic is automatically paused for your speech • Auto-listening for
              interruptions
            </span>
          </div>
        )}

        {recitalState === 'interrupted' && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(239, 68, 68, 0.24)',
              border: '1px solid rgba(248, 113, 113, 0.55)',
              borderRadius: '6px',
              padding: '6px 12px',
              marginBottom: '14px',
              color: '#fca5a5',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: '14px' }}>⚡</span>
            <span>
              Interviewer Interruption Detected: "{lastInterruption || currentQuestion}" — Reacting
              live
            </span>
          </div>
        )}

        {/* Teleprompter Answer Content Area */}
        <div
          style={{
            fontSize: fontSizes[teleprompterFontSize].size,
            lineHeight: fontSizes[teleprompterFontSize].line,
            color: '#f8fafc',
            fontWeight: 450,
            letterSpacing: '0.2px',
            textShadow:
              '0 1px 3px rgba(0, 0, 0, 0.98), 0 2px 8px rgba(0, 0, 0, 0.9), 0 0 16px rgba(0, 0, 0, 0.7)',
          }}
        >
          {answerValidationStatus === 'BLOCKED' ? (
            <div
              className="blocked-speaking-card"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: '12px',
                padding: '20px',
                margin: '12px 0',
                color: '#fecaca',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ fontSize: '18px' }}>🚫</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#f87171' }}>
                  Candidate Recital Blocked (Factual Grounding Safety Gate)
                </span>
              </div>
              <p style={{ fontSize: '13px', color: '#fca5a5', lineHeight: '1.5', margin: '0 0 12px 0' }}>
                {blockedReason ||
                  'This generated answer contains unsupported personal claims that could not be validated against your candidate knowledge vault. To protect your interview credibility, raw claims cannot be recited.'}
              </p>

              {technicalGuidance && technicalGuidance.trim().length > 0 && (
                <div
                  className="technical-guidance-card"
                  style={{
                    background: 'rgba(0, 0, 0, 0.45)',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    borderRadius: '8px',
                    padding: '14px',
                    marginTop: '12px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#93c5fd',
                      marginBottom: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>📘 Impersonal Technical Guidance (Reference Only — Do Not Present as Past Personal Experience):</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                    {technicalGuidance}
                  </div>
                </div>
              )}
            </div>
          ) : currentAnswer ? (
            <div>
              {/* Live Answer Steering Actions */}
              {!isRibbonMode && !isGenerating && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    margin: '4px 0 16px 0',
                    flexWrap: 'wrap',
                    padding: '6px 10px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.07)',
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#94a3b8',
                      fontWeight: 650,
                      marginRight: '2px',
                    }}
                  >
                    ✨ Steering:
                  </span>

                  <button
                    onClick={() =>
                      handleSteerAnswer(
                        'Condense this into a punchy 30-40 second executive answer covering core intuition, approach, and Big-O complexity.'
                      )
                    }
                    title="Condense into an ultra-punchy 30-40s answer"
                    style={{
                      background: 'rgba(99, 102, 241, 0.18)',
                      color: '#c7d2fe',
                      border: '1px solid rgba(129, 140, 248, 0.35)',
                      borderRadius: '14px',
                      padding: '3px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>⚡ 30s Summary</span>
                  </button>

                  <button
                    onClick={() =>
                      handleSteerAnswer(
                        'Provide 2-3 sharp, senior-level clarifying questions to ask the interviewer before writing code or designing (e.g. scale, concurrency, duplicate handling, and edge cases).'
                      )
                    }
                    title="Generate sharp clarifying questions to ask the interviewer first"
                    style={{
                      background: 'rgba(234, 179, 8, 0.18)',
                      color: '#fde047',
                      border: '1px solid rgba(250, 204, 21, 0.35)',
                      borderRadius: '14px',
                      padding: '3px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>❓ Clarify First</span>
                  </button>

                  <button
                    onClick={() =>
                      handleSteerAnswer(
                        'Explain the core intuition and pattern in 2 clear conversational sentences without writing code.'
                      )
                    }
                    title="Explain intuition without writing code"
                    style={{
                      background: 'rgba(56, 189, 248, 0.18)',
                      color: '#bae6fd',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      borderRadius: '14px',
                      padding: '3px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>💡 Intuition Only</span>
                  </button>

                  <button
                    onClick={() =>
                      handleSteerAnswer(
                        'Drill down deeply into the system architecture, memory overhead, backpressure limits, and failure recovery using the 3-Beat framework.'
                      )
                    }
                    title="Expand on architectural mechanics and trade-offs"
                    style={{
                      background: 'rgba(168, 85, 247, 0.18)',
                      color: '#e9d5ff',
                      border: '1px solid rgba(192, 132, 252, 0.35)',
                      borderRadius: '14px',
                      padding: '3px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>🏛️ Architecture & Trade-Offs</span>
                  </button>

                  {responseMode === 'coding' && (
                    <button
                      onClick={() =>
                        handleSteerAnswer(
                          'Provide a step-by-step trace/dry-run table of the code with a concrete example input, showing index, pointer, and variable state transitions.'
                        )
                      }
                      title="Show step-by-step variable dry run"
                      style={{
                        background: 'rgba(16, 185, 129, 0.18)',
                        color: '#a7f3d0',
                        border: '1px solid rgba(52, 211, 153, 0.35)',
                        borderRadius: '14px',
                        padding: '3px 10px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>🧪 Variable Dry-Run</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleRegenerateCurrentAnswer()}
                    title="Regenerate alternative answer from scratch"
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: '#cbd5e1',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '14px',
                      padding: '3px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <RotateCcw size={10} />
                    <span>Regenerate</span>
                  </button>
                </div>
              )}

        {(responseMode === 'quiz' || currentAnswer?.includes('CORRECT ANSWER:')) && (
                <QuizAnswerCard
                  answerText={currentAnswer}
                  onCopy={async (text) => {
                    await copyToClipboard(text);
                    setToast('🎯 Correct Option copied to clipboard!');
                  }}
                />
              )}

              {responseMode === 'application' && applicationSession && (
                <div style={{ marginBottom: '16px' }}>
                  <ApplicationAssistanceView session={applicationSession} />
                </div>
              )}

              {parsedSegments.map((segment, idx) => {
                if (segment.type === 'code' && segment.code) {
                  return (
                    <CodeBlockCard
                      key={idx}
                      index={idx}
                      language={segment.language || settings?.preferredLanguage || 'code'}
                      code={segment.code}
                      onCopy={handleCopyCodeBlock}
                      isCopied={!!copiedCodeIndices[idx]}
                    />
                  );
                }

                const text = segment.content || '';
                const isQuizHighlight =
                  text.includes('CORRECT ANSWER:') || text.includes('CORRECT OPTION:');

                if (isQuizHighlight) {
                  return (
                    <div
                      key={idx}
                      style={{
                        margin: '12px 0 16px 0',
                        padding: '12px 16px',
                        background:
                          'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.15))',
                        border: '2px solid rgba(52, 211, 153, 0.7)',
                        borderRadius: '8px',
                        boxShadow: '0 0 20px rgba(16, 185, 129, 0.25)',
                        color: '#f0fdf4',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {text}
                    </div>
                  );
                }

                return (
                  <div
                    key={idx}
                    className={"floating-prompter-card shadow-2xl group " + (isRibbonMode ? "p-3 sm:p-4 my-1.5" : "p-5 sm:p-7 my-3")}
                    style={{
                      fontSize: {
                        small: '15px',
                        medium: '18px',
                        large: '22px',
                        xlarge: '26px',
                      }[teleprompterFontSize] || '18px',
                      lineHeight: {
                        small: '1.6',
                        medium: '1.7',
                        large: '1.75',
                        xlarge: '1.8',
                      }[teleprompterFontSize] || '1.7',
                      color: '#f8fafc',
                      whiteSpace: 'pre-wrap',
                      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                      letterSpacing: '-0.01em',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '6px',
                        marginBottom: '8px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleTriggerAutoTypeText(text)}
                        title="Auto-type this text paragraph directly into active chat box (Shortcut: Option+T)"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'rgba(168, 85, 247, 0.25)',
                          color: '#e9d5ff',
                          border: '1px solid rgba(192, 132, 252, 0.45)',
                          borderRadius: '5px',
                          padding: '2px 8px',
                          fontSize: '11px',
                          fontWeight: 650,
                          cursor: 'pointer',
                        }}
                      >
                        <MessageSquare size={11} />
                        <span>Type Text (⌥T)</span>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          await copyToClipboard(text);
                          setToast('📋 Text copied to clipboard!');
                        }}
                        title="Copy text"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          color: '#cbd5e1',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          borderRadius: '5px',
                          padding: '2px 8px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <Copy size={11} />
                        <span>Copy</span>
                      </button>
                    </div>

                    {text}
                  </div>
                );
              })}

              {isGenerating && (
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '18px',
                    background: '#6366f1',
                    marginLeft: '4px',
                    verticalAlign: 'middle',
                    animation: 'pulse 1s infinite',
                  }}
                />
              )}

              {/* Layer 6: Predicted Follow-Ups Panel */}
              {!isRibbonMode && predictedFollowUps && predictedFollowUps.length > 0 && !isGenerating && (
                <FollowUpPredictions
                  followUps={predictedFollowUps}
                  onSelect={(fu) => handleTriggerQuestion(fu)}
                />
              )}
            </div>
          ) : isGenerating ? (
            <div
              style={{
                padding: "24px",
                background: "rgba(15, 23, 42, 0.75)",
                border: "1px solid rgba(129, 140, 248, 0.3)",
                borderRadius: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "6px",
                      background: "rgba(99, 102, 241, 0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Loader2 size={14} className="spin" style={{ color: "#818cf8" }} />
                  </div>
                  <span style={{ fontWeight: 700, fontSize: "13px", color: "#e0e7ff" }}>
                    Synthesizing Verified Interview Solution...
                  </span>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {draftAnswer ? '⚡ DRAFT (VALIDATION ACTIVE)' : `${responseMode.toUpperCase()} STREAM`}
                </span>
              </div>

              {draftAnswer && draftAnswer.trim().length > 0 ? (
                <div
                  style={{
                    background: "rgba(0, 0, 0, 0.45)",
                    borderRadius: "10px",
                    padding: "16px",
                    border: "1px solid rgba(251, 191, 36, 0.25)",
                    color: "#f1f5f9",
                    fontSize: "15px",
                    lineHeight: "1.6",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "#f59e0b", fontWeight: 700, marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>🛡️ Live Generation Draft</span>
                    <span style={{ color: "#94a3b8", fontWeight: 400 }}>— Grounding validation in progress; ready-to-speak answer will display upon completion.</span>
                  </div>
                  {draftAnswer}
                  <span style={{ display: 'inline-block', width: '8px', height: '16px', background: '#f59e0b', marginLeft: '6px', verticalAlign: 'middle', animation: 'pulse 1s infinite' }} />
                </div>
              ) : (
                <>
                  {/* Shimmer Skeleton Blocks */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "4px" }}>
                    <div className="skeleton-shimmer" style={{ height: "18px", width: "75%" }} />
                    <div className="skeleton-shimmer" style={{ height: "14px", width: "92%" }} />
                    <div className="skeleton-shimmer" style={{ height: "14px", width: "85%" }} />
                    <div className="skeleton-shimmer" style={{ height: "14px", width: "60%" }} />
                  </div>

                  <div
                    style={{
                      background: "rgba(0, 0, 0, 0.4)",
                      borderRadius: "10px",
                      padding: "14px",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    <div className="skeleton-shimmer" style={{ height: "12px", width: "40%" }} />
                    <div className="skeleton-shimmer" style={{ height: "12px", width: "65%" }} />
                  </div>
                </>
              )}
            </div>
          ) : isRibbonMode ? (
            <div className="floating-prompter-card p-4 sm:p-5 my-auto max-w-xl mx-auto flex flex-col items-center justify-center text-center shadow-2xl select-none">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={"w-2.5 h-2.5 rounded-full " + (isListening ? "bg-emerald-400 animate-pulse" : "bg-indigo-400")} />
                <span className="text-xs font-bold text-white tracking-wide">
                  {isListening ? "Live Copilot Active — Listening for Interview Question..." : "AI Technical Copilot Standby"}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mb-3 max-w-md leading-relaxed">
                Speak or paste a question to see real-time verified answers, or snip a coding problem directly off your screen.
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleScreenCapture('fullscreen')}
                  disabled={isScreenReading}
                  className="card-interactive px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600/90 hover:bg-emerald-500 text-white border border-emerald-400/40 flex items-center gap-1.5 shadow-sm transition"
                >
                  {isScreenReading ? <Loader2 size={12} className="spin" /> : <Camera size={12} />}
                  <span>Snip Screen (⌘⇧S)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTriggerQuestion("Explain the trade-offs between optimistic vs pessimistic locking in distributed systems.")}
                  className="card-interactive px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600/70 hover:bg-indigo-500 text-indigo-100 border border-indigo-400/30 flex items-center gap-1.5 transition"
                >
                  <Sparkles size={12} />
                  <span>Test Sample Question</span>
                </button>
                <button
                  type="button"
                  onClick={toggleInterviewFocusMode}
                  className="card-interactive px-2.5 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                >
                  Full Studio
                </button>
              </div>
            </div>
          ) : (
            <div style={{ color: '#e2e8f0', width: '100%', maxWidth: '980px', margin: '0 auto' }}>
              {/* Top Status & Persona Banner */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: isUltraCompact ? '8px 12px' : '12px 18px',
                  background:
                    'linear-gradient(135deg, rgba(30, 27, 75, 0.6), rgba(15, 23, 42, 0.75))',
                  border: '1px solid rgba(129, 140, 248, 0.25)',
                  borderRadius: '14px',
                  marginBottom: '16px',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {isListening ? (
                    <span className="beacon-live" />
                  ) : (
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: '#818cf8',
                        display: 'inline-block',
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#f8fafc',
                      letterSpacing: '-0.1px',
                    }}
                  >
                    {isListening
                      ? 'Live Copilot Active — Listening for interview question or coding challenge...'
                      : 'AI Technical Copilot Ready • Screen OCR & Speech Standby'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#c7d2fe',
                    background: 'rgba(99, 102, 241, 0.18)',
                    border: '1px solid rgba(129, 140, 248, 0.35)',
                    borderRadius: '20px',
                    padding: '3px 10px',
                  }}
                >
                  <Target size={12} style={{ color: '#a78bfa' }} />
                  <span>Abhishek Singh • Software Development Engineer</span>
                </div>
              </div>

              {/* Instant Action Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '18px',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={() => handleScreenCapture('fullscreen')}
                  disabled={isScreenReading}
                  style={{
                    flex: '1 1 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: isUltraCompact ? '8px 12px' : '12px 18px',
                    background:
                      'linear-gradient(135deg, rgba(16, 185, 129, 0.9), rgba(5, 150, 105, 0.95))',
                    color: '#ffffff',
                    border: '1px solid rgba(52, 211, 153, 0.6)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: isScreenReading ? 'wait' : 'pointer',
                    boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {isScreenReading ? (
                    <Loader2 size={15} className="spin" />
                  ) : (
                    <ScanText size={15} />
                  )}
                  <span>📸 Solve Full Screen (⌘⇧S)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleScreenCapture('snip')}
                  disabled={isScreenReading}
                  style={{
                    flex: '1 1 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: isUltraCompact ? '8px 12px' : '12px 18px',
                    background:
                      'linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(79, 70, 229, 0.95))',
                    color: '#ffffff',
                    border: '1px solid rgba(129, 140, 248, 0.6)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: isScreenReading ? 'wait' : 'pointer',
                    boxShadow: '0 4px 16px rgba(99, 102, 241, 0.35)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Crop size={15} />
                  <span>✂️ Snip Question Box (⌘⇧X)</span>
                </button>

                <button
                  type="button"
                  onClick={toggleRecording}
                  style={{
                    flex: '1 1 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px 18px',
                    background: isListening
                      ? 'linear-gradient(135deg, rgba(225, 29, 72, 0.9), rgba(190, 18, 60, 0.95))'
                      : 'rgba(255, 255, 255, 0.08)',
                    color: '#ffffff',
                    border: isListening
                      ? '1px solid rgba(244, 63, 94, 0.6)'
                      : '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: isListening ? '0 4px 16px rgba(225, 29, 72, 0.4)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {isListening ? <MicOff size={15} /> : <Mic size={15} />}
                  <span>{isListening ? 'Stop Mic (R)' : '🎙️ Dictate Question (R)'}</span>
                </button>
              </div>

              {/* Three Interactive Response Mode Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: '12px',
                  marginBottom: '18px',
                }}
              >
                {/* Coding Mode Card */}
                <div
                  onClick={() => {
                    setResponseMode('coding');
                    setToast('Mode set: 💻 Coding Challenge');
                  }}
                  style={{
                    background:
                      responseMode === 'coding'
                        ? 'linear-gradient(145deg, rgba(49, 46, 129, 0.6), rgba(15, 23, 42, 0.85))'
                        : 'rgba(15, 23, 42, 0.55)',
                    border:
                      responseMode === 'coding'
                        ? '1.5px solid rgba(129, 140, 248, 0.65)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow:
                      responseMode === 'coding' ? '0 4px 18px rgba(99, 102, 241, 0.25)' : 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: 800,
                        fontSize: '13px',
                        color: '#a5b4fc',
                      }}
                    >
                      <Terminal size={14} />
                      <span>💻 Coding Mode</span>
                    </div>
                    {responseMode === 'coding' && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#4f46e5',
                          color: '#fff',
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      color: '#94a3b8',
                      fontSize: '11px',
                      lineHeight: '1.5',
                      margin: '0 0 10px 0',
                    }}
                  >
                    Verified, runnable code with line numbers, Big-O proof, and 1-click clipboard
                    copy.
                  </p>
                  <span
                    style={{
                      fontSize: '10px',
                      color: '#c7d2fe',
                      fontWeight: 600,
                      background: 'rgba(99, 102, 241, 0.2)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    Language: {settings?.preferredLanguage || 'Java'}
                  </span>
                </div>

                {/* Behavioral / Interview Mode Card */}
                <div
                  onClick={() => {
                    setResponseMode('interview');
                    setToast('Mode set: 🎙️ Interview / STAR');
                  }}
                  style={{
                    background:
                      responseMode === 'interview'
                        ? 'linear-gradient(145deg, rgba(88, 28, 135, 0.6), rgba(15, 23, 42, 0.85))'
                        : 'rgba(15, 23, 42, 0.55)',
                    border:
                      responseMode === 'interview'
                        ? '1.5px solid rgba(192, 132, 252, 0.65)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow:
                      responseMode === 'interview' ? '0 4px 18px rgba(168, 85, 247, 0.25)' : 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: 800,
                        fontSize: '13px',
                        color: '#d8b4fe',
                      }}
                    >
                      <Volume2 size={14} />
                      <span>🎙️ Behavioral Mode</span>
                    </div>
                    {responseMode === 'interview' && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#9333ea',
                          color: '#fff',
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      color: '#94a3b8',
                      fontSize: '11px',
                      lineHeight: '1.5',
                      margin: '0 0 10px 0',
                    }}
                  >
                    Natural first-person spoken STAR responses tailored to your actual backend
                    engineering achievements.
                  </p>
                  <span
                    style={{
                      fontSize: '10px',
                      color: '#e9d5ff',
                      fontWeight: 600,
                      background: 'rgba(168, 85, 247, 0.2)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    Persona: Abhishek Singh
                  </span>
                </div>

                {/* Quiz / MCQ Mode Card */}
                <div
                  onClick={() => {
                    setResponseMode('quiz');
                    setToast('Mode set: 📝 Quiz / MCQ');
                  }}
                  style={{
                    background:
                      responseMode === 'quiz'
                        ? 'linear-gradient(145deg, rgba(6, 78, 59, 0.6), rgba(15, 23, 42, 0.85))'
                        : 'rgba(15, 23, 42, 0.55)',
                    border:
                      responseMode === 'quiz'
                        ? '1.5px solid rgba(52, 211, 153, 0.65)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow:
                      responseMode === 'quiz' ? '0 4px 18px rgba(16, 185, 129, 0.25)' : 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: 800,
                        fontSize: '13px',
                        color: '#86efac',
                      }}
                    >
                      <Check size={14} />
                      <span>📝 Quiz / MCQ Mode</span>
                    </div>
                    {responseMode === 'quiz' && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#059669',
                          color: '#fff',
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      color: '#94a3b8',
                      fontSize: '11px',
                      lineHeight: '1.5',
                      margin: '0 0 10px 0',
                    }}
                  >
                    Instant highlighted correct option with 1-line proof and explanation of why
                    distractors fail.
                  </p>
                  <span
                    style={{
                      fontSize: '10px',
                      color: '#a7f3d0',
                      fontWeight: 600,
                      background: 'rgba(16, 185, 129, 0.2)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    Instant Proof + Distractors
                  </span>
                </div>

                {/* Option 4: Application Form Assistance */}
                <div
                  onClick={() => {
                    setResponseMode('application');
                    setToast('Mode set: 📋 Application Form Assistance');
                  }}
                  style={{
                    background:
                      responseMode === 'application'
                        ? 'linear-gradient(145deg, rgba(30, 58, 138, 0.6), rgba(15, 23, 42, 0.85))'
                        : 'rgba(15, 23, 42, 0.55)',
                    border:
                      responseMode === 'application'
                        ? '1.5px solid rgba(96, 165, 250, 0.65)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow:
                      responseMode === 'application' ? '0 4px 18px rgba(59, 130, 246, 0.25)' : 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: 800,
                        fontSize: '13px',
                        color: '#93c5fd',
                      }}
                    >
                      <ScanText size={14} />
                      <span>📋 Application Assistance</span>
                    </div>
                    {responseMode === 'application' && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#2563eb',
                          color: '#fff',
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      color: '#94a3b8',
                      fontSize: '11px',
                      lineHeight: '1.5',
                      margin: '0 0 10px 0',
                    }}
                  >
                    Question-by-question form assistance for vendor questionnaires and job portals without hallucinated claims.
                  </p>
                  <span
                    style={{
                      fontSize: '10px',
                      color: '#bfdbfe',
                      fontWeight: 600,
                      background: 'rgba(59, 130, 246, 0.2)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    Question Extraction + Fact Grounding
                  </span>
                </div>
              </div>

              {/* Keyboard Shortcuts Strip */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '14px',
                  padding: '8px 14px',
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  fontSize: '11px',
                  color: '#94a3b8',
                  flexWrap: 'wrap',
                }}
              >
                <span>
                  <kbd className="kbd">⌘⇧S</kbd> Full Screen OCR
                </span>
                <span>
                  <kbd className="kbd">⌘⇧X</kbd> Snip Box
                </span>
                <span>
                  <kbd className="kbd">⌘K</kbd> Clear & Reset
                </span>
                <span>
                  <kbd className="kbd">⌘J</kbd> Auto-Scroll
                </span>
                <span>
                  <kbd className="kbd">Space</kbd> Done Answering
                </span>
                <span>
                  <kbd className="kbd">⌘⇧H</kbd> Stealth Hide
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════════════ BOTTOM STEALTH TOOLBAR & INPUT BAR ════════════ */}
      {!isRibbonMode && (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: `rgba(12, 14, 24, ${Math.min(0.78, windowOpacity * 0.75 + 0.18)})`,
          borderTop: '1px solid rgba(255, 255, 255, 0.10)',
          padding: '8px 14px',
          gap: '8px',
        }}
      >
        {/* Row 1: Direct Question Input Box (Full-width Responsive) & Quick Pills */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
          <form
            onSubmit={handleFormSubmit}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}
          >
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Type or paste any interview / coding question & press Enter..."
              style={{
                flex: 1,
                minWidth: 0,
                background: 'rgba(255, 255, 255, 0.07)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '12px',
                color: '#f8fafc',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!manualInput.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: manualInput.trim() ? '#4f46e5' : 'rgba(255, 255, 255, 0.08)',
                color: manualInput.trim() ? '#ffffff' : '#64748b',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontWeight: 600,
                fontSize: '12px',
                cursor: manualInput.trim() ? 'pointer' : 'default',
                flexShrink: 0,
              }}
            >
              <Send size={12} />
              <span>Solve</span>
            </button>
          </form>

          {/* Quick-Test Buttons Bar (Horizontally scrollable, never squishes input) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              overflowX: 'auto',
              whiteSpace: 'nowrap',
              paddingBottom: '2px',
              scrollbarWidth: 'none',
            }}
          >
            <span
              style={{
                fontSize: '10px',
                color: '#64748b',
                fontWeight: 700,
                flexShrink: 0,
                textTransform: 'uppercase',
              }}
            >
              ⚡ Quick Tests:
            </span>
            <button
              onClick={() => {
                setResponseMode('coding');
                handleTriggerQuestion(
                  'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. Provide optimal O(N) solution with Hash Table.'
                );
              }}
              title="Test Coding Challenge Mode (Two Sum in preferred language)"
              style={{
                background:
                  'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(79, 70, 229, 0.25))',
                border: '1px solid rgba(129, 140, 248, 0.55)',
                color: '#c7d2fe',
                borderRadius: '12px',
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              💻 Two Sum
            </button>
            <button
              onClick={() => {
                setResponseMode('quiz');
                handleTriggerQuestion(
                  'Question: Which of the following is true regarding Inodes in Unix filesystems?\nA) They store file name and data\nB) They store file metadata and data block pointers\nC) They reside in MBR\nD) They are only used in FAT32\nSelect the single correct option and justify.'
                );
              }}
              title="Test Quiz / MCQ Mode (Highlight correct answer + proof)"
              style={{
                background:
                  'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.25))',
                border: '1px solid rgba(52, 211, 153, 0.55)',
                color: '#a7f3d0',
                borderRadius: '12px',
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              📝 MCQ Quiz
            </button>
            <button
              onClick={() => {
                setResponseMode('interview');
                handleTriggerQuestion(
                  'Tell me about a challenging distributed systems backend issue you solved in your past production experience.'
                );
              }}
              title="Test Behavioral / STAR Interview Response Mode"
              style={{
                background:
                  'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(147, 51, 234, 0.25))',
                border: '1px solid rgba(192, 132, 252, 0.55)',
                color: '#e9d5ff',
                borderRadius: '12px',
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🎙️ Behavioral
            </button>
            <button
              onClick={() =>
                InterviewEngine.handleEvent({
                  type: 'SCREEN_PROBLEM_DETECTED',
                  rawText:
                    'Pregunta: Dado un arreglo de números enteros nums y un valor entero target, devuelva los índices de los dos elementos que sumados sean iguales a target. Asuma que cada entrada tiene exactamente una solución y no use el mismo elemento dos veces. Ejemplo: nums = [2, 7, 11, 15], target = 9 -> Salida: [0, 1]',
                  mode: 'fullscreen',
                })
              }
              title="Test Automatic Spanish Detection, English Translation & Code Solution"
              style={{
                background:
                  'linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(220, 38, 38, 0.25))',
                border: '1px solid rgba(248, 113, 113, 0.55)',
                color: '#fecaca',
                borderRadius: '12px',
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🇪🇸 Spanish
            </button>
          </div>
        </div>

        {/* Row 2: Mic Status & Live Audio Diagnostics (Responsive Wrap) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#94a3b8',
            gap: '8px',
            rowGap: '6px',
            flexWrap: 'wrap',
          }}
        >
          {/* Screen OCR & Solve Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <button
              onClick={() => handleScreenCapture('fullscreen')}
              disabled={isScreenReading}
              title="Capture Interviewer's Shared Screen & Solve 100% accurately (Shortcut: Cmd+Shift+S)"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: isScreenReading
                  ? 'rgba(245, 158, 11, 0.3)'
                  : 'linear-gradient(135deg, rgba(16, 185, 129, 0.28), rgba(5, 150, 105, 0.28))',
                color: isScreenReading ? '#fde68a' : '#6ee7b7',
                border: isScreenReading
                  ? '1px solid #f59e0b'
                  : '1px solid rgba(52, 211, 153, 0.45)',
                borderRadius: '6px',
                padding: '4px 10px',
                fontWeight: 650,
                fontSize: '11px',
                cursor: isScreenReading ? 'wait' : 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {isScreenReading ? <Loader2 size={12} className="spin" /> : <ScanText size={12} />}
              <span>{isScreenReading ? 'Reading Screen...' : '📸 Solve Screen (⌘⇧S)'}</span>
            </button>

            <button
              onClick={() => handleScreenCapture('snip')}
              disabled={isScreenReading}
              title="Snip specific question box / code snippet on screen"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(99, 102, 241, 0.2)',
                color: '#c7d2fe',
                border: '1px solid rgba(129, 140, 248, 0.35)',
                borderRadius: '6px',
                padding: '4px 8px',
                fontWeight: 600,
                fontSize: '11px',
                cursor: isScreenReading ? 'wait' : 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <Crop size={11} />
              <span>✂️ Snip Box</span>
            </button>

            <button
              onClick={() => handleAppendScreenCapture('fullscreen')}
              disabled={isScreenReading}
              title="Scroll down in question & append lower section/constraints (Shortcut: Cmd+Shift+A)"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(6, 182, 212, 0.22)',
                color: '#67e8f9',
                border: '1px solid rgba(34, 211, 238, 0.35)',
                borderRadius: '6px',
                padding: '4px 8px',
                fontWeight: 650,
                fontSize: '11px',
                cursor: isScreenReading ? 'wait' : 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <FilePlus size={11} />
              <span>📄 + Append Page (⌘⇧A)</span>
            </button>
          </div>

          {/* Left: Mic toggle button & Live Hearing Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={toggleRecording}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: isListening ? '#dc2626' : '#4f46e5',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontWeight: 600,
                fontSize: '11px',
                cursor: 'pointer',
                boxShadow: isListening ? '0 0 10px rgba(220, 38, 38, 0.5)' : 'none',
              }}
            >
              {isListening ? (
                <>
                  <MicOff size={12} />
                  <span>Listening ({diagnosticState.currentDb} dB)</span>
                </>
              ) : (
                <>
                  <Mic size={12} />
                  <span>Start Listening</span>
                </>
              )}
            </button>

            {/* Live 5-Bar Audio Level VU Meter */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: '2px',
                height: '14px',
                padding: '0 2px',
              }}
              title={`Microphone input level: ${diagnosticState.currentDb} dB (Threshold: -46 dB)`}
            >
              {[1, 2, 3, 4, 5].map((bar) => {
                const minThreshold = -62 + bar * 6; // -56, -50, -44, -38, -32
                const active = isListening && diagnosticState.currentDb > minThreshold;
                const color = bar >= 5 ? '#ef4444' : bar >= 4 ? '#f59e0b' : '#10b981';
                return (
                  <span
                    key={bar}
                    style={{
                      width: '3px',
                      height: `${4 + bar * 2}px`,
                      borderRadius: '1px',
                      background: active ? color : 'rgba(255, 255, 255, 0.15)',
                      boxShadow: active ? `0 0 6px ${color}` : 'none',
                      transition: 'background 0.08s ease',
                    }}
                  />
                );
              })}
            </div>

            {/* Status explanation */}
            <span
              style={{
                color:
                  recitalState === 'reciting'
                    ? '#93c5fd'
                    : recitalState === 'interrupted'
                      ? '#fca5a5'
                      : isListening
                        ? '#86efac'
                        : '#94a3b8',
              }}
            >
              {status === 'transcribing'
                ? '🎙️ Transcribing speech...'
                : status === 'analyzing' || status === 'generating'
                  ? '⚡ Streaming answer...'
                  : recitalState === 'reciting'
                    ? '🗣️ Candidate answering (mic echo paused • listening for third person)'
                    : recitalState === 'interrupted'
                      ? '⚡ Interviewer interrupted! Reacting live...'
                      : isListening
                        ? '● Continuous mic active (auto echo-filtering)'
                        : 'Mic paused'}
            </span>

            {/* Live heard ticker */}
            {diagnosticState.latestTranscript && diagnosticState.latestTranscript !== '(empty)' && (
              <span
                style={{
                  maxWidth: '240px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: '#cbd5e1',
                }}
                title={diagnosticState.latestTranscript}
              >
                Heard: "{diagnosticState.latestTranscript}"
              </span>
            )}
          </div>

          {/* Right: Action Buttons (Clear & Copy) */}
          {currentAnswer && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={clearAndResetToListen}
                title="Clear current answer and listen for new question (Shortcut: ⌘K)"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(239, 68, 68, 0.16)',
                  border: '1px solid rgba(248, 113, 113, 0.35)',
                  color: '#fca5a5',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 650,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>✨ New Question (⌘K)</span>
              </button>
              <button
                onClick={copyAnswer}
                title="Copy entire answer including explanations to clipboard"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#cbd5e1',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                <Copy size={11} /> Copy Full Answer
              </button>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Shortcuts Quick-Ref Modal */}
      {showShortcuts && (
        <div
          onClick={() => setShowShortcuts(false)}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 90,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0f172a',
              border: '1px solid rgba(129, 140, 248, 0.35)',
              borderRadius: '10px',
              padding: '20px',
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 12px 36px rgba(0, 0, 0, 0.8)',
              color: '#f8fafc',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 700,
                  fontSize: '15px',
                  color: '#e0e7ff',
                }}
              >
                <Keyboard size={16} style={{ color: '#818cf8' }} />
                <span>Stealth & Global Keyboard Shortcuts</span>
              </div>
              <button
                onClick={() => setShowShortcuts(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}
            >
              {[
                {
                  key: '⌘ + ⇧ + H',
                  desc: 'Instant Stealth: Vanish / Reveal overlay window with 0ms delay and zero animation.',
                },
                { key: '⌘ + \\', desc: 'One-handed quick stealth toggle.' },
                { key: '⌘ + ⇧ + Space', desc: 'Panic stealth toggle anywhere across macOS.' },
                {
                  key: '⌘ + ⇧ + S',
                  desc: "Capture & Solve Interviewer's Shared Screen (OCR & Multilingual).",
                },
                {
                  key: '⌘ + 1 / 2 / 3',
                  desc: 'Instant Mode Switch: 1 = Coding, 2 = Interview, 3 = Quiz / MCQ.',
                },
                { key: '⌘ + K', desc: 'Copy clean compilable code directly to clipboard.' },
                { key: '⌘ + J', desc: 'Toggle smooth hands-free auto-scrolling.' },
                { key: 'Space', desc: 'Done reciting: advance teleprompter and resume listening.' },
                { key: 'Escape', desc: 'Instantly dismiss overlay window.' },
              ].map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  <span style={{ color: '#cbd5e1' }}>{item.desc}</span>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      background: 'rgba(99, 102, 241, 0.25)',
                      color: '#a5b4fc',
                      border: '1px solid rgba(129, 140, 248, 0.4)',
                      borderRadius: '4px',
                      padding: '2px 7px',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      marginLeft: '12px',
                    }}
                  >
                    {item.key}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowShortcuts(false)}
              style={{
                marginTop: '16px',
                width: '100%',
                background: '#4f46e5',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px',
                fontWeight: 650,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
