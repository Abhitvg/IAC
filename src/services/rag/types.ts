/**
 * RAG & Backup Domain Types
 * Defines data structures for candidate knowledge chunks, vector indexing,
 * hybrid retrieval, and persistent full-system backup snapshots.
 */

export type RagCategory =
  | 'profile'
  | 'project'
  | 'experience'
  | 'competency'
  | 'star_story'
  | 'architecture'
  | 'interview_qa'
  | 'credential';

export interface RagChunk {
  id: string;
  docId: string;
  category: RagCategory;
  title: string;
  content: string;
  keywords: string[];
  vector: Record<string, number>;
  sourceProvenance: string;
  timestamp: number;
}

export interface RagDocument {
  id: string;
  category: RagCategory;
  title: string;
  summary: string;
  chunkIds: string[];
  metadata?: Record<string, unknown>;
}

export interface RagRetrievalResult {
  chunk: RagChunk;
  score: number;
  keywordScore: number;
  vectorScore: number;
  matchedKeywords: string[];
}

export interface RagBackupSnapshot {
  id: string;
  label: string;
  timestamp: number;
  version: string;
  checksum: string;
  documents: RagDocument[];
  chunks: RagChunk[];
  candidateProfile?: any;
  vaultProfile?: any;
  totalChunks: number;
}

export interface RagBackupManifest {
  id: string;
  label: string;
  timestamp: number;
  version: string;
  checksum: string;
  totalChunks: number;
  totalDocuments: number;
  sizeBytes: number;
}

export interface RagQueryOptions {
  topK?: number;
  category?: RagCategory;
  minScore?: number;
  requireKeywords?: string[];
}
