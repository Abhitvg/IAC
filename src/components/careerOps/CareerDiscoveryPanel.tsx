import React, { useState } from 'react';
import { AlertCircle, Briefcase, Clock3, Plus, Radar, RefreshCw, Trash2 } from 'lucide-react';
import { useCareerOpsStore } from '../../store/useCareerOpsStore';
import type { ProviderConfig } from '../../services/careerOps/careerOpsService';

interface CareerDiscoveryPanelProps {
  resumeText: string;
  providerConfig?: ProviderConfig;
}

export function CareerDiscoveryPanel({ resumeText, providerConfig }: CareerDiscoveryPanelProps) {
  const {
    sources,
    applications,
    isDiscovering,
    lastDiscoveryAt,
    addSource,
    updateSource,
    removeSource,
    discoverJobsFromSources,
  } = useCareerOpsStore();

  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [keywords, setKeywords] = useState('');
  const [autoEvaluate, setAutoEvaluate] = useState(false);
  const [message, setMessage] = useState('');
  const [lastResult, setLastResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const handleAddSource = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      addSource({
        label,
        url,
        keywords: keywords
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        autoEvaluate,
      });
      setLabel('');
      setUrl('');
      setKeywords('');
      setAutoEvaluate(false);
      setMessage('Career page added. It will be scanned while CareerOps is open.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not add this career page.');
    }
  };

  const handleScan = async () => {
    setMessage('');
    try {
      const result = await discoverJobsFromSources(resumeText, providerConfig);
      setLastResult(result);
      setMessage(
        `Scan complete: ${result.imported} new jobs imported, ${result.skipped} duplicates or keyword mismatches skipped.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Career page scan failed.');
    }
  };

  const discoveredApplications = applications.filter((application) =>
    application.notes?.startsWith('Discovered from ')
  );

  const panelStyle: React.CSSProperties = {
    background: 'rgba(15, 23, 42, 0.72)',
    border: '1px solid rgba(255, 255, 255, 0.09)',
    borderRadius: 12,
    padding: 16,
  };

  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    padding: '8px 12px',
    color: '#f8fafc',
    background: 'rgba(255,255,255,0.07)',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        maxWidth: 1100,
        margin: '0 auto',
      }}
    >
      <div style={{ ...panelStyle, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          style={{
            padding: 10,
            borderRadius: 10,
            background: 'rgba(249,115,22,0.14)',
            color: '#fb923c',
          }}
        >
          <Radar size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 16, fontWeight: 800 }}>
            Job Discovery Automation
          </h3>
          <p style={{ margin: '5px 0 0', color: '#94a3b8', fontSize: 12, lineHeight: 1.6 }}>
            Add public company career pages or ATS boards. CareerOps checks enabled sources every 12
            hours while CareerOps is open, imports new postings, and deduplicates by URL. You can
            opt into automatic evaluation; applications are never submitted automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={handleScan}
          disabled={isDiscovering || sources.every((source) => !source.enabled)}
          style={{
            ...buttonStyle,
            background: 'linear-gradient(135deg,#f97316,#ea580c)',
            border: 0,
            opacity: isDiscovering ? 0.6 : 1,
          }}
        >
          <RefreshCw size={13} className={isDiscovering ? 'animate-spin' : undefined} />
          {isDiscovering ? 'Scanning…' : 'Scan now'}
        </button>
      </div>

      <form
        onSubmit={handleAddSource}
        style={{
          ...panelStyle,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10,
        }}
      >
        <div>
          <label
            htmlFor="career-source-label"
            style={{
              display: 'block',
              color: '#94a3b8',
              fontSize: 10,
              fontWeight: 800,
              marginBottom: 5,
            }}
          >
            SOURCE NAME
          </label>
          <input
            id="career-source-label"
            required
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="e.g. Anthropic Careers"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '9px 10px',
              borderRadius: 7,
              background: '#0b1220',
              color: '#f8fafc',
              border: '1px solid rgba(255,255,255,0.13)',
              fontSize: 12,
            }}
          />
        </div>
        <div>
          <label
            htmlFor="career-source-url"
            style={{
              display: 'block',
              color: '#94a3b8',
              fontSize: 10,
              fontWeight: 800,
              marginBottom: 5,
            }}
          >
            PUBLIC CAREER PAGE URL (HTTPS)
          </label>
          <input
            id="career-source-url"
            type="url"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://jobs.ashbyhq.com/company"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '9px 10px',
              borderRadius: 7,
              background: '#0b1220',
              color: '#f8fafc',
              border: '1px solid rgba(255,255,255,0.13)',
              fontSize: 12,
            }}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label
            htmlFor="career-source-keywords"
            style={{
              display: 'block',
              color: '#94a3b8',
              fontSize: 10,
              fontWeight: 800,
              marginBottom: 5,
            }}
          >
            OPTIONAL KEYWORDS (COMMA SEPARATED)
          </label>
          <input
            id="career-source-keywords"
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            placeholder="software engineer, AI, full stack, DevOps"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '9px 10px',
              borderRadius: 7,
              background: '#0b1220',
              color: '#f8fafc',
              border: '1px solid rgba(255,255,255,0.13)',
              fontSize: 12,
            }}
          />
        </div>
        <label
          style={{
            gridColumn: '1 / -1',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: '#cbd5e1',
            fontSize: 11,
          }}
        >
          <input
            type="checkbox"
            checked={autoEvaluate}
            onChange={(event) => setAutoEvaluate(event.target.checked)}
          />
          Automatically evaluate newly imported jobs against my loaded resume
        </label>
        <p
          style={{
            gridColumn: '1 / -1',
            margin: '-4px 0 0 24px',
            color: '#64748b',
            fontSize: 10,
            lineHeight: 1.5,
          }}
        >
          When enabled, the job description and loaded resume are evaluated locally or sent to your
          configured AI provider. Review every result; keyword-only scores are marked as
          preliminary.
        </p>
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            style={{
              ...buttonStyle,
              background: 'rgba(249,115,22,0.16)',
              color: '#fdba74',
              borderColor: 'rgba(249,115,22,0.35)',
            }}
          >
            <Plus size={13} /> Add career page
          </button>
        </div>
      </form>

      {message && (
        <div
          role="status"
          style={{ ...panelStyle, padding: '10px 12px', color: '#cbd5e1', fontSize: 12 }}
        >
          {message}
          {lastResult?.errors.length ? (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: '#fca5a5' }}>
              {lastResult.errors.slice(0, 3).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <div style={panelStyle}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 10,
          }}
        >
          <h4 style={{ margin: 0, color: '#f8fafc', fontSize: 13, fontWeight: 800 }}>
            Configured sources ({sources.length})
          </h4>
          <span style={{ color: '#64748b', fontSize: 10 }}>
            {lastDiscoveryAt
              ? `Last scan finished ${new Date(lastDiscoveryAt).toLocaleString()}`
              : 'No scan completed in this session'}
          </span>
        </div>
        {sources.length === 0 ? (
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>
            No sources yet. Add a company careers page to start discovery.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sources.map((source) => (
              <div
                key={source.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: 10,
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.035)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <Briefcase size={15} color="#fb923c" />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: '#f8fafc', fontSize: 12, fontWeight: 700 }}>
                    {source.label}
                  </div>
                  <div style={{ color: '#64748b', fontSize: 10, overflowWrap: 'anywhere' }}>
                    {source.url}
                  </div>
                  <div
                    style={{
                      color: source.lastError ? '#fca5a5' : '#64748b',
                      fontSize: 10,
                      marginTop: 3,
                    }}
                  >
                    {source.lastError ||
                      (source.lastCheckedAt
                        ? `Checked ${new Date(source.lastCheckedAt).toLocaleString()}`
                        : 'Not scanned yet')}
                  </div>
                </div>
                <label
                  title="Automatically score new postings from this source"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    color: '#94a3b8',
                    fontSize: 9,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={source.autoEvaluate}
                    onChange={(event) =>
                      updateSource(source.id, { autoEvaluate: event.target.checked })
                    }
                  />
                  Auto-evaluate
                </label>
                <button
                  type="button"
                  onClick={() => updateSource(source.id, { enabled: !source.enabled })}
                  style={{
                    ...buttonStyle,
                    padding: '5px 8px',
                    color: source.enabled ? '#86efac' : '#94a3b8',
                  }}
                >
                  {source.enabled ? 'Enabled' : 'Paused'}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${source.label}`}
                  onClick={() => removeSource(source.id)}
                  style={{ ...buttonStyle, padding: 6, color: '#fca5a5' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={panelStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
          <Clock3 size={14} color="#60a5fa" />
          <h4 style={{ margin: 0, color: '#f8fafc', fontSize: 13, fontWeight: 800 }}>
            Recently discovered ({discoveredApplications.length})
          </h4>
        </div>
        {discoveredApplications.length === 0 ? (
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>
            New postings imported from configured sources will appear here and in the main pipeline.
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))',
              gap: 8,
            }}
          >
            {discoveredApplications.slice(0, 12).map((job) => (
              <div
                key={job.id}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.035)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ color: '#f8fafc', fontSize: 12, fontWeight: 700 }}>{job.role}</div>
                <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 3 }}>
                  {job.company} · {job.location || 'Location not specified'}
                </div>
                {job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-block',
                      marginTop: 6,
                      color: '#fdba74',
                      fontSize: 10,
                    }}
                  >
                    Open original posting ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
          color: '#94a3b8',
          fontSize: 10,
          lineHeight: 1.5,
        }}
      >
        <AlertCircle size={13} color="#fbbf24" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Discovery is best-effort: some sites block automated requests or render job listings only
          with JavaScript. Login-protected pages are not bypassed. Verify each imported posting and
          its eligibility details before evaluating or applying.
        </span>
      </div>
    </div>
  );
}
