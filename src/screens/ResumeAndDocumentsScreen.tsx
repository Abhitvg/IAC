import React, { useState, useEffect } from 'react';
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
  GitBranch,
  ShieldCheck,
  AlertCircle,
  FolderGit2,
} from 'lucide-react';
import { PageHeader, Card, StatusBadge, EmptyState } from '../design-system/components';
import { useAppStore } from '../store/useAppStore';
import { CandidateKnowledgeBase } from '../services/candidateIntelligence';
import { WebsiteSourceService } from '../services/website/websiteSourceService';
import { KnowledgeVaultService } from '../services/knowledgeVault';
import { GitHubIngestionService, GitHubRepoSummary } from '../services/ingestion/githubIngestionService';
import { LinkedInIngestionService } from '../services/ingestion/linkedinIngestionService';
import { SourceReconciliationService, ContradictionAlert } from '../services/ingestion/sourceReconciliationService';
import { DocumentIngestionService } from '../services/ingestion/documentIngestionService';
import { CanonicalProfileService } from '../services/knowledgeVault/canonicalProfileService';

export const ResumeAndDocumentsScreen: React.FC = () => {
  const { resumeText, jobDescriptionText, setResumeModalOpen, setToast } = useAppStore();
  const [sources, setSources] = useState(() => WebsiteSourceService.getSources());
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState<string>('');

  // GitHub integration states
  const [ghToken, setGhToken] = useState('');
  const [isConnectingGh, setIsConnectingGh] = useState(false);
  const [ghRepos, setGhRepos] = useState<GitHubRepoSummary[]>([]);
  const [isIngestingGh, setIsIngestingGh] = useState(false);
  const ghService = GitHubIngestionService.getInstance();
  const [isGhConnected, setIsGhConnected] = useState(() => ghService.isConnected());

  // LinkedIn states
  const liService = LinkedInIngestionService.getInstance();
  const [isParsingLi, setIsParsingLi] = useState(false);

  // Contradiction states
  const reconciler = SourceReconciliationService.getInstance();
  const [contradictions, setContradictions] = useState<ContradictionAlert[]>(() => reconciler.detectContradictions());

  useEffect(() => {
    if (isGhConnected) {
      ghService.listRepositories().then(setGhRepos).catch(console.warn);
    }
  }, [isGhConnected]);

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
      setContradictions(reconciler.detectContradictions());
    } catch (err: any) {
      console.error('Crawl failed:', err);
      setToast?.(`Website crawl failed: ${err?.message || err}`);
    } finally {
      setIsCrawling(false);
      setCrawlProgress('');
    }
  };

  const handleConnectGitHub = async () => {
    if (!ghToken.trim()) return;
    setIsConnectingGh(true);
    try {
      const user = await ghService.verifyAndConnect(ghToken);
      setIsGhConnected(true);
      setToast?.(`✅ Connected GitHub account: @${user.login}`);
      const repos = await ghService.listRepositories();
      setGhRepos(repos);
    } catch (err: any) {
      setToast?.(`GitHub connection failed: ${err?.message || err}`);
    } finally {
      setIsConnectingGh(false);
    }
  };

  const handleIngestGitHub = async () => {
    setIsIngestingGh(true);
    try {
      setToast?.('Auditing selected GitHub repositories and commit authorship...');
      const result = await ghService.ingestSelectedRepositories();
      setToast?.(`✅ Audited ${result.inspectedRepositories.length} repositories with verified commit SHAs!`);
      setContradictions(reconciler.detectContradictions());
    } catch (err: any) {
      setToast?.(`GitHub audit failed: ${err?.message || err}`);
    } finally {
      setIsIngestingGh(false);
    }
  };

  const handleLinkedInUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsingLi(true);
    try {
      setToast?.(`Parsing official LinkedIn export ${file.name}...`);
      const ingestion = await DocumentIngestionService.ingestFile(file);
      const parsed = liService.parseLinkedInPdfText(ingestion.rawText);
      liService.syncToCanonicalProfile(parsed);
      setToast?.(`✅ Imported ${parsed.experience.length} roles and ${parsed.topSkills.length} skills from LinkedIn!`);
      setContradictions(reconciler.detectContradictions());
    } catch (err: any) {
      setToast?.(`LinkedIn export parsing failed: ${err?.message || err}`);
    } finally {
      setIsParsingLi(false);
    }
  };

  const handleResolveConflict = (conflictId: string, chosenValue: any) => {
    reconciler.resolveContradiction(conflictId, chosenValue);
    setContradictions(reconciler.detectContradictions());
    setToast?.('✅ Conflict resolved and confirmed by candidate.');
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
        description="Review candidate multi-source extraction (Resume, Portfolio, GitHub, LinkedIn) and claim-level grounding boundaries."
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

      {/* Contradiction / Conflict Alerts Banner */}
      {contradictions.length > 0 && (
        <div style={{ marginBottom: '24px', padding: '16px', background: '#241416', border: '1px solid #7F1D1D', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#F87171' }}>
            <AlertTriangle size={18} />
            <strong style={{ fontSize: '13px' }}>Cross-Source Contradictions Detected ({contradictions.length})</strong>
          </div>
          <p style={{ fontSize: '12px', color: '#FCA5A5', margin: '0 0 12px 0' }}>
            Differing claims exist between your uploaded resume, personal website, GitHub repositories, or LinkedIn export. Confirm canonical values below.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {contradictions.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: '10px 14px',
                  background: '#1A0E10',
                  borderRadius: '6px',
                  border: '1px solid #991B1B',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#FEE2E2' }}>{c.description}</div>
                  <div style={{ fontSize: '11px', color: '#FCA5A5', marginTop: '2px' }}>
                    Conflicting sources: {c.conflictingSources.map((s) => `${s.source} (${s.value})`).join(' vs ')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {c.conflictingSources.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleResolveConflict(c.id, s.value)}
                      style={{
                        padding: '4px 10px',
                        background: '#371B1E',
                        border: '1px solid #B91C1C',
                        borderRadius: '4px',
                        color: '#FEE2E2',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Use {s.source} ({s.value})
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* GitHub Account & Selected Repositories Section */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderGit2 size={16} style={{ color: '#8B7CFF' }} />
            GitHub Account &amp; Selected Repositories
          </h3>
          <span style={{ fontSize: '11px', color: '#9299AA' }}>
            Provenance: REPOSITORY_SUPPORTED
          </span>
        </div>
        <Card padding="none">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #292E3A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {!isGhConnected ? (
              <div style={{ display: 'flex', gap: '8px', flex: 1, maxWidth: '500px' }}>
                <input
                  type="password"
                  placeholder="Enter GitHub Personal Access Token (repo, read:user)"
                  value={ghToken}
                  onChange={(e) => setGhToken(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    background: '#0F1218',
                    border: '1px solid #292E3A',
                    borderRadius: '6px',
                    color: '#F3F4F8',
                    fontSize: '12px',
                  }}
                />
                <button
                  type="button"
                  onClick={handleConnectGitHub}
                  disabled={isConnectingGh || !ghToken.trim()}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    background: '#8B7CFF',
                    border: 'none',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isConnectingGh ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <CheckCircle2 size={16} style={{ color: '#35C991' }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#F3F4F8' }}>
                  Connected as @{ghService.getCurrentUser()?.login || 'Candidate'}
                </span>
                <span style={{ fontSize: '11px', color: '#9299AA' }}>
                  {ghService.getSelectedRepositoryNames().length} of {ghRepos.length} repos selected
                </span>
                <button
                  type="button"
                  onClick={() => {
                    ghService.disconnect();
                    setIsGhConnected(false);
                    setGhRepos([]);
                  }}
                  style={{
                    padding: '4px 8px',
                    background: 'transparent',
                    border: '1px solid #292E3A',
                    borderRadius: '4px',
                    color: '#f87171',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Disconnect
                </button>
              </div>
            )}
            {isGhConnected && (
              <button
                type="button"
                onClick={handleIngestGitHub}
                disabled={isIngestingGh || ghService.getSelectedRepositoryNames().length === 0}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  background: isIngestingGh ? '#1E2330' : '#8B7CFF',
                  border: '1px solid #292E3A',
                  color: '#F3F4F8',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: isIngestingGh ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <RefreshCw size={13} className={isIngestingGh ? 'animate-spin' : ''} />
                {isIngestingGh ? 'Auditing Repos...' : 'Audit Selected Repositories'}
              </button>
            )}
          </div>
          {isGhConnected && ghRepos.length > 0 && (
            <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '8px 20px' }}>
              {ghRepos.slice(0, 10).map((r) => {
                const isSelected = ghService.getSelectedRepositoryNames().includes(r.fullName);
                return (
                  <div
                    key={r.id}
                    style={{
                      padding: '8px 0',
                      borderBottom: '1px solid #1E2330',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#F3F4F8' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          ghService.toggleRepositorySelection(r.fullName, e.target.checked);
                          setGhRepos([...ghRepos]);
                        }}
                      />
                      <strong>{r.name}</strong>
                      <span style={{ color: '#9299AA', fontSize: '11px' }}>{r.description || 'No description'}</span>
                    </label>
                    <span style={{ color: '#8B7CFF', fontSize: '11px' }}>{r.primaryLanguage || 'Code'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* LinkedIn Profile & Export Ingestion Section */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={16} style={{ color: '#8B7CFF' }} />
            LinkedIn Permitted Export Ingestion
          </h3>
          <span style={{ fontSize: '11px', color: '#9299AA' }}>
            Official PDF Export / Archive
          </span>
        </div>
        <Card padding="none">
          <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#F3F4F8', marginBottom: '4px' }}>
                Import Official LinkedIn Profile PDF
              </div>
              <p style={{ fontSize: '11px', color: '#9299AA', margin: 0 }}>
                Download via LinkedIn: Profile &rarr; More &rarr; "Save to PDF". Ingests career history with 100% compliance.
              </p>
            </div>
            <label
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                background: '#1E2330',
                border: '1px solid #292E3A',
                color: '#8B7CFF',
                fontSize: '12px',
                fontWeight: 600,
                cursor: isParsingLi ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Upload size={13} />
              {isParsingLi ? 'Parsing PDF...' : 'Select LinkedIn Profile.pdf'}
              <input
                type="file"
                accept=".pdf"
                onChange={handleLinkedInUpload}
                disabled={isParsingLi}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </Card>
      </div>

      {/* Personal Website Sources Section */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={16} style={{ color: '#8B7CFF' }} />
            Personal Websites &amp; Online Portfolio Sources
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
        Extracted Candidate Claims &amp; Verification Status
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
