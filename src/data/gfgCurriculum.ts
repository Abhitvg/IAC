/**
 * Open Standard Computer Science & Engineering Curriculum Knowledge Base
 *
 * Grounded in open academic principles (CLRS, Designing Data-Intensive Applications,
 * Operating Systems: Three Easy Pieces, Computer Networking: A Top-Down Approach).
 */

export interface GfgTopic {
  category: string;
  subtopics: string[];
  keyConcepts: string[];
  interviewProtips: string[];
}

export const GFG_CODING_PATTERNS: GfgTopic = {
  category: 'Data Structures & Algorithms Core Patterns',
  subtopics: [
    'Arrays & Dynamic Sliding Window',
    'Strings & Finite Automata / KMP',
    'Two Pointers & Binary Search on Solution Space',
    'Linked Lists & Doubly-Linked Sentinel Caches',
    'Stacks & Monotonic Queues',
    'Trees, BSTs, & Lowest Common Ancestor',
    'Heaps & Two-Heap Running Median',
    'Graphs (BFS, DFS, Dijkstra, Kahn Topological Sort, DSU)',
    'Dynamic Programming (State Reductions, Knapsack, LCS)',
    'Trie Structures for Prefix Matching',
  ],
  keyConcepts: [
    "Kadane's algorithm for maximum contiguous subarray in O(N) time and O(1) space",
    'Two-pointer inward contraction for sorted array complement pairs in O(N)',
    'Sliding window state maintenance using character frequency hash tables',
    'Monotonic stack for finding next greater element and histogram areas in O(N)',
    "Floyd's cycle detection algorithm using fast and slow pointer traversal",
    'Binary search tree invariant verification using recursive boundary ranges',
    "Dijkstra's shortest path algorithm using binary priority queues in O((V + E) log V)",
    "Kahn's algorithm for topological sorting via in-degree queues in O(V + E)",
    'Disjoint Set Union with path compression and rank heuristics in near O(1)',
    'Dynamic programming subproblem formulation and space reduction via rolling buffers',
  ],
  interviewProtips: [
    'Always state the brute force first, then identify repeated work to justify the optimal data structure.',
    'State Time and Space Complexity in asymptotic notation (Big-O) before writing code.',
    'Handle edge cases explicitly: null/empty input, single element, duplicates, negative numbers, and boundary overflows.',
  ],
};

export const GFG_DEVOPS_KNOWLEDGE: GfgTopic = {
  category: 'Cloud Infrastructure & SRE Fundamentals',
  subtopics: [
    'Linux Fundamentals & Process Management',
    'Containerization (Docker OCI Standards)',
    'Orchestration (Kubernetes Architecture)',
    'CI/CD Pipelines & Immutable Artifacts',
    'Observability (Metrics, Logs, Distributed Traces)',
    'Infrastructure as Code (Terraform, Declarative State)',
  ],
  keyConcepts: [
    'Linux namespaces (pid, net, mnt) and cgroups for container isolation',
    'Multi-stage Docker builds minimizing attack surface and image size',
    'Kubernetes control plane architecture: API Server, etcd, Controller Manager, Kubelet',
    'Canary deployments and automated blue/green traffic splitting',
    'OpenTelemetry distributed tracing spans with W3C traceparent propagation',
    'SLIs, SLOs, and Error Budgets for production reliability management',
  ],
  interviewProtips: [
    'Frame infrastructure decisions around reliability, recovery time (RTO/RPO), and blast radius containment.',
    'Emphasize automation over manual runbook interventions.',
  ],
};

export const GFG_WEB_TECHNOLOGY: GfgTopic = {
  category: 'Web Architecture & Distributed Systems',
  subtopics: [
    'HTTP Protocol Evolution (HTTP/1.1, HTTP/2 multiplexing, HTTP/3 QUIC)',
    'RESTful API Design & Idempotency Semantics',
    'Browser Rendering Lifecycle & Critical Rendering Path',
    'Caching Strategies (Browser, Edge CDN, In-Memory Redis)',
    'Asynchronous Event Streams & WebSockets',
    'Authentication Protocols (OAuth 2.0, OpenID Connect, JWTs)',
  ],
  keyConcepts: [
    'HTTP/2 stream multiplexing eliminating head-of-line blocking at application layer',
    'Idempotency key tokens ensuring safe retry behavior on network drops',
    'Critical rendering path optimization: CSSOM, DOM, repaint, and reflow minimization',
    'Cache-Aside vs Write-Through vs Write-Back distributed caching architectures',
    'Event-driven architectures using persistent message logs (Kafka, RabbitMQ)',
    'Stateless JWT token verification vs centralized session revocation trade-offs',
  ],
  interviewProtips: [
    'Distinguish between transport-layer guarantees and application-layer idempotency.',
    'Highlight user-perceived performance metrics (p99 latency, Core Web Vitals).',
  ],
};

export const GFG_CORE_CS_SUBJECTS: GfgTopic = {
  category: 'Operating Systems & Database Systems',
  subtopics: [
    'Process vs Thread Memory Models and Context Switching',
    'Concurrency Control (Locks, Semaphores, Deadlock Conditions)',
    'Virtual Memory, Paging, and Page Fault Handling',
    'Relational DBMS Internals (B+ Trees, WAL, ACID Transactions)',
    'Database Isolation Levels (Read Committed, Repeatable Read, Serializable)',
    'Computer Networking (TCP 3-Way Handshake, Congestion Control)',
  ],
  keyConcepts: [
    'Virtual memory address translation via Page Tables and Translation Lookaside Buffers (TLB)',
    'Deadlock conditions: Mutual Exclusion, Hold and Wait, No Preemption, Circular Wait',
    'B+ Tree index depth and sequential leaf traversal efficiency for range scans',
    'Write-Ahead Logging (WAL) ensuring durability and fast crash recovery via ARIES protocol',
    'Isolation phenomena: Dirty Reads, Non-Repeatable Reads, Phantom Reads, and Write Skew',
    'TCP slow-start, congestion avoidance, and fast retransmit mechanisms',
  ],
  interviewProtips: [
    'Ground abstract theoretical questions in real-world kernel and storage engine behaviors.',
    'State ACID guarantees explicitly when comparing relational and distributed databases.',
  ],
};

export function getGfgKnowledgePromptSection(): string {
  return [
    `=== CORE CS & SYSTEM DESIGN KNOWLEDGE BASE ===`,
    `1. ${GFG_CODING_PATTERNS.category}:`,
    ...GFG_CODING_PATTERNS.keyConcepts.map((c) => `   - ${c}`),
    `2. ${GFG_DEVOPS_KNOWLEDGE.category}:`,
    ...GFG_DEVOPS_KNOWLEDGE.keyConcepts.map((c) => `   - ${c}`),
    `3. ${GFG_WEB_TECHNOLOGY.category}:`,
    ...GFG_WEB_TECHNOLOGY.keyConcepts.map((c) => `   - ${c}`),
    `4. ${GFG_CORE_CS_SUBJECTS.category}:`,
    ...GFG_CORE_CS_SUBJECTS.keyConcepts.map((c) => `   - ${c}`),
  ].join('\n');
}
