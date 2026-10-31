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
} from 'lucide-react';
import { PageHeader, Card, StatusBadge, EmptyState } from '../design-system/components';
import { CandidateKnowledgeBase } from '../services/candidateIntelligence';
import { useAppStore } from '../store/useAppStore';

export const KnowledgeBaseScreen: React.FC = () => {
  const { resumeText } = useAppStore();
  const kb = React.useMemo(() => {
    return CandidateKnowledgeBase.getActiveKnowledgeBase(resumeText || '');
  }, [resumeText]);

  const [activeDomain, setActiveDomain] = React.useState<'candidate' | 'technical'>('candidate');
  const [search, setSearch] = React.useState('');

  const projects = kb.getAllProjects();
  const allVerifiedTechs = Array.from(
    new Set(projects.flatMap((p) => p.technologyStack || []))
  );

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
    <div style={{ padding: '24px 32px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        title="Knowledge Base"
        description="Explicit separation between candidate personal evidence and general technical concepts."
        badge={
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '6px',
              background: 'rgba(139, 124, 255, 0.12)',
              color: '#8B7CFF',
              border: '1px solid rgba(139, 124, 255, 0.3)',
              fontWeight: 600,
            }}
          >
            Domain Separation Enforced
          </span>
        }
      />

      {/* Domain Switcher */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
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

      {activeDomain === 'candidate' ? (
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {projects.map((p) => (
              <Card key={p.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>{p.name}</h4>
                  <StatusBadge status={p.verificationStatus || 'UNKNOWN'} size="sm" />
                </div>
                <div style={{ fontSize: '12px', color: '#9299AA', marginBottom: '10px' }}>
                  Role: <strong style={{ color: '#F3F4F8' }}>{p.ownership || 'contributor'}</strong>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {(p.technologyStack || []).map((t: string) => (
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

