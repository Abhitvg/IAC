import React, { useState } from 'react';
import {
  ExtractedFormQuestion,
  FormQuestionAnswer,
  ApplicationFormSession,
} from '../../services/ApplicationFormAssistanceService';
import { useAppStore } from '../../store/useAppStore';
import { useCareerOpsStore } from '../../store/useCareerOpsStore';
import { copyToClipboard } from '../../utils/clipboard';
import {
  FileText,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  HelpCircle,
  Briefcase,
  Layers,
  Edit3,
  ShieldCheck,
  RotateCcw,
  Maximize2,
  Minimize2,
  Eye,
  Sliders,
} from 'lucide-react';

interface ApplicationAssistanceViewProps {
  session: ApplicationFormSession;
  onClose?: () => void;
}

export const ApplicationAssistanceView: React.FC<ApplicationAssistanceViewProps> = ({
  session,
  onClose,
}) => {
  const {
    updateApplicationAnswer,
    markApplicationAnswerCopied,
    setToast,
    windowOpacity,
    teleprompterViewMode,
    setTeleprompterViewMode,
  } = useAppStore();

  const { saveFormAnswer } = useCareerOpsStore();

  const [activeIdx, setActiveIdx] = useState(session.activeQuestionIndex || 0);
  const [detailMode, setDetailMode] = useState<'concise' | 'detailed'>('concise');
  const [isEditing, setIsEditing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const currentQ: ExtractedFormQuestion | undefined = session.questions[activeIdx];
  const currentA: FormQuestionAnswer | undefined = currentQ ? session.answers[currentQ.id] : undefined;

  const handleCopyAnswer = async (qId: string, answerText: string) => {
    if (!answerText) return;
    try {
      await copyToClipboard(answerText);
      setCopiedId(qId);
      markApplicationAnswerCopied(qId);

      if (session.associatedJobId && currentQ) {
        saveFormAnswer(session.associatedJobId, qId, currentQ.questionText, answerText, true);
      }

      setToast('📋 Copied answer to clipboard! Paste directly into application form.');
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      setToast('⚠️ Failed to copy answer to clipboard');
    }
  };

  const handleDetailToggle = (mode: 'concise' | 'detailed') => {
    setDetailMode(mode);
    if (!currentQ || !currentA) return;
    const chosenText = mode === 'concise' ? currentA.conciseAnswer : currentA.detailedAnswer;
    updateApplicationAnswer(currentQ.id, chosenText);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!currentQ) return;
    updateApplicationAnswer(currentQ.id, e.target.value);
  };

  const handlePrev = () => {
    if (activeIdx > 0) {
      setActiveIdx(activeIdx - 1);
      setIsEditing(false);
    }
  };

  const handleNext = () => {
    if (activeIdx < session.questions.length - 1) {
      setActiveIdx(activeIdx + 1);
      setIsEditing(false);
    }
  };

  const handleToggleCompact = async () => {
    const nextMode = teleprompterViewMode === 'compact' ? 'full' : 'compact';
    setTeleprompterViewMode(nextMode);

    if (typeof window !== 'undefined' && window.electronAPI?.setWindowSize) {
      if (nextMode === 'compact') {
        await window.electronAPI.setWindowSize(640, 380);
      } else {
        await window.electronAPI.setWindowSize(1024, 720);
      }
    }
  };

  const isCompact = teleprompterViewMode === 'compact';

  return (
    <div
      role="region"
      aria-label="Application Assistance Workspace"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: isCompact ? 'rgba(15, 23, 42, 0.94)' : 'rgba(11, 15, 25, 0.96)',
        backdropFilter: 'blur(16px)',
        color: '#f8fafc',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid rgba(99, 102, 241, 0.3)',
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(30, 41, 59, 0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} color="#818cf8" />
          <span style={{ fontWeight: 600, fontSize: '13px', color: '#e2e8f0' }}>
            Application Assistance
          </span>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '999px',
              fontSize: '11px',
              fontWeight: 600,
              background: 'rgba(99, 102, 241, 0.2)',
              color: '#a5b4fc',
              border: '1px solid rgba(99, 102, 241, 0.3)',
            }}
          >
            {session.category.replace(/_/g, ' ')}
          </span>
          {session.associatedCompany && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: '#34d399',
                background: 'rgba(16, 185, 129, 0.15)',
                padding: '2px 8px',
                borderRadius: '6px',
              }}
            >
              <Briefcase size={12} />
              {session.associatedCompany} ({session.associatedJobTitle || 'CareerOps Matched'})
            </span>
          )}
        </div>

        {/* View Controls & Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '8px' }}>
            <button
              onClick={handlePrev}
              disabled={activeIdx === 0}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '4px',
                color: activeIdx === 0 ? '#475569' : '#cbd5e1',
                padding: '4px 6px',
                cursor: activeIdx === 0 ? 'not-allowed' : 'pointer',
              }}
              title="Previous Question"
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: '12px', color: '#94a3b8', padding: '0 4px' }}>
              Q {activeIdx + 1} of {session.questions.length}
            </span>
            <button
              onClick={handleNext}
              disabled={activeIdx >= session.questions.length - 1}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '4px',
                color: activeIdx >= session.questions.length - 1 ? '#475569' : '#cbd5e1',
                padding: '4px 6px',
                cursor: activeIdx >= session.questions.length - 1 ? 'not-allowed' : 'pointer',
              }}
              title="Next Question"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <button
            onClick={handleToggleCompact}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '6px',
              color: '#cbd5e1',
              padding: '4px 8px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
            title={isCompact ? 'Expand Workspace' : 'Compact Floating Mode'}
          >
            {isCompact ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
            {isCompact ? 'Expand' : 'Compact'}
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      {currentQ && currentA ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: isCompact ? '12px' : '16px 20px',
            overflowY: 'auto',
            gap: '12px',
          }}
        >
          {/* Question Banner */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              borderRadius: '8px',
              padding: '10px 14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontWeight: 600, fontSize: '13px', color: '#f1f5f9', lineHeight: 1.4 }}>
                <span style={{ color: '#818cf8', marginRight: '6px' }}>#{currentQ.number}.</span>
                {currentQ.questionText}
              </div>
              {currentQ.characterLimit && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: currentA.isOverLimit ? '#f87171' : '#94a3b8',
                    background: currentA.isOverLimit ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap',
                    marginLeft: '8px',
                  }}
                >
                  {currentA.characterCount} / {currentQ.characterLimit} chars
                </span>
              )}
            </div>

            {/* Badges */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Safety State Badge */}
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  background:
                    currentA.safetyState === 'VALIDATED'
                      ? 'rgba(16, 185, 129, 0.25)'
                      : currentA.safetyState === 'CANDIDATE_CONFIRMED'
                      ? 'rgba(59, 130, 246, 0.25)'
                      : currentA.safetyState === 'TECHNICAL_GUIDANCE'
                      ? 'rgba(168, 85, 247, 0.25)'
                      : 'rgba(234, 179, 8, 0.25)',
                  color:
                    currentA.safetyState === 'VALIDATED'
                      ? '#6ee7b7'
                      : currentA.safetyState === 'CANDIDATE_CONFIRMED'
                      ? '#93c5fd'
                      : currentA.safetyState === 'TECHNICAL_GUIDANCE'
                      ? '#d8b4fe'
                      : '#fde047',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                }}
              >
                {currentA.safetyState || 'NEEDS_USER_INPUT'}
              </span>

              {/* Response Mode Badge */}
              <span
                style={{
                  fontSize: '10px',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#cbd5e1',
                }}
              >
                {currentA.responseMode || (currentQ.asksPersonalExperience ? 'PERSONAL_EXPERIENCE' : 'TECHNICAL_KNOWLEDGE')}
              </span>

              {currentQ.asksPersonalExperience && (
                <span style={{ fontSize: '10px', background: 'rgba(168, 85, 247, 0.2)', color: '#d8b4fe', padding: '1px 6px', borderRadius: '4px' }}>
                  Personal Implementation
                </span>
              )}
              {currentQ.asksTechnicalKnowledge && (
                <span style={{ fontSize: '10px', background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', padding: '1px 6px', borderRadius: '4px' }}>
                  Technical Architecture
                </span>
              )}
              {currentQ.asksFactualDeclaration && (
                <span style={{ fontSize: '10px', background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7', padding: '1px 6px', borderRadius: '4px' }}>
                  Factual Declaration
                </span>
              )}
            </div>
          </div>

          {/* Answer Controls Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => handleDetailToggle('concise')}
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: detailMode === 'concise' ? '1px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: detailMode === 'concise' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                  color: detailMode === 'concise' ? '#a5b4fc' : '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                Concise
              </button>
              <button
                onClick={() => handleDetailToggle('detailed')}
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: detailMode === 'detailed' ? '1px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: detailMode === 'detailed' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                  color: detailMode === 'detailed' ? '#a5b4fc' : '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                Detailed
              </button>
              <button
                onClick={() => setIsEditing(!isEditing)}
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: isEditing ? '1px solid #eab308' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: isEditing ? 'rgba(234, 179, 8, 0.15)' : 'transparent',
                  color: isEditing ? '#fde047' : '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Edit3 size={11} />
                {isEditing ? 'Editing' : 'Edit'}
              </button>
            </div>

            <button
              onClick={() => handleCopyAnswer(currentQ.id, currentA.currentAnswer)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: currentA.isCopied ? '#059669' : '#4f46e5',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
              }}
            >
              {copiedId === currentQ.id || currentA.isCopied ? <Check size={14} /> : <Copy size={14} />}
              {copiedId === currentQ.id ? 'Copied!' : currentA.isCopied ? 'Copied' : 'Copy Answer'}
            </button>
          </div>

          {/* Answer Text Area / Display */}
          {isEditing ? (
            <textarea
              value={currentA.currentAnswer}
              onChange={handleTextChange}
              rows={isCompact ? 4 : 6}
              style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.9)',
                color: '#f8fafc',
                border: currentA.isOverLimit ? '1px solid #ef4444' : '1px solid rgba(99, 102, 241, 0.4)',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '13px',
                lineHeight: 1.6,
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
              }}
            />
          ) : (
            <div
              style={{
                background: 'rgba(30, 41, 59, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '13px',
                lineHeight: 1.6,
                color: '#e2e8f0',
                userSelect: 'text',
              }}
            >
              {currentA.currentAnswer}
            </div>
          )}

          {/* Missing Information / Clarification Banner */}
          {currentA.missingInformation.length > 0 && (
            <div
              style={{
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.25)',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '11px',
                color: '#fef08a',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              <AlertTriangle size={14} color="#facc15" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Missing Evidence:</strong> {currentA.missingInformation[0]}
                {currentA.clarificationRequest && (
                  <div style={{ marginTop: '2px', color: '#fde047' }}>
                    <em>Clarification Prompt:</em> {currentA.clarificationRequest}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Evidence Provenance Footer */}
          {!isCompact && currentA.evidenceUsed.length > 0 && (
            <div
              style={{
                fontSize: '11px',
                color: '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: 'auto',
                borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                paddingTop: '8px',
              }}
            >
              <ShieldCheck size={13} color="#34d399" />
              <span>
                <strong>Grounding Evidence:</strong> {currentA.evidenceUsed.join(' | ')}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
          No questions extracted from screen.
        </div>
      )}
    </div>
  );
};

