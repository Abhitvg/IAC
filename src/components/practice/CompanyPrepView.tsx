import React, { useState } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import { useAppStore } from '../../store/useAppStore';

export const CompanyPrepView: React.FC = () => {
  const {
    companyPlans,
    activeCompanyPlan,
    createCompanyPlan,
    toggleDrillCompleted,
    addCompanyNote,
  } = usePracticeStore();
  const { resumeText } = useAppStore();

  const [companyName, setCompanyName] = useState('');
  const [role, setRole] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [durationDays, setDurationDays] = useState<7 | 14>(7);
  const [showCreator, setShowCreator] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [roundName, setRoundName] = useState('Round 1: Technical Screen');
  const [formError, setFormError] = useState<string | null>(null);

  const currentPlan = activeCompanyPlan || companyPlans[0];

  const handleCreate = () => {
    if (!companyName.trim()) {
      setFormError('Please provide a company name.');
      return;
    }
    if (!jobDescription.trim()) {
      setFormError('Please paste the job description.');
      return;
    }
    setFormError(null);
    createCompanyPlan(companyName, role, jobDescription, resumeText || '', durationDays);
    setShowCreator(false);
    setCompanyName('');
    setJobDescription('');
  };

  const handleAddNote = () => {
    if (!currentPlan || !newNote.trim()) return;
    addCompanyNote(currentPlan.companyName, roundName, newNote);
    setNewNote('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Company-Specific Preparation & Round Notes
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Paste a Job Description to generate a tailored 7- or 14-day study plan, gap analysis,
            and persist feedback across rounds.
          </p>
        </div>
        <button
          onClick={() => setShowCreator(!showCreator)}
          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition"
        >
          + Prepare for New Company
        </button>
      </div>

      {/* Plan Creator Form */}
      {showCreator && (
        <div className="p-5 bg-slate-900 border border-indigo-500/30 rounded-2xl space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
            Target Company & Job Description Parser
          </h3>
          {formError && (
            <div
              role="alert"
              className="p-2 rounded bg-rose-950/80 border border-rose-500/50 text-rose-300 text-xs font-medium"
            >
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <label htmlFor="company-name-input" className="text-slate-400 block mb-1">
                Company Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                id="company-name-input"
                aria-label="Company Name"
                placeholder="e.g. Stripe, Google, Meta, Datadog"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
              />
            </div>
            <div>
              <label htmlFor="company-role-input" className="text-slate-400 block mb-1">
                Target Role / Seniority
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                id="company-role-input"
                aria-label="Target Role / Seniority"
                placeholder="e.g. Senior Backend Engineer"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
              />
            </div>
          </div>

          <div className="text-xs">
            <label htmlFor="company-jd-textarea" className="text-slate-400 block mb-1">
              Paste Job Description (JD)
            </label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              id="company-jd-textarea"
              aria-label="Job Description"
              placeholder="Paste requirements, stack, and responsibilities here..."
              className="w-full h-28 p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono text-xs"
            />
          </div>

          <div className="flex justify-between items-center pt-2">
            <div className="flex gap-2 items-center text-xs text-slate-300">
              <span>Roadmap Length:</span>
              <button
                type="button"
                onClick={() => setDurationDays(7)}
                className={`px-3 py-1 rounded text-xs font-bold border ${
                  durationDays === 7
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setDurationDays(14)}
                className={`px-3 py-1 rounded text-xs font-bold border ${
                  durationDays === 14
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                14 Days
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowCreator(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow"
              >
                Generate Tailored Roadmap
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Plan Overview */}
      {currentPlan ? (
        <div className="space-y-6">
          {/* Top Card: Company Summary & Themes */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs uppercase font-bold text-indigo-400">
                  Target Company Strategy
                </span>
                <h3 className="text-2xl font-extrabold text-white mt-0.5">
                  {currentPlan.companyName}
                </h3>
                <span className="text-xs text-slate-400">
                  {currentPlan.seniority} {currentPlan.targetRole} • {currentPlan.durationDays}-Day
                  Preparation Plan
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-w-sm justify-end">
                {currentPlan.extractedStack.map((tech) => (
                  <span
                    key={tech}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>

            {/* Likely Themes */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80">
              <span className="text-xs font-bold text-slate-300 block mb-1.5">
                Likely Interview Themes for {currentPlan.companyName}:
              </span>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs text-slate-300">
                {currentPlan.likelyRoundThemes.map((theme, i) => (
                  <li key={i} className="flex gap-2 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                    <span>{theme}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resume Gap Analysis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl space-y-1">
                <span className="font-bold text-emerald-400">Matched Strengths:</span>
                <p className="text-emerald-200">
                  {currentPlan.resumeGapAnalysis.matchedStrengths.join(', ') ||
                    'General software engineering fundamentals'}
                </p>
              </div>
              <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded-xl space-y-1">
                <span className="font-bold text-rose-400">JD Skills to Highlight / Study:</span>
                <p className="text-rose-200">
                  {currentPlan.resumeGapAnalysis.missingCompetencies.join(', ') || 'None flagged'}
                </p>
              </div>
            </div>
          </div>

          {/* Daily Drills Roadmap */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-300">
              {currentPlan.durationDays}-Day Structured Roadmap
            </h3>
            <div className="space-y-2">
              {currentPlan.dailyDrills.map((drill) => (
                <div
                  key={drill.day}
                  className={`p-3.5 rounded-xl border flex items-center justify-between transition ${
                    drill.completed
                      ? 'bg-slate-900/40 border-slate-800/50 text-slate-500'
                      : 'bg-slate-900 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={drill.completed}
                      onChange={() => toggleDrillCompleted(0, drill.day)}
                      className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-700"
                    />
                    <div>
                      <div className="flex gap-2 items-center">
                        <span className="text-xs font-bold text-indigo-400">Day {drill.day}:</span>
                        <span
                          className={`text-xs font-bold ${drill.completed ? 'line-through text-slate-500' : 'text-white'}`}
                        >
                          {drill.title}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          {drill.focusCategory}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">{drill.targetExercise}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Round Notes & Continuity */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-white">Round-to-Round Continuity Notes</h3>
                <p className="text-[11px] text-slate-400">
                  Record feedback and weak spots from Round 1 so Round 2 preparation builds directly
                  on what happened.
                </p>
              </div>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {currentPlan.persistentNotes.map((note, i) => (
                <div
                  key={i}
                  className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-300 font-mono"
                >
                  {note}
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <input
                type="text"
                value={roundName}
                onChange={(e) => setRoundName(e.target.value)}
                placeholder="Round Name (e.g. Round 2: System Design)"
                className="w-1/3 p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
              />
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="What did they drill into? (e.g. Invalidation edge cases, trade-offs)"
                className="flex-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
              />
              <button
                onClick={handleAddNote}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg"
              >
                Add Note
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-indigo-950/20 border border-slate-800/80 rounded-3xl text-center flex flex-col items-center justify-center space-y-4 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-3xl">
            🏢
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">No Company Roadmap Created Yet</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Targeting a specific tier-1 company? Paste their job description to generate a
              tailored 7- or 14-day study plan with specific tech stack drill lists and cross-round
              notes.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-1 max-w-lg">
            {['Google L5', 'Meta E5', 'Amazon SDE II', 'Stripe L3', 'Uber SSE'].map((co) => (
              <button
                key={co}
                type="button"
                onClick={() => {
                  setCompanyName(co.split(' ')[0]);
                  setRole(co);
                  setShowCreator(true);
                }}
                className="px-3 py-1 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 text-indigo-300 rounded-lg text-xs font-semibold transition"
              >
                + {co} Blueprint
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowCreator(true)}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition active:scale-[0.98]"
          >
            + Create New Company Roadmap
          </button>
        </div>
      )}
    </div>
  );
};
