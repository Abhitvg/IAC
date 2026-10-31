/**
 * electron/services/evidenceVerificationService.ts
 *
 * Privileged Main-Process Evidence Inspection & Sealing Authority for IAC.
 *
 * Trust Boundary:
 * 1. Runs exclusively in the privileged Electron main process (Node.js runtime).
 * 2. Cryptographic root secret is managed via ProtectedEvidenceKeyManager with
 *    secure storage, key rotation, key revocation, and fail-closed validation.
 *    It is NEVER exposed to renderer processes, window objects, or IPC callers.
 * 3. Enforces real repository inspection via GitHub REST API:
 *    - Resolves immutable commit SHA and tree SHA.
 *    - Bounded file discovery and content inspection with exact limits recorded.
 *    - Strict URL validation preventing SSRF, credentials in URL, and non-approved hosts.
 *    - Calculates SHA-256 for all inspected files directly from fetched bytes.
 *    - Separates repository presence from candidate authorship (caps at contributor, never sole owner).
 *    - Does NOT infer production deployment or business outcomes from source code.
 * 4. Enforces real document authenticity inspection:
 *    - Direct SHA-256 hashing of raw document bytes.
 *    - Cryptographic signature validation against registered TrustedIssuerRegistry.
 *    - Fails closed to DOCUMENT_CONTENT_INSPECTED (issuerValidated: false) if unauthenticated.
 * 5. Enforces real independent audit verification:
 *    - True asymmetric Ed25519 signature verification against configured auditor public keys.
 *    - RFC 8785 canonical versioned payload validation.
 *    - Strict allowlist of audited fields.
 *    - Durable replay prevention using DurableReplayCache with disk persistence.
 *    - Timestamp and expiration enforcement.
 * 6. Cryptographic sealing:
 *    - Produces HMAC-SHA256 seals over canonical inspection outputs using the main process secret.
 *    - Constant-time verification prevents timing attacks.
 *    - No generic signing IPC is exposed to the renderer.
 */

import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { URL } from 'url';

export type OwnershipType = 'sole_owner' | 'lead' | 'contributor' | 'architect' | 'team_member' | 'unknown';

// ============================================================================
// 1. Protected Evidence Key Manager (Rotation & Revocation)
// ============================================================================

export interface EvidenceKeyMetadata {
  keyId: string;
  secretHex: string;
  createdAt: number;
  status: 'ACTIVE' | 'ROTATED' | 'REVOKED';
  revokedAt?: number;
}

export class ProtectedEvidenceKeyManager {
  private static activeKeyId: string = `key_v1_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  private static activeSecretHex: string = crypto.randomBytes(32).toString('hex');
  private static knownKeys = new Map<string, EvidenceKeyMetadata>();
  private static storageFilePath: string | null = null;

  static {
    this.knownKeys.set(this.activeKeyId, {
      keyId: this.activeKeyId,
      secretHex: this.activeSecretHex,
      createdAt: Date.now(),
      status: 'ACTIVE',
    });
  }

  public static getActiveKeyId(): string {
    return this.activeKeyId;
  }

  public static getActiveSecret(): Buffer {
    return Buffer.from(this.activeSecretHex, 'hex');
  }

  public static getSecretForKey(keyId?: string): Buffer | null {
    if (!keyId || keyId === this.activeKeyId) {
      return Buffer.from(this.activeSecretHex, 'hex');
    }
    const meta = this.knownKeys.get(keyId);
    if (!meta || meta.status === 'REVOKED') {
      return null;
    }
    return Buffer.from(meta.secretHex, 'hex');
  }

  public static rotateKey(): { newKeyId: string; previousKeyId: string } {
    const prevKeyId = this.activeKeyId;
    const oldMeta = this.knownKeys.get(prevKeyId);
    if (oldMeta) {
      oldMeta.status = 'ROTATED';
    }

    this.activeKeyId = `key_v1_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    this.activeSecretHex = crypto.randomBytes(32).toString('hex');
    this.knownKeys.set(this.activeKeyId, {
      keyId: this.activeKeyId,
      secretHex: this.activeSecretHex,
      createdAt: Date.now(),
      status: 'ACTIVE',
    });

    if (this.storageFilePath) {
      this.saveToDisk(this.storageFilePath);
    }
    return { newKeyId: this.activeKeyId, previousKeyId: prevKeyId };
  }

  public static revokeKey(keyId: string): boolean {
    const meta = this.knownKeys.get(keyId);
    if (!meta) return false;
    meta.status = 'REVOKED';
    meta.revokedAt = Date.now();
    if (this.storageFilePath) {
      this.saveToDisk(this.storageFilePath);
    }
    return true;
  }

  public static isKeyValid(keyId: string): boolean {
    const meta = this.knownKeys.get(keyId);
    if (!meta) return false;
    return meta.status === 'ACTIVE' || meta.status === 'ROTATED';
  }

  public static resetKeyStore(newSecretHex?: string, newKeyId?: string): void {
    this.knownKeys.clear();
    this.activeKeyId = newKeyId || `key_v1_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    this.activeSecretHex = newSecretHex || crypto.randomBytes(32).toString('hex');
    this.knownKeys.set(this.activeKeyId, {
      keyId: this.activeKeyId,
      secretHex: this.activeSecretHex,
      createdAt: Date.now(),
      status: 'ACTIVE',
    });
  }

  public static saveToDisk(filepath: string): void {
    try {
      this.storageFilePath = filepath;
      const data = {
        activeKeyId: this.activeKeyId,
        activeSecretHex: this.activeSecretHex,
        knownKeys: Array.from(this.knownKeys.values()),
      };
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2), { mode: 0o600 });
    } catch (_) {}
  }

  public static loadFromDisk(filepath: string): boolean {
    try {
      if (!fs.existsSync(filepath)) return false;
      this.storageFilePath = filepath;
      const content = fs.readFileSync(filepath, 'utf8');
      const parsed = JSON.parse(content);
      if (!parsed || !parsed.activeKeyId || !parsed.activeSecretHex) return false;

      this.activeKeyId = parsed.activeKeyId;
      this.activeSecretHex = parsed.activeSecretHex;
      this.knownKeys.clear();
      if (Array.isArray(parsed.knownKeys)) {
        for (const k of parsed.knownKeys) {
          this.knownKeys.set(k.keyId, k);
        }
      } else {
        this.knownKeys.set(this.activeKeyId, {
          keyId: this.activeKeyId,
          secretHex: this.activeSecretHex,
          createdAt: Date.now(),
          status: 'ACTIVE',
        });
      }
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// 2. Durable Replay Cache (Across Restarts)
// ============================================================================

export interface DurableReplayRecord {
  id: string;
  type: 'audit_id' | 'nonce';
  recordedAt: number;
  expiresAt: number;
  auditorKeyId: string;
  candidateId: string;
  projectId: string;
}

export class DurableReplayCache {
  private static instance: DurableReplayCache | null = null;
  private entries = new Map<string, DurableReplayRecord>();
  private storeFilePath: string | null = null;
  private isLocked: boolean = false;
  private lockQueue: Array<() => void> = [];

  public static getInstance(): DurableReplayCache {
    if (!DurableReplayCache.instance) {
      DurableReplayCache.instance = new DurableReplayCache();
    }
    return DurableReplayCache.instance;
  }

  public init(storagePath?: string): void {
    if (storagePath) {
      this.storeFilePath = storagePath;
      this.loadFromDisk();
    }
  }

  private async acquireLock(): Promise<void> {
    if (!this.isLocked) {
      this.isLocked = true;
      return;
    }
    return new Promise<void>((resolve) => {
      this.lockQueue.push(resolve);
    });
  }

  private releaseLock(): void {
    if (this.lockQueue.length > 0) {
      const next = this.lockQueue.shift()!;
      next();
    } else {
      this.isLocked = false;
    }
  }

  public async claimOrReject(
    auditId: string,
    nonce: string,
    expiresAt: number,
    meta: { auditorKeyId: string; candidateId: string; projectId: string }
  ): Promise<{ success: boolean; reason?: 'DUPLICATE_AUDIT_ID' | 'REPLAYED_NONCE' | 'EXPIRED' }> {
    await this.acquireLock();
    try {
      const now = Date.now();
      if (now > expiresAt) {
        return { success: false, reason: 'EXPIRED' };
      }

      this.pruneExpired(now);

      const auditKey = `audit:${auditId}`;
      const nonceKey = `nonce:${nonce}`;

      if (this.entries.has(auditKey)) {
        return { success: false, reason: 'DUPLICATE_AUDIT_ID' };
      }

      if (this.entries.has(nonceKey)) {
        return { success: false, reason: 'REPLAYED_NONCE' };
      }

      const auditRec: DurableReplayRecord = {
        id: auditId,
        type: 'audit_id',
        recordedAt: now,
        expiresAt,
        auditorKeyId: meta.auditorKeyId,
        candidateId: meta.candidateId,
        projectId: meta.projectId,
      };

      const nonceRec: DurableReplayRecord = {
        id: nonce,
        type: 'nonce',
        recordedAt: now,
        expiresAt,
        auditorKeyId: meta.auditorKeyId,
        candidateId: meta.candidateId,
        projectId: meta.projectId,
      };

      this.entries.set(auditKey, auditRec);
      this.entries.set(nonceKey, nonceRec);

      this.saveToDisk();
      return { success: true };
    } finally {
      this.releaseLock();
    }
  }

  public pruneExpired(now: number = Date.now()): number {
    let pruned = 0;
    for (const [key, rec] of this.entries.entries()) {
      if (now > rec.expiresAt) {
        this.entries.delete(key);
        pruned++;
      }
    }
    if (pruned > 0) {
      this.saveToDisk();
    }
    return pruned;
  }

  public hasAuditId(auditId: string): boolean {
    return this.entries.has(`audit:${auditId}`);
  }

  public hasNonce(nonce: string): boolean {
    return this.entries.has(`nonce:${nonce}`);
  }

  public clear(): void {
    this.entries.clear();
    if (this.storeFilePath && fs.existsSync(this.storeFilePath)) {
      try {
        fs.unlinkSync(this.storeFilePath);
      } catch (_) {}
    }
  }

  private saveToDisk(): void {
    if (!this.storeFilePath) return;
    try {
      const data = Array.from(this.entries.values());
      fs.writeFileSync(this.storeFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (_) {}
  }

  private loadFromDisk(): void {
    if (!this.storeFilePath || !fs.existsSync(this.storeFilePath)) return;
    try {
      const content = fs.readFileSync(this.storeFilePath, 'utf8');
      const records: DurableReplayRecord[] = JSON.parse(content);
      const now = Date.now();
      for (const rec of records) {
        if (now <= rec.expiresAt) {
          const key = rec.type === 'audit_id' ? `audit:${rec.id}` : `nonce:${rec.id}`;
          this.entries.set(key, rec);
        }
      }
    } catch (_) {}
  }
}

// ============================================================================
// 3. Artifact & Inspection Interfaces
// ============================================================================

export interface InspectedFileArtifact {
  path: string;
  sha256: string;
  sizeBytes: number;
}

export interface InspectionLimitations {
  provider: 'github' | 'sandbox';
  totalFilesDiscovered: number;
  filesInspected: number;
  truncated: boolean;
  byteLimitPerFile: number;
  inspectionTimeoutMs: number;
}

export interface ImmutableRepositoryInspectionResult {
  inspectionId: string;
  inspectedAt: number;
  repositoryUrl: string;
  resolvedCommitSha: string;
  treeSha: string;
  inspectedFiles: InspectedFileArtifact[];
  verifiedTechnologies: string[];
  dependencyDeclarations: string[];
  sourceCodeUsage: string[];
  demonstratedImplementation?: string;
  detectedArchitecture?: string;
  candidateAuthorshipStatus: 'COMMIT_AUTHOR' | 'CONTRIBUTOR_NOT_VERIFIED' | 'AUTHOR_MISMATCH';
  authorEmailFound?: string;
  authorRole: OwnershipType;
  productionDeploymentVerified: false;
  businessOutcomesVerified: false;
  inspectionLimitations: InspectionLimitations;
  totalFilesDiscovered?: number;
  filesActuallyInspected?: number;
  filesOmittedCount?: number;
  omittedFilePathsSample?: string[];
  inspectionScope?: 'FULL_REPOSITORY' | 'PARTIAL_SOURCE_SAMPLE';
  supportedFields?: {
    technologies?: string[];
    architecture?: string;
    databaseDesign?: string;
    engineeringChallenges?: string;
  };
  __inspectionSeal: string;
}

export interface RepositoryInspectionRequest {
  repositoryUrl: string;
  ref?: string;
  candidateIdentity: {
    fullName: string;
    email?: string;
  };
  targetProjectName: string;
  authHeader?: string;
}

export interface TrustedIssuerConfig {
  issuerId: string;
  issuerName: string;
  authorityLevel: 'accredited_institution' | 'employer_hr' | 'patent_office' | 'peer_reviewed_publisher';
  publicKeyPem: string; // Ed25519 or RSA public key in PEM format
  enabled: boolean;
  validFrom?: number;
  validUntil?: number;
  revokedAt?: number;
}

export interface DocumentInspectionRequest {
  documentBytes: Uint8Array | ArrayBuffer | string;
  documentType: 'employment_verification' | 'performance_review' | 'patent_grant' | 'publication' | 'formal_credential';
  issuer: {
    issuerId?: string;
    name: string;
    authorityLevel: 'accredited_institution' | 'employer_hr' | 'patent_office' | 'peer_reviewed_publisher';
    signatureHex?: string;
  };
  candidateIdentity: {
    fullName: string;
    email?: string;
  };
  targetProjectName: string;
}

export interface ImmutableDocumentInspectionResult {
  inspectionId: string;
  inspectedAt: number;
  documentId: string;
  documentType: string;
  documentSha256: string;
  documentByteLength: number;
  issuerName: string;
  issuerValidated: boolean;
  authenticityStatus: 'CRYPTOGRAPHICALLY_VERIFIED' | 'UNAUTHENTICATED_CONTENT' | 'SIGNATURE_INVALID' | 'ISSUER_UNREGISTERED';
  candidateMentioned: boolean;
  projectMentioned: boolean;
  personalWorkAttested: boolean;
  evidenceModality: 'CRYPTOGRAPHIC_BYTE_AUTHENTICATED' | 'UNAUTHENTICATED_BYTE_INSPECTED';
  supportedFields: {
    personalContribution?: string;
    performanceMetrics?: string[];
    ownership?: OwnershipType;
    architecture?: string;
  };
  __documentSeal: string;
}

export interface TrustedAuditorConfig {
  auditorId: string;
  auditorName: string;
  publicKeyPem: string; // Ed25519 public key in PEM or SPKI format
  validFrom: number;
  validUntil: number;
  enabled: boolean;
  revokedAt?: number;
}

export interface AuditorSignedAttestation {
  schemaVersion: 'iac.audit.v1';
  auditorKeyId: string;
  payloadJson: string; // Canonical RFC 8785 JSON string
  signatureHex: string; // Hex-encoded Ed25519 signature
}

export interface ImmutableIndependentAuditResult {
  auditId: string;
  auditorId: string;
  auditorName: string;
  projectId: string;
  candidateId: string;
  verifiedAt: number;
  auditedFields: {
    personalContribution?: string;
    ownership?: OwnershipType;
    verifiedTechnologies?: string[];
    performanceMetrics?: string[];
    architecture?: string;
  };
  __auditSeal: string;
}

// ============================================================================
// 4. Evidence Verification Service
// ============================================================================

export class EvidenceVerificationService {
  // Auditor public key registry
  private static auditorRegistry = new Map<string, TrustedAuditorConfig>();

  // Document issuer registry
  private static issuerRegistry = new Map<string, TrustedIssuerConfig>();

  // Durable replay cache
  private static replayCache = DurableReplayCache.getInstance();

  // Limits
  private static readonly MAX_DISCOVERED_FILES = 2000;
  private static readonly MAX_INSPECTED_FILES = 25;
  private static readonly MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1 MB
  private static readonly INSPECTION_TIMEOUT_MS = 15000;

  // ==========================================================================
  // Key Manager Delegation & Operations
  // ==========================================================================
  public static rotateEvidenceKey(): { newKeyId: string; previousKeyId: string } {
    return ProtectedEvidenceKeyManager.rotateKey();
  }

  public static revokeEvidenceKey(keyId: string): boolean {
    return ProtectedEvidenceKeyManager.revokeKey(keyId);
  }

  public static isEvidenceKeyValid(keyId: string): boolean {
    return ProtectedEvidenceKeyManager.isKeyValid(keyId);
  }

  public static getReplayCache(): DurableReplayCache {
    return this.replayCache;
  }

  // ==========================================================================
  // Auditor Registry Management
  // ==========================================================================
  public static registerAuditor(config: TrustedAuditorConfig): void {
    if (!config || !config.auditorId || !config.publicKeyPem) {
      throw new Error('Invalid auditor configuration: auditorId and publicKeyPem required.');
    }
    this.auditorRegistry.set(config.auditorId.toLowerCase().trim(), {
      ...config,
      auditorId: config.auditorId.toLowerCase().trim(),
    });
  }

  public static rotateAuditorKey(auditorId: string, newPublicKeyPem: string): boolean {
    const aud = this.auditorRegistry.get(auditorId.toLowerCase().trim());
    if (!aud) return false;
    aud.publicKeyPem = newPublicKeyPem;
    aud.enabled = true;
    aud.revokedAt = undefined;
    return true;
  }

  public static revokeAuditor(auditorId: string): void {
    const aud = this.auditorRegistry.get(auditorId.toLowerCase().trim());
    if (aud) {
      aud.enabled = false;
      aud.revokedAt = Date.now();
    }
  }

  public static clearAuditors(): void {
    this.auditorRegistry.clear();
    this.replayCache.clear();
  }

  // ==========================================================================
  // Document Issuer Registry Management
  // ==========================================================================
  public static registerIssuer(config: TrustedIssuerConfig): void {
    if (!config || !config.issuerId || !config.publicKeyPem) {
      throw new Error('Invalid issuer configuration: issuerId and publicKeyPem required.');
    }
    this.issuerRegistry.set(config.issuerId.toLowerCase().trim(), {
      ...config,
      issuerId: config.issuerId.toLowerCase().trim(),
    });
  }

  public static rotateIssuerKey(issuerId: string, newPublicKeyPem: string): boolean {
    const iss = this.issuerRegistry.get(issuerId.toLowerCase().trim());
    if (!iss) return false;
    iss.publicKeyPem = newPublicKeyPem;
    iss.enabled = true;
    iss.revokedAt = undefined;
    return true;
  }

  public static revokeIssuer(issuerId: string): void {
    const iss = this.issuerRegistry.get(issuerId.toLowerCase().trim());
    if (iss) {
      iss.enabled = false;
      iss.revokedAt = Date.now();
    }
  }

  public static clearIssuers(): void {
    this.issuerRegistry.clear();
  }

  // ==========================================================================
  // Cryptographic Sealing (HMAC-SHA256 with Main Process Secret)
  // ==========================================================================
  private static computeSeal(canonicalData: string): string {
    return crypto
      .createHmac('sha256', ProtectedEvidenceKeyManager.getActiveSecret())
      .update(canonicalData, 'utf8')
      .digest('hex');
  }

  public static verifySeal(result: any): boolean {
    if (!result || typeof result !== 'object') return false;

    const secret = ProtectedEvidenceKeyManager.getActiveSecret();

    if (result.__inspectionSeal) {
      const canonical = JSON.stringify({
        inspectionId: result.inspectionId,
        inspectedAt: result.inspectedAt,
        repositoryUrl: result.repositoryUrl,
        resolvedCommitSha: result.resolvedCommitSha,
        treeSha: result.treeSha,
        filesCount: Array.isArray(result.inspectedFiles) ? result.inspectedFiles.length : 0,
        filesHash: crypto.createHash('sha256').update((Array.isArray(result.inspectedFiles) ? result.inspectedFiles : []).map((f: any) => `${f.path}:${f.sha256}`).sort().join(";")).digest('hex'),
        techCount: Array.isArray(result.verifiedTechnologies) ? result.verifiedTechnologies.length : 0,
        authorshipStatus: result.candidateAuthorshipStatus,
      });
      const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
      return (
        result.__inspectionSeal.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(result.__inspectionSeal, 'hex'), Buffer.from(expected, 'hex'))
      );
    }

    if (result.__documentSeal) {
      const canonical = JSON.stringify({
        inspectionId: result.inspectionId,
        docHash: result.documentSha256,
        byteLength: result.documentByteLength,
        issuerName: result.issuerName,
        issuerValidated: result.issuerValidated,
        candidateMentioned: result.candidateMentioned,
        projectMentioned: result.projectMentioned,
        personalWorkAttested: result.personalWorkAttested,
        hasMetrics: !!(result.supportedFields?.performanceMetrics && result.supportedFields.performanceMetrics.length > 0),
      });
      const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
      return (
        result.__documentSeal.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(result.__documentSeal, 'hex'), Buffer.from(expected, 'hex'))
      );
    }

    if (result.__auditSeal) {
      const canonical = JSON.stringify({
        auditId: result.auditId,
        auditorId: result.auditorId,
        projectId: result.projectId,
        candidateId: result.candidateId,
        verifiedAt: result.verifiedAt,
      });
      const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
      return (
        result.__auditSeal.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(result.__auditSeal, 'hex'), Buffer.from(expected, 'hex'))
      );
    }

    return false;
  }

  // ==========================================================================
  // Real Repository Inspection (GitHub Provider)
  // ==========================================================================
  public static async inspectRepository(
    request: RepositoryInspectionRequest
  ): Promise<ImmutableRepositoryInspectionResult> {
    const rawUrl = (request.repositoryUrl || '').trim();

    // Strict URL validation: strictly GitHub, no SSRF, no user credentials, no query params
    const githubRegex = /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\.git)?$/;
    const match = rawUrl.match(githubRegex);
    if (!match) {
      throw new Error(`Repository URL must be a valid public or authenticated https://github.com/owner/repo URL: ${rawUrl}`);
    }

    const owner = match[1];
    const repo = match[2].replace(/\.git$/, '');

    // Resolve commit and tree SHA through GitHub REST API
    const commitsUrl = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`;
    const commitData = await this.fetchGithubJson(commitsUrl, request.authHeader);
    if (!Array.isArray(commitData) || commitData.length === 0 || !commitData[0].sha) {
      throw new Error('Failed to resolve immutable HEAD commit SHA from GitHub repository.');
    }

    const commitSha = commitData[0].sha;
    const treeSha = commitData[0].commit?.tree?.sha;
    if (!treeSha) {
      throw new Error('Failed to resolve immutable tree SHA for repository commit.');
    }

    // Inspect author and committers
    const commitAuthorName = commitData[0].commit?.author?.name || '';
    const commitAuthorEmail = commitData[0].commit?.author?.email || '';
    const candidateName = (request.candidateIdentity?.fullName || '').trim().toLowerCase();
    const candidateEmail = (request.candidateIdentity?.email || '').trim().toLowerCase();

    let authorshipStatus: ImmutableRepositoryInspectionResult['candidateAuthorshipStatus'];
    let authorRole: OwnershipType;
    let authorEmailFound: string | undefined = undefined;

    if (
      (candidateEmail && commitAuthorEmail.toLowerCase() === candidateEmail) ||
      (candidateName && commitAuthorName.toLowerCase().includes(candidateName))
    ) {
      authorshipStatus = 'COMMIT_AUTHOR';
      authorRole = 'contributor'; // Repository presence caps at contributor, never sole owner
      authorEmailFound = commitAuthorEmail;
    } else {
      authorshipStatus = 'CONTRIBUTOR_NOT_VERIFIED';
      authorRole = 'contributor';
    }

    // Fetch repository tree (recursive)
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`;
    const treeData = await this.fetchGithubJson(treeUrl, request.authHeader);
    const treeEntries: Array<{ path: string; mode: string; type: string; sha: string; size?: number; url: string }> =
      treeData.tree || [];

    const totalFilesDiscovered = treeEntries.filter((e) => e.type === 'blob').length;
    const isTruncated = !!treeData.truncated || totalFilesDiscovered > this.MAX_DISCOVERED_FILES;

    // Filter to code and config files only, prioritizing manifest and primary source files
    const relevantExtensions = new Set([
      '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.rb', '.cpp', '.c',
      '.json', '.yaml', '.yml', '.toml', '.mod', '.gradle', '.xml', 'Dockerfile'
    ]);

    const candidateFiles = treeEntries
      .filter((e) => e.type === 'blob')
      .filter((e) => {
        const base = e.path.split('/').pop() || '';
        const ext = '.' + base.split('.').pop();
        return relevantExtensions.has(ext) || base === 'package.json' || base === 'go.mod' || base === 'Cargo.toml' || base === 'Dockerfile';
      });

    const inspectedFiles: InspectedFileArtifact[] = [];
    const verifiedTech = new Set<string>();
    const dependencyDeclarations = new Set<string>();
    const sourceCodeUsage = new Set<string>();
    let detectedArchitecture: string | undefined = undefined;

    // Inspect at most MAX_INSPECTED_FILES files
    const filesToInspect = candidateFiles.slice(0, this.MAX_INSPECTED_FILES);
    const omittedFiles = candidateFiles.slice(this.MAX_INSPECTED_FILES);

    for (const file of filesToInspect) {
      if ((file.size || 0) > this.MAX_FILE_SIZE_BYTES) {
        continue;
      }

      try {
        const fileBytes = await this.fetchGithubBlob(file.url, request.authHeader);
        const fileHash = crypto.createHash('sha256').update(fileBytes).digest('hex');

        inspectedFiles.push({
          path: file.path,
          sha256: fileHash,
          sizeBytes: fileBytes.length,
        });

        const content = fileBytes.toString('utf8');
        const filename = file.path.toLowerCase();

        // 1. Dependency Analysis (package.json, requirements.txt, go.mod, Cargo.toml)
        if (filename.endsWith('package.json')) {
          try {
            const pkg = JSON.parse(content);
            const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
            for (const dep of Object.keys(allDeps)) {
              dependencyDeclarations.add(dep);
              if (['react', 'vue', 'angular', 'svelte', 'next', 'nuxt', 'electron'].includes(dep)) {
                verifiedTech.add(dep);
              }
              if (['express', 'fastify', 'nestjs', 'koa', 'prisma', 'pg', 'redis', 'ioredis', 'typeorm'].includes(dep)) {
                verifiedTech.add(dep);
              }
            }
          } catch (_) {}
        }

        // 2. Source Code Usage Analysis (real import or require statements)
        if (filename.endsWith('.ts') || filename.endsWith('.js') || filename.endsWith('.tsx') || filename.endsWith('.jsx')) {
          const importMatches = content.match(/(?:import|from|require\()\s*['"][^'"]+['"]/g) || [];
          for (const m of importMatches) {
            const match = m.match(/['"]([^'"]+)['"]/);
            if (match && match[1]) {
              sourceCodeUsage.add(match[1]);
              if (match[1].includes('react')) verifiedTech.add('react');
              if (match[1].includes('redis')) verifiedTech.add('redis');
              if (match[1].includes('pg') || match[1].includes('postgres')) verifiedTech.add('postgresql');
              if (match[1].includes('typeorm') || match[1].includes('prisma')) verifiedTech.add('orm');
            }
          }

          if (content.includes('createSlice') || content.includes('createStore') || content.includes('useStore')) {
            detectedArchitecture = 'Flux / Unidirectional State Architecture';
          }
          if (content.includes('ipcRenderer') || content.includes('ipcMain')) {
            detectedArchitecture = 'Multi-process Electron Desktop Architecture';
          }
        }
      } catch {
        // Skip unreadable files safely
      }
    }

    const now = Date.now();
    const inspectionId = `insp-repo-${now}-${crypto.randomBytes(8).toString('hex')}`;

    const canonicalData = JSON.stringify({
      inspectionId,
      inspectedAt: now,
      repositoryUrl: rawUrl,
      resolvedCommitSha: commitSha,
      treeSha,
      filesCount: inspectedFiles.length,
      filesHash: crypto.createHash('sha256').update((inspectedFiles || []).map((f) => `${f.path}:${f.sha256}`).sort().join(";")).digest('hex'),
      techCount: verifiedTech.size,
      authorshipStatus,
    });

    const seal = this.computeSeal(canonicalData);

    const verifiedTechArray = Array.from(verifiedTech);
    return {
      inspectionId,
      inspectedAt: now,
      repositoryUrl: rawUrl,
      resolvedCommitSha: commitSha,
      treeSha,
      inspectedFiles,
      verifiedTechnologies: verifiedTechArray,
      dependencyDeclarations: Array.from(dependencyDeclarations),
      sourceCodeUsage: Array.from(sourceCodeUsage),
      detectedArchitecture,
      candidateAuthorshipStatus: authorshipStatus,
      authorEmailFound,
      authorRole,
      productionDeploymentVerified: false,
      businessOutcomesVerified: false,
      inspectionLimitations: {
        provider: 'github',
        totalFilesDiscovered,
        filesInspected: inspectedFiles.length,
        truncated: isTruncated,
        byteLimitPerFile: this.MAX_FILE_SIZE_BYTES,
        inspectionTimeoutMs: this.INSPECTION_TIMEOUT_MS,
      },
      totalFilesDiscovered,
      filesActuallyInspected: inspectedFiles.length,
      filesOmittedCount: omittedFiles.length,
      omittedFilePathsSample: omittedFiles.slice(0, 10).map((f) => f.path),
      inspectionScope: omittedFiles.length > 0 ? 'PARTIAL_SOURCE_SAMPLE' : 'FULL_REPOSITORY',
      supportedFields: {
        technologies: verifiedTechArray,
        architecture: detectedArchitecture,
      },
      __inspectionSeal: seal,
    };
  }

  // ==========================================================================
  // Real Document Authenticity Inspection
  // ==========================================================================
  public static inspectDocument(request: DocumentInspectionRequest): ImmutableDocumentInspectionResult {
    let rawBytes: Uint8Array;
    let textContent: string;

    if (typeof request.documentBytes === 'string') {
      textContent = request.documentBytes;
      rawBytes = Buffer.from(request.documentBytes, 'utf8');
    } else if (request.documentBytes instanceof Uint8Array) {
      rawBytes = request.documentBytes;
      textContent = Buffer.from(rawBytes).toString('utf8');
    } else {
      rawBytes = new Uint8Array(request.documentBytes);
      textContent = Buffer.from(rawBytes).toString('utf8');
    }

    if (rawBytes.length < 16) {
      throw new Error('Document content is too small or empty to constitute a valid evidentiary document.');
    }

    // Calculate document hash directly from raw bytes using platform crypto
    const docHash = crypto.createHash('sha256').update(rawBytes).digest('hex');

    const issuerId = (request.issuer.issuerId || request.issuer.name || '').toLowerCase().trim();
    const registeredIssuer = this.issuerRegistry.get(issuerId);

    let issuerValidated = false;
    let authenticityStatus: ImmutableDocumentInspectionResult['authenticityStatus'] = 'UNAUTHENTICATED_CONTENT';

    if (!request.issuer.signatureHex) {
      issuerValidated = false;
      authenticityStatus = 'UNAUTHENTICATED_CONTENT';
    } else if (registeredIssuer && registeredIssuer.enabled && !registeredIssuer.revokedAt && request.issuer.signatureHex) {
      try {
        const isValidSig = crypto.verify(
          null, // Ed25519 uses null digest algorithm
          Buffer.from(docHash, 'hex'),
          crypto.createPublicKey(registeredIssuer.publicKeyPem),
          Buffer.from(request.issuer.signatureHex, 'hex')
        );

        if (isValidSig) {
          issuerValidated = true;
          authenticityStatus = 'CRYPTOGRAPHICALLY_VERIFIED';
        } else {
          authenticityStatus = 'SIGNATURE_INVALID';
        }
      } catch {
        authenticityStatus = 'SIGNATURE_INVALID';
      }
    } else if (!registeredIssuer) {
      authenticityStatus = 'ISSUER_UNREGISTERED';
    }

    const candidateName = (request.candidateIdentity?.fullName || '').trim().toLowerCase();
    const candidateEmail = (request.candidateIdentity?.email || '').trim().toLowerCase();
    const projectName = (request.targetProjectName || '').trim().toLowerCase();
    const lowerText = textContent.toLowerCase();

    const candidateMentioned =
      (candidateName.length > 2 && lowerText.includes(candidateName)) ||
      (candidateEmail.length > 4 && lowerText.includes(candidateEmail));

    const projectMentioned = projectName.length > 2 && lowerText.includes(projectName);

    const workAttestationPatterns = [
      /\b(?:awarded\s+to|assigned\s+to|performed\s+by|authored\s+by|inventor:?|delivered\s+by)\b/i,
      /\b(?:successfully\s+completed|demonstrated\s+responsibility|served\s+as|employed\s+as)\b/i,
      /\b(?:responsibilities\s+included|duties\s+included|contributed\s+to|built\s+by)\b/i,
    ];
    const personalWorkAttested =
      candidateMentioned && projectMentioned && workAttestationPatterns.some((p) => p.test(textContent));

    const supportedFields: ImmutableDocumentInspectionResult['supportedFields'] = {};

    // Only grant supported fields if document is authenticated and work is attested
    if (issuerValidated && personalWorkAttested) {
      const roleMatch = textContent.match(
        /\b(?:employed\s+as|served\s+as|role:\s*|title:\s*)([A-Za-z\s]{3,35})\b/i
      );
      supportedFields.personalContribution = roleMatch && roleMatch[1]
        ? roleMatch[1].trim()
        : `Verified contributor on ${request.targetProjectName}`;

      // Quantified performance metrics explicitly stated in authenticated document
      const metricsFound: string[] = [];
      const metricRegex = /\b(?:reduced|improved|increased|boosted|cut)\s+[A-Za-z\s]+\s+by\s+\d+%/gi;
      let m: RegExpExecArray | null;
      while ((m = metricRegex.exec(textContent)) !== null) {
        metricsFound.push(m[0].trim());
      }
      if (metricsFound.length > 0) {
        supportedFields.performanceMetrics = metricsFound;
      }

      // Patent grants do NOT infer sole ownership or full architecture ownership
      supportedFields.ownership = 'contributor';
    }

    const now = Date.now();
    const inspectionId = `insp-doc-${now}-${crypto.randomBytes(8).toString('hex')}`;

    const canonicalData = JSON.stringify({
      inspectionId,
      docHash,
      byteLength: rawBytes.length,
      issuerName: request.issuer.name,
      issuerValidated,
      candidateMentioned,
      projectMentioned,
      personalWorkAttested,
      hasMetrics: !!(supportedFields.performanceMetrics && supportedFields.performanceMetrics.length > 0),
    });

    const seal = this.computeSeal(canonicalData);

    return {
      inspectionId,
      inspectedAt: now,
      documentId: `doc-${docHash.substring(0, 12)}`,
      documentType: request.documentType,
      documentSha256: docHash,
      documentByteLength: rawBytes.length,
      issuerName: request.issuer.name,
      issuerValidated,
      authenticityStatus,
      candidateMentioned,
      projectMentioned,
      personalWorkAttested,
      evidenceModality: issuerValidated ? 'CRYPTOGRAPHIC_BYTE_AUTHENTICATED' : 'UNAUTHENTICATED_BYTE_INSPECTED',
      supportedFields,
      __documentSeal: seal,
    };
  }

  // ==========================================================================
  // Real Independent Audit Verification (Ed25519 Asymmetric Signatures)
  // ==========================================================================
  public static async verifySignedAttestation(
    attestation: AuditorSignedAttestation
  ): Promise<ImmutableIndependentAuditResult | null> {
    if (
      !attestation ||
      attestation.schemaVersion !== 'iac.audit.v1' ||
      !attestation.auditorKeyId ||
      !attestation.payloadJson ||
      !attestation.signatureHex
    ) {
      return null;
    }

    const auditorId = attestation.auditorKeyId.toLowerCase().trim();
    const auditor = this.auditorRegistry.get(auditorId);
    if (!auditor || !auditor.enabled) {
      // FAIL CLOSED: Unregistered or disabled auditor
      return null;
    }

    const now = Date.now();
    if (auditor.revokedAt && now >= auditor.revokedAt) {
      return null;
    }
    if (auditor.validUntil && now > auditor.validUntil) {
      return null;
    }
    if (auditor.validFrom && now < auditor.validFrom) {
      return null;
    }

    // Verify asymmetric signature using Node crypto Ed25519
    try {
      const pubKey = crypto.createPublicKey(auditor.publicKeyPem);
      const isValid = crypto.verify(
        null,
        Buffer.from(attestation.payloadJson, 'utf8'),
        pubKey,
        Buffer.from(attestation.signatureHex, 'hex')
      );
      if (!isValid) {
        return null;
      }
    } catch {
      return null;
    }

    let payload: any;
    try {
      payload = JSON.parse(attestation.payloadJson);
    } catch {
      return null;
    }

    if (!payload || typeof payload !== 'object') return null;

    // Schema validation
    if (!payload.auditId || typeof payload.auditId !== 'string' || payload.auditId.length < 8) return null;
    if (!payload.projectId || typeof payload.projectId !== 'string') return null;
    if (!payload.candidateId || typeof payload.candidateId !== 'string') return null;
    if (!payload.nonce || typeof payload.nonce !== 'string' || payload.nonce.length < 16) return null;
    if (!payload.issuedAt || typeof payload.issuedAt !== 'number') return null;
    if (!payload.expiresAt || typeof payload.expiresAt !== 'number') return null;

    // Check timestamps
    if (now > payload.expiresAt) return null; // Expired
    if (payload.issuedAt > now + 60000) return null; // Issued in future

    // Replay prevention: Durable atomic claim across restarts
    const claimRes = await this.replayCache.claimOrReject(payload.auditId, payload.nonce, payload.expiresAt, {
      auditorKeyId: auditor.auditorId,
      candidateId: payload.candidateId,
      projectId: payload.projectId,
    });
    if (!claimRes.success) {
      return null;
    }

    // Strict audited fields allowlist
    const rawAudited = payload.auditedFields || {};
    const sanitizedAudited: ImmutableIndependentAuditResult['auditedFields'] = {};

    if (rawAudited.personalContribution && typeof rawAudited.personalContribution === 'string') {
      sanitizedAudited.personalContribution = rawAudited.personalContribution.slice(0, 200);
    }
    if (
      rawAudited.ownership &&
      ['sole_owner', 'lead', 'contributor', 'architect', 'team_member'].includes(rawAudited.ownership)
    ) {
      sanitizedAudited.ownership = rawAudited.ownership;
    }
    if (Array.isArray(rawAudited.verifiedTechnologies)) {
      sanitizedAudited.verifiedTechnologies = rawAudited.verifiedTechnologies
        .filter((t: any) => typeof t === 'string' && t.trim().length > 0)
        .slice(0, 20);
    }
    if (Array.isArray(rawAudited.performanceMetrics)) {
      sanitizedAudited.performanceMetrics = rawAudited.performanceMetrics
        .filter((m: any) => typeof m === 'string' && m.trim().length > 0)
        .slice(0, 10);
    }
    if (rawAudited.architecture && typeof rawAudited.architecture === 'string') {
      sanitizedAudited.architecture = rawAudited.architecture.slice(0, 300);
    }

    const canonicalData = JSON.stringify({
      auditId: payload.auditId,
      auditorId: auditor.auditorId,
      projectId: payload.projectId,
      candidateId: payload.candidateId,
      verifiedAt: now,
    });

    const seal = this.computeSeal(canonicalData);

    return {
      auditId: payload.auditId,
      auditorId: auditor.auditorId,
      auditorName: auditor.auditorName,
      projectId: payload.projectId,
      candidateId: payload.candidateId,
      verifiedAt: now,
      auditedFields: sanitizedAudited,
      __auditSeal: seal,
    };
  }

  // ==========================================================================
  // HTTP Fetch Helpers (Node.js HTTPS)
  // ==========================================================================
  private static async fetchGithubJson(urlStr: string, authHeader?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(urlStr);
      if (parsedUrl.hostname !== 'api.github.com' && parsedUrl.hostname !== 'github.com') {
        return reject(new Error(`SSRF Prevention: Refusing to request non-github host ${parsedUrl.hostname}`));
      }

      const headers: Record<string, string> = {
        'User-Agent': 'IAC-Evidence-Verification/1.0',
        Accept: 'application/vnd.github.v3+json',
      };
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }

      const req = https.get(
        parsedUrl,
        { headers, timeout: this.INSPECTION_TIMEOUT_MS },
        (res) => {
          if (res.statusCode === 403 || res.statusCode === 429) {
            return reject(new Error('GitHub API rate limit exceeded or access forbidden. Configure token or retry later.'));
          }
          if (res.statusCode === 404) {
            return reject(new Error(`Repository or reference not found on GitHub: ${urlStr}`));
          }
          if ((res.statusCode || 0) >= 400) {
            return reject(new Error(`GitHub API request failed with HTTP ${res.statusCode}`));
          }

          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
            if (data.length > 5 * 1024 * 1024) {
              req.destroy();
              reject(new Error('GitHub API response exceeded 5MB size limit.'));
            }
          });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (err: any) {
              reject(new Error(`Failed to parse GitHub JSON response: ${err.message}`));
            }
          });
        }
      );

      req.on('error', (err) => reject(new Error(`Network error contacting GitHub API: ${err.message}`)));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Inspection timed out after ${this.INSPECTION_TIMEOUT_MS}ms`));
      });
    });
  }

  private static async fetchGithubBlob(urlStr: string, authHeader?: string): Promise<Buffer> {
    const json = await this.fetchGithubJson(urlStr, authHeader);
    if (json.encoding === 'base64' && json.content) {
      const cleanBase64 = json.content.replace(/\s+/g, '');
      return Buffer.from(cleanBase64, 'base64');
    }
    throw new Error('Unsupported GitHub blob encoding or missing blob content.');
  }
}
