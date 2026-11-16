import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clipboard, ShieldCheck, Wand2 } from 'lucide-react';
import { copyToClipboard } from '../../utils/clipboard';
import { LinkedInPlaybookWorkbench } from './LinkedInPlaybookWorkbench';
import {
  getLinkedInCharacterLimit,
  humanizeLinkedInText,
  scoreLinkedInText,
  type ContentKind,
} from '../../services/careerOps/linkedinContentQuality';

interface LinkedInContentStudioProps {
  initialDraft?: string;
  initialKind?: ContentKind;
}

export function LinkedInContentStudio({
  initialDraft,
  initialKind = 'post',
}: LinkedInContentStudioProps) {
  const [kind, setKind] = useState<ContentKind>(initialKind);
  const [draft, setDraft] = useState(initialDraft ?? '');
  const [cleaned, setCleaned] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'draft' | 'playbooks'>('draft');
  useEffect(() => {
    if (initialDraft !== undefined) {
      setDraft(initialDraft);
      setCleaned('');
      setNotice('');
      setKind(initialKind);
    }
  }, [initialDraft, initialKind]);

  const report = useMemo(() => scoreLinkedInText(cleaned || draft, kind), [cleaned, draft, kind]);
  const result = useMemo(() => humanizeLinkedInText(draft), [draft]);
  const panel: React.CSSProperties = {
    background: 'rgba(15,23,42,.72)',
    border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 12,
    padding: 16,
  };
  const button: React.CSSProperties = {
    border: '1px solid rgba(255,255,255,.14)',
    borderRadius: 8,
    padding: '9px 12px',
    color: '#f8fafc',
    background: 'rgba(255,255,255,.07)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
  };
  const checks = Object.entries(report.checks);
  const characterLimit = getLinkedInCharacterLimit(kind);
  const currentText = cleaned || draft;
  const overCharacterLimit = characterLimit !== null && currentText.length > characterLimit;

  return (
    <section style={{ display: 'grid', gap: 14, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        <button
          type="button"
          style={{
            ...button,
            background: view === 'draft' ? 'rgba(249,115,22,.18)' : button.background,
            color: view === 'draft' ? '#fdba74' : '#e2e8f0',
          }}
          onClick={() => setView('draft')}
        >
          Draft & Review
        </button>
        <button
          type="button"
          style={{
            ...button,
            background: view === 'playbooks' ? 'rgba(249,115,22,.18)' : button.background,
            color: view === 'playbooks' ? '#fdba74' : '#e2e8f0',
          }}
          onClick={() => setView('playbooks')}
        >
          Playbook Workbench
        </button>
      </div>
      {view === 'playbooks' ? (
        <LinkedInPlaybookWorkbench
          onUseDraft={(template) => {
            setKind('post');
            setDraft(template);
            setCleaned('');
            setNotice('Hook template loaded. Replace every placeholder with your own verified details.');
            setView('draft');
          }}
        />
      ) : (
        <>
      <div style={panel}>
        <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 16 }}>LinkedIn Content Studio</h3>
        <p style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.6 }}>
          Clean formatting, catch generic phrasing and review factual quality before using a post,
          comment, reply or DM. Scores are local writing heuristics, not AI-detector predictions.
        </p>
        <label style={{ display: 'block', color: '#cbd5e1', fontSize: 11, marginBottom: 6 }}>
          CONTENT TYPE
        </label>
        <select
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as ContentKind);
            setCleaned('');
          }}
          style={{ ...button, marginBottom: 12 }}
        >
          <option value="post">Post</option>
          <option value="comment">Comment</option>
          <option value="reply">Reply</option>
          <option value="dm">Direct message</option>
          <option value="invite">Connection invite note</option>
        </select>
        <textarea
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setCleaned('');
          }}
          placeholder="Paste or write your LinkedIn draft..."
          rows={9}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            resize: 'vertical',
            background: '#0b1220',
            border: '1px solid rgba(255,255,255,.14)',
            borderRadius: 8,
            color: '#f8fafc',
            padding: 12,
            font: 'inherit',
            fontSize: 13,
            lineHeight: 1.6,
          }}
        />
        {characterLimit !== null && (
          <p
            style={{
              margin: '6px 0 0',
              color: overCharacterLimit ? '#fca5a5' : '#94a3b8',
              fontSize: 11,
              textAlign: 'right',
            }}
          >
            {currentText.length}/{characterLimit} characters
            {overCharacterLimit ? ' — over the target for this message type' : ''}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <button
            style={{ ...button, background: 'rgba(249,115,22,.18)', color: '#fdba74' }}
            onClick={() => {
              setCleaned(result.text);
              setNotice('Cleanup suggestions applied. Check each replacement for meaning and grammar before using it.');
            }}
            disabled={!draft.trim()}
          >
            <Wand2 size={14} style={{ verticalAlign: 'middle' }} /> Clean draft
          </button>
          <button
            style={button}
            onClick={async () => {
              const copied = await copyToClipboard(cleaned || draft);
              setNotice(
                copied ? 'Draft copied.' : 'Copy failed. Select and copy the draft manually.'
              );
            }}
            disabled={!(cleaned || draft).trim()}
          >
            <Clipboard size={14} style={{ verticalAlign: 'middle' }} /> Copy draft
          </button>
          <button
            style={button}
            onClick={() => {
              setDraft('');
              setCleaned('');
              setNotice('');
            }}
          >
            Clear
          </button>
        </div>
        {notice && (
          <p role="status" style={{ color: '#cbd5e1', fontSize: 12 }}>
            {notice}
          </p>
        )}
      </div>
      {cleaned && (
        <div style={panel}>
          <h4 style={{ margin: '0 0 8px', color: '#f8fafc' }}>Cleaned draft</h4>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              color: '#e2e8f0',
              font: 'inherit',
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {cleaned}
          </pre>
          <p style={{ color: '#94a3b8', fontSize: 11 }}>
            Changes: {result.changes.length ? result.changes.join('; ') : 'No automatic changes.'}
          </p>
          {!!result.replacements.length && (
            <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
              <strong style={{ color: '#fdba74', fontSize: 11 }}>Lexical suggestions to verify</strong>
              {result.replacements.map((replacement) => (
                <div key={replacement.find} style={{ color: '#cbd5e1', fontSize: 11 }}>
                  “{replacement.find}” → “{replacement.replace}” ({replacement.count})
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={17} color="#34d399" />
          <h4 style={{ margin: 0, color: '#f8fafc' }}>Writing quality review</h4>
        </div>
        <p style={{ color: '#94a3b8', fontSize: 11 }}>
          Text: {report.wordCount} words · {report.contentKind} · Heuristic result: {report.verdict}
          {report.weakestCheck ? ` · Lowest signal: ${report.weakestCheck}` : ''}
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))',
            gap: 8,
          }}
        >
          {checks.map(([name, check]) => (
            <div
              key={name}
              style={{ background: 'rgba(255,255,255,.04)', borderRadius: 8, padding: 10 }}
            >
              <div style={{ color: '#cbd5e1', fontSize: 11, textTransform: 'capitalize' }}>
                {name.replace(/([A-Z])/g, ' $1')}
              </div>
              <strong style={{ color: '#f8fafc', fontSize: 20 }}>
                {check.score === null ? 'N/A' : check.score}
              </strong>
              <div style={{ color: '#94a3b8', fontSize: 10, lineHeight: 1.4 }}>{check.detail}</div>
            </div>
          ))}
        </div>
        {!!report.structuralFlags.length && (
          <div style={{ marginTop: 12, color: '#fdba74', fontSize: 11 }}>
            <AlertTriangle size={14} style={{ verticalAlign: 'middle' }} /> Manual review:{' '}
            {report.structuralFlags.join(' · ')}
          </div>
        )}
        <p style={{ color: '#94a3b8', fontSize: 10, lineHeight: 1.5 }}>
          These scores are local writing heuristics, not an AI detector, authorship test or reach predictor. A PASS is not proof of human authorship. Never add fake personal stories, numbers, credentials or engagement bait to improve a score.
        </p>
      </div>
        </>
      )}
    </section>
  );
}
