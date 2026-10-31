import React from 'react';
import {
  FolderGit2,
  Plus,
  ExternalLink,
  Code2,
  Server,
  Layers,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { StatusBadge, PageHeader, Card, EmptyState, EvidenceDrawer } from '../design-system/components';
import { CandidateKnowledgeBase } from '../services/candidateIntelligence';
import { useAppStore } from '../store/useAppStore';

export const ProjectsScreen: React.FC = () => {
  const { resumeText } = useAppStore();
  const kb = React.useMemo(() => {
    return CandidateKnowledgeBase.getActiveKnowledgeBase(resumeText || '');
  }, [resumeText]);

  const [selectedProject, setSelectedProject] = React.useState<any | null>(null);
  const [search, setSearch] = React.useState('');

  const projects = kb.getAllProjects();
  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.technologyStack || []).some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        title="Candidate Projects"
        description="Independent field-level tracking of technical contributions, system architecture, and repository evidence."
        badge={
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '6px',
              background: 'rgba(53, 201, 145, 0.12)',
              color: '#35C991',
              border: '1px solid rgba(53, 201, 145, 0.3)',
              fontWeight: 600,
            }}
          >
            {projects.length} Registered
          </span>
        }
      />

      {/* Search Bar */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search projects by name or technology..."
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

      {/* Grid of Projects */}
      {filteredProjects.length === 0 ? (
        <EmptyState
          icon={<FolderGit2 size={36} />}
          title="No Projects Found"
          description="Upload your resume or register a project to begin field-level provenance tracking."
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px',
          }}
        >
          {filteredProjects.map((project) => {
            const prov = project.fieldProvenance || {};
            const techList = project.technologyStack || [];

            return (
              <Card
                key={project.id}
                interactive
                onClick={() => setSelectedProject(project)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '180px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
                      {project.name}
                    </h3>
                    <StatusBadge status={project.verificationStatus || 'UNKNOWN'} size="sm" />
                  </div>

                  <p
                    style={{
                      fontSize: '12px',
                      color: '#9299AA',
                      margin: '0 0 14px 0',
                      lineHeight: 1.4,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {project.problemStatement || 'No project description recorded.'}
                  </p>
                </div>

                <div>
                  {/* Technology Pills */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
                    {techList.slice(0, 4).map((tech: string) => (
                      <span
                        key={tech}
                        style={{
                          fontSize: '10px',
                          background: '#1E2330',
                          border: '1px solid #292E3A',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          color: '#A99DFF',
                        }}
                      >
                        {tech}
                      </span>
                    ))}
                    {techList.length > 4 && (
                      <span style={{ fontSize: '10px', color: '#9299AA', alignSelf: 'center' }}>
                        +{techList.length - 4} more
                      </span>
                    )}
                  </div>

                  {/* Footer info */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid #292E3A',
                      paddingTop: '10px',
                      fontSize: '11px',
                      color: '#9299AA',
                    }}
                  >
                    <span>Role: <strong style={{ color: '#F3F4F8' }}>{project.ownership || 'contributor'}</strong></span>
                    <span style={{ color: '#8B7CFF', display: 'flex', alignItems: 'center', gap: '2px' }}>
                      Inspect <ChevronRight size={12} />
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Project Detail Drawer */}
      <EvidenceDrawer
        isOpen={!!selectedProject}
        onClose={() => setSelectedProject(null)}
        title={selectedProject?.name || 'Project Details'}
        subtitle="Field-level provenance and verified technical contributions"
      >
        {selectedProject && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#9299AA', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Overall Verification Status
              </label>
              <StatusBadge status={selectedProject.verificationStatus || 'UNKNOWN'} />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#9299AA', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Personal Contribution
              </label>
              <div style={{ background: '#171B24', padding: '10px', borderRadius: '6px', border: '1px solid #292E3A', color: '#F3F4F8' }}>
                {selectedProject.personalContribution || 'UNKNOWN'}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#9299AA', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Technical Architecture
              </label>
              <div style={{ background: '#171B24', padding: '10px', borderRadius: '6px', border: '1px solid #292E3A', color: '#F3F4F8' }}>
                {selectedProject.architecture || 'UNKNOWN'}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#9299AA', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Technologies Used
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {(selectedProject.technologyStack || []).map((t: string) => (
                  <span
                    key={t}
                    style={{
                      fontSize: '11px',
                      background: '#1E2330',
                      border: '1px solid #292E3A',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      color: '#A99DFF',
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {selectedProject.repositoryUrl && (
              <div>
                <label style={{ fontSize: '11px', color: '#9299AA', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Repository Source
                </label>
                <div style={{ background: '#171B24', padding: '10px', borderRadius: '6px', border: '1px solid #292E3A', color: '#8B7CFF', fontFamily: 'monospace', fontSize: '12px' }}>
                  {selectedProject.repositoryUrl}
                </div>
              </div>
            )}
          </div>
        )}
      </EvidenceDrawer>
    </div>
  );
};
