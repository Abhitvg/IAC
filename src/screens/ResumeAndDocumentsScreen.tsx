import React, { useState } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Eye,
  FileCheck,
  Globe,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { PageHeader, Card, StatusBadge, EmptyState } from '../design-system/components';
import { useAppStore } from '../store/useAppStore';
import { CandidateKnowledgeBase } from '../services/candidateIntelligence';
import { WebsiteSourceService } from '../services/website/websiteSourceService';
import { KnowledgeVaultService } from '../services/knowledgeVault';

export const ResumeAndDocumentsScreen: React.FC = () => {
  const { resumeText, jobDescriptionText, setResumeModalOpen, setToast } = useAppStore();
  const [sources, setSources] = useState(() => WebsiteSourceService.getSources());
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState<string>('');

  const handleCrawlWebsite = async (sourceId: string) => {
    setIsCrawling(true);
    setCrawlProgress('Initiating crawler...');
    try {
      setToast?.('Starting website crawl with same-origin SSRF guards...');
      const pages = await WebsiteSourceService.crawlSource(sourceId, (prog) => {
        setCrawlProgress(`Discovered ${prog.pagesDiscovered} pages, crawled ${prog.pagesCrawled}...`);
      });
      const source = sources.find((s) => s.id === sourceId);
      if (source && pages.length > 0) {
        KnowledgeVaultService.getInstance().populateFromWebsitePages(pages, source.seedUrl);
        setToast?.(`✅ Crawled ${pages.length} pages and ingested claims into Knowledge Vault!`);
      }
      setSources(WebsiteSourceService.getSources());
    } catch (err: any) {
      console.error('Crawl failed:', err);
      setToast?.(`Website crawl failed: ${err?.message || err}`);
    } finally {
      setIsCrawling(false);
      setCrawlProgress('');
    }
  };

  const kb = React.useMemo(() => {
    return CandidateKnowledgeBase.getActiveKnowledgeBase(resumeText || '');
  }, [resumeText]);

  const projects = kb.getAllProjects();
  const wordCount = (resumeText || '').trim().split(/\s+/).filter(Boolean).length;
  const jdWordCount = (jobDescriptionText || '').trim().split(/\s+/).filter(Boolean).length;

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        title="Resume & Documents Library"
        description="Review candidate resume extraction, target job descriptions, and claim-level grounding boundaries."
        actions={
          <button
            type="button"
            onClick={() => setResumeModalOpen(true)}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: '#8B7CFF',
              color: '#F3F4F8',
              fontWeight: 600,
              fontSize: '12px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            className="hover:bg-[#A99DFF]"
          >
            <Upload size={14} /> Upload / Edit Documents
          </button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
        {/* Candidate Resume Panel */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={16} style={{ color: '#8B7CFF' }} />
              Candidate Resume
            </h3>
            <span style={{ fontSize: '11px', color: '#9299AA' }}>
              {wordCount} words extracted
            </span>
          </div>

          {!resumeText ? (
            <EmptyState
              title="No Resume Loaded"
              description="Upload your resume (PDF, DOCX, MD) to extract candidate claims."
              action={
                <button
                  type="button"
                  onClick={() => setResumeModalOpen(true)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: '#1E2330',
                    border: '1px solid #292E3A',
                    color: '#8B7CFF',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Upload Resume
                </button>
              }
            />
          ) : (
            <div
              style={{
                maxHeight: '340px',
                overflowY: 'auto',
                background: '#11141B',
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid #292E3A',
                fontSize: '12px',
                color: '#9299AA',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
              }}
            >
              {resumeText}
            </div>
          )}
        </Card>

        {/* Target Job Description Panel */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileCheck size={16} style={{ color: '#35C991' }} />
              Target Job Description
            </h3>
            <span style={{ fontSize: '11px', color: '#9299AA' }}>
              {jdWordCount} words parsed
            </span>
          </div>

          {!jobDescriptionText ? (
            <EmptyState
              title="No Job Description Loaded"
              description="Provide the target job description to match skills and target topics."
              action={
                <button
                  type="button"
                  onClick={() => setResumeModalOpen(true)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: '#1E2330',
                    border: '1px solid #292E3A',
                    color: '#35C991',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Add Job Description
                </button>
              }
            />
          ) : (
            <div
              style={{
                maxHeight: '340px',
                overflowY: 'auto',
                background: '#11141B',
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid #292E3A',
                fontSize: '12px',
                color: '#9299AA',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}
            >
              {jobDescriptionText}
            </div>
          )}
        </Card>
      </div>

      {/* Personal Website Sources Section */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={16} style={{ color: '#8B7CFF' }} />
            Personal Websites & Online Portfolio Sources
          </h3>
          <span style={{ fontSize: '11px', color: '#9299AA' }}>
            Provenance: WEBSITE_REPORTED
          </span>
        </div>
        <Card padding="none">
          {sources.map((source) => (
            <div
              key={source.id}
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #292E3A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, color: '#F3F4F8', fontSize: '13px' }}>{source.label}</span>
                  <a
                    href={source.seedUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#8B7CFF', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                  >
                    {source.seedUrl} <ExternalLink size={12} />
                  </a>
                </div>
                <div style={{ fontSize: '11px', color: '#9299AA', display: 'flex', gap: '16px' }}>
                  <span>Discovered Pages: <strong style={{ color: '#F3F4F8' }}>{source.pages?.length || 0}</strong></span>
                  <span>Extracted Claims: <strong style={{ color: '#F3F4F8' }}>{source.totalClaimsCount}</strong></span>
                  <span>
                    Status:{' '}
                    <strong style={{ color: source.status === 'crawling' ? '#F4B84A' : '#35C991' }}>
                      {source.status.toUpperCase()}
                    </strong>
                  </span>
                  {source.lastCrawledAt && (
                    <span>Last Crawled: {new Date(source.lastCrawledAt).toLocaleTimeString()}</span>
                  )}
                </div>
                {crawlProgress && (
                  <div style={{ marginTop: '6px', fontSize: '11px', color: '#8B7CFF' }}>
                    {crawlProgress}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleCrawlWebsite(source.id)}
                disabled={isCrawling}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  background: isCrawling ? '#1E2330' : '#8B7CFF',
                  color: '#F3F4F8',
                  border: '1px solid #292E3A',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: isCrawling ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <RefreshCw size={13} className={isCrawling ? 'animate-spin' : ''} />
                {isCrawling ? 'Crawling...' : 'Crawl & Ingest Website'}
              </button>
            </div>
          ))}
        </Card>
      </div>

      {/* Claim Extraction Review Section */}
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', marginBottom: '12px' }}>
        Extracted Candidate Claims & Verification Status
      </h3>
      <Card padding="none">
        <div style={{ padding: '16px', borderBottom: '1px solid #292E3A', fontSize: '12px', color: '#9299AA' }}>
          Resume claims begin in <strong style={{ color: '#F3F4F8' }}>RESUME_REPORTED</strong> status and require repository or document inspection to elevate to verified status.
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #292E3A', color: '#9299AA', fontSize: '11px', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 16px' }}>Project Claim</th>
                <th style={{ padding: '12px 16px' }}>Technologies Extracted</th>
                <th style={{ padding: '12px 16px' }}>Initial Provenance</th>
                <th style={{ padding: '12px 16px' }}>Current Status</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#9299AA' }}>
                    No extracted claims available.
                  </td>
                </tr>
              ) : (
                projects.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #292E3A' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#F3F4F8' }}>{p.name}</td>
                    <td style={{ padding: '12px 16px', color: '#A99DFF' }}>{(p.technologyStack || []).slice(0, 4).join(', ') || 'None'}</td>
                    <td style={{ padding: '12px 16px', color: '#9299AA' }}>RESUME_PARSED</td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge status={p.verificationStatus || 'RESUME_REPORTED'} size="sm" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
