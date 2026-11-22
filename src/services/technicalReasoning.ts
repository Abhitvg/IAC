/**
 * technicalReasoning.ts
 *
 * Technical Reasoning Engine & Domain Verification Pipeline for IAC 2.0.
 *
 * Implements the 8-Step Internal Reasoning Pipeline and Domain-Specific Correctness Verifications:
 * - Coding: Syntax, bounds, null/empty, integer overflow, Big-O complexity.
 * - Java: JMM semantics, happens-before, volatile vs synchronized, deadlock.
 * - Node.js: Event loop phases, microtask/nextTick ordering, libuv, stream backpressure.
 * - PostgreSQL: MVCC, transaction isolation levels, locking, index write penalties.
 * - Distributed Systems: Idempotency, partition tolerance, delivery guarantees (NO false exactly-once).
 * - Security: Threat models, trust boundaries, token security, sanitization.
 */

import { DetailedInterviewCategory } from './questionUnderstanding';

export interface ReasoningStep {
  stepNumber: number;
  name: string;
  description: string;
  guidance: string;
}

export interface DomainVerificationRule {
  domain: string;
  mandatoryChecks: string[];
  strictProhibitions: string[];
}

export class TechnicalReasoningEngine {
  /**
   * The 8-Step Structured Reasoning Pipeline.
   */
  public static readonly STEPS: ReasoningStep[] = [
    {
      stepNumber: 1,
      name: 'Understand the requirement',
      description: 'Pinpoint the exact question being asked and its underlying intent.',
      guidance: 'Answer the actual question immediately in sentence 1; do not diverge into adjacent topics.',
    },
    {
      stepNumber: 2,
      name: 'Identify assumptions and constraints',
      description: 'Surface scale, memory, runtime, and failure assumptions.',
      guidance: 'Explicitly state operating boundaries (e.g. single-node vs distributed, memory vs latency).',
    },
    {
      stepNumber: 3,
      name: 'Generate a technically sound solution',
      description: 'Architect the optimal mechanism using standard production patterns.',
      guidance: 'Explain the core mechanism with exact architectural clarity.',
    },
    {
      stepNumber: 4,
      name: 'Check edge cases',
      description: 'Probe boundary conditions, null/empty cases, and network timeouts.',
      guidance: 'Anticipate what fails under load, crash recovery, or concurrency contention.',
    },
    {
      stepNumber: 5,
      name: 'Verify correctness',
      description: 'Validate against domain laws (JMM, MVCC, CAP, ACID).',
      guidance: 'Ensure algorithm logic, memory barriers, and synchronization guarantees hold true.',
    },
    {
      stepNumber: 6,
      name: 'Identify trade-offs',
      description: 'Expose the architectural cost, write penalties, or operational complexity.',
      guidance: 'Always discuss the primary cost ("The trade-off is..."). No architecture is free.',
    },
    {
      stepNumber: 7,
      name: 'Produce a natural interview response',
      description: 'Weave technical depth into fluent, spoken conversational English.',
      guidance: 'Use short, spoken sentences with natural contractions; avoid bullet-point dumps.',
    },
    {
      stepNumber: 8,
      name: 'Check for misleading claims',
      description: 'Audit against candidate facts and anti-hallucination rules.',
      guidance: 'Ensure zero invented metrics, false personal credits, or impossible claims.',
    },
  ];

  /**
   * Retrieves domain verification rules based on category and question tokens.
   */
  public static getDomainVerification(category: DetailedInterviewCategory): DomainVerificationRule {
    switch (category) {
      case 'Java and concurrency':
        return {
          domain: 'Java and JVM Concurrency',
          mandatoryChecks: [
            'Verify Java Memory Model (JMM) happens-before relationships.',
            'Volatile: Guarantees visibility and ordering; does NOT guarantee atomicity for compound operations (e.g. count++).',
            'Synchronized: Guarantees both visibility and mutual exclusion via monitor lock.',
            'ExecutorService: Thread pool sizing based on CPU-bound (N_cpu + 1) vs I/O-bound workloads.',
            'ConcurrentHashMap: Uses lock striping / synchronized bin buckets + CAS nodes; allows concurrent reads without locking entire table.',
            'Deadlock: Requires 4 Coffman conditions (Mutual exclusion, Hold and wait, No preemption, Circular wait). Prevention: Consistent lock acquisition ordering.',
          ],
          strictProhibitions: [
            'NEVER claim volatile makes non-atomic compound operations thread-safe.',
            'NEVER claim synchronized has zero performance cost under high contention.',
          ],
        };

      case 'JavaScript and Node.js':
        return {
          domain: 'Node.js Runtime & Event Loop',
          mandatoryChecks: [
            'Event loop phases: Timers (setTimeout/setInterval) -> Pending callbacks -> Idle/prepare -> Poll (I/O) -> Check (setImmediate) -> Close callbacks.',
            'Microtasks: process.nextTick runs before Promise microtasks; both drain completely between event loop phases.',
            'libuv thread pool: Default 4 threads; handles synchronous file I/O, DNS resolution, and crypto; does NOT handle network sockets (handled by epoll/kqueue).',
            'Worker threads: Use for CPU-intensive work (image compression, hashing) to prevent blocking main event loop.',
            'Streams & Backpressure: Handle .write() returning false and await "drain" event to prevent out-of-memory buffer buildup.',
          ],
          strictProhibitions: [
            'NEVER claim Node.js is multi-threaded for standard JS execution.',
            'NEVER claim process.nextTick is part of the event loop itself (it is an immediate microtask queue).',
          ],
        };

      case 'Databases':
        return {
          domain: 'PostgreSQL & Database Systems',
          mandatoryChecks: [
            'Transaction isolation levels: Read Committed (default in PG), Repeatable Read (snapshot isolation, prevents non-repeatable reads), Serializable (SSI prevents write skew).',
            'PostgreSQL MVCC: Updates create new tuple versions with xmin/xmax; dead tuples require VACUUM / autovacuum to reclaim space.',
            'B-Tree Indexes: Accelerate equality and range queries; cost write amplification because every INSERT/UPDATE must update index pages.',
            'Locking: Row-level locks (FOR UPDATE/SHARE) vs table locks; deadlock detection aborts one transaction.',
            'Query Planner: EXPLAIN ANALYZE checks sequential scans vs index scans based on table statistics and cardinality.',
          ],
          strictProhibitions: [
            'NEVER recommend indexing every column blindly without discussing write amplification and storage overhead.',
            'NEVER claim Read Committed isolation prevents phantom reads or non-repeatable reads.',
          ],
        };

      case 'Distributed systems':
      case 'System design':
        return {
          domain: 'Distributed Systems & Scalability',
          mandatoryChecks: [
            'Delivery guarantees: Network channels offer at-least-once or at-most-once delivery.',
            'Idempotency: Critical for retried RPCs and webhooks. Requires unique idempotency key checked atomically (e.g., in Redis or database).',
            'Kafka ordering: Guaranteed strictly within a single partition, NOT globally across multiple partitions.',
            'Retries: Must employ exponential backoff with full jitter and circuit breakers to avoid cascading retry storms.',
            'Partitioning & CAP: Under network partitions, a system chooses Consistency (rejecting writes) or Availability (accepting potentially stale writes).',
            'Failure recovery: Timeouts do NOT mean failure; the downstream system may have committed the mutation.',
          ],
          strictProhibitions: [
            'NEVER claim "exactly-once" delivery across independent distributed systems without explicitly qualifying it as at-least-once + idempotent deduplication.',
            'NEVER claim Kafka guarantees global message ordering across partitions.',
          ],
        };

      case 'DevOps':
        return {
          domain: 'DevOps, CI/CD & Infrastructure as Code',
          mandatoryChecks: [
            'Terraform workflow: distinguish init, validate, plan, and apply; review the exact plan and never describe plan as a deployment.',
            'Terraform state: use a remote backend with access control, versioning, encryption, and state locking; for the S3 backend, understand native lockfile support and do not assume a DynamoDB lock table is required.',
            'Terraform safety: separate environments, keep reusable modules small and versioned, detect drift, protect state, and avoid secrets in plans, outputs, logs, or source control.',
            'CI/CD integrity: build once and promote the same immutable artifact; gate promotion on tests, security scans, approvals where required, and deployment health.',
            'Deployment strategy: explain rolling, blue/green, or canary trade-offs; define health checks, rollback criteria, and database migration compatibility.',
            'Containers: use trusted minimal base images, pin dependencies, run as non-root, and avoid embedding credentials in image layers.',
            'Kubernetes: distinguish readiness, liveness, and startup probes; set resource requests/limits and explain how bad probes or limits can cause restarts or throttling.',
            'Observability: correlate logs, metrics, and traces; define service-level indicators and alert on user-visible symptoms rather than CPU alone.',
          ],
          strictProhibitions: [
            'NEVER claim terraform plan changes infrastructure; apply performs the change.',
            'NEVER store plaintext credentials in Terraform state, plan artifacts, container images, or CI logs.',
            'NEVER claim a liveness probe should fail merely because a downstream dependency is temporarily unavailable.',
            'NEVER claim Kubernetes resource limits are equivalent to requests.',
          ],
        };

      case 'AWS and cloud':
        return {
          domain: 'AWS Cloud Architecture & Operations',
          mandatoryChecks: [
            'IAM: apply least privilege, short-lived workload credentials, and explicit trust policies; distinguish identity policies from resource policies.',
            'Networking: explain VPC CIDRs, subnet routing, security groups, network ACLs, NAT, VPC endpoints, and public versus private reachability.',
            'Resilience: select multi-AZ or multi-region design based on recovery objectives, failure domains, and cost rather than assuming every workload needs active-active.',
            'Storage: choose S3, EBS, EFS, RDS, or DynamoDB based on access pattern, consistency, durability, and operational requirements.',
            'Operations: use CloudWatch metrics/logs/alarms and distributed tracing; define actionable alarms and tested recovery procedures.',
            'Security: encrypt data in transit and at rest, control secret access, rotate credentials, and avoid exposing sensitive values in logs or outputs.',
          ],
          strictProhibitions: [
            'NEVER place long-lived AWS access keys in application code, source control, or container images.',
            'NEVER describe a security group as stateless; security groups are stateful and network ACLs are stateless.',
            'NEVER assume a private subnet has internet access without a valid egress route or service endpoint.',
            'NEVER promise multi-region availability without addressing replication, consistency, failover, and recovery testing.',
          ],
        };

      case 'Security':
        return {
          domain: 'Application Security & Threat Modeling',
          mandatoryChecks: [
            'Authentication vs Authorization: Authentication verifies identity (who you are); Authorization verifies permissions (what you can do).',
            'Tokens: JWTs should be signed with asymmetric keys (RS256); access tokens short-lived (15 min); refresh tokens stored securely in HttpOnly, SameSite cookies.',
            'Input Validation: Validate on the server side using allowlists; parameterized queries for SQL injection prevention; context-aware encoding for XSS.',
            'Trust boundaries: Never trust client headers or browser-side state; validate tokens at the API gateway or service boundary.',
            'Secret handling: Secrets must never be committed to source code or logged in error stacks; use secret managers and runtime env injection.',
          ],
          strictProhibitions: [
            'NEVER recommend storing sensitive auth tokens in localStorage where XSS can extract them.',
            'NEVER claim encryption alone eliminates the need for proper access control.',
          ],
        };

      case 'Data structures and algorithms':
      case 'Programming fundamentals':
        return {
          domain: 'Coding & Algorithmic Rigor',
          mandatoryChecks: [
            'Syntax & Compilation: Ensure valid, executable syntax with matching brackets and necessary imports.',
            'Boundary inputs: Check null, empty array/string, single element, negative numbers, and integer overflow.',
            'Complexity: State Time Complexity O(...) and Space Complexity O(...) upfront with exact mathematical proof.',
            'Algorithm selection: Choose optimal approach (e.g. Two Pointers O(N), Hash Map O(N), Binary Search O(log N)).',
          ],
          strictProhibitions: [
            'NEVER output placeholders like "// TODO" or "// implement logic here".',
            'NEVER claim an algorithm is O(1) space if it creates recursive call frames proportional to N.',
          ],
        };

      default:
        return {
          domain: 'General Technical Engineering',
          mandatoryChecks: [
            'Direct answer in first sentence.',
            'Explain the underlying architectural or runtime mechanism.',
            'Provide one concrete real-world example.',
            'Identify the primary trade-off or operational limitation.',
          ],
          strictProhibitions: [
            'NO corporate buzzwords or generic filler ("Certainly!", "Great question!").',
            'NO unsupported claims or fabricated metrics.',
          ],
        };
    }
  }

  /**
   * Builds the Technical Reasoning section for injection into LLM prompts.
   */
  public static buildReasoningPromptSection(category: DetailedInterviewCategory): string {
    const domainRule = TechnicalReasoningEngine.getDomainVerification(category);

    return `════════════ TECHNICAL REASONING & VERIFICATION ENGINE ════════════
MANDATORY INTERNAL 8-STEP PIPELINE (Apply before speaking):
1. Understand requirement: Answer directly in sentence 1.
2. Assumptions & constraints: State operating boundaries.
3. Sound solution: Detail the exact underlying mechanism.
4. Edge cases: Address boundaries, failures, or contention.
5. Correctness check: Adhere strictly to the domain laws below.
6. Trade-offs: State the primary operational cost or bottleneck.
7. Natural response: Deliver in fluent, conversational spoken English.
8. Anti-hallucination check: Zero fabricated metrics or unverified personal claims.

DOMAIN-SPECIFIC CORRECTNESS MANDATES (${domainRule.domain}):
${domainRule.mandatoryChecks.map((check) => `• ${check}`).join('\n')}

STRICT TECHNICAL PROHIBITIONS:
${domainRule.strictProhibitions.map((p) => `❌ ${p}`).join('\n')}
═════════════════════════════════════════════════════════════`;
  }
}
