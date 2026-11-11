import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CandidateProject } from '../../services/knowledgeVault';

export interface ProjectsSectionProps {
  projects: CandidateProject[];
  onUpdateProjects: (updatedProjects: CandidateProject[], immediate?: boolean) => void;
  registerFlushHandler: (flushFn: () => void) => () => void;
}

interface LocalProjItem extends CandidateProject {
  _techStackRaw?: string;
}

export const ProjectsSection: React.FC<ProjectsSectionProps> = React.memo(
  ({ projects, onUpdateProjects, registerFlushHandler }) => {
    const [draft, setDraft] = useState<LocalProjItem[]>(() =>
      projects.map((p) => ({
        ...p,
        _techStackRaw: p.technologyStack.join(', '),
      }))
    );
    const draftRef = useRef<LocalProjItem[]>(draft);
    draftRef.current = draft;

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSyncedRef = useRef<CandidateProject[]>(projects);

    useEffect(() => {
      if (projects !== lastSyncedRef.current) {
        lastSyncedRef.current = projects;
        setDraft(
          projects.map((p) => ({
            ...p,
            _techStackRaw: p.technologyStack.join(', '),
          }))
        );
        draftRef.current = projects.map((p) => ({
          ...p,
          _techStackRaw: p.technologyStack.join(', '),
        }));
      }
    }, [projects]);

    const sanitizeDraftForExport = (items: LocalProjItem[]): CandidateProject[] => {
      return items.map(({ _techStackRaw, ...rest }) => ({
        ...rest,
        technologyStack:
          _techStackRaw !== undefined
            ? _techStackRaw.split(',').map((s) => s.trim()).filter(Boolean)
            : rest.technologyStack,
      }));
    };

    const flushDraft = useCallback(() => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (JSON.stringify(draftRef.current) !== JSON.stringify(lastSyncedRef.current)) {
        lastSyncedRef.current = draftRef.current;
        onUpdateProjects(sanitizeDraftForExport(draftRef.current), true);
      }
    }, [onUpdateProjects]);

    useEffect(() => {
      const unregister = registerFlushHandler(flushDraft);
      return () => {
        flushDraft();
        unregister();
      };
    }, [registerFlushHandler, flushDraft]);

    const notifyChange = (next: LocalProjItem[], immediate = false) => {
      setDraft(next);
      draftRef.current = next;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (immediate) {
        onUpdateProjects(sanitizeDraftForExport(next), true);
      } else {
        debounceTimerRef.current = setTimeout(() => {
          onUpdateProjects(sanitizeDraftForExport(draftRef.current), false);
        }, 350);
      }
    };

    const handleAddProject = () => {
      const newProj: LocalProjItem = {
        id: `proj_${Date.now()}`,
        name: '',
        description: '',
        repositoryUrl: '',
        ownership: 'UNKNOWN',
        exactContribution: '',
        technologyStack: [],
        _techStackRaw: '',
        deploymentStatus: 'UNKNOWN',
        outcomes: [],
        evidenceReferences: [],
        status: 'CANDIDATE_CONFIRMED',
        candidateConfirmed: true,
      };
      notifyChange([...draftRef.current, newProj], true);
    };

    const handleRemoveProject = (idx: number) => {
      const next = draftRef.current.filter((_, i) => i !== idx);
      notifyChange(next, true);
    };

    const handleItemFieldChange = (idx: number, field: keyof CandidateProject, val: any) => {
      const next = draftRef.current.map((item, i) => {
        if (i !== idx) return item;
        return {
          ...item,
          [field]: val,
          candidateConfirmed: true,
        };
      });
      notifyChange(next, false);
    };

    const handleTechStackChange = (idx: number, rawVal: string) => {
      const next = draftRef.current.map((item, i) => {
        if (i !== idx) return item;
        return {
          ...item,
          _techStackRaw: rawVal,
          candidateConfirmed: true,
        };
      });
      notifyChange(next, false);
    };

    return (
      <div data-testid="wizard-section-projects">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
              F. Projects &amp; Provenance Tracking
            </h3>
            <p style={{ fontSize: '12px', color: '#9299AA', margin: '2px 0 0 0' }}>
              Repository code presence does not prove personal authorship without explicit contribution.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddProject}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              background: '#8B7CFF',
              border: 'none',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Plus size={14} /> Add Project
          </button>
        </div>

        {draft.length === 0 ? (
          <div
            style={{
              padding: '32px',
              textAlign: 'center',
              background: '#171B24',
              borderRadius: '8px',
              border: '1px dashed #292E3A',
              color: '#9299AA',
              fontSize: '13px',
            }}
          >
            No projects registered yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {draft.map((proj, idx) => (
              <div
                key={proj.id}
                style={{
                  padding: '16px',
                  background: '#171B24',
                  border: '1px solid #292E3A',
                  borderRadius: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#F3F4F8' }}>
                    Project #{idx + 1}: {proj.name || 'Untitled'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveProject(idx)}
                    style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="wizard-grid-2col" style={{ marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="Project Name (e.g. RaftKV)"
                    value={proj.name}
                    onChange={(e) => handleItemFieldChange(idx, 'name', e.target.value)}
                    onBlur={flushDraft}
                    style={{
                      padding: '6px 10px',
                      background: '#0F1218',
                      border: '1px solid #292E3A',
                      borderRadius: '4px',
                      color: '#F3F4F8',
                      fontSize: '12px',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Repository URL (e.g. https://github.com/org/repo)"
                    value={proj.repositoryUrl || ''}
                    onChange={(e) => handleItemFieldChange(idx, 'repositoryUrl', e.target.value)}
                    onBlur={flushDraft}
                    style={{
                      padding: '6px 10px',
                      background: '#0F1218',
                      border: '1px solid #292E3A',
                      borderRadius: '4px',
                      color: '#F3F4F8',
                      fontSize: '12px',
                    }}
                  />
                </div>

                <div className="wizard-grid-2col" style={{ marginBottom: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#CBD5E1', marginBottom: '2px' }}>
                      Ownership Category
                    </label>
                    <select
                      value={proj.ownership}
                      onChange={(e) => {
                        handleItemFieldChange(idx, 'ownership', e.target.value as any);
                        flushDraft();
                      }}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        background: '#0F1218',
                        border: '1px solid #292E3A',
                        borderRadius: '4px',
                        color: '#F3F4F8',
                        fontSize: '11px',
                      }}
                    >
                      <option value="UNKNOWN">Unknown / Unspecified</option>
                      <option value="SOLE_OWNER">Sole Owner / Author</option>
                      <option value="PRIMARY_CONTRIBUTOR">Primary Contributor</option>
                      <option value="COLLABORATOR">Collaborator / Maintenance</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#CBD5E1', marginBottom: '2px' }}>
                      Technology Stack (Comma-separated)
                    </label>
                    <input
                      type="text"
                      placeholder="Go, gRPC, Protobuf, Docker"
                      value={proj._techStackRaw ?? ''}
                      onChange={(e) => handleTechStackChange(idx, e.target.value)}
                      onBlur={flushDraft}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        background: '#0F1218',
                        border: '1px solid #292E3A',
                        borderRadius: '4px',
                        color: '#F3F4F8',
                        fontSize: '11px',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#35C991', fontWeight: 600, marginBottom: '2px' }}>
                    Exact Personal Contribution (Required to Enable Live Answers)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="State exactly what modules, logic, or optimizations you authored..."
                    value={proj.exactContribution}
                    onChange={(e) => handleItemFieldChange(idx, 'exactContribution', e.target.value)}
                    onBlur={flushDraft}
                    style={{
                      width: '100%',
                      padding: '8px',
                      background: '#0F1218',
                      border: '1px solid #292E3A',
                      borderRadius: '4px',
                      color: '#F3F4F8',
                      fontSize: '12px',
                      lineHeight: '1.4',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);

ProjectsSection.displayName = 'ProjectsSection';
