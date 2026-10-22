import React, { useState } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import {
  FeedbackImporter,
  redactFeedbackText,
} from '../../services/practice/feedback/FeedbackImporter';
import { FeedbackRecord, FeedbackWeakness } from '../../services/practice/types';
import { LLMManager } from '../../services/providers/LLMProvider';
import { Shield, CheckCircle, AlertTriangle, Trash2, Plus, History } from 'lucide-react';

export const FeedbackImportView: React.FC = () => {
  const { feedbackRecords, addFeedbackRecord, deleteFeedbackRecord } = usePracticeStore();

  // Form inputs
  const [rawText, setRawText] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [roundType, setRoundType] = useState('Technical Interview');
  const [customNamesInput, setCustomNamesInput] = useState('');
  const [useHeuristicOnly, setUseHeuristicOnly] = useState(false);

  // Stepper state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [confirmedSend, setConfirmedSend] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Staged extracted record for editing prior to saving
  const [stagedRecord, setStagedRecord] = useState<FeedbackRecord | null>(null);

  // Computed live redaction preview
  const customNames = customNamesInput
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const redactedPreview = rawText ? redactFeedbackText(rawText, customNames) : '';

  const handleStartAnalysis = async () => {
    if (!rawText.trim()) {
      setErrorBanner('Please paste interview feedback or rejection notes before analyzing.');
      return;
    }
    if (!confirmedSend) {
      setErrorBanner('You must confirm the redacted text preview before transmitting data.');
      return;
    }

    setIsAnalyzing(true);
    setErrorBanner(null);
    setSuccessBanner(null);

    try {
      const llmManager = new LLMManager();
      const record = await FeedbackImporter.importFeedback({
        rawText,
        customNames,
        confirmed: true,
        useHeuristic: useHeuristicOnly,
        metadata: {
          company: company.trim() || 'Anonymous Employer',
          role: role.trim() || 'Software Engineer',
          roundType,
        },
        llmManager,
      });

      setStagedRecord(record);
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to analyze feedback.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveStaged = () => {
    if (!stagedRecord) return;
    const res = addFeedbackRecord(stagedRecord);
    if (!res.success && res.duplicate) {
      setErrorBanner(
        'This feedback report has already been imported (duplicate content detected).'
      );
      return;
    }

    setSuccessBanner(`Feedback report for ${stagedRecord.company} successfully saved!`);
    setStagedRecord(null);
    setRawText('');
    setCompany('');
    setRole('');
    setConfirmedSend(false);
  };

  const handleDeleteWeakness = (idx: number) => {
    if (!stagedRecord) return;
    const updated = stagedRecord.weaknesses.filter((_, i) => i !== idx);
    setStagedRecord({ ...stagedRecord, weaknesses: updated });
  };

  const handleDeleteStrength = (idx: number) => {
    if (!stagedRecord) return;
    const updated = stagedRecord.strengths.filter((_, i) => i !== idx);
    setStagedRecord({ ...stagedRecord, strengths: updated });
  };

  const handleAddWeakness = () => {
    if (!stagedRecord) return;
    const newWeakness: FeedbackWeakness = {
      topic: 'General Topic',
      skill: 'structure',
      severity: 1,
      evidence: stagedRecord.redactedText.slice(0, 40) || 'Manual note',
      requestedFix: 'Add clear signposting and examples',
    };
    setStagedRecord({ ...stagedRecord, weaknesses: [...stagedRecord.weaknesses, newWeakness] });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          Import Employer Feedback &amp; Rejection Notes
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Paste real recruiter or interviewer debriefs. Sensitive contacts are redacted locally
          before LLM extraction structures them into actionable coaching targets.
        </p>
      </div>

      {errorBanner && (
        <div
          role="alert"
          className="p-3 bg-rose-950/80 border border-rose-500/50 rounded-xl text-rose-200 text-xs font-semibold flex items-center gap-2"
        >
          <AlertTriangle size={15} />
          <span>{errorBanner}</span>
        </div>
      )}

      {successBanner && (
        <div
          role="status"
          className="p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-200 text-xs font-semibold flex items-center gap-2"
        >
          <CheckCircle size={15} />
          <span>{successBanner}</span>
        </div>
      )}

      {/* Main Workspace Grid: Paste Box & Redaction Preview */}
      {!stagedRecord ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Input Form */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              1. Paste Raw Interview Feedback
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label htmlFor="company-name-fb" className="text-slate-400 block mb-1">
                  Company / Team
                </label>
                <input
                  id="company-name-fb"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Stripe, Uber, Airbnb"
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div>
                <label htmlFor="role-name-fb" className="text-slate-400 block mb-1">
                  Target Role
                </label>
                <input
                  id="role-name-fb"
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Senior Backend Engineer"
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>
            </div>

            <div className="text-xs">
              <label htmlFor="round-type-fb" className="text-slate-400 block mb-1">
                Round Type
              </label>
              <select
                id="round-type-fb"
                value={roundType}
                onChange={(e) => setRoundType(e.target.value)}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs"
              >
                <option value="Technical Interview">Technical Interview</option>
                <option value="System Design">System Design</option>
                <option value="Coding & DSA">Coding &amp; DSA</option>
                <option value="Behavioral & Leadership">Behavioral &amp; Leadership</option>
              </select>
            </div>

            <div className="text-xs">
              <label htmlFor="custom-names-fb" className="text-slate-400 block mb-1">
                Interviewer / Recruiter Names to Redact (comma-separated)
              </label>
              <input
                id="custom-names-fb"
                type="text"
                value={customNamesInput}
                onChange={(e) => setCustomNamesInput(e.target.value)}
                placeholder="e.g. John Doe, Alex Smith"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs"
              />
            </div>

            <div className="text-xs">
              <label htmlFor="raw-feedback-textarea" className="text-slate-400 block mb-1">
                Pasted Feedback Text
              </label>
              <textarea
                id="raw-feedback-textarea"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={8}
                placeholder="Paste the email or debrief notes here..."
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs leading-relaxed"
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-300">
              <input
                id="heuristic-only-toggle"
                type="checkbox"
                checked={useHeuristicOnly}
                onChange={(e) => setUseHeuristicOnly(e.target.checked)}
                className="rounded bg-slate-950 border-slate-700 text-indigo-600"
              />
              <label htmlFor="heuristic-only-toggle" className="cursor-pointer">
                Process 100% locally with heuristic sentence splitter (zero network call)
              </label>
            </div>
          </div>

          {/* Right Column: Live Redaction Preview & Explicit Confirmation */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Shield size={14} />
                  2. Local Redaction Preview
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">
                  {rawText.length > 0 ? `${redactedPreview.length} chars` : 'Waiting for input'}
                </span>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Review exactly what will be analyzed. Emails, phone numbers, URLs, and requested
                names are replaced with tokens locally before processing.
              </p>

              <div
                tabIndex={0}
                aria-label="Redacted text preview container"
                className="w-full h-56 p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 font-mono text-xs overflow-y-auto whitespace-pre-wrap leading-relaxed select-text"
              >
                {redactedPreview ? (
                  redactedPreview
                ) : (
                  <span className="text-slate-600 italic">
                    Paste feedback on the left to see the live redacted output here...
                  </span>
                )}
              </div>
            </div>

            {/* Explicit Confirmation Checkbox & Trigger */}
            <div className="pt-3 border-t border-slate-800 space-y-3">
              <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmedSend}
                  onChange={(e) => setConfirmedSend(e.target.checked)}
                  disabled={!rawText.trim()}
                  className="mt-0.5 rounded bg-slate-950 border-slate-700 text-indigo-600"
                />
                <span className="leading-snug">
                  I have reviewed the redacted preview above and confirm sending this text for
                  weakness extraction.
                </span>
              </label>

              <button
                type="button"
                onClick={handleStartAnalysis}
                disabled={!confirmedSend || isAnalyzing || !rawText.trim()}
                className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-lg transition flex items-center justify-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Analyzing Feedback &amp; Extracting Weaknesses...</span>
                  </>
                ) : (
                  <span>Send to Analysis &amp; Structure Weaknesses →</span>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Staged Results Review & Inline Editor */
        <div className="p-6 bg-slate-900 border border-indigo-500/30 rounded-2xl space-y-5">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <span className="text-xs uppercase font-extrabold tracking-widest text-indigo-400">
                Extraction Review
              </span>
              <h3 className="text-lg font-black text-white mt-0.5">
                {stagedRecord.company} — {stagedRecord.role}
              </h3>
              {stagedRecord.isEstimated && (
                <span className="inline-block mt-1 px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[10px] font-bold">
                  Estimated via Heuristic Splitter
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStagedRecord(null)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Cancel &amp; Discard
              </button>
              <button
                type="button"
                onClick={handleSaveStaged}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow"
              >
                ✓ Save to Feedback Records
              </button>
            </div>
          </div>

          {/* Weaknesses List */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold uppercase text-rose-400">
                Extracted Weaknesses ({stagedRecord.weaknesses.length})
              </h4>
              <button
                type="button"
                onClick={handleAddWeakness}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold"
              >
                <Plus size={12} /> Add Weakness
              </button>
            </div>

            {stagedRecord.weaknesses.map((w, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex flex-col md:flex-row justify-between gap-3"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{w.topic}</span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      Skill: {w.skill}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        w.severity === 3
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : w.severity === 2
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                      }`}
                    >
                      Severity {w.severity} (
                      {w.severity === 3 ? 'Critical' : w.severity === 2 ? 'Notable' : 'Polish'})
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 italic">"{w.evidence}"</p>
                  <p className="text-xs text-emerald-400">Fix: {w.requestedFix}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteWeakness(idx)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition"
                    aria-label={`Delete weakness ${w.topic}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Strengths List */}
          <div className="space-y-3 pt-3 border-t border-slate-800">
            <h4 className="text-xs font-bold uppercase text-emerald-400">
              Extracted Strengths ({stagedRecord.strengths.length})
            </h4>

            {stagedRecord.strengths.map((s, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex justify-between items-center"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{s.topic}</span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {s.skill}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 italic mt-0.5">"{s.evidence}"</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteStrength(idx)}
                  className="p-1.5 text-slate-500 hover:text-rose-400 transition"
                  aria-label={`Delete strength ${s.topic}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History of Past Imported Feedback */}
      <div className="space-y-4 pt-4 border-t border-slate-800">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <History size={16} className="text-indigo-400" />
          <span>Imported Feedback History ({feedbackRecords.length})</span>
        </div>

        {feedbackRecords.length === 0 ? (
          <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center text-xs text-slate-500">
            No feedback reports imported yet. Paste your first debrief above to start tracking real
            interviewer gaps.
          </div>
        ) : (
          <div className="space-y-3">
            {feedbackRecords.map((item) => (
              <div
                key={item.id}
                className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col md:flex-row justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{item.company}</span>
                    <span className="text-xs text-slate-400">({item.role})</span>
                    <span className="text-[10px] text-slate-500 font-mono">{item.date}</span>
                    {item.isEstimated && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Estimated
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs pt-1">
                    <span className="text-rose-400 font-semibold">
                      {item.weaknesses.length} Weakness{item.weaknesses.length !== 1 ? 'es' : ''}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-emerald-400 font-semibold">
                      {item.strengths.length} Strength{item.strengths.length !== 1 ? 's' : ''}
                    </span>
                    {item.overallTone && (
                      <>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-400">{item.overallTone}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => deleteFeedbackRecord(item.id)}
                    className="p-2 text-slate-500 hover:text-rose-400 transition"
                    aria-label={`Delete record for ${item.company}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
