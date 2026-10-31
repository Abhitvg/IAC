import React from 'react';
import {
  History,
  Clock,
  Calendar,
  MessageSquare,
  Search,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { PageHeader, Card, StatusBadge, EmptyState } from '../design-system/components';
import { useAppStore } from '../store/useAppStore';

export const InterviewHistoryScreen: React.FC = () => {
  const { sessionHistory, setSessionsOpen } = useAppStore();
  const [search, setSearch] = React.useState('');

  const filteredSessions = (sessionHistory || []).filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const matchRole = (s.targetRole || '').toLowerCase().includes(q);
    const matchCompany = (s.targetCompany || '').toLowerCase().includes(q);
    return matchRole || matchCompany;
  });

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        title="Interview History"
        description="Comprehensive audit log of past live interview sessions, detected questions, and grounding validations."
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
            {sessionHistory?.length || 0} Sessions Recorded
          </span>
        }
      />

      {/* Filter bar */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Filter by role or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: '#171B24',
            border: '1px solid #292E3A',
            borderRadius: '8px',
            padding: '8px 14px',
            fontSize: '13px',
            color: '#F3F4F8',
            outline: 'none',
            width: '100%',
            maxWidth: '360px',
          }}
          className="focus:border-[#8B7CFF]"
        />
      </div>

      {!sessionHistory || sessionHistory.length === 0 ? (
        <EmptyState
          icon={<History size={36} />}
          title="No Past Sessions Recorded"
          description="Your completed live interview sessions, questions, and teleprompter transcripts will appear here."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredSessions.map((s) => {
            const dateStr = s.startTime ? new Date(s.startTime).toLocaleDateString() : 'Recent';
            const durationMin = s.durationMs ? Math.round(s.durationMs / 60000) : 0;
            const qCount = s.questions?.length || 0;

            return (
              <Card
                key={s.id}
                interactive
                onClick={() => setSessionsOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      background: '#1E2330',
                      border: '1px solid #292E3A',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#8B7CFF',
                    }}
                  >
                    <MessageSquare size={18} />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
                      {s.targetRole || 'Interview Session'} {s.targetCompany ? `• ${s.targetCompany}` : ''}
                    </h4>
                    <div style={{ fontSize: '12px', color: '#9299AA', display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={12} /> {dateStr}
                      </span>
                      {durationMin > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} /> {durationMin} min
                        </span>
                      )}
                      <span>{qCount} questions logged</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <StatusBadge status={s.performance ? 'validated' : 'candidate_confirmed'} label={s.performance ? 'Analyzed' : 'Saved'} size="sm" />
                  <ChevronRight size={16} style={{ color: '#8B7CFF' }} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

