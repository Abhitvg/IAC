import React, { useState } from 'react';
import type { JavaSandboxResult } from '../../types';

interface JavaSandboxPanelProps {
  sourceCode: string;
}

function statusTone(status: JavaSandboxResult['status']): 'success' | 'warning' | 'neutral' {
  if (status === 'OUTPUT_MATCHED' || status === 'COMPILED' || status === 'EXECUTED') {
    return 'success';
  }
  if (
    status === 'OUTPUT_MISMATCH' ||
    status === 'COMPILE_FAILED' ||
    status === 'RUNTIME_FAILED' ||
    status === 'TIMEOUT'
  ) {
    return 'warning';
  }
  return 'neutral';
}

export function JavaSandboxPanel({ sourceCode }: JavaSandboxPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [stdin, setStdin] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [compareOutput, setCompareOutput] = useState(false);
  const [executeMain, setExecuteMain] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<JavaSandboxResult | null>(null);
  const [localError, setLocalError] = useState('');

  const runSandbox = async () => {
    if (running || !acknowledged) return;
    const run = window.electronAPI?.runJavaSandbox;
    if (!run) {
      setLocalError('The Java sandbox is available only in the installed IAC desktop application.');
      return;
    }

    setRunning(true);
    setResult(null);
    setLocalError('');
    try {
      const response = await run({
        sourceCode,
        stdin,
        expectedOutput: compareOutput ? expectedOutput : undefined,
        executeMain,
      });
      setResult(response);
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : 'The Java sandbox request could not be completed.'
      );
    } finally {
      setRunning(false);
    }
  };

  const tone = result ? statusTone(result.status) : 'neutral';
  const toneColor =
    tone === 'success' ? '#6ee7b7' : tone === 'warning' ? '#fca5a5' : '#cbd5e1';
  const toneBorder =
    tone === 'success'
      ? 'rgba(52, 211, 153, 0.3)'
      : tone === 'warning'
        ? 'rgba(248, 113, 113, 0.35)'
        : 'rgba(148, 163, 184, 0.2)';

  return (
    <section
      aria-label="Java sandbox verification"
      style={{
        marginTop: 14,
        border: '1px solid rgba(96, 165, 250, 0.25)',
        borderRadius: 9,
        background: 'rgba(15, 23, 42, 0.58)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '10px 12px',
          border: 0,
          background: 'transparent',
          color: '#bfdbfe',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <span>Check Java in local sandbox</span>
        <span style={{ color: '#94a3b8', fontSize: 11 }}>{expanded ? 'Hide' : 'Open'}</span>
      </button>

      {expanded && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, color: '#aeb9c8', fontSize: 11, lineHeight: 1.5 }}>
            Manual only. Nothing runs until you acknowledge the warning and press the button. Code is
            sent only to your verified local Docker context; the container has no network or host
            folder mounts. Docker and the host kernel remain part of the security boundary.
          </p>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, color: '#cbd5e1', fontSize: 11 }}>
            Standard input (stdin)
            <textarea
              value={stdin}
              onChange={(event) => {
                setStdin(event.target.value);
                setResult(null);
              }}
              rows={3}
              maxLength={8192}
              placeholder="Enter sample input here (optional)"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                resize: 'vertical',
                borderRadius: 6,
                border: '1px solid rgba(148,163,184,0.25)',
                background: 'rgba(2,6,23,0.75)',
                color: '#e2e8f0',
                padding: 8,
                font: '12px ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#cbd5e1', fontSize: 11 }}>
            <input
              type="checkbox"
              checked={executeMain}
              onChange={(event) => {
                setExecuteMain(event.target.checked);
                setResult(null);
              }}
            />
            Run public static main method after compilation (when present)
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#cbd5e1', fontSize: 11 }}>
            <input
              type="checkbox"
              checked={compareOutput}
              onChange={(event) => {
                setCompareOutput(event.target.checked);
                setResult(null);
              }}
            />
            Compare with expected output
          </label>

          {compareOutput && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, color: '#cbd5e1', fontSize: 11 }}>
              Expected output
              <textarea
                value={expectedOutput}
                onChange={(event) => {
                  setExpectedOutput(event.target.value);
                  setResult(null);
                }}
                rows={3}
                maxLength={8192}
                placeholder="Paste the expected output"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  borderRadius: 6,
                  border: '1px solid rgba(148,163,184,0.25)',
                  background: 'rgba(2,6,23,0.75)',
                  color: '#e2e8f0',
                  padding: 8,
                  font: '12px ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              />
            </label>
          )}

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 7, color: '#fcd34d', fontSize: 11, lineHeight: 1.45 }}>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              style={{ marginTop: 1 }}
            />
            I understand this executes generated code in a restricted local container. I will not
            submit secrets or code I do not trust.
          </label>

          <button
            type="button"
            disabled={running || !acknowledged}
            onClick={() => void runSandbox()}
            style={{
              alignSelf: 'flex-start',
              border: 0,
              borderRadius: 6,
              padding: '8px 12px',
              background: running || !acknowledged ? '#334155' : '#1d4ed8',
              color: '#fff',
              cursor: running || !acknowledged ? 'not-allowed' : 'pointer',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {running ? 'Compiling / running…' : 'Compile / run Java'}
          </button>

          {localError && (
            <div role="alert" style={{ color: '#fca5a5', fontSize: 11 }}>
              {localError}
            </div>
          )}

          {result && (
            <div
              role="status"
              aria-live="polite"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
                padding: 9,
                borderRadius: 7,
                border: '1px solid ' + toneBorder,
                background: 'rgba(2,6,23,0.65)',
                color: toneColor,
                fontSize: 11,
                lineHeight: 1.5,
              }}
            >
              <strong>{result.status.replace(/_/g, ' ')}</strong>
              <span>{result.message}</span>
              <span style={{ color: '#94a3b8' }}>Elapsed: {result.durationMs} ms</span>
              {result.setupCommand && (
                <>
                  <span style={{ color: '#cbd5e1' }}>
                    Run this command once to install the pinned image:
                  </span>
                  <code
                    style={{
                      display: 'block',
                      overflowWrap: 'anywhere',
                      padding: 7,
                      borderRadius: 5,
                      background: 'rgba(15,23,42,0.9)',
                      color: '#e2e8f0',
                    }}
                  >
                    {result.setupCommand}
                  </code>
                </>
              )}
              {result.stdout && (
                <div>
                  <strong style={{ color: '#cbd5e1' }}>Program output</strong>
                  <pre
                    style={{
                      margin: '4px 0 0',
                      maxHeight: 160,
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      color: '#e2e8f0',
                    }}
                  >
                    {result.stdout}
                  </pre>
                </div>
              )}
              {result.stderr && (
                <div>
                  <strong style={{ color: '#cbd5e1' }}>Compiler / runtime diagnostics</strong>
                  <pre
                    style={{
                      margin: '4px 0 0',
                      maxHeight: 160,
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      color: '#fca5a5',
                    }}
                  >
                    {result.stderr}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
