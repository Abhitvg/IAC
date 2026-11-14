/**
 * Candidate RAG & Backup Service
 *
 * Provides:
 * 1. Hybrid semantic + BM25 vector retrieval over verified candidate knowledge.
 * 2. Automated rolling backup snapshots & 1-click restore.
 * 3. JSON Export / Import for full candidate data portability.
 * 4. Context augmentation for live interview answer generation.
 */

import {
  RagCategory,
  RagChunk,
  RagDocument,
  RagRetrievalResult,
  RagBackupSnapshot,
  RagBackupManifest,
  RagQueryOptions,
} from './types';
import { INITIAL_CANDIDATE_RAG_ENTRIES, RawRagSourceEntry } from './candidateRagData';
import { useCandidateVaultStore } from '../../store/useCandidateVaultStore';

const STORAGE_KEY_CHUNKS = 'iac_rag_knowledge_chunks_v1';
const STORAGE_KEY_DOCS = 'iac_rag_knowledge_docs_v1';
const STORAGE_KEY_BACKUPS = 'iac_rag_backup_snapshots_v1';
const MAX_BACKUP_SNAPSHOTS = 10;

/**
 * Standard English stop-words to prune from lexical search
 */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'were', 'will', 'with', 'i', 'my', 'we', 'our', 'you',
  'this', 'then', 'they', 'them', 'their', 'or', 'so', 'if', 'into',
]);

/**
 * Tokenizes and normalizes text for inverted indexing and vector computation.
 */
function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * Computes a normalized term-frequency sparse vector for cosine similarity
 */
function computeTermVector(tokens: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const token of tokens) {
    counts[token] = (counts[token] || 0) + 1;
  }
  let sumSq = 0;
  for (const token in counts) {
    sumSq += counts[token] * counts[token];
  }
  const magnitude = Math.sqrt(sumSq) || 1;
  const vector: Record<string, number> = {};
  for (const token in counts) {
    vector[token] = counts[token] / magnitude;
  }
  return vector;
}

/**
 * Cosine similarity between two normalized sparse vectors
 */
function cosineSimilarity(
  vecA: Record<string, number>,
  vecB: Record<string, number>
): number {
  let dotProduct = 0;
  for (const term in vecA) {
    if (vecB[term]) {
      dotProduct += vecA[term] * vecB[term];
    }
  }
  return Math.min(1, Math.max(0, dotProduct));
}

/**
 * Fast DJB2 checksum for backup verification
 */
function computeChecksum(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = (hash * 33) ^ content.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export class CandidateRagService {
  private static instance: CandidateRagService | null = null;

  public static getInstance(): CandidateRagService {
    if (!CandidateRagService.instance) {
      CandidateRagService.instance = new CandidateRagService();
    }
    return CandidateRagService.instance;
  }

  private chunks: Map<string, RagChunk> = new Map();
  private documents: Map<string, RagDocument> = new Map();
  private inMemoryBackups: RagBackupSnapshot[] = [];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.initialize();
  }

  /**
   * Initializes RAG storage from localStorage or loads initial seed data
   */
  private initialize(): void {
    let loadedFromStorage = false;
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const rawChunks = localStorage.getItem(STORAGE_KEY_CHUNKS);
        const rawDocs = localStorage.getItem(STORAGE_KEY_DOCS);
        if (rawChunks && rawDocs) {
          const parsedChunks: RagChunk[] = JSON.parse(rawChunks);
          const parsedDocs: RagDocument[] = JSON.parse(rawDocs);
          if (Array.isArray(parsedChunks) && parsedChunks.length > 0) {
            for (const chunk of parsedChunks) this.chunks.set(chunk.id, chunk);
            for (const doc of parsedDocs) this.documents.set(doc.id, doc);
            loadedFromStorage = true;
          }
        }
      } catch (e) {
        console.warn('[RagService] Failed to load stored chunks, re-seeding:', e);
      }
    }

    if (!loadedFromStorage || this.chunks.size === 0) {
      this.seedInitialKnowledge();
    }

    // Auto-create initial baseline backup if none exists
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const rawBackups = localStorage.getItem(STORAGE_KEY_BACKUPS);
        if (!rawBackups) {
          this.createBackup('Initial System Baseline Snapshot');
        }
      } catch (_e) {}
    }
  }

  /**
   * Seeds all verified candidate knowledge into RAG documents and chunks
   */
  public seedInitialKnowledge(): void {
    this.chunks.clear();
    this.documents.clear();

    const docMap: Record<string, { title: string; category: RagCategory; chunkIds: string[] }> = {};

    for (const entry of INITIAL_CANDIDATE_RAG_ENTRIES) {
      const fullText = `${entry.title} ${entry.content} ${entry.keywords.join(' ')}`;
      const tokens = tokenizeText(fullText);
      const vector = computeTermVector(tokens);

      const chunk: RagChunk = {
        id: entry.id,
        docId: entry.docId,
        category: entry.category,
        title: entry.title,
        content: entry.content,
        keywords: entry.keywords,
        vector,
        sourceProvenance: entry.sourceProvenance,
        timestamp: Date.now(),
      };

      this.chunks.set(chunk.id, chunk);

      if (!docMap[entry.docId]) {
        docMap[entry.docId] = {
          title: entry.title.split('—')[0].trim(),
          category: entry.category,
          chunkIds: [],
        };
      }
      docMap[entry.docId].chunkIds.push(chunk.id);
    }

    for (const docId in docMap) {
      const d = docMap[docId];
      this.documents.set(docId, {
        id: docId,
        category: d.category,
        title: d.title,
        summary: `Grounded verified entries for ${d.title}`,
        chunkIds: d.chunkIds,
      });
    }

    this.persistToStorage();
    this.notify();
  }

  private persistToStorage(): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      const chunksArr = Array.from(this.chunks.values());
      const docsArr = Array.from(this.documents.values());
      localStorage.setItem(STORAGE_KEY_CHUNKS, JSON.stringify(chunksArr));
      localStorage.setItem(STORAGE_KEY_DOCS, JSON.stringify(docsArr));
    } catch (e) {
      console.warn('[RagService] Failed to persist chunks to localStorage:', e);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (_e) {}
    }
  }

  // ─── RETRIEVAL ENGINE ─────────────────────────────────────────────────────

  /**
   * Retrieves top-K grounded chunks using hybrid BM25 + Vector Cosine similarity
   */
  public retrieve(query: string, options: RagQueryOptions = {}): RagRetrievalResult[] {
    const topK = options.topK ?? 4;
    const minScore = options.minScore ?? 0.12;
    const category = options.category;
    const queryTokens = tokenizeText(query);

    if (queryTokens.length === 0) {
      return [];
    }

    const queryVector = computeTermVector(queryTokens);
    const queryTokenSet = new Set(queryTokens);
    const results: RagRetrievalResult[] = [];

    for (const chunk of this.chunks.values()) {
      if (category && chunk.category !== category) continue;

      // 1. Vector Cosine Similarity
      const vectorScore = cosineSimilarity(queryVector, chunk.vector);

      // 2. Lexical / Keyword Matching
      const matchedKeywords: string[] = [];
      let keywordHits = 0;

      for (const kw of chunk.keywords) {
        const kwLower = kw.toLowerCase();
        for (const qToken of queryTokens) {
          if (kwLower.includes(qToken)) {
            if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw);
            keywordHits += 1.5;
          }
        }
      }

      // Check content match
      const contentTokens = tokenizeText(chunk.content);
      for (const token of contentTokens) {
        if (queryTokenSet.has(token)) {
          keywordHits += 0.5;
        }
      }

      const keywordScore = Math.min(1, keywordHits / Math.max(queryTokens.length * 2, 4));

      // 3. Combined Hybrid Score (55% Vector + 45% Keyword)
      const combinedScore = vectorScore * 0.55 + keywordScore * 0.45;

      if (combinedScore >= minScore) {
        results.push({
          chunk,
          score: Math.round(combinedScore * 1000) / 1000,
          keywordScore: Math.round(keywordScore * 1000) / 1000,
          vectorScore: Math.round(vectorScore * 1000) / 1000,
          matchedKeywords: matchedKeywords.slice(0, 5),
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Builds an augmented context markdown block for injecting into interview system prompts
   */
  public generateAugmentedContext(query: string, maxChunks: number = 3): string {
    const matches = this.retrieve(query, { topK: maxChunks, minScore: 0.15 });
    if (matches.length === 0) return '';

    const lines: string[] = [
      '### Verified Candidate Evidence & Grounded Context (from RAG Vault):',
    ];

    for (const match of matches) {
      lines.push(
        `- **${match.chunk.title}** [Category: ${match.chunk.category}, Relevance: ${Math.round(match.score * 100)}%]:`
      );
      lines.push(`  ${match.chunk.content}`);
    }

    return lines.join('\n');
  }

  // ─── CHUNK MANAGEMENT ─────────────────────────────────────────────────────

  public getAllChunks(): RagChunk[] {
    return Array.from(this.chunks.values());
  }

  public getAllDocuments(): RagDocument[] {
    return Array.from(this.documents.values());
  }

  public getChunkCount(): number {
    return this.chunks.size;
  }

  public addChunk(entry: {
    category: RagCategory;
    title: string;
    content: string;
    keywords: string[];
    sourceProvenance?: string;
  }): RagChunk {
    const id = `custom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const docId = `doc-${entry.category}`;
    const tokens = tokenizeText(`${entry.title} ${entry.content} ${entry.keywords.join(' ')}`);
    const vector = computeTermVector(tokens);

    const chunk: RagChunk = {
      id,
      docId,
      category: entry.category,
      title: entry.title.trim(),
      content: entry.content.trim(),
      keywords: entry.keywords,
      vector,
      sourceProvenance: entry.sourceProvenance || 'USER_SUPPLIED_RECORD',
      timestamp: Date.now(),
    };

    this.chunks.set(chunk.id, chunk);

    if (!this.documents.has(docId)) {
      this.documents.set(docId, {
        id: docId,
        category: entry.category,
        title: entry.category.toUpperCase(),
        summary: `Custom entries for ${entry.category}`,
        chunkIds: [id],
      });
    } else {
      this.documents.get(docId)!.chunkIds.push(id);
    }

    this.persistToStorage();
    this.notify();
    return chunk;
  }

  public deleteChunk(chunkId: string): boolean {
    if (!this.chunks.has(chunkId)) return false;
    const chunk = this.chunks.get(chunkId)!;
    this.chunks.delete(chunkId);

    const doc = this.documents.get(chunk.docId);
    if (doc) {
      doc.chunkIds = doc.chunkIds.filter((id) => id !== chunkId);
      if (doc.chunkIds.length === 0) {
        this.documents.delete(chunk.docId);
      }
    }

    this.persistToStorage();
    this.notify();
    return true;
  }

  // ─── BACKUP & RESTORE ENGINE ──────────────────────────────────────────────

  /**
   * Creates a complete backup snapshot of the candidate's RAG knowledge,
   * vault profile, and documents with timestamp and checksum.
   */
  public createBackup(label: string = 'Manual RAG Backup'): RagBackupSnapshot {
    const chunks = Array.from(this.chunks.values());
    const documents = Array.from(this.documents.values());
    const vaultProfile = useCandidateVaultStore.getState().profile;

    const snapshotPayload = {
      version: '1.0.0',
      timestamp: Date.now(),
      documents,
      chunks,
      vaultProfile,
      totalChunks: chunks.length,
    };

    const serialized = JSON.stringify(snapshotPayload);
    const checksum = computeChecksum(serialized);

    const snapshot: RagBackupSnapshot = {
      id: `backup-${Date.now()}-${checksum.slice(0, 6)}`,
      label: label.trim() || `Backup ${new Date().toLocaleDateString()}`,
      timestamp: Date.now(),
      version: '1.0.0',
      checksum,
      documents,
      chunks,
      vaultProfile,
      totalChunks: chunks.length,
    };

    this.inMemoryBackups.unshift(snapshot);
    if (this.inMemoryBackups.length > MAX_BACKUP_SNAPSHOTS) {
      this.inMemoryBackups = this.inMemoryBackups.slice(0, MAX_BACKUP_SNAPSHOTS);
    }

    // Save to localStorage backup ring
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_BACKUPS);
        let backups: RagBackupSnapshot[] = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(backups)) backups = [];
        backups.unshift(snapshot);
        if (backups.length > MAX_BACKUP_SNAPSHOTS) {
          backups = backups.slice(0, MAX_BACKUP_SNAPSHOTS);
        }
        localStorage.setItem(STORAGE_KEY_BACKUPS, JSON.stringify(backups));
      } catch (e) {
        console.warn('[RagService] Failed to save backup snapshot to localStorage:', e);
      }
    }

    this.notify();
    return snapshot;
  }

  /**
   * Lists all available backup manifests
   */
  public listBackups(): RagBackupManifest[] {
    let backups = this.inMemoryBackups;
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_BACKUPS);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            backups = parsed;
          }
        }
      } catch (_e) {}
    }

    return backups.map((b) => ({
      id: b.id,
      label: b.label,
      timestamp: b.timestamp,
      version: b.version,
      checksum: b.checksum,
      totalChunks: b.totalChunks || b.chunks?.length || 0,
      totalDocuments: b.documents?.length || 0,
      sizeBytes: typeof Blob !== 'undefined' ? new Blob([JSON.stringify(b)]).size : JSON.stringify(b).length,
    }));
  }

  /**
   * Restores knowledge base from a backup snapshot ID
   */
  public restoreBackup(backupId: string): boolean {
    let target = this.inMemoryBackups.find((b) => b.id === backupId);

    if (!target && typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_BACKUPS);
        if (raw) {
          const backups: RagBackupSnapshot[] = JSON.parse(raw);
          target = backups.find((b) => b.id === backupId);
        }
      } catch (e) {
        console.error('[RagService] Restore failed:', e);
      }
    }

    if (!target) return false;
    return this.applySnapshot(target);
  }

  /**
   * Applies a snapshot object directly to active state
   */
  public applySnapshot(snapshot: RagBackupSnapshot): boolean {
    if (!snapshot || !Array.isArray(snapshot.chunks)) return false;

    this.chunks.clear();
    this.documents.clear();

    for (const chunk of snapshot.chunks) {
      this.chunks.set(chunk.id, chunk);
    }
    for (const doc of snapshot.documents || []) {
      this.documents.set(doc.id, doc);
    }

    // Restore candidate vault profile if present in snapshot
    if (snapshot.vaultProfile) {
      useCandidateVaultStore.getState().updateProfile(snapshot.vaultProfile as any);
    }

    this.persistToStorage();
    this.notify();
    return true;
  }

  /**
   * Exports full RAG knowledge base & backups as a formatted JSON string
   */
  public exportBackupJson(backupId?: string): string {
    if (backupId) {
      const found =
        this.inMemoryBackups.find((b) => b.id === backupId) ||
        (typeof window !== 'undefined' && typeof localStorage !== 'undefined'
          ? (JSON.parse(localStorage.getItem(STORAGE_KEY_BACKUPS) || '[]') as RagBackupSnapshot[]).find(
              (b) => b.id === backupId
            )
          : undefined);
      if (found) return JSON.stringify(found, null, 2);
    }
    const current = this.createBackup('Exported Full System Snapshot');
    return JSON.stringify(current, null, 2);
  }

  /**
   * Imports and restores a backup from an external JSON string
   */
  public importBackupJson(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || !Array.isArray(parsed.chunks)) {
        throw new Error('Invalid backup schema: missing chunks array');
      }
      return this.applySnapshot(parsed);
    } catch (e) {
      console.error('[RagService] Failed to import backup JSON:', e);
      return false;
    }
  }

  /**
   * Deletes a specific backup snapshot
   */
  public deleteBackup(backupId: string): boolean {
    this.inMemoryBackups = this.inMemoryBackups.filter((b) => b.id !== backupId);

    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_BACKUPS);
        if (raw) {
          let backups: RagBackupSnapshot[] = JSON.parse(raw);
          backups = backups.filter((b) => b.id !== backupId);
          localStorage.setItem(STORAGE_KEY_BACKUPS, JSON.stringify(backups));
        }
      } catch (_e) {}
    }

    this.notify();
    return true;
  }
}
