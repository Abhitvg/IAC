import React, { useState, useMemo } from 'react';
import {
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Lock,
  Globe,
  Star,
  GitFork,
  ExternalLink,
  CheckSquare,
  Square,
  AlertCircle,
  RefreshCw,
  X,
  ShieldCheck,
} from 'lucide-react';
import { GitHubRepoSummary, GitHubIngestionService } from '../../services/ingestion/githubIngestionService';

export type RepoSortOption = 'updated_desc' | 'name_asc' | 'name_desc' | 'lang_asc' | 'stars_desc';
export type RepoPageSize = 10 | 25 | 50 | 'all';

export interface GitHubRepoSelectorProps {
  repos: GitHubRepoSummary[];
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
  onSelectionChange?: () => void;
  service?: GitHubIngestionService;
  initialSearchTerm?: string;
  initialSortBy?: RepoSortOption;
  initialPageSize?: RepoPageSize;
}

export const GitHubRepoSelector: React.FC<GitHubRepoSelectorProps> = ({
  repos,
  isLoading,
  error,
  onRetry,
  onSelectionChange,
  service = GitHubIngestionService.getInstance(),
  initialSearchTerm = '',
  initialSortBy = 'updated_desc',
  initialPageSize = 10,
}) => {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [sortBy, setSortBy] = useState<RepoSortOption>(initialSortBy);
  const [pageSize, setPageSize] = useState<RepoPageSize>(initialPageSize);
  const [currentPage, setCurrentPage] = useState(1);
  const [, setRerenderTick] = useState(0);

  // Read current selected set directly from service
  const selectedNames = useMemo(() => new Set(service.getSelectedRepositoryNames()), [service, repos]);

  // 1. Filtered list
  const filteredRepos = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return repos;

    return repos.filter((r) => {
      const nameMatch = r.name.toLowerCase().includes(term);
      const fullNameMatch = r.fullName.toLowerCase().includes(term);
      const descMatch = (r.description || '').toLowerCase().includes(term);
      const langMatch = (r.primaryLanguage || '').toLowerCase().includes(term);
      const topicMatch = r.topics.some((t) => t.toLowerCase().includes(term));
      return nameMatch || fullNameMatch || descMatch || langMatch || topicMatch;
    });
  }, [repos, searchTerm]);

  // 2. Sorted list
  const sortedRepos = useMemo(() => {
    const list = [...filteredRepos];
    list.sort((a, b) => {
      switch (sortBy) {
        case 'updated_desc':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'name_asc':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        case 'name_desc':
          return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
        case 'lang_asc': {
          const lA = (a.primaryLanguage || 'zzz').toLowerCase();
          const lB = (b.primaryLanguage || 'zzz').toLowerCase();
          return lA.localeCompare(lB);
        }
        case 'stars_desc':
          return b.stargazersCount - a.stargazersCount;
        default:
          return 0;
      }
    });
    return list;
  }, [filteredRepos, sortBy]);

  // 3. Pagination calculation
  const totalItems = sortedRepos.length;
  const isAll = pageSize === 'all';
  const effectivePageSize = isAll ? Math.max(totalItems, 1) : pageSize;
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalItems / effectivePageSize));

  // Auto-clamp page when list shrinks
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedRepos = useMemo(() => {
    if (isAll) return sortedRepos;
    const startIndex = (safeCurrentPage - 1) * effectivePageSize;
    return sortedRepos.slice(startIndex, startIndex + effectivePageSize);
  }, [sortedRepos, isAll, safeCurrentPage, effectivePageSize]);

  // Counts
  const totalAccountRepos = repos.length;
  const totalSelectedCount = selectedNames.size;
  const filteredSelectedCount = useMemo(() => {
    return filteredRepos.filter((r) => selectedNames.has(r.fullName)).length;
  }, [filteredRepos, selectedNames]);

  const hasFilter = searchTerm.trim().length > 0;
  const allFilteredSelected = filteredRepos.length > 0 && filteredSelectedCount === filteredRepos.length;

  const triggerUpdate = () => {
    setRerenderTick((t) => t + 1);
    onSelectionChange?.();
  };

  const handleToggleOne = (fullName: string, checked: boolean) => {
    service.toggleRepositorySelection(fullName, checked);
    triggerUpdate();
  };

  const handleToggleFiltered = () => {
    if (allFilteredSelected) {
      // Deselect only filtered
      const namesToDeselect = filteredRepos.map((r) => r.fullName);
      service.deselectRepositories(namesToDeselect);
    } else {
      // Select all filtered
      const namesToSelect = filteredRepos.map((r) => r.fullName);
      service.selectRepositories(namesToSelect);
    }
    triggerUpdate();
  };

  const handleSelectAllAccount = () => {
    service.selectRepositories(repos.map((r) => r.fullName));
    triggerUpdate();
  };

  const handleClearAllSelections = () => {
    service.deselectRepositories();
    triggerUpdate();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 20px' }}>
      {/* Scope and Privacy Note */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: '#9299AA',
          borderBottom: '1px solid #1E2330',
          paddingBottom: '8px',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldCheck size={14} style={{ color: '#35C991' }} />
          <span>
            Displaying all account repositories. Private repositories require the <code>repo</code> token scope.
          </span>
        </span>
        <span style={{ fontWeight: 600, color: '#F3F4F8' }}>
          {totalSelectedCount} of {totalAccountRepos} selected
        </span>
      </div>

      {/* Control Toolbar: Search, Sort, PageSize */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Search Field */}
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#9299AA',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            data-testid="github-repo-search-input"
            aria-label="Filter repositories by name, description, language, or owner/repo"
            placeholder="Search by name, description, language, owner/repo..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              width: '100%',
              padding: '6px 30px 6px 32px',
              background: '#0F1218',
              border: '1px solid #292E3A',
              borderRadius: '6px',
              color: '#F3F4F8',
              fontSize: '12px',
              boxSizing: 'border-box',
            }}
          />
          {searchTerm && (
            <button
              type="button"
              data-testid="github-repo-search-clear"
              aria-label="Clear search filter"
              onClick={() => {
                setSearchTerm('');
                setCurrentPage(1);
              }}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: '#9299AA',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '2px',
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Sorting & Page Size Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#9299AA' }}>
            <ArrowUpDown size={12} />
            <select
              data-testid="github-repo-sort-select"
              aria-label="Sort repositories"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as RepoSortOption)}
              style={{
                background: '#0F1218',
                border: '1px solid #292E3A',
                borderRadius: '6px',
                color: '#F3F4F8',
                fontSize: '11px',
                padding: '5px 8px',
                cursor: 'pointer',
              }}
            >
              <option value="updated_desc">Recently Updated</option>
              <option value="name_asc">Name (A–Z)</option>
              <option value="name_desc">Name (Z–A)</option>
              <option value="lang_asc">Language (A–Z)</option>
              <option value="stars_desc">Most Stars</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#9299AA' }}>
            <span style={{ fontSize: '11px' }}>Per page:</span>
            <select
              data-testid="github-repo-pagesize-select"
              aria-label="Repositories per page"
              value={pageSize}
              onChange={(e) => {
                const val = e.target.value;
                setPageSize(val === 'all' ? 'all' : (Number(val) as RepoPageSize));
                setCurrentPage(1);
              }}
              style={{
                background: '#0F1218',
                border: '1px solid #292E3A',
                borderRadius: '6px',
                color: '#F3F4F8',
                fontSize: '11px',
                padding: '5px 8px',
                cursor: 'pointer',
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value="all">All (Scrollable)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bulk Selection Actions Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#161B22',
          border: '1px solid #292E3A',
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '11px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            data-testid="github-repo-select-filtered-btn"
            onClick={handleToggleFiltered}
            disabled={filteredRepos.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 8px',
              background: allFilteredSelected ? '#292E3A' : '#8B7CFF',
              border: 'none',
              borderRadius: '4px',
              color: '#FFFFFF',
              fontSize: '11px',
              fontWeight: 600,
              cursor: filteredRepos.length === 0 ? 'not-allowed' : 'pointer',
              opacity: filteredRepos.length === 0 ? 0.5 : 1,
            }}
          >
            {allFilteredSelected ? <Square size={12} /> : <CheckSquare size={12} />}
            <span>
              {hasFilter
                ? allFilteredSelected
                  ? `Deselect Filtered (${filteredRepos.length})`
                  : `Select Filtered (${filteredRepos.length})`
                : allFilteredSelected
                ? 'Deselect All'
                : `Select All (${filteredRepos.length})`}
            </span>
          </button>

          {/* Account-wide buttons when filter is active */}
          {hasFilter && (
            <>
              <button
                type="button"
                data-testid="github-repo-select-all-btn"
                onClick={handleSelectAllAccount}
                style={{
                  padding: '4px 8px',
                  background: 'transparent',
                  border: '1px solid #292E3A',
                  borderRadius: '4px',
                  color: '#8B7CFF',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Select Every Repo ({totalAccountRepos})
              </button>
              {totalSelectedCount > 0 && (
                <button
                  type="button"
                  data-testid="github-repo-clear-all-btn"
                  onClick={handleClearAllSelections}
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
                  Clear All ({totalSelectedCount})
                </button>
              )}
            </>
          )}

          {!hasFilter && totalSelectedCount > 0 && !allFilteredSelected && (
            <button
              type="button"
              data-testid="github-repo-clear-all-btn"
              onClick={handleClearAllSelections}
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
              Clear All Selections ({totalSelectedCount})
            </button>
          )}
        </div>

        <div style={{ color: '#9299AA', fontSize: '11px' }}>
          {hasFilter ? (
            <span>
              Showing <strong style={{ color: '#F3F4F8' }}>{filteredRepos.length}</strong> matching (
              <strong style={{ color: '#35C991' }}>{filteredSelectedCount}</strong> selected) of{' '}
              {totalAccountRepos} total
            </span>
          ) : (
            <span>
              Total: <strong style={{ color: '#F3F4F8' }}>{totalAccountRepos}</strong> repositories (
              <strong style={{ color: '#35C991' }}>{totalSelectedCount}</strong> selected)
            </span>
          )}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div
          data-testid="github-repo-loading-state"
          style={{
            padding: '24px',
            textAlign: 'center',
            color: '#9299AA',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <RefreshCw size={14} className="animate-spin" style={{ color: '#8B7CFF' }} />
          <span>Retrieving repositories from GitHub across all pages...</span>
        </div>
      )}

      {/* API / Rate Limit / Pagination Error State */}
      {!isLoading && error && (
        <div
          data-testid="github-repo-error-banner"
          style={{
            padding: '12px 14px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            color: '#F87171',
            fontSize: '12px',
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: '2px' }}>Failed to load GitHub repositories</div>
            <div style={{ color: '#EF4444', fontSize: '11px', marginBottom: '8px', wordBreak: 'break-word' }}>
              {error}
            </div>
            {onRetry && (
              <button
                type="button"
                data-testid="github-repo-retry-btn"
                onClick={onRetry}
                style={{
                  padding: '4px 10px',
                  background: '#8B7CFF',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#FFFFFF',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <RefreshCw size={11} />
                <span>Retry Fetch</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty States */}
      {!isLoading && !error && totalAccountRepos === 0 && (
        <div
          data-testid="github-repo-empty-account"
          style={{
            padding: '28px',
            textAlign: 'center',
            color: '#9299AA',
            fontSize: '12px',
          }}
        >
          <Globe size={24} style={{ color: '#8B7CFF', marginBottom: '8px', opacity: 0.7 }} />
          <div>No repositories found for this GitHub account.</div>
          <div style={{ fontSize: '11px', marginTop: '4px', color: '#6B7280' }}>
            Ensure your account has accessible repositories or check token permissions.
          </div>
        </div>
      )}

      {!isLoading && !error && totalAccountRepos > 0 && filteredRepos.length === 0 && (
        <div
          data-testid="github-repo-empty-search"
          style={{
            padding: '24px',
            textAlign: 'center',
            color: '#9299AA',
            fontSize: '12px',
          }}
        >
          <div>No repositories match "{searchTerm}".</div>
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setCurrentPage(1);
            }}
            style={{
              marginTop: '8px',
              padding: '4px 10px',
              background: '#1E2330',
              border: '1px solid #292E3A',
              borderRadius: '4px',
              color: '#8B7CFF',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Clear Filter
          </button>
        </div>
      )}

      {/* Repository List Area (No hardcoded 10-item truncation) */}
      {!isLoading && !error && paginatedRepos.length > 0 && (
        <div
          data-testid="github-repo-list-container"
          style={{
            maxHeight: '340px',
            overflowY: 'auto',
            border: '1px solid #1E2330',
            borderRadius: '6px',
            background: '#0F1218',
          }}
        >
          {paginatedRepos.map((r) => {
            const isSelected = selectedNames.has(r.fullName);
            return (
              <div
                key={r.id}
                data-testid={`github-repo-row-${r.name}`}
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid #1E2330',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  fontSize: '12px',
                  background: isSelected ? 'rgba(139, 124, 255, 0.05)' : 'transparent',
                  transition: 'background 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1, minWidth: 0 }}>
                  <input
                    type="checkbox"
                    data-testid={`github-repo-checkbox-${r.fullName}`}
                    aria-label={`Select ${r.fullName}`}
                    checked={isSelected}
                    onChange={(e) => handleToggleOne(r.fullName, e.target.checked)}
                    style={{
                      cursor: 'pointer',
                      marginTop: '3px',
                      accentColor: '#8B7CFF',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <strong style={{ color: '#F3F4F8', fontSize: '13px' }}>{r.name}</strong>
                      <span style={{ color: '#6B7280', fontSize: '11px' }}>({r.fullName})</span>

                      {/* Visibility Badge */}
                      {r.isPrivate ? (
                        <span
                          data-testid="badge-private"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            background: 'rgba(245, 158, 11, 0.12)',
                            color: '#F59E0B',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            padding: '1px 6px',
                            borderRadius: '10px',
                            fontSize: '10px',
                            fontWeight: 600,
                          }}
                        >
                          <Lock size={10} />
                          Private
                        </span>
                      ) : (
                        <span
                          data-testid="badge-public"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            background: 'rgba(53, 201, 145, 0.12)',
                            color: '#35C991',
                            border: '1px solid rgba(53, 201, 145, 0.3)',
                            padding: '1px 6px',
                            borderRadius: '10px',
                            fontSize: '10px',
                            fontWeight: 600,
                          }}
                        >
                          <Globe size={10} />
                          Public
                        </span>
                      )}

                      {/* Fork Badge */}
                      {r.isFork && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px',
                            background: '#1E2330',
                            color: '#9299AA',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            fontSize: '10px',
                          }}
                        >
                          <GitFork size={10} />
                          Fork
                        </span>
                      )}

                      {/* External Link */}
                      <a
                        href={r.htmlUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="View on GitHub"
                        style={{ color: '#9299AA', display: 'inline-flex', alignItems: 'center' }}
                      >
                        <ExternalLink size={11} />
                      </a>
                    </div>

                    <div
                      style={{
                        color: '#9299AA',
                        fontSize: '11px',
                        marginTop: '3px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={r.description || 'No description'}
                    >
                      {r.description || 'No description provided'}
                    </div>
                  </div>
                </div>

                {/* Right Metadata: Language, Stars, Updated */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flexShrink: 0,
                    fontSize: '11px',
                  }}
                >
                  {r.primaryLanguage && (
                    <span
                      style={{
                        color: '#8B7CFF',
                        background: 'rgba(139, 124, 255, 0.1)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 500,
                      }}
                    >
                      {r.primaryLanguage}
                    </span>
                  )}

                  {r.stargazersCount > 0 && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        color: '#EAB308',
                      }}
                    >
                      <Star size={11} />
                      {r.stargazersCount}
                    </span>
                  )}

                  <span style={{ color: '#6B7280', fontSize: '10px' }}>
                    {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Navigation Footer */}
      {!isLoading && !error && !isAll && totalPages > 1 && (
        <div
          data-testid="github-repo-pagination-controls"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#9299AA',
            paddingTop: '4px',
          }}
        >
          <div>
            Showing {(safeCurrentPage - 1) * effectivePageSize + 1}–
            {Math.min(safeCurrentPage * effectivePageSize, totalItems)} of {totalItems} repositories
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              data-testid="github-repo-page-first"
              disabled={safeCurrentPage === 1}
              onClick={() => setCurrentPage(1)}
              aria-label="First page"
              style={{
                padding: '4px 6px',
                background: '#161B22',
                border: '1px solid #292E3A',
                borderRadius: '4px',
                color: safeCurrentPage === 1 ? '#4B5563' : '#F3F4F8',
                cursor: safeCurrentPage === 1 ? 'not-allowed' : 'pointer',
              }}
            >
              <ChevronsLeft size={12} />
            </button>
            <button
              type="button"
              data-testid="github-repo-page-prev"
              disabled={safeCurrentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
              style={{
                padding: '4px 6px',
                background: '#161B22',
                border: '1px solid #292E3A',
                borderRadius: '4px',
                color: safeCurrentPage === 1 ? '#4B5563' : '#F3F4F8',
                cursor: safeCurrentPage === 1 ? 'not-allowed' : 'pointer',
              }}
            >
              <ChevronLeft size={12} />
            </button>

            <span style={{ padding: '0 8px', color: '#F3F4F8', fontWeight: 500 }}>
              Page {safeCurrentPage} of {totalPages}
            </span>

            <button
              type="button"
              data-testid="github-repo-page-next"
              disabled={safeCurrentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
              style={{
                padding: '4px 6px',
                background: '#161B22',
                border: '1px solid #292E3A',
                borderRadius: '4px',
                color: safeCurrentPage === totalPages ? '#4B5563' : '#F3F4F8',
                cursor: safeCurrentPage === totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              <ChevronRight size={12} />
            </button>
            <button
              type="button"
              data-testid="github-repo-page-last"
              disabled={safeCurrentPage === totalPages}
              onClick={() => setCurrentPage(totalPages)}
              aria-label="Last page"
              style={{
                padding: '4px 6px',
                background: '#161B22',
                border: '1px solid #292E3A',
                borderRadius: '4px',
                color: safeCurrentPage === totalPages ? '#4B5563' : '#F3F4F8',
                cursor: safeCurrentPage === totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              <ChevronsRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
