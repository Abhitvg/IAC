/**
 * GeeksforGeeks Complete Interview Preparation Knowledge Base
 *
 * Sourced from:
 * 1. GFG Complete Interview Preparation Course Syllabus (23-page PDF)
 * 2. GFG Practice for Cracking Any Coding Interview
 * 3. GFG DevOps Tutorial
 * 4. GFG Web Technology & System Design Guide
 */

export interface GfgTopic {
  category: string;
  subtopics: string[];
  keyConcepts: string[];
  interviewProtips: string[];
}

export const GFG_CODING_PATTERNS: GfgTopic = {
  category: "Data Structures & Algorithms (GFG Practice Guide)",
  subtopics: [
    "Arrays & Sliding Window",
    "Strings & Pattern Matching (KMP, Rabin-Karp)",
    "Two Pointers & Binary Search",
    "Linked Lists & LRU Cache",
    "Stacks & Monotonic Queues (Next Greater Element, Histogram)",
    "Trees & Binary Search Trees (LCA, Views, Diameter)",
    "Heaps & Priority Queues (Median of Stream, Kth Largest)",
    "Graphs (BFS, DFS, Dijkstra, TopoSort, DSU, Kosaraju)",
    "Dynamic Programming (Knapsack, LCS, LIS, Coin Change)",
    "Trie & Segment Trees"
  ],
  keyConcepts: [
    "Kadane's Algorithm for maximum subarray sum in O(n) time and O(1) space",
    "Two Pointer technique for sorted arrays (e.g. Two Sum, Container With Most Water, 3Sum)",
    "Sliding Window for substring/subarray metrics (longest substring without repeats, min window substring)",
    "Monotonic Stack for finding Next Greater Element, Stock Span, and Largest Rectangle in Histogram in O(n)",
    "Floyd's Tortoise and Hare for loop detection and removal in Linked Lists",
    "Lowest Common Ancestor (LCA) in Binary Trees and BSTs in O(h) or O(n)",
    "Dijkstra's Algorithm using Min-Heap PriorityQueue in O((V + E) log V)",
    "Kahn's Algorithm for Topological Sort using In-Degrees and Queue in O(V + E)",
    "Disjoint Set Union (DSU) with Path Compression and Union by Rank in near O(1) amortized time",
    "Dynamic Programming memoization vs tabulation: state transitions for 0/1 Knapsack, Coin Change, LCS"
  ],
  interviewProtips: [
    "Always state the brute force first, then identify repeated work to justify the optimal data structure.",
    "State Time and Space Complexity in asymptotic notation (Big-O) before writing code.",
    "Handle edge cases explicitly: null/empty input, single element, duplicates, negative numbers, and boundary overflows."
  ]
};

export const GFG_DEVOPS_KNOWLEDGE: GfgTopic = {
  category: "DevOps & Cloud Infrastructure (GFG DevOps Tutorial)",
  subtopics: [
    "DevOps Lifecycle & Culture (CI/CD/CD)",
    "Linux Systems & Shell Administration (Permissions, SSH, Systemd, Process monitoring)",
    "Computer Networking & Protocols (DNS, TCP/IP, OSI, Subnets, CIDR, Firewalls, Load Balancers)",
    "Version Control & GitOps (Branching models, Rebase vs Merge, Pre-commit hooks, ArgoCD)",
    "Continuous Integration & Delivery (AWS CodePipeline, Jenkins, GitHub Actions, GitLab CI)",
    "Containers & Orchestration (Docker, Multi-stage builds, Kubernetes EKS/AKS/GKE)",
    "Infrastructure as Code (Terraform, State management, CloudFormation, Ansible)",
    "Cloud Computing (AWS EC2, S3, IAM, VPC, EKS, RDS Aurora, Route53)",
    "Observability & Monitoring (Prometheus, Grafana, Alertmanager, ELK Stack, CloudWatch)",
    "DevSecOps (Zero Trust, Least Privilege IAM, KMS, Secrets Manager, Trivy scanning)"
  ],
  keyConcepts: [
    "CI/CD Pipelines: Automated build, test, security scan, and deployment with blue/green or canary rollouts",
    "Docker Multi-Stage Builds: Reducing image sizes from 1GB to <50MB using scratch/alpine runtime stages",
    "Kubernetes Architecture: Control Plane (API server, etcd, scheduler, controller) + Worker Nodes (kubelet, kube-proxy, containerd)",
    "K8s Workloads & Scaling: Deployments, DaemonSets, StatefulSets, Horizontal Pod Autoscaler (HPA), Karpenter node provisioning",
    "Kubernetes Networking: Pod-to-Pod overlay networks (CNI like Calico/AWS VPC CNI), ClusterIP, NodePort, LoadBalancer, and Ingress controllers",
    "Terraform State Management: Remote backends in S3 with DynamoDB state locking to prevent concurrent apply race conditions",
    "Zero-Downtime Deployments: Blue-Green routing via DNS/ALB and Canary deployments via service mesh (Istio/Linkerd)",
    "Observability: Golden Signals (Latency, Traffic, Errors, Saturation) monitored via Prometheus exporters and Grafana dashboards"
  ],
  interviewProtips: [
    "Speak authoritatively about production incident management, MTTR reduction, and post-mortems.",
    "Explain cloud cost optimization trade-offs (e.g. Spot instances, reserved instances, Graviton ARM processors, Fargate vs EC2).",
    "Always reference security-first principles: no hardcoded secrets, IAM role assumption via OIDC, encryption in transit (TLS 1.3) and at rest (KMS)."
  ]
};

export const GFG_WEB_TECHNOLOGY: GfgTopic = {
  category: "Web Technology & System Design (GFG Web Tech Guide)",
  subtopics: [
    "Web Architecture & HTTP Protocols (HTTP/1.1 vs HTTP/2 vs HTTP/3, HTTPS, TLS Handshake)",
    "RESTful API Design, GraphQL, gRPC, and WebSockets",
    "Frontend Engineering (DOM, CSS Box Model, React, Event Loop, Closures, Virtual DOM)",
    "Backend Microservices Architecture (API Gateway, Service Discovery, Circuit Breakers)",
    "Caching Strategies (Redis, Memcached, Cache-Aside, Write-Through, Write-Behind, Eviction policies like LRU)",
    "Message Queues & Event Streaming (Apache Kafka, RabbitMQ, Decoupled async processing)",
    "Database Architecture (RDBMS vs NoSQL, Indexing, B+ Trees, ACID, Normalization, Sharding, Read Replicas)",
    "Web Security (CORS, CSRF, XSS, Content Security Policy, SQL Injection, JWT vs Session Auth)"
  ],
  keyConcepts: [
    "HTTP/2 Multiplexing: Multiple bidirectional streams over a single TCP connection eliminating head-of-line blocking",
    "Event Loop in JavaScript: Call stack, Web APIs, Microtask queue (Promises), Macrotask queue (setTimeout), requestAnimationFrame",
    "Caching with Redis: Cache-Aside pattern, handling Cache Stampede via distributed locks (Redlock), and Cache Invalidation",
    "Database Indexing: B+ Tree index structures, composite indexes, left-most prefix rule, and EXPLAIN query plan analysis",
    "CORS (Cross-Origin Resource Sharing): Preflight OPTIONS request, Access-Control-Allow-Origin, credentials headers",
    "High-Level System Design: Load balancers (L4 vs L7), horizontal scaling, stateless application servers, database replication"
  ],
  interviewProtips: [
    "When asked about scalability, address both vertical and horizontal scaling, caching layers, and database bottlenecks.",
    "For API design questions, specify HTTP methods (GET, POST, PUT, DELETE, PATCH), idempotency, pagination, and status codes."
  ]
};

export const GFG_CORE_CS_SUBJECTS: GfgTopic = {
  category: "Core Computer Science Subjects (GFG Syllabus)",
  subtopics: [
    "Operating Systems (Process vs Thread, Concurrency, Scheduling, Synchronization, Deadlocks, Virtual Memory)",
    "Database Management Systems (Relational Model, Normalization 1NF to BCNF, ACID, Transactions, Concurrency Control)",
    "Computer Networks (OSI 7 Layers, TCP/IP 4 Layers, TCP 3-Way Handshake, Sliding Window, UDP, DNS, ARP, Subnetting)",
    "Object-Oriented Analysis & Design (SOLID Principles, Design Patterns, Class Diagrams, Low-Level Design Case Studies)"
  ],
  keyConcepts: [
    "Deadlock Conditions (Coffman Conditions): Mutual Exclusion, Hold and Wait, No Preemption, Circular Wait",
    "Process Synchronization: Critical Section problem, Mutex, Semaphores (Counting vs Binary), Race Conditions",
    "Virtual Memory & Paging: Page tables, TLB (Translation Lookaside Buffer), Page Faults, Thrashing, Inverted Page Tables",
    "Database Normalization: Eliminating insertion, deletion, and update anomalies through functional dependencies (1NF to BCNF)",
    "ACID Properties: Atomicity (WAL / Undo logs), Consistency, Isolation (Read Uncommitted, Read Committed, Repeatable Read, Serializable), Durability (Redo logs)",
    "TCP 3-Way Handshake (SYN -> SYN-ACK -> ACK) and 4-Way Connection Teardown (FIN -> ACK -> FIN -> ACK)",
    "Low-Level Design (LLD): Applying Strategy, Factory, Observer, Decorator, and Singleton patterns to system modeling"
  ],
  interviewProtips: [
    "Answer OS questions with concrete trade-offs (e.g. User-level vs Kernel-level threads, Context switching overhead).",
    "For DBMS concurrency, be ready to explain Dirty Reads, Non-Repeatable Reads, and Phantom Reads with isolation levels."
  ]
};

/**
 * Returns a concise, prompt-injectable summary of GeeksforGeeks interview standards
 */
export function getGfgKnowledgePromptSection(): string {
  return `════════════ 3. GEEKSFORGEEKS INTERVIEW CURRICULUM & KNOWLEDGE BASE ════════════
You have full mastery over the standard GeeksforGeeks Complete Interview Preparation curriculum:
1. DATA STRUCTURES & ALGORITHMS (GFG Practice Guide):
   - Arrays & Strings: Kadane's algorithm, Sliding Window, Two Pointers, KMP, Rabin-Karp, Dutch National Flag.
   - Lists & Stacks: Floyd's loop detection/removal, LRU Cache, Monotonic Stack (Next Greater Element, Histogram Area).
   - Trees & Graphs: Level order traversal, LCA, Tree Views (Left/Right/Top/Bottom), Dijkstra, Topological Sort (Kahn's), DSU, Kosaraju's SCC.
   - Dynamic Programming & Greedy: 0/1 Knapsack, Coin Change, LCS, LIS, Activity Selection, Huffman Coding.

2. DEVOPS & CLOUD ARCHITECTURE (GFG DevOps Tutorial):
   - CI/CD & Automation: AWS CodePipeline, GitHub Actions, Jenkins, automated testing, canary & blue-green rollouts.
   - Containerization & Kubernetes: Docker multi-stage builds, Pods, Deployments, Services (ClusterIP/LoadBalancer), Ingress, HPA, Karpenter.
   - Infrastructure as Code & Linux: Terraform remote state with S3/DynamoDB locking, Linux systemd, SSH, netstat, iostat, iptables.
   - Observability & SRE: Prometheus metrics, Grafana dashboards, Golden Signals (Latency, Traffic, Errors, Saturation), MTTR reduction.

3. WEB TECHNOLOGY & SYSTEM DESIGN (GFG Web Tech Guide):
   - Web Protocols: HTTP/2 multiplexing, HTTP/3 QUIC, TLS 1.3 handshake, WebSockets, REST idempotency, GraphQL.
   - Scalability & Caching: Redis Cache-Aside, Write-Through, Cache Stampede prevention (Redlock), B+ Tree database indexing.
   - Web Security: CORS preflight, CSRF tokens, XSS mitigation, Content Security Policy (CSP), JWT vs Session cookies.

4. CORE COMPUTER SCIENCE SUBJECTS (GFG Syllabus):
   - Operating Systems: Process vs Thread, Mutex vs Semaphores, Coffman Deadlock conditions, Virtual Memory & Paging, Thrashing.
   - DBMS: ACID properties, WAL logs, MVCC, Transaction Isolation Levels, Database Normalization (1NF to BCNF), B+ Tree indexing.
   - Computer Networks: TCP 3-way handshake, 4-way teardown, Sliding Window flow control, Congestion control, OSI vs TCP/IP, DNS, ARP.
   - Object-Oriented Design (LLD): SOLID principles, Factory, Strategy, Observer, Decorator, and Singleton patterns.`;
}
