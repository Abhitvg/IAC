import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Users,
  Search,
  Plus,
  Upload,
  Zap,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Trash2,
  Clock,
  Filter,
  Check,
  Building,
  Briefcase,
  X,
  FileSpreadsheet,
  Send,
  MessageSquare,
  Shield,
  ChevronDown,
} from 'lucide-react';
import { NetworkContact, RelationshipStage, JobApplication } from '../../services/careerOps/types';
import { useNetworkStore } from '../../store/useNetworkStore';
import { parseLinkedInConnectionsCsv } from '../../services/careerOps/linkedInCsvParser';
import { copyToClipboard } from '../../utils/clipboard';

const STAGE_CONFIG: Record<
  RelationshipStage,
  { label: string; bg: string; color: string; border: string }
> = {
  discovered: {
    label: 'Discovered',
    bg: 'rgba(148, 163, 184, 0.12)',
    color: '#94a3b8',
    border: 'rgba(148, 163, 184, 0.25)',
  },
  outreach_queued: {
    label: 'Outreach Queued',
    bg: 'rgba(245, 158, 11, 0.12)',
    color: '#fbbf24',
    border: 'rgba(245, 158, 11, 0.3)',
  },
  sent: {
    label: 'Outreach Sent',
    bg: 'rgba(56, 189, 248, 0.12)',
    color: '#38bdf8',
    border: 'rgba(56, 189, 248, 0.3)',
  },
  replied: {
    label: 'Conversation Active',
    bg: 'rgba(168, 85, 247, 0.12)',
    color: '#c084fc',
    border: 'rgba(168, 85, 247, 0.3)',
  },
  referral_offered: {
    label: 'Referral Offered',
    bg: 'rgba(34, 197, 94, 0.15)',
    color: '#4ade80',
    border: 'rgba(34, 197, 94, 0.35)',
  },
};

interface NetworkViewProps {
  applications?: JobApplication[];
  onSelectJob?: (jobId: string) => void;
  onOpenOutreachStudio?: () => void;
}

export const NetworkView: React.FC<NetworkViewProps> = ({ applications = [], onOpenOutreachStudio }) => {
  const {
    contacts,
    selectedContactId,
    searchQuery,
    stageFilter,
    suppressionFilter,
    companyFilter,
    isImportModalOpen,
    isAssistQueueModalOpen,
    setSearchQuery,
    setStageFilter,
    setSuppressionFilter,
    setCompanyFilter,
    setSelectedContactId,
    setIsImportModalOpen,
    setIsAssistQueueModalOpen,
    addContact,
    updateContact,
    deleteContact,
    toggleSuppression,
    advanceStage,
    importFromLinkedInCsv,
    markAssistSent,
    resetToDemo,
  } = useNetworkStore();

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [csvContent, setCsvContent] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [selectedJobIdForImport, setSelectedJobIdForImport] = useState<string>('');

  // Add contact form state
  const [newName, setNewName] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newLinkedinUrl, setNewLinkedinUrl] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newStage, setNewStage] = useState<RelationshipStage>('discovered');
  const [newOutreachDraft, setNewOutreachDraft] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Filtered contacts list
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesCompany = c.company.toLowerCase().includes(q);
        const matchesTitle = c.title.toLowerCase().includes(q);
        const matchesNotes = (c.notes || '').toLowerCase().includes(q);
        if (!matchesName && !matchesCompany && !matchesTitle && !matchesNotes) return false;
      }

      // Stage filter
      if (stageFilter !== 'all' && c.stage !== stageFilter) {
        return false;
      }

      // Suppression filter
      if (suppressionFilter === 'active_only' && c.isSuppressed) return false;
      if (suppressionFilter === 'suppressed_only' && !c.isSuppressed) return false;

      // Company filter
      if (companyFilter !== 'all' && c.company !== companyFilter) return false;

      return true;
    });
  }, [contacts, searchQuery, stageFilter, suppressionFilter, companyFilter]);

  // Companies for filter dropdown
  const uniqueCompanies = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => {
      if (c.company) set.add(c.company);
    });
    return Array.from(set).sort();
  }, [contacts]);

  // Keyboard Navigation: j/k selection, c to copy note, o to open LinkedIn, x to toggle suppression, / to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in input or textarea
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        if (e.key === 'Escape') {
          (document.activeElement as HTMLElement).blur();
        }
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === 'Escape') {
        setIsAddModalOpen(false);
        setIsImportModalOpen(false);
        setIsAssistQueueModalOpen(false);
        return;
      }

      if (filteredContacts.length === 0) return;

      const currentIndex = filteredContacts.findIndex((c) => c.id === selectedContactId);

      if (e.key === 'j') {
        e.preventDefault();
        const nextIndex = currentIndex < filteredContacts.length - 1 ? currentIndex + 1 : 0;
        setSelectedContactId(filteredContacts[nextIndex].id);
      } else if (e.key === 'k') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : filteredContacts.length - 1;
        setSelectedContactId(filteredContacts[prevIndex].id);
      } else if (e.key === 'c' && selectedContactId) {
        const contact = filteredContacts.find((c) => c.id === selectedContactId);
        if (contact?.outreachDraft) {
          e.preventDefault();
          void handleCopy(contact.outreachDraft, contact.id, 'Connection note');
        }
      } else if (e.key === 'o' && selectedContactId) {
        const contact = filteredContacts.find((c) => c.id === selectedContactId);
        if (contact?.linkedinUrl) {
          e.preventDefault();
          window.open(contact.linkedinUrl, '_blank', 'noopener,noreferrer');
        }
      } else if (e.key === 'x' && selectedContactId) {
        e.preventDefault();
        toggleSuppression(selectedContactId);
        showToast('Do-Not-Contact status toggled.');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedContactId, filteredContacts]);

  // Assist Queue items (stage === 'outreach_queued' and not suppressed)
  const assistQueueItems = useMemo(() => {
    return contacts.filter((c) => c.stage === 'outreach_queued' && !c.isSuppressed);
  }, [contacts]);

  // Executive summary counts
  const stats = useMemo(() => {
    return {
      total: contacts.length,
      active: contacts.filter((c) => (c.stage === 'outreach_queued' || c.stage === 'sent') && !c.isSuppressed).length,
      referrals: contacts.filter((c) => c.stage === 'referral_offered').length,
      suppressed: contacts.filter((c) => c.isSuppressed).length,
    };
  }, [contacts]);

  const handleCopy = async (text: string, id: string, label: string) => {
    await copyToClipboard(text);
    setCopiedId(id);
    showToast(`Copied ${label} to clipboard!`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newCompany.trim()) {
      showToast('Name and Company are required.');
      return;
    }

    addContact({
      name: newName.trim(),
      title: newTitle.trim() || 'Professional',
      company: newCompany.trim(),
      linkedinUrl: newLinkedinUrl.trim() || undefined,
      email: newEmail.trim() || undefined,
      stage: newStage,
      isSuppressed: false,
      outreachDraft: newOutreachDraft.trim() || undefined,
      notes: newNotes.trim() || undefined,
    });

    showToast(`Added contact ${newName} to Network.`);
    setIsAddModalOpen(false);
    // Reset form
    setNewName('');
    setNewTitle('');
    setNewCompany('');
    setNewLinkedinUrl('');
    setNewEmail('');
    setNewStage('discovered');
    setNewOutreachDraft('');
    setNewNotes('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text || '');
    };
    reader.readAsText(file);
  };

  const handleImportCsvSubmit = () => {
    if (!csvContent.trim()) {
      showToast('Please select or upload a valid CSV file.');
      return;
    }

    setIsImporting(true);
    try {
      const parsed = parseLinkedInConnectionsCsv(csvContent);
      if (parsed.length === 0) {
        showToast('No valid contact rows could be parsed from this CSV.');
        setIsImporting(false);
        return;
      }

      const res = importFromLinkedInCsv(
        parsed,
        'discovered',
        selectedJobIdForImport || undefined
      );

      showToast(`Imported ${res.imported} contacts (${res.duplicates} duplicates skipped).`);
      setIsImportModalOpen(false);
      setCsvContent('');
      setCsvFileName('');
    } catch (err) {
      showToast('Failed to import CSV: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxWidth: '1280px',
        margin: '0 auto',
        width: '100%',
        color: '#f8fafc',
      }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(249, 115, 22, 0.5)',
            color: '#f8fafc',
            padding: '10px 18px',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            fontSize: '12px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Zap size={14} color="#fb923c" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Network Header & Executive Metrics */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          padding: '16px 20px',
          borderRadius: '12px',
          background: 'rgba(15, 23, 42, 0.65)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(168, 85, 247, 0.2))',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Users size={20} color="#c084fc" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                Network & Assist Queue
              </h2>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: '#4ade80',
                  border: '1px solid rgba(34, 197, 94, 0.35)',
                }}
              >
                H1 VERIFIED • USER GESTURE ONLY
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>
              Track insiders, recruiters, and alumni across 5 relationship stages. Semi-automated outreach via Assist Queue.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {onOpenOutreachStudio && (
            <button
              onClick={onOpenOutreachStudio}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.2), rgba(3, 105, 161, 0.2))',
                color: '#38bdf8',
                border: '1px solid rgba(2, 132, 199, 0.4)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Users size={14} />
              <span>Company Outreach Studio</span>
            </button>
          )}

          <button
            onClick={() => setIsAddModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#f8fafc',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Plus size={14} />
            <span>Add Contact</span>
          </button>

          <button
            onClick={() => setIsImportModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#a5b4fc',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <FileSpreadsheet size={14} />
            <span>Import Connections.csv</span>
          </button>

          <button
            onClick={() => setIsAssistQueueModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              background:
                assistQueueItems.length > 0
                  ? 'linear-gradient(135deg, #f97316, #ea580c)'
                  : 'rgba(255, 255, 255, 0.06)',
              color: '#ffffff',
              border: 'none',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow:
                assistQueueItems.length > 0 ? '0 2px 10px rgba(249, 115, 22, 0.4)' : 'none',
            }}
          >
            <Zap size={14} />
            <span>Assist Queue ({assistQueueItems.length})</span>
          </button>

          {contacts.length === 0 && (
            <button
              onClick={resetToDemo}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                background: 'rgba(249, 115, 22, 0.15)',
                color: '#fb923c',
                border: '1px solid rgba(249, 115, 22, 0.35)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ⚡ Load Demo Network
            </button>
          )}
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            background: 'rgba(15, 23, 42, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Total Contacts</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#f8fafc', marginTop: '4px' }}>
            {stats.total}
          </div>
        </div>

        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            background: 'rgba(245, 158, 11, 0.06)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
          }}
        >
          <div style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 600 }}>Active Waves</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#fbbf24', marginTop: '4px' }}>
            {stats.active}
          </div>
        </div>

        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            background: 'rgba(34, 197, 94, 0.06)',
            border: '1px solid rgba(34, 197, 94, 0.25)',
          }}
        >
          <div style={{ fontSize: '11px', color: '#4ade80', fontWeight: 600 }}>Referral Offered</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#4ade80', marginTop: '4px' }}>
            {stats.referrals}
          </div>
        </div>

        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            background: 'rgba(239, 68, 68, 0.06)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
          }}
        >
          <div style={{ fontSize: '11px', color: '#f87171', fontWeight: 600 }}>Do-Not-Contact</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#f87171', marginTop: '4px' }}>
            {stats.suppressed}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          padding: '10px 14px',
          borderRadius: '10px',
          background: 'rgba(15, 23, 42, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 240px' }}>
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '320px',
            }}
          >
            <Search
              size={14}
              color="#64748b"
              style={{ position: 'absolute', left: '10px', top: '10px' }}
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by name, role, company, or note... (/ to focus)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px 6px 30px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#f8fafc',
                fontSize: '11px',
                outline: 'none',
              }}
            />
          </div>

          {/* Stage Dropdown */}
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as any)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#cbd5e1',
              fontSize: '11px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Stages</option>
            <option value="discovered">Discovered</option>
            <option value="outreach_queued">Outreach Queued</option>
            <option value="sent">Outreach Sent</option>
            <option value="replied">Conversation Active</option>
            <option value="referral_offered">Referral Offered</option>
          </select>

          {/* Company Dropdown */}
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#cbd5e1',
              fontSize: '11px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Companies</option>
            {uniqueCompanies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Suppression filter */}
          <select
            value={suppressionFilter}
            onChange={(e) => setSuppressionFilter(e.target.value as any)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#cbd5e1',
              fontSize: '11px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Status</option>
            <option value="active_only">Active Only</option>
            <option value="suppressed_only">Do-Not-Contact Only</option>
          </select>
        </div>

        {/* Keyboard Shortcut Hints */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: '#64748b' }}>
          <span><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '4px' }}>j/k</kbd> navigate</span>
          <span><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '4px' }}>c</kbd> copy note</span>
          <span><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '4px' }}>o</kbd> open linkedin</span>
          <span><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '4px' }}>x</kbd> toggle suppression</span>
        </div>
      </div>

      {/* Main People Table */}
      <div
        style={{
          borderRadius: '12px',
          background: 'rgba(15, 23, 42, 0.65)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
        }}
      >
        {filteredContacts.length === 0 ? (
          <div
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <Users size={36} color="#64748b" />
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
                No Contacts Match Your Query
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                Try adjusting your search terms or filters, import your LinkedIn Connections.csv, or add a contact manually.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <button
                onClick={() => setIsAddModalOpen(true)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#cbd5e1',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + Add Single Contact
              </button>
              <button
                onClick={() => setIsImportModalOpen(true)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                📥 Import Connections.csv
              </button>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr
                  style={{
                    background: 'rgba(15, 23, 42, 0.8)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#94a3b8',
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  <th style={{ padding: '10px 16px', width: '220px' }}>Contact</th>
                  <th style={{ padding: '10px 16px', width: '220px' }}>Role & Company</th>
                  <th style={{ padding: '10px 16px', width: '180px' }}>Stage</th>
                  <th style={{ padding: '10px 16px', width: '130px' }}>Last Activity</th>
                  <th style={{ padding: '10px 16px', width: '120px' }}>Suppression</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((contact) => {
                  const isSelected = selectedContactId === contact.id;
                  const stageMeta = STAGE_CONFIG[contact.stage] || STAGE_CONFIG.discovered;

                  return (
                    <tr
                      key={contact.id}
                      onClick={() => setSelectedContactId(contact.id)}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        background: isSelected
                          ? 'rgba(249, 115, 22, 0.08)'
                          : contact.isSuppressed
                          ? 'rgba(239, 68, 68, 0.03)'
                          : 'transparent',
                        cursor: 'pointer',
                        transition: 'background 0.12s ease',
                      }}
                    >
                      {/* Name & LinkedIn Link */}
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: '50%',
                              background: 'rgba(99, 102, 241, 0.15)',
                              border: '1px solid rgba(99, 102, 241, 0.3)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#a5b4fc',
                              flexShrink: 0,
                            }}
                          >
                            {contact.name.charAt(0)}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontWeight: 700, color: '#f8fafc' }}>{contact.name}</span>
                              {contact.linkedinUrl && (
                                <a
                                  href={contact.linkedinUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Open LinkedIn Profile"
                                  style={{ color: '#38bdf8', display: 'flex', alignItems: 'center' }}
                                >
                                  <ExternalLink size={12} />
                                </a>
                              )}
                            </div>
                            {contact.email && (
                              <div style={{ fontSize: '10px', color: '#64748b' }}>{contact.email}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Role & Company */}
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#cbd5e1' }}>{contact.title}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#94a3b8' }}>
                          <Building size={11} color="#64748b" />
                          <span>{contact.company}</span>
                        </div>
                      </td>

                      {/* Relationship Stage Dropdown */}
                      <td style={{ padding: '10px 16px' }}>
                        <select
                          value={contact.stage}
                          onChange={(e) => {
                            e.stopPropagation();
                            advanceStage(contact.id, e.target.value as RelationshipStage);
                            showToast(`Updated ${contact.name}'s stage to ${STAGE_CONFIG[e.target.value as RelationshipStage].label}.`);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            background: stageMeta.bg,
                            color: stageMeta.color,
                            border: `1px solid ${stageMeta.border}`,
                            fontSize: '11px',
                            fontWeight: 700,
                            outline: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="discovered">Discovered</option>
                          <option value="outreach_queued">Outreach Queued</option>
                          <option value="sent">Outreach Sent</option>
                          <option value="replied">Conversation Active</option>
                          <option value="referral_offered">Referral Offered</option>
                        </select>
                      </td>

                      {/* Last Activity */}
                      <td style={{ padding: '10px 16px', fontSize: '11px', color: '#94a3b8' }}>
                        {contact.lastContactedAt ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} color="#64748b" />
                            <span>
                              {Math.round((Date.now() - contact.lastContactedAt) / 86400000)}d ago
                            </span>
                          </div>
                        ) : contact.connectedOn ? (
                          <span style={{ color: '#64748b' }}>Conn. {contact.connectedOn}</span>
                        ) : (
                          <span style={{ color: '#64748b' }}>Not contacted</span>
                        )}
                      </td>

                      {/* Suppression Toggle */}
                      <td style={{ padding: '10px 16px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSuppression(contact.id);
                            showToast(contact.isSuppressed ? `Removed suppression for ${contact.name}` : `Suppressed ${contact.name}`);
                          }}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '10px',
                            fontWeight: 700,
                            border: contact.isSuppressed
                              ? '1px solid rgba(239, 68, 68, 0.4)'
                              : '1px solid rgba(255, 255, 255, 0.1)',
                            background: contact.isSuppressed
                              ? 'rgba(239, 68, 68, 0.15)'
                              : 'rgba(255, 255, 255, 0.03)',
                            color: contact.isSuppressed ? '#f87171' : '#64748b',
                            cursor: 'pointer',
                          }}
                        >
                          {contact.isSuppressed ? '🛡️ Suppressed' : 'Allowed'}
                        </button>
                      </td>

                      {/* Action Buttons */}
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          {contact.outreachDraft && !contact.isSuppressed && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleCopy(contact.outreachDraft!, contact.id, 'Connection note');
                              }}
                              title="Copy personalized <=300 char note"
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                background: copiedId === contact.id ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                color: copiedId === contact.id ? '#4ade80' : '#cbd5e1',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                fontSize: '11px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              {copiedId === contact.id ? <Check size={12} /> : <Copy size={12} />}
                              <span>Note</span>
                            </button>
                          )}

                          {!contact.isSuppressed && contact.stage !== 'sent' && contact.stage !== 'referral_offered' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                advanceStage(contact.id, 'outreach_queued');
                                showToast(`Dispatched ${contact.name} to Assist Queue.`);
                              }}
                              title="Add to Assist Queue"
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                background: 'rgba(249, 115, 22, 0.12)',
                                color: '#fb923c',
                                border: '1px solid rgba(249, 115, 22, 0.3)',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              <Zap size={12} />
                            </button>
                          )}

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteContact(contact.id);
                              showToast(`Deleted ${contact.name}.`);
                            }}
                            title="Delete contact"
                            style={{
                              padding: '4px 6px',
                              borderRadius: '6px',
                              background: 'transparent',
                              color: '#64748b',
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: ASSIST QUEUE MODAL (Strict H1 Compliance) */}
      {isAssistQueueModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '680px',
              background: '#0f172a',
              borderRadius: '16px',
              border: '1px solid rgba(249, 115, 22, 0.35)',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.8)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '85vh',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(15, 23, 42, 0.8)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={18} color="#fb923c" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>
                  LinkedIn Assist Queue ({assistQueueItems.length})
                </h3>
              </div>
              <button
                onClick={() => setIsAssistQueueModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Hard Line H1 Compliance Notice */}
            <div
              style={{
                padding: '12px 20px',
                background: 'rgba(249, 115, 22, 0.08)',
                borderBottom: '1px solid rgba(249, 115, 22, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '11px',
                color: '#cbd5e1',
              }}
            >
              <ShieldAlert size={16} color="#fb923c" style={{ flexShrink: 0 }} />
              <span>
                <strong>Hard Line H1 Compliance:</strong> LinkedIn outreach is strictly semi-automated. Review the tailored note, click to copy and open the recipient's profile, and explicitly click "Mark Sent" once submitted.
              </span>
            </div>

            {/* Assist Items List */}
            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {assistQueueItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 0', color: '#94a3b8' }}>
                  <CheckCircle2 size={36} color="#4ade80" style={{ margin: '0 auto 10px' }} />
                  <p style={{ margin: 0, fontWeight: 700, color: '#f8fafc' }}>Assist Queue is Clear!</p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
                    No outreach actions are waiting for human confirmation.
                  </p>
                </div>
              ) : (
                assistQueueItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '10px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <span style={{ fontWeight: 800, fontSize: '13px', color: '#f8fafc' }}>
                          {item.name}
                        </span>
                        <span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '6px' }}>
                          • {item.title} at <strong>{item.company}</strong>
                        </span>
                      </div>
                      {item.linkedinUrl && (
                        <a
                          href={item.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: '11px',
                            color: '#38bdf8',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            textDecoration: 'none',
                          }}
                        >
                          <span>Open Profile</span>
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>

                    {/* Outreach Draft Text Box */}
                    {item.outreachDraft ? (
                      <div
                        style={{
                          background: 'rgba(0, 0, 0, 0.4)',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          fontSize: '12px',
                          color: '#e2e8f0',
                          lineHeight: '1.5',
                        }}
                      >
                        {item.outreachDraft}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: '8px',
                            fontSize: '10px',
                            color: item.outreachDraft.length <= 300 ? '#4ade80' : '#f87171',
                          }}
                        >
                          <span>{item.outreachDraft.length} / 300 characters (LinkedIn limit)</span>
                          <button
                            onClick={() => void handleCopy(item.outreachDraft!, item.id, 'Connection Note')}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: copiedId === item.id ? '#4ade80' : '#38bdf8',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontWeight: 700,
                            }}
                          >
                            {copiedId === item.id ? <Check size={12} /> : <Copy size={12} />}
                            <span>{copiedId === item.id ? 'Copied!' : 'Copy Note'}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
                        No outreach draft generated for this contact yet.
                      </div>
                    )}

                    {/* Step-by-Step Human Gesture Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        onClick={() => advanceStage(item.id, 'discovered')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: '#94a3b8',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        Dismiss / Skip
                      </button>
                      <button
                        onClick={() => {
                          markAssistSent(item.id);
                          showToast(`Marked outreach sent to ${item.name}.`);
                        }}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '6px',
                          background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                          color: '#ffffff',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <CheckCircle2 size={13} />
                        <span>Confirm Sent (User Gesture)</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(15, 23, 42, 0.8)',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                onClick={() => setIsAssistQueueModalOpen(false)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#cbd5e1',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: LINKEDIN CONNECTIONS.CSV IMPORTER */}
      {isImportModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '560px',
              background: '#0f172a',
              borderRadius: '16px',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.8)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileSpreadsheet size={18} color="#818cf8" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>
                  Import LinkedIn Connections.csv
                </h3>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', lineHeight: '1.5' }}>
                Export your network via LinkedIn Settings → Data Privacy → Get a copy of your data → <em>Connections</em>. Upload the downloaded <code>Connections.csv</code> file below to populate your insider graph.
              </p>

              {/* File Upload Zone */}
              <label
                style={{
                  border: '2px dashed rgba(99, 102, 241, 0.4)',
                  borderRadius: '12px',
                  padding: '24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'rgba(99, 102, 241, 0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Upload size={24} color="#818cf8" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0' }}>
                  {csvFileName ? `Selected: ${csvFileName}` : 'Choose Connections.csv or drag and drop'}
                </span>
                <span style={{ fontSize: '10px', color: '#64748b' }}>
                  Standard LinkedIn format (First Name, Last Name, URL, Company, Position)
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>

              {/* Target Job Anchor (Optional) */}
              {applications.length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                    Anchor imported contacts to a target job (optional):
                  </label>
                  <select
                    value={selectedJobIdForImport}
                    onChange={(e) => setSelectedJobIdForImport(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#f8fafc',
                      fontSize: '11px',
                    }}
                  >
                    <option value="">None (Independent Network Contacts)</option>
                    {applications.map((app) => (
                      <option key={app.id} value={app.id}>
                        {app.company} — {app.role}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: '#94a3b8',
                    border: 'none',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!csvContent.trim() || isImporting}
                  onClick={handleImportCsvSubmit}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: csvContent.trim() ? 'pointer' : 'not-allowed',
                    opacity: csvContent.trim() ? 1 : 0.5,
                  }}
                >
                  {isImporting ? 'Importing...' : 'Parse & Import Contacts'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ADD SINGLE CONTACT MODAL */}
      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              background: '#0f172a',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.8)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Plus size={18} color="#fb923c" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>
                  Add Network Contact
                </h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddContactSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Johnson"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                    Title / Position
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Senior Recruiter"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                    Company *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Stripe"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                    LinkedIn URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://linkedin.com/in/..."
                    value={newLinkedinUrl}
                    onChange={(e) => setNewLinkedinUrl(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                    Initial Stage
                  </label>
                  <select
                    value={newStage}
                    onChange={(e) => setNewStage(e.target.value as RelationshipStage)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  >
                    <option value="discovered">Discovered</option>
                    <option value="outreach_queued">Outreach Queued</option>
                    <option value="sent">Outreach Sent</option>
                    <option value="replied">Conversation Active</option>
                    <option value="referral_offered">Referral Offered</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                  Personalized Outreach Draft (≤ 300 chars)
                </label>
                <textarea
                  rows={3}
                  maxLength={300}
                  placeholder="Hi [Name], saw your work on [Topic]..."
                  value={newOutreachDraft}
                  onChange={(e) => setNewOutreachDraft(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#f8fafc',
                    fontSize: '12px',
                    resize: 'none',
                  }}
                />
                <div style={{ fontSize: '10px', color: '#64748b', textAlign: 'right', marginTop: '2px' }}>
                  {newOutreachDraft.length} / 300 chars
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: '#94a3b8',
                    border: 'none',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #f97316, #ea580c)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Save Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
