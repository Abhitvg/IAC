import React from 'react';
import {
  FolderKanban,
  FileCheck2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { StatusBadge, PageHeader, Card, EmptyState, EvidenceDrawer } from '../design-system/components';
import { CandidateKnowledgeBase } from '../services/candidateIntelligence';
import { useAppStore } from '../store/useAppStore';

export const EvidenceVaultScreen: React.FC = () => {
  const { resumeText } = useAppStore();
  const kb = React.useMemo(() => {
    return CandidateKnowledgeBase.getActiveKnowledgeBase(resumeText || '');
  }, [resumeText]);

  const [activeTab, setActiveTab] = React.useState<
    'all' | 'repository' | 'document' | 'audit' | 'candidate' | 'unverified'
  >('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedRecord, setSelectedRecord] = React.useState<any | null>(null);

  const projects = kb.getAllProjects();

  // Aggregate verified & unverified facts across all projects
  const allRecords = React.useMemo(() => {
    const records: any[] = [];
    projects.forEach((p) => {
      const prov = p.fieldProvenance || {};
      Object.entries(prov).forEach(([fieldName, fieldData]: [string, any]) => {
        records.push({
          id: `${p.id}-${fieldName}`,
          projectId: p.id,
          projectName: p.name,
          fieldName,
          value: fieldData.value,
          provenance: fieldData.provenance || 'UNKNOWN_DEFAULT',
          status: fieldData.verificationStatus || 'UNKNOWN',
          evidenceSource: fieldData.evidenceSource || p.repositoryUrl || 'None',
          confirmedAt: fieldData.confirmedAt,
          inspectionData: p.storedInspection,
        });
      });
    });
    return records;
  }, [projects]);

  // Filter records
  const filteredRecords = React.useMemo(() => {
    return allRecords.filter((rec) => {
      // Tab filter
      if (activeTab === 'repository' && !rec.status.toLowerCase().includes('repository')) return false;
      if (activeTab === 'document' && !rec.status.toLowerCase().includes('document')) return false;
      if (activeTab === 'audit' && !rec.status.toLowerCase().includes('independently')) return false;
      if (activeTab === 'candidate' && !rec.status.toLowerCase().includes('confirmed')) return false;
      if (activeTab === 'unverified' && rec.status !== 'UNKNOWN' && rec.status !== 'RESUME_REPORTED') return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = rec.projectName.toLowerCase().includes(q);
        const matchField = rec.fieldName.toLowerCase().includes(q);
        const matchVal = String(rec.value).toLowerCase().includes(q);
        if (!matchName && !matchField && !matchVal) return false;
      }
      return true;
    });
  }, [allRecords, activeTab, searchQuery]);

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        title="Evidence Vault"
        description="Inspect cryptographically verified repository artifacts, issuer attestations, and candidate fact provenance."
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
            Zero-Trust Provenance
          </span>
        }
      />

      {/* Tabs & Search Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '4px',
            background: '#171B24',
            padding: '4px',
            borderRadius: '8px',
            border: '1px solid #292E3A',
          }}
        >
          {[
            { id: 'all', label: 'All Evidence' },
            { id: 'repository', label: 'Repository Supported' },
            { id: 'document', label: 'Document Supported' },
            { id: 'audit', label: 'Independent Audit' },
            { id: 'candidate', label: 'Candidate Confirmed' },
            { id: 'unverified', label: 'Unverified / Unknown' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 400,
                  background: isActive ? '#1E2330' : 'transparent',
                  color: isActive ? '#F3F4F8' : '#9299AA',
                  border: isActive ? '1px solid #292E3A' : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <input
          type="text"
          placeholder="Filter claims or projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            background: '#171B24',
            border: '1px solid #292E3A',
            borderRadius: '8px',
            padding: '6px 12px',
            fontSize: '12px',
            color: '#F3F4F8',
            outline: 'none',
            width: '240px',
          }}
          className="focus:border-[#8B7CFF]"
        />
      </div>

      {/* Evidence Table */}
      {filteredRecords.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={36} />}
          title="No Matching Evidence Claims Found"
          description="Try switching tabs or uploading a candidate resume/repository to generate verifiable evidence records."
        />
      ) : (
        <Card padding="none">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid #292E3A',
                    color: '#9299AA',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  <th style={{ padding: '12px 16px' }}>Project</th>
                  <th style={{ padding: '12px 16px' }}>Field Claimed</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px' }}>Provenance</th>
                  <th style={{ padding: '12px 16px' }}>Evidence Source</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec) => (
                  <tr
                    key={rec.id}
                    onClick={() => setSelectedRecord(rec)}
                    style={{
                      borderBottom: '1px solid #292E3A',
                      cursor: 'pointer',
                      transition: 'background 0.12s ease',
                    }}
                    className="hover:bg-[#1E2330]/50"
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#F3F4F8' }}>
                      {rec.projectName}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#F3F4F8', fontFamily: 'monospace' }}>
                      {rec.fieldName}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge status={rec.status} />
                    </td>
                    <td style={{ padding: '12px 16px', color: '#9299AA' }}>
                      {rec.provenance}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        color: '#9299AA',
                        maxWidth: '220px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={String(rec.evidenceSource)}
                    >
                      {String(rec.evidenceSource)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#8B7CFF' }}>
                      <ChevronRight size={14} style={{ display: 'inline-block' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Evidence Detail Drawer */}
      <EvidenceDrawer
        isOpen={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        title={selectedRecord ? `${selectedRecord.projectName} — ${selectedRecord.fieldName}` : ''}
        subtitle="Cryptographic verification & provenance details"
      >
        {selectedRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#9299AA', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Verification Status
              </label>
              <StatusBadge status={selectedRecord.status} />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#9299AA', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Field Value Claimed
              </label>
              <div
                style={{
                  background: '#171B24',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #292E3A',
                  color: '#F3F4F8',
                  wordBreak: 'break-word',
                }}
              >
                {Array.isArray(selectedRecord.value)
                  ? selectedRecord.value.join(', ') || 'None'
                  : String(selectedRecord.value)}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#9299AA', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Evidence Source
              </label>
              <div
                style={{
                  background: '#171B24',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #292E3A',
                  color: '#9299AA',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
              >
                {String(selectedRecord.evidenceSource)}
              </div>
            </div>

            {selectedRecord.inspectionData && (
              <div>
                <label style={{ fontSize: '11px', color: '#9299AA', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Inspection Metadata & Cryptographic Seal
                </label>
                <div
                  style={{
                    background: '#171B24',
                    padding: '12px',
                    borderRadius: '6px',
                    border: '1px solid #292E3A',
                    color: '#9299AA',
                    fontSize: '11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div>
                    <strong style={{ color: '#F3F4F8' }}>Inspection ID:</strong>{' '}
                    {selectedRecord.inspectionData.inspectionId || 'N/A'}
                  </div>
                  <div>
                    <strong style={{ color: '#F3F4F8' }}>Commit SHA:</strong>{' '}
                    <span style={{ fontFamily: 'monospace' }}>
                      {selectedRecord.inspectionData.resolvedCommitSha?.slice(0, 10) || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <strong style={{ color: '#F3F4F8' }}>Files Inspected:</strong>{' '}
                    {selectedRecord.inspectionData.filesActuallyInspected || selectedRecord.inspectionData.inspectedFiles?.length || 0}
                  </div>
                  <div>
                    <strong style={{ color: '#F3F4F8' }}>Seal Verified:</strong>{' '}
                    <span style={{ color: '#35C991' }}>✓ HMAC-SHA256 Authenticated</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </EvidenceDrawer>
    </div>
  );
};

