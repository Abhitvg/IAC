import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { X, Calendar, Clock, Target, Code, Database, BrainCircuit, Activity } from 'lucide-react';

export default function SessionsPanel() {
  const { sessionHistory, currentPerformance, setSessionsOpen } = useAppStore();

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Coding':
      case 'DSA':
        return <Code size={12} />;
      case 'DBMS':
        return <Database size={12} />;
      case 'System Design':
        return <Activity size={12} />;
      default:
        return <BrainCircuit size={12} />;
    }
  };

  return (
    <>
      <div className="panel-overlay" onClick={() => setSessionsOpen(false)} />
      <div className="panel" style={{ width: '450px' }}>
        <div className="panel__header">
          <h2 className="panel__title">Session History</h2>
          <button className="panel__close" onClick={() => setSessionsOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="panel__body">
          {currentPerformance && (
            <div className="performance-card" style={{ marginBottom: '24px' }}>
              <h3 className="performance-card__title">Latest Session Performance</h3>
              
              <div className="performance-grid">
                <div className="performance-stat">
                  <div className="performance-stat__value">{currentPerformance.totalQuestions}</div>
                  <div className="performance-stat__label">Questions</div>
                </div>
                <div className="performance-stat">
                  <div className="performance-stat__value">{currentPerformance.averageResponseTime}s</div>
                  <div className="performance-stat__label">Avg. Response Time</div>
                </div>
              </div>

              {currentPerformance.strongAreas.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div className="card__label" style={{ marginBottom: '8px' }}>Strong Areas</div>
                  <div className="performance-tags">
                    {currentPerformance.strongAreas.map((area: any) => (
                      <span key={area} className="performance-tag performance-tag--strong">{area}</span>
                    ))}
                  </div>
                </div>
              )}

              {currentPerformance.weakAreas.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div className="card__label" style={{ marginBottom: '8px' }}>Areas to Improve</div>
                  <div className="performance-tags">
                    {currentPerformance.weakAreas.map((area: any) => (
                      <span key={area} className="performance-tag performance-tag--weak">{area}</span>
                    ))}
                  </div>
                </div>
              )}

              {currentPerformance.recommendations.length > 0 && (
                <div>
                  <div className="card__label" style={{ marginBottom: '8px' }}>Recommendations</div>
                  <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {currentPerformance.recommendations.map((rec: any, i: number) => (
                      <li key={i} style={{ marginBottom: '4px' }}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="settings-section">
            <h3 className="settings-section__title">Past Sessions</h3>
            
            {sessionHistory.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 0' }}>
                <Calendar size={32} className="empty-state__icon" />
                <div className="empty-state__title">No sessions yet</div>
                <div className="empty-state__description">
                  Complete an interview practice session and it will appear here.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {sessionHistory.map((session) => {
                  const date = new Date(session.startTime);
                  const duration = session.endTime 
                    ? Math.round((new Date(session.endTime).getTime() - date.getTime()) / 60000) 
                    : 0;

                  // Group questions by category
                  const categories: Record<string, number> = {};
                  session.questions.forEach((q: any) => {
                    categories[q.category] = (categories[q.category] || 0) + 1;
                  });

                  return (
                    <div key={session.id} className="session-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="session-item__date">
                          {date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                        </div>
                        <div className="session-item__meta" style={{ display: 'flex', gap: '12px' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Target size={10} /> {session.questions.length} Qs
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={10} /> {duration} min
                          </span>
                        </div>
                      </div>
                      
                      <div className="session-item__stats">
                        {Object.entries(categories).slice(0, 4).map(([cat, count]) => (
                          <span key={cat} className="session-item__stat" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {getCategoryIcon(cat)} {cat} ({count})
                          </span>
                        ))}
                        {Object.keys(categories).length > 4 && (
                          <span className="session-item__stat">+{Object.keys(categories).length - 4} more</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
