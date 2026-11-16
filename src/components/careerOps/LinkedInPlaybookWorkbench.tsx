import React, { useMemo, useState } from 'react';
import { copyToClipboard } from '../../utils/clipboard';
import hookLibrary from '../../../docs/linkedin-assist/hooks.json';
import profileRubric from '../../../docs/linkedin-assist/profile-rubric.json';

interface HookEntry {
  id: number;
  name: string;
  template: string;
  example: string;
  best_for: string;
  trap: string;
}
interface ProfileCriterion {
  id: string;
  points: number;
  full_marks: string;
}
interface LinkedInPlaybookWorkbenchProps {
  onUseDraft: (draft: string) => void;
}

const hooks = hookLibrary.hooks as HookEntry[];
const criteria = profileRubric.items as ProfileCriterion[];
type WorkbenchMode = 'hooks' | 'profile' | 'planner';

export function LinkedInPlaybookWorkbench({ onUseDraft }: LinkedInPlaybookWorkbenchProps) {
  const [mode, setMode] = useState<WorkbenchMode>('hooks');
  const [query, setQuery] = useState('');
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(criteria.map((item) => [item.id, 0]))
  );
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [proof, setProof] = useState('');
  const [opinion, setOpinion] = useState('');
  const [teach, setTeach] = useState('');
  const [story, setStory] = useState('');
  const [audience, setAudience] = useState('');
  const [notice, setNotice] = useState('');

  const filteredHooks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return hooks;
    return hooks.filter((hook) =>
      [hook.name, hook.template, hook.best_for, hook.example]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    );
  }, [query]);

  const profileScore = criteria.reduce((sum, item) => sum + (scores[item.id] ?? 0), 0);
  const plannerFields: {
    label: string;
    value: string;
    setValue: (value: string) => void;
    placeholder: string;
  }[] = [
    {
      label: 'Proof',
      value: proof,
      setValue: setProof,
      placeholder: 'A real result, project, mistake or measured outcome',
    },
    {
      label: 'Opinion',
      value: opinion,
      setValue: setOpinion,
      placeholder: 'A defensible position your audience may disagree with',
    },
    {
      label: 'Teach',
      value: teach,
      setValue: setTeach,
      placeholder: 'One useful method, lesson or process',
    },
    {
      label: 'Story / offer',
      value: story,
      setValue: setStory,
      placeholder: 'A true scene, lesson or clear offer',
    },
  ];
  const plan = useMemo(
    () =>
      [
        'WEEKLY LINKEDIN PLAN',
        audience.trim() ? `Audience: ${audience.trim()}` : '',
        '',
        `PROOF — ${proof.trim() || '[Add a specific verified result or experience]'}`,
        `OPINION — ${opinion.trim() || '[Add a defensible point of view]'}`,
        `TEACH — ${teach.trim() || '[Add one useful lesson or process]'}`,
        `STORY / OFFER — ${story.trim() || '[Add a real story or clear offer]'}`,
        '',
        'Before drafting: verify every number, claim, client reference and outcome. Do not invent proof.',
      ]
        .filter((line, index, all) => line !== '' || all[index - 1] !== '')
        .join('\n'),
    [audience, proof, opinion, teach, story]
  );

  const panel: React.CSSProperties = {
    background: 'rgba(15,23,42,.72)',
    border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 12,
    padding: 16,
  };
  const button: React.CSSProperties = {
    border: '1px solid rgba(255,255,255,.14)',
    borderRadius: 8,
    padding: '8px 11px',
    color: '#e2e8f0',
    background: 'rgba(255,255,255,.06)',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 700,
  };
  const muted: React.CSSProperties = { color: '#94a3b8', fontSize: 11, lineHeight: 1.55 };

  async function copy(value: string, label: string) {
    const copied = await copyToClipboard(value);
    setNotice(copied ? `${label} copied.` : 'Copy failed. Select and copy the text manually.');
  }

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div style={panel}>
        <h3 style={{ margin: '0 0 6px', color: '#f8fafc', fontSize: 15 }}>
          LinkedIn Playbook Workbench
        </h3>
        <p style={muted}>
          Practical frameworks adapted from the MIT-licensed upstream skill pack. These are planning
          aids, not claims about guaranteed reach, engagement or hiring outcomes.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {(
            [
              ['hooks', '21 post hooks'],
              ['profile', 'Profile scorecard'],
              ['planner', 'Weekly planner'],
            ] as [WorkbenchMode, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              style={{
                ...button,
                background: mode === value ? 'rgba(249,115,22,.2)' : button.background,
                color: mode === value ? '#fdba74' : '#e2e8f0',
                borderColor: mode === value ? 'rgba(249,115,22,.45)' : 'rgba(255,255,255,.14)',
              }}
              onClick={() => {
                setMode(value);
                setNotice('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'hooks' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={panel}>
            <label
              htmlFor="linkedin-hook-search"
              style={{ display: 'block', color: '#cbd5e1', fontSize: 11, marginBottom: 6 }}
            >
              SEARCH THE HOOK LIBRARY
            </label>
            <input
              id="linkedin-hook-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try: mistake, story, comparison, number..."
              style={{
                width: '100%',
                boxSizing: 'border-box',
                borderRadius: 8,
                padding: 10,
                color: '#f8fafc',
                background: '#0b1220',
                border: '1px solid rgba(255,255,255,.14)',
              }}
            />
            <p style={muted}>
              {filteredHooks.length} of {hooks.length} formulas. Pick a structure that fits the real
              material; do not force a formula onto a weak idea.
            </p>
          </div>
          {filteredHooks.map((hook) => (
            <article key={hook.id} style={panel}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <strong style={{ color: '#f8fafc', fontSize: 13 }}>
                  #{hook.id} · {hook.name}
                </strong>
                <button style={button} onClick={() => onUseDraft(hook.template)}>
                  Use template
                </button>
              </div>
              <p style={{ color: '#fdba74', fontSize: 12, lineHeight: 1.55 }}>{hook.template}</p>
              <p style={muted}>Example: {hook.example}</p>
              <p style={muted}>Best for: {hook.best_for}</p>
              <p style={{ ...muted, color: '#fca5a5' }}>Common trap: {hook.trap}</p>
            </article>
          ))}
          {filteredHooks.length === 0 && <p style={muted}>No hook formulas match that search.</p>}
        </div>
      )}

      {mode === 'profile' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: 0, color: '#f8fafc', fontSize: 14 }}>
                  Profile self-assessment
                </h4>
                <p style={muted}>
                  Score each section against the criteria. This is not an automatic profile audit.
                </p>
              </div>
              <strong
                style={{ color: '#fdba74', fontSize: 24, fontVariantNumeric: 'tabular-nums' }}
              >
                {profileScore}/100
              </strong>
            </div>
            <div
              style={{
                height: 7,
                borderRadius: 99,
                overflow: 'hidden',
                background: 'rgba(255,255,255,.1)',
                marginTop: 10,
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${profileScore}%`,
                  background: '#f97316',
                  transition: 'width .15s ease',
                }}
              />
            </div>
            <p style={muted}>
              A low score identifies a section to review; it does not predict profile views,
              recruiter responses or job offers.
            </p>
            <button
              style={button}
              onClick={() => {
                setScores(Object.fromEntries(criteria.map((item) => [item.id, 0])));
                setEvidence({});
              }}
            >
              Reset scorecard
            </button>
          </div>
          {criteria.map((item) => (
            <article key={item.id} style={panel}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <strong style={{ color: '#f8fafc', fontSize: 12 }}>
                  {item.id.replace(/_/g, ' ')}
                </strong>
                <strong style={{ color: '#fdba74', fontSize: 12 }}>
                  {scores[item.id] ?? 0}/{item.points}
                </strong>
              </div>
              <p style={muted}>{item.full_marks}</p>
              <input
                aria-label={`Score for ${item.id}, maximum ${item.points}`}
                type="range"
                min={0}
                max={item.points}
                step={1}
                value={scores[item.id] ?? 0}
                onChange={(event) =>
                  setScores((current) => ({ ...current, [item.id]: Number(event.target.value) }))
                }
                style={{ width: '100%', accentColor: '#f97316' }}
              />
              <input
                aria-label={`Evidence or next action for ${item.id}`}
                value={evidence[item.id] ?? ''}
                onChange={(event) =>
                  setEvidence((current) => ({ ...current, [item.id]: event.target.value }))
                }
                placeholder="Evidence or next action (optional)"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  borderRadius: 7,
                  padding: 8,
                  color: '#f8fafc',
                  background: '#0b1220',
                  border: '1px solid rgba(255,255,255,.12)',
                }}
              />
            </article>
          ))}
          <button
            style={{
              ...button,
              justifySelf: 'start',
              background: 'rgba(249,115,22,.18)',
              color: '#fdba74',
            }}
            onClick={() =>
              copy(
                [
                  `LINKEDIN PROFILE SCORE: ${profileScore}/100`,
                  ...criteria.map(
                    (item) =>
                      `${item.id}: ${scores[item.id] ?? 0}/${item.points}${evidence[item.id]?.trim() ? ` — ${evidence[item.id].trim()}` : ''}`
                  ),
                ].join('\n'),
                'Profile scorecard'
              )
            }
          >
            Copy scorecard
          </button>
        </div>
      )}

      {mode === 'planner' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={panel}>
            <h4 style={{ margin: '0 0 6px', color: '#f8fafc', fontSize: 14 }}>
              Plan four distinct content slots
            </h4>
            <p style={muted}>
              A lightweight weekly structure: proof, opinion, teaching and a real story or offer.
              This is a starting point, not a posting-frequency guarantee.
            </p>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 11, marginBottom: 5 }}>
              WHO ARE YOU WRITING FOR?
            </label>
            <input
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              placeholder="e.g. engineering managers hiring backend teams"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                borderRadius: 7,
                padding: 9,
                color: '#f8fafc',
                background: '#0b1220',
                border: '1px solid rgba(255,255,255,.12)',
              }}
            />
          </div>
          {plannerFields.map((field) => (
            <div key={field.label} style={panel}>
              <label style={{ display: 'block', color: '#f8fafc', fontWeight: 700, fontSize: 12 }}>
                {field.label}
              </label>
              <textarea
                value={field.value}
                onChange={(event) => field.setValue(event.target.value)}
                rows={3}
                placeholder={field.placeholder}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  marginTop: 7,
                  borderRadius: 7,
                  padding: 9,
                  resize: 'vertical',
                  color: '#f8fafc',
                  background: '#0b1220',
                  border: '1px solid rgba(255,255,255,.12)',
                  font: 'inherit',
                  fontSize: 12,
                }}
              />
            </div>
          ))}
          <div style={panel}>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                color: '#e2e8f0',
                font: 'inherit',
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              {plan}
            </pre>
            <button
              style={{ ...button, background: 'rgba(249,115,22,.18)', color: '#fdba74' }}
              onClick={() => copy(plan, 'Weekly plan')}
            >
              Copy weekly plan
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p role="status" style={muted}>
          {notice}
        </p>
      )}
    </section>
  );
}
