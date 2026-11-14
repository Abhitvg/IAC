import React from 'react';
import {
  BookOpen,
  Code2,
  Server,
  Layers,
  Cpu,
  Database,
  Cloud,
  FileCheck2,
  Sparkles,
  Search,
  Download,
  Upload,
  RotateCcw,
  Trash2,
  Archive,
  CheckCircle2,
  Tag,
  ShieldCheck,
} from 'lucide-react';
import { PageHeader, Card, StatusBadge, EmptyState } from '../design-system/components';
import { CandidateKnowledgeBase } from '../services/candidateIntelligence';
import { KnowledgeVaultService } from '../services/knowledgeVault';
import { CandidateRagService, RagCategory, RagChunk, RagBackupManifest, RagRetrievalResult } from '../services/rag';
import { useAppStore } from '../store/useAppStore';

export const KnowledgeBaseScreen: React.FC = () => {
  const { resumeText, setResumeModalOpen, setToast } = useAppStore();
  const kb = React.useMemo(() => {
    return CandidateKnowledgeBase.getActiveKnowledgeBase(resumeText || '');
  }, [resumeText]);

  const [activeDomain, setActiveDomain] = React.useState<'candidate' | 'technical' | 'rag'>('rag');
  const [vault, setVault] = React.useState(() => KnowledgeVaultService.getInstance().getVault());

  // RAG State
  const ragService = React.useMemo(() => CandidateRagService.getInstance(), []);
  const [ragSearchQuery, setRagSearchQuery] = React.useState('');
  const [ragCategoryFilter, setRagCategoryFilter] = React.useState<RagCategory | 'all'>('all');
  const [chunks, setChunks] = React.useState<RagChunk[]>(() => ragService.getAllChunks());
  const [backups, setBackups] = React.useState<RagBackupManifest[]>(() => ragService.listBackups());
  const [retrievalResults, setRetrievalResults] = React.useState<RagRetrievalResult[]>([]);
  const [customBackupLabel, setCustomBackupLabel] = React.useState('');
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const unsubVault = KnowledgeVaultService.getInstance().subscribe((v) => setVault(v));
    const unsubRag = ragService.subscribe(() => {
      setChunks(ragService.getAllChunks());
      setBackups(ragService.listBackups());
    });
    return () => {
      unsubVault();
      unsubRag();
    };
  }, [ragService]);

  // Live RAG Semantic Search
  React.useEffect(() => {
    const q = ragSearchQuery.trim();
    if (q.length > 1) {
      const results = ragService.retrieve(q, {
        topK: 6,
        category: ragCategoryFilter === 'all' ? undefined : ragCategoryFilter,
        minScore: 0.08,
      });
      setRetrievalResults(results);
    } else {
      setRetrievalResults([]);
    }
  }, [ragSearchQuery, ragCategoryFilter, ragService, chunks]);

  const projects = kb.getAllProjects();
  const vaultProjects = vault.projects;

  const handleCreateBackup = () => {
    const label = customBackupLabel.trim() || `Manual Snapshot ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const snapshot = ragService.createBackup(label);
    setCustomBackupLabel('');
    setToast?.(`📦 Backup created: "${snapshot.label}" (${snapshot.totalChunks} chunks)`);
  };

  const handleRestoreBackup = (id: string, label: string) => {
    const ok = window.confirm(`Restore knowledge base from backup: "${label}"?`);
    if (ok) {
      const success = ragService.restoreBackup(id);
      if (success) {
        setToast?.(`✅ Successfully restored: "${label}"`);
      } else {
        setToast?.(`❌ Failed to restore backup "${label}"`);
      }
    }
  };

  const handleDeleteBackup = (id: string, label: string) => {
    const ok = window.confirm(`Delete backup: "${label}"?`);
    if (ok) {
      ragService.deleteBackup(id);
      setToast?.(`🗑️ Deleted backup snapshot: "${label}"`);
    }
  };

  const handleExportBackup = (id?: string) => {
    const jsonStr = ragService.exportBackupJson(id);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candidate-rag-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setToast?.('💾 Backup file exported successfully');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const success = ragService.importBackupJson(text);
        if (success) {
          setToast?.('📥 External backup imported and verified successfully!');
        } else {
          setToast?.('❌ Invalid backup JSON schema.');
        }
      } catch (_err) {
        setToast?.('❌ Error reading backup JSON file.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleResetToBaseline = () => {
    const ok = window.confirm('Reset RAG knowledge to verified candidate baseline (Sheetal Electrotech, UKCOP, Bakraw, Porcupine, NCERT Virasat)?');
    if (ok) {
      ragService.seedInitialKnowledge();
      setToast?.('⚡ RAG vault re-seeded with verified candidate baseline');
    }
  };

  const filteredChunks = chunks.filter((c) => {
    if (ragCategoryFilter !== 'all' && c.category !== ragCategoryFilter) return false;
    return true;
  });

  // Technical knowledge topics (General computer science / architecture)
  const technicalTopics = [
    {
      category: 'System Design & Distributed Systems',
      topics: [
        { name: 'CAP Theorem & PACELC', desc: 'Consistency vs Availability tradeoffs across network partitions.' },
        { name: 'Event-Driven Architectures', desc: 'Decoupled pub-sub queues (Kafka, RabbitMQ) and at-least-once delivery semantics.' },
        { name: 'Caching Strategies', desc: 'Cache-Aside, Write-Through, Write-Behind, and eviction algorithms (LRU, LFU).' },
      ],
    },
    {
      category: 'Databases & Storage',
      topics: [
        { name: 'ACID vs BASE Transactions', desc: 'Two-phase commit, isolation levels (Repeatable Read, Serializable).' },
        { name: 'Database Indexing & B-Trees', desc: 'Composite indexes, selectivity, and query execution planning.' },
        { name: 'Sharding & Partitioning', desc: 'Consistent hashing, range-based partitioning, and rebalancing.' },
      ],
    },
    {
      category: 'Cloud & Infrastructure',
      topics: [
        { name: 'Container Orchestration & Kubernetes', desc: 'Deployments, ingress, service discovery, and rolling updates.' },
        { name: 'Resilience Patterns', desc: 'Circuit breakers, exponential backoff, rate limiting, and bulkhead isolation.' },
      ],
    },
  ];

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1240px', margin: '0 auto' }}>
      <PageHeader
        title="Knowledge Base & RAG Vault"
        description="Candidate evidence, verified project provenance, and vector-indexed backup recovery system."
        badge={
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '6px',
              background: 'rgba(56, 189, 248, 0.12)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              fontWeight: 600,
            }}
          >
            ⚡ RAG Retrieval & Backups Active
          </span>
        }
      />

      {/* Domain Switcher */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setActiveDomain('rag')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            background: activeDomain === 'rag' ? '#38bdf8' : '#171B24',
            color: activeDomain === 'rag' ? '#0f172a' : '#9299AA',
            border: activeDomain === 'rag' ? '1px solid #38bdf8' : '1px solid #292E3A',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          <Database size={15} /> ⚡ RAG Vault & Backups ({chunks.length} Chunks)
        </button>

        <button
          type="button"
          onClick={() => setActiveDomain('candidate')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            background: activeDomain === 'candidate' ? '#8B7CFF' : '#171B24',
            color: activeDomain === 'candidate' ? '#F3F4F8' : '#9299AA',
            border: activeDomain === 'candidate' ? '1px solid #8B7CFF' : '1px solid #292E3A',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          <Layers size={15} /> Domain A: Candidate Experience & Evidence
        </button>

        <button
          type="button"
          onClick={() => setActiveDomain('technical')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            background: activeDomain === 'technical' ? '#8B7CFF' : '#171B24',
            color: activeDomain === 'technical' ? '#F3F4F8' : '#9299AA',
            border: activeDomain === 'technical' ? '1px solid #8B7CFF' : '1px solid #292E3A',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          <Cpu size={15} /> Domain B: General Technical Knowledge
        </button>
      </div>

      {activeDomain === 'rag' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top Control Bar: Backup & Snapshot Operations */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={18} color="#38bdf8" />
                  RAG Backup & Knowledge Snapshot Center
                </h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                  Stores all expected candidate information, verified projects, competencies, and STAR stories. Fully exportable and restorable.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Snapshot label (optional)..."
                  value={customBackupLabel}
                  onChange={(e) => setCustomBackupLabel(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    width: '180px',
                  }}
                />
                <button
                  type="button"
                  onClick={handleCreateBackup}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: '#0284c7',
                    border: 'none',
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  title="Create instant backup snapshot of active RAG knowledge and vault"
                >
                  <Archive size={14} /> 📦 Create Backup
                </button>

                <button
                  type="button"
                  onClick={() => handleExportBackup()}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  title="Download complete RAG knowledge base as JSON"
                >
                  <Download size={14} /> Export JSON
                </button>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImportFile}
                  accept=".json"
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  title="Import external backup JSON"
                >
                  <Upload size={14} /> Import JSON
                </button>

                <button
                  type="button"
                  onClick={handleResetToBaseline}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  title="Reset to verified candidate baseline"
                >
                  <RotateCcw size={13} /> Re-seed
                </button>
              </div>
            </div>

            {/* Backups Snapshot History */}
            {backups.length > 0 && (
              <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #334155' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Archive size={14} color="#38bdf8" />
                  <span>Available Snapshots ({backups.length}):</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                  {backups.map((b) => (
                    <div
                      key={b.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#38bdf8', fontWeight: 600 }}>{b.label}</span>
                        <span style={{ color: '#64748b', fontSize: '11px' }}>
                          {new Date(b.timestamp).toLocaleString()}
                        </span>
                        <span style={{ color: '#94a3b8', fontSize: '11px', background: '#1e293b', padding: '1px 6px', borderRadius: '4px' }}>
                          {b.totalChunks} chunks · {(b.sizeBytes / 1024).toFixed(1)} KB
                        </span>
                        <span style={{ color: '#475569', fontSize: '10px', fontFamily: 'monospace' }}>
                          crc:{b.checksum.slice(0, 6)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleRestoreBackup(b.id, b.label)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            background: '#0369a1',
                            border: 'none',
                            color: '#ffffff',
                            cursor: 'pointer',
                          }}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportBackup(b.id)}
                          style={{
                            padding: '3px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            background: '#334155',
                            border: 'none',
                            color: '#cbd5e1',
                            cursor: 'pointer',
                          }}
                          title="Download this snapshot"
                        >
                          <Download size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBackup(b.id, b.label)}
                          style={{
                            padding: '3px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#f87171',
                            cursor: 'pointer',
                          }}
                          title="Delete snapshot"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Interactive RAG Semantic Search */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Test live RAG retrieval (e.g. event loop, TCP vs UDP, React server components, B-Tree indexing, SOLID, CORS, CAP theorem, Sheetal Electrotech)..."
                value={ragSearchQuery}
                onChange={(e) => setRagSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 42px',
                  borderRadius: '10px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}
              />
            </div>

            {/* Category Filter Pills */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#64748b', marginRight: '4px' }}>Filter:</span>
              {([
                'all',
                'cs_fundamentals',
                'web_development',
                'software_engineering',
                'backend_database',
                'system_design',
                'security_devops',
                'project',
                'profile',
                'star_story',
                'experience',
                'competency',
                'interview_qa',
              ] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setRagCategoryFilter(cat)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: ragCategoryFilter === cat ? '#0284c7' : '#1e293b',
                    color: ragCategoryFilter === cat ? '#ffffff' : '#94a3b8',
                    border: ragCategoryFilter === cat ? '1px solid #38bdf8' : '1px solid #334155',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {cat === 'all'
                    ? `All (${chunks.length})`
                    : cat === 'cs_fundamentals'
                      ? 'CS Fundamentals'
                      : cat === 'web_development'
                        ? 'Web Dev'
                        : cat === 'software_engineering'
                          ? 'Software Eng'
                          : cat === 'backend_database'
                            ? 'Backend & DB'
                            : cat === 'system_design'
                              ? 'System Design'
                              : cat === 'security_devops'
                                ? 'Security & DevOps'
                                : cat.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Search Retrieval Results Banner */}
          {ragSearchQuery.trim().length > 1 && (
            <div style={{ background: 'rgba(56, 189, 248, 0.06)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '10px', padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={15} /> Live Semantic RAG Results ({retrievalResults.length} matches):
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Cosine + BM25 Hybrid Scoring (Active in live interview teleprompter)
                </span>
              </div>
              {retrievalResults.length === 0 ? (
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                  No high-confidence chunks matched this specific query.
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '12px' }}>
                  {retrievalResults.map(({ chunk, score, matchedKeywords }) => (
                    <div
                      key={chunk.id}
                      style={{
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        padding: '12px 14px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>{chunk.title}</span>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', background: 'rgba(56,189,248,0.15)', padding: '2px 6px', borderRadius: '4px' }}>
                          {Math.round(score * 100)}% Match
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.45', margin: '0 0 8px 0' }}>
                        {chunk.content}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', background: '#1e293b', color: '#94a3b8', padding: '1px 6px', borderRadius: '3px' }}>
                          {chunk.sourceProvenance}
                        </span>
                        {matchedKeywords.map((kw) => (
                          <span key={kw} style={{ fontSize: '10px', background: '#0369a1', color: '#e0f2fe', padding: '1px 5px', borderRadius: '3px' }}>
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* All Grounded RAG Chunks Grid */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BookOpen size={16} color="#38bdf8" />
                Indexed Knowledge Chunks ({filteredChunks.length})
              </h4>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Zero fabricated claims · 100% grounded in verified candidate evidence
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '14px' }}>
              {filteredChunks.map((chunk) => (
                <div
                  key={chunk.id}
                  style={{
                    background: '#11141B',
                    border: '1px solid #292E3A',
                    borderRadius: '10px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                      <h5 style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                        {chunk.title}
                      </h5>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: '#38bdf8',
                          background: 'rgba(56, 189, 248, 0.1)',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {chunk.category.replace('_', ' ')}
                      </span>
                    </div>

                    <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5', margin: '0 0 12px 0' }}>
                      {chunk.content}
                    </p>
                  </div>

                  <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                      {chunk.keywords.slice(0, 6).map((kw) => (
                        <span
                          key={kw}
                          style={{
                            fontSize: '10px',
                            background: '#1e293b',
                            color: '#cbd5e1',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            border: '1px solid #334155',
                          }}
                        >
                          {kw}
                        </span>
                      ))}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: '#64748b' }}>
                      <span>Source: <strong style={{ color: '#94a3b8' }}>{chunk.sourceProvenance}</strong></span>
                      <span>ID: {chunk.id.slice(0, 14)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : activeDomain === 'candidate' ? (
        <div>
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(139, 124, 255, 0.08)',
              border: '1px solid rgba(139, 124, 255, 0.25)',
              fontSize: '12px',
              color: '#F3F4F8',
              marginBottom: '20px',
            }}
          >
            <strong>Zero-Trust Candidate Domain:</strong> Only verified candidate claims from repository or document inspection may be cited as personal implementation achievements.
          </div>

          {projects.length === 0 && vaultProjects.length === 0 ? (
            <EmptyState
              title="No Candidate Projects in Vault"
              description="Upload your resume or crawl your portfolio website to populate your candidate intelligence vault."
              action={
                <button
                  type="button"
                  onClick={() => setResumeModalOpen(true)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    background: '#8B7CFF',
                    border: 'none',
                    color: '#F3F4F8',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Load Resume / Sources
                </button>
              }
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {vaultProjects.map((p) => (
                <Card key={p.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>{p.title}</h4>
                    <StatusBadge status={p.status || 'UNKNOWN'} size="sm" />
                  </div>
                  <div style={{ fontSize: '12px', color: '#9299AA', marginBottom: '10px' }}>
                    Role: <strong style={{ color: '#F3F4F8' }}>{p.role || 'Contributor'}</strong>
                  </div>
                  <p style={{ fontSize: '12px', color: '#9299AA', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                    {p.description}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {(p.technologies || []).map((t: string) => (
                      <span
                        key={t}
                        style={{
                          fontSize: '10px',
                          background: '#1E2330',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          color: '#A99DFF',
                          border: '1px solid #292E3A',
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(53, 201, 145, 0.08)',
              border: '1px solid rgba(53, 201, 145, 0.25)',
              fontSize: '12px',
              color: '#F3F4F8',
              marginBottom: '20px',
            }}
          >
            <strong>Technical Concepts Domain:</strong> Used for algorithmic explanations and system design concepts. Explanations here are never presented as the candidate's personal work.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {technicalTopics.map((cat) => (
              <Card key={cat.category}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#F3F4F8', marginBottom: '12px' }}>
                  {cat.category}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                  {cat.topics.map((t) => (
                    <div
                      key={t.name}
                      style={{
                        background: '#11141B',
                        padding: '12px',
                        borderRadius: '6px',
                        border: '1px solid #292E3A',
                      }}
                    >
                      <strong style={{ fontSize: '13px', color: '#8B7CFF', display: 'block', marginBottom: '4px' }}>
                        {t.name}
                      </strong>
                      <p style={{ fontSize: '12px', color: '#9299AA', margin: 0, lineHeight: 1.4 }}>
                        {t.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
