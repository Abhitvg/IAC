import { CurriculumQuestion } from './types';

export const CURRICULUM_QUESTIONS: CurriculumQuestion[] = [
  // ─────────────────────────────────────────────────────────────
  // 1. Data Structures: Arrays & Strings (Complexity Analysis)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'cq_arrays_01',
    curriculumTopicId: 'ds_arrays_strings',
    conceptReference: 'Dynamic array doubling strategy providing amortized O(1) append',
    questionType: 'complexity_analysis',
    difficultyTier: 'easy',
    difficultyNumeric: 2,
    prompt:
      'Explain why appending to a dynamic array has an amortized time complexity of O(1) despite occasional O(N) array resizing and memory reallocation.',
    interviewObjective:
      'Assess understanding of amortized analysis, aggregate method, and geometric growth factor.',
    expectedKnowledge: [
      'Geometric resizing strategy (factor of 2 or 1.5)',
      'Cost of copying elements during reallocation',
      'Aggregate or accounting method proof of amortized O(1)',
      'Pitfalls of arithmetic growth strategies (e.g., adding fixed capacity)',
    ],
    evaluationCriteria: {
      rubricCriteria: [
        'Explains doubling capacity leads to total copies bounded by 2N',
        'Contrasts geometric resizing with arithmetic reallocation leading to O(N^2)',
        'Accurately distinguishes worst-case per-operation O(N) from amortized O(1)',
      ],
      expectedConcepts: ['Amortized analysis', 'Geometric progression', 'Memory reallocation'],
      failurePatterns: [
        'Confuses average case with amortized worst-case guarantee',
        'Claims resizing happens every N operations without accounting for geometric step sizing',
      ],
    },
    relevantEdgeCases: [
      'Downsizing/shrinking when elements are removed to prevent thrashing (e.g. shrink at 25% capacity)',
      'Memory fragmentation and reallocation failure under memory pressure',
    ],
    expectedAnswerCharacteristics: [
      'Uses mathematical summation of 1 + 2 + 4 + ... + N = 2N - 1',
      'Explains why fixed increment allocation (e.g. +100 elements) degrades to O(N^2) total time',
    ],
    followUpOpportunities: [
      'How does Java ArrayList vs Python list implement resizing growth factors?',
      'How would you implement hysteresis during shrinking to avoid thrashing at capacity boundaries?',
    ],
    timeBudgetMinutes: 10,
    tags: ['data_structures', 'dynamic_arrays', 'amortization', 'complexity_analysis'],
  },

  // ─────────────────────────────────────────────────────────────
  // 2. Data Structures: Arrays & Strings (Coding Problem)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'cq_arrays_02',
    curriculumTopicId: 'ds_arrays_strings',
    conceptReference: 'Dynamic sliding window state maintenance using frequency tables',
    questionType: 'coding_problem',
    difficultyTier: 'intermediate',
    difficultyNumeric: 3,
    prompt:
      'Given an array of positive integers and a target sum S, find the minimal length of a contiguous subarray of which the sum is greater than or equal to S. If none exists, return 0.',
    interviewObjective:
      'Evaluate ability to apply sliding window with two pointers and maintain window sum invariant in O(N) time.',
    expectedKnowledge: [
      'Sliding window with dynamic window size',
      'Two pointers moving monotonically from left to right',
      'Maintaining running window sum in O(1) per pointer advance',
      'O(N) time and O(1) auxiliary space complexity',
    ],
    evaluationCriteria: {
      rubricCriteria: [
        'Establishes and verbalizes window invariant',
        'Expands right pointer while sum < S; contracts left pointer while sum >= S',
        'Maintains minimal length variable correctly',
        'Correctly analyzes total pointer moves as 2N, yielding O(N) runtime',
      ],
      expectedConcepts: ['Sliding window', 'Monotonic pointers', 'Prefix sum invariant'],
      failurePatterns: [
        'Nested loop re-summing subarray elements in O(N^2)',
        'Off-by-one errors in window length calculation',
      ],
    },
    relevantEdgeCases: [
      'Entire array sum is strictly less than S (returns 0)',
      'A single element is greater than or equal to S (returns 1)',
      'Array contains empty or single-element inputs',
    ],
    expectedAnswerCharacteristics: [
      'Clarifies constraints before coding',
      'Dry runs with an example like [2,3,1,2,4,3], S = 7',
      'Concludes with time and space complexity analysis',
    ],
    followUpOpportunities: [
      'What if array elements could be negative? (Requires prefix sum + monotonic deque / hashmap in O(N))',
      'How does this generalize to finding longest subarray with sum at most S?',
    ],
    timeBudgetMinutes: 20,
    tags: ['data_structures', 'sliding_window', 'two_pointers', 'coding'],
  },

  // ─────────────────────────────────────────────────────────────
  // 3. Data Structures: Hash Tables (Conceptual)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'cq_hash_01',
    curriculumTopicId: 'ds_hash_tables',
    conceptReference: 'Hash function properties: uniformity, determinism, avalanche effect',
    questionType: 'conceptual',
    difficultyTier: 'intermediate',
    difficultyNumeric: 3,
    prompt:
      'Compare separate chaining and open addressing for hash table collision resolution. How does cache locality, load factor, and deletion handling differ between them?',
    interviewObjective:
      'Assess in-depth understanding of collision strategies, memory layout, CPU cache behavior, and tombstones.',
    expectedKnowledge: [
      'Separate chaining with linked lists or balanced trees',
      'Open addressing with linear probing, quadratic probing, or double hashing',
      'Load factor thresholds (0.75 for chaining, 0.5-0.7 for open addressing)',
      'Cache locality advantages of flat open addressing arrays',
      'Tombstone markers for deletion in open addressing to preserve probe sequences',
    ],
    evaluationCriteria: {
      rubricCriteria: [
        'Identifies that open addressing keeps all keys in contiguous table array, offering superior CPU cache locality',
        'Explains why open addressing requires tombstone markers during deletion',
        'Discusses primary clustering in linear probing vs secondary clustering',
        'Explains why chaining handles high load factors (> 1.0) gracefully whereas open addressing fails',
      ],
      expectedConcepts: ['Separate chaining', 'Open addressing', 'Cache locality', 'Tombstones', 'Load factor'],
      failurePatterns: [
        'Claims open addressing can have load factor greater than 1.0',
        'Forgets that deleting an entry in open addressing breaks subsequent probe lookups if not marked with a tombstone',
      ],
    },
    relevantEdgeCases: [
      'Degenerate hash functions producing uniform collisions (O(N) search)',
      'Table full condition in open addressing requiring eager resizing',
    ],
    expectedAnswerCharacteristics: [
      'Contrasts Java HashMap (chaining with treeification) with Python dict or C++ absl::flat_hash_map',
      'Highlights impact of L1/L2 cache misses caused by pointer chasing in chained linked lists',
    ],
    followUpOpportunities: [
      'Why did Java 8 convert long collision chains to Red-Black trees when bucket length exceeds 8?',
      'How does Robin Hood hashing reduce probe sequence variance in open addressing?',
    ],
    timeBudgetMinutes: 15,
    tags: ['data_structures', 'hash_tables', 'collision_resolution', 'cache_locality'],
  },

  // ─────────────────────────────────────────────────────────────
  // 4. Data Structures: Trees & BST (Architecture Tradeoff)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'cq_trees_01',
    curriculumTopicId: 'ds_trees_bst',
    conceptReference: 'Balanced binary search trees: AVL height-balance invariant (factor in {-1, 0, 1}) and rotations',
    questionType: 'architecture_tradeoff',
    difficultyTier: 'advanced',
    difficultyNumeric: 4,
    prompt:
      'Compare AVL trees and Red-Black trees. Under what workload profile would you choose an AVL tree over a Red-Black tree, and why do most language standard libraries (like C++ std::map and Java TreeMap) use Red-Black trees?',
    interviewObjective:
      'Evaluate deep knowledge of tree balancing invariants, rotation frequency, lookup vs insertion performance trade-offs.',
    expectedKnowledge: [
      'AVL tree balance factor constraint (height difference <= 1)',
      'Red-Black tree properties (black height invariant, no two adjacent red nodes)',
      'AVL tree is more strictly balanced: max height ~ 1.44 log2(N)',
      'Red-Black tree max height ~ 2 log2(N)',
      'AVL provides faster lookups due to shallower depth; Red-Black provides faster insertions and deletions due to fewer rotations (at most 2 rotations for insert, 3 for delete)',
    ],
    evaluationCriteria: {
      rubricCriteria: [
        'Articulates strict balance of AVL versus looser balance of Red-Black trees',
        'Explains that read-heavy workloads benefit from AVL due to lower tree height',
        'Explains that write-heavy/general-purpose workloads favor Red-Black due to bounded rotations O(1)',
        'Accurately quotes time complexities: O(log N) for search, insert, and delete in both',
      ],
      expectedConcepts: ['AVL balance factor', 'Red-Black invariants', 'Tree rotations', 'Black height'],
      failurePatterns: [
        'Claims one has O(1) worst-case search and the other has O(log N)',
        'Cannot explain why looser balance reduces rotation overhead during modifications',
      ],
    },
    relevantEdgeCases: [
      'Sequential insertion of sorted keys leading to degenerate O(N) linked list without balancing',
      'Memory overhead of storing balance factors vs 1 bit of color per node',
    ],
    expectedAnswerCharacteristics: [
      'Mentions that Red-Black trees only need 1 bit per node (often packed in pointer alignment bits)',
      'Connects library design (e.g. Linux CFS, std::map) to balanced trade-offs',
    ],
    followUpOpportunities: [
      'Walk me through the cases of tree rebalancing when a new node is inserted into a Red-Black tree.',
      'How do B-Trees and B+ Trees adapt self-balancing concepts for disk storage and block I/O?',
    ],
    timeBudgetMinutes: 15,
    tags: ['data_structures', 'trees', 'bst', 'avl', 'red_black', 'tradeoffs'],
  },

  // ─────────────────────────────────────────────────────────────
  // 5. Algorithms: Graph Algorithms (Definition & Explanation)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'cq_graph_01',
    curriculumTopicId: 'algo_graph_algorithms',
    conceptReference: 'Dijkstra single-source shortest path with min-heap / priority queue',
    questionType: 'definition_explanation',
    difficultyTier: 'intermediate',
    difficultyNumeric: 3,
    prompt:
      'Compare Dijkstra’s algorithm and the Bellman-Ford algorithm for single-source shortest paths. Why does Dijkstra fail on graphs with negative edge weights, and how does Bellman-Ford detect negative weight cycles?',
    interviewObjective:
      'Assess knowledge of greedy choice vs relaxation, negative edge implications, and time complexity bounds.',
    expectedKnowledge: [
      'Dijkstra uses greedy selection with a min-priority queue (O((V + E) log V))',
      'Dijkstra assumes visited node distance is finalized and will not decrease; negative edges violate this greedy property',
      'Bellman-Ford relaxes all E edges V - 1 times (O(V * E))',
      'A path without cycles contains at most V - 1 edges; if an edge can still be relaxed on the V-th iteration, a negative cycle exists',
    ],
    evaluationCriteria: {
      rubricCriteria: [
        'Explains the greedy invariant of Dijkstra and constructs a minimal counterexample with a negative edge',
        'States standard Dijkstra min-heap time complexity: O((V + E) log V)',
        'Explains why Bellman-Ford requires V - 1 relaxation rounds',
        'Explains negative cycle detection on the V-th round of Bellman-Ford',
      ],
      expectedConcepts: ['Dijkstra invariant', 'Greedy choice property', 'Bellman-Ford relaxation', 'Negative cycles'],
      failurePatterns: [
        'Claims Dijkstra works with negative edge weights as long as there is no negative cycle',
        'Cannot explain why V - 1 iterations are sufficient for longest simple shortest path',
      ],
    },
    relevantEdgeCases: [
      'Disconnected graph components with unreachable nodes',
      'Negative cycles reachable from source causing unbounded negative distance',
    ],
    expectedAnswerCharacteristics: [
      'Presents a 3-node triangle graph where Dijkstra greedily marks a node visited before discovering a cheaper route via a negative edge',
      'Mentions SPFA (Shortest Path Faster Algorithm) as an optimized queue-based Bellman-Ford heuristic',
    ],
    followUpOpportunities: [
      'How does Johnson’s algorithm use Bellman-Ford reweighting to enable all-pairs shortest paths via Dijkstra?',
      'How does A* search incorporate heuristics while guaranteeing optimality with admissible heuristics?',
    ],
    timeBudgetMinutes: 15,
    tags: ['algorithms', 'graph_algorithms', 'dijkstra', 'bellman_ford', 'shortest_path'],
  },

  // ─────────────────────────────────────────────────────────────
  // 6. Computer Science: Threads & Concurrency (Edge Case)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'cq_concurrency_01',
    curriculumTopicId: 'cs_threads_concurrency',
    conceptReference: 'Deadlock necessary conditions (mutual exclusion, hold and wait, no preemption, circular wait)',
    questionType: 'edge_case',
    difficultyTier: 'advanced',
    difficultyNumeric: 4,
    prompt:
      'State the four Coffman conditions necessary and sufficient for a deadlock to occur in a concurrent system. Provide an engineering strategy to break each condition in production software.',
    interviewObjective:
      'Evaluate deep understanding of concurrent execution, resource ordering, lock hierarchies, and prevention strategies.',
    expectedKnowledge: [
      'Mutual exclusion: resources cannot be shared simultaneously',
      'Hold and wait: process holds resources while requesting additional resources',
      'No preemption: resources cannot be forcibly taken from a process holding them',
      'Circular wait: closed chain of processes each waiting for a resource held by the next',
      'Strategies to break conditions: lock hierarchy / total resource ordering to eliminate circular wait, tryLock with timeouts to prevent unbounded wait/preemption, lock-free data structures (CAS) to eliminate mutual exclusion',
    ],
    evaluationCriteria: {
      rubricCriteria: [
        'Accurately names all 4 Coffman conditions without omitting circular wait or no preemption',
        'Explains strict resource ordering (lock ranking) to mathematically eliminate circular wait',
        'Discusses timed acquisition (e.g. tryAcquire with backoff) to break hold-and-wait / no-preemption',
        'Explains lock-free / non-blocking algorithms using Compare-And-Swap (CAS)',
      ],
      expectedConcepts: ['Coffman conditions', 'Circular wait', 'Lock hierarchy', 'Compare-and-swap', 'Deadlock detection'],
      failurePatterns: [
        'Confuses race conditions or livelocks with deadlocks',
        'Cannot name the 4 conditions or suggests impractical solutions like "never use threads"',
      ],
    },
    relevantEdgeCases: [
      'Livelock caused by simultaneous backoff without randomized jitter',
      'Lock inversion across distributed microservices or database row locks',
    ],
    expectedAnswerCharacteristics: [
      'Gives practical examples such as database deadlocks resolved by victim selection and transaction rollback',
      'Mentions wait-for graph cycle detection algorithms',
    ],
    followUpOpportunities: [
      'How does the Banker’s algorithm safely avoid deadlocks in resource allocation systems?',
      'How do read-copy-update (RCU) mechanisms in the Linux kernel avoid read-side locking entirely?',
    ],
    timeBudgetMinutes: 15,
    tags: ['computer_science', 'concurrency', 'deadlock', 'coffman_conditions', 'synchronization'],
  },

  // ─────────────────────────────────────────────────────────────
  // 7. Computer Science: Operating Systems (Debugging)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'cq_os_01',
    curriculumTopicId: 'cs_operating_systems',
    conceptReference: 'Virtual memory address translation, page tables, TLB (Translation Lookaside Buffer), and page faults',
    questionType: 'debugging',
    difficultyTier: 'intermediate',
    difficultyNumeric: 3,
    prompt:
      'Trace what happens inside the CPU, MMU, and OS kernel when a thread accesses a virtual memory address that is valid in the process address space but currently not present in physical RAM (a major page fault).',
    interviewObjective:
      'Assess low-level systems knowledge: MMU page table walk, TLB miss, interrupt handling, disk paging, and context switching.',
    expectedKnowledge: [
      'Virtual address translation via TLB and page table',
      'Page table entry present bit is 0, triggering CPU page fault exception (interrupt #14 on x86)',
      'CPU transitions from user mode to kernel mode via interrupt descriptor table',
      'Kernel inspects faulting address in CR2 register and checks process VMA (virtual memory area)',
      'Kernel allocates physical page frame and initiates asynchronous disk I/O to read page from swap/backing file',
      'Thread is placed in blocked/waiting state; OS context switches to another runnable thread',
      'Disk I/O completion interrupt arrives; page table entry updated with physical frame and present bit = 1',
      'Thread transitions to ready queue; when rescheduled, instruction is restarted from scratch',
    ],
    evaluationCriteria: {
      rubricCriteria: [
        'Mentions MMU and present bit triggering hardware page fault trap',
        'Differentiates minor page fault (in memory, needs mapping) from major page fault (requires disk I/O)',
        'Identifies that the faulting thread yields CPU while awaiting disk I/O',
        'Notes that the faulting instruction is re-executed upon resumption',
      ],
      expectedConcepts: ['MMU', 'Page table entry', 'Page fault interrupt', 'TLB', 'Context switch', 'Virtual memory'],
      failurePatterns: [
        'Claims page fault crashes the process immediately (confuses with segmentation fault)',
        'Believes the CPU itself reads data from the hard drive without OS intervention',
      ],
    },
    relevantEdgeCases: [
      'Invalid memory address access producing SIGSEGV',
      'Thrashing where page fault frequency overwhelms CPU throughput due to excessive memory pressure',
    ],
    expectedAnswerCharacteristics: [
      'Structured chronological sequence from hardware trap to OS handler to instruction restart',
      'Explicitly references TLB (Translation Lookaside Buffer) and page replacement algorithms (LRU, Clock)',
    ],
    followUpOpportunities: [
      'How do multi-level page tables and huge pages (2MB / 1GB) mitigate memory overhead and TLB pressure?',
      'What is copy-on-write (COW) and how does fork() leverage page fault traps to optimize process creation?',
    ],
    timeBudgetMinutes: 15,
    tags: ['computer_science', 'operating_systems', 'virtual_memory', 'page_faults', 'mmu'],
  },

  // ─────────────────────────────────────────────────────────────
  // 8. Computer Science: Databases (Real-World Scenario)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'cq_databases_01',
    curriculumTopicId: 'cs_databases',
    conceptReference: 'ACID transactions: Atomicity, Consistency, Isolation (Read Committed, Repeatable Read, Serializable), Durability',
    questionType: 'real_world_scenario',
    difficultyTier: 'advanced',
    difficultyNumeric: 4,
    prompt:
      'In an e-commerce inventory system, two concurrent transactions attempt to checkout the last available item of stock. Explain how different SQL isolation levels (Read Committed, Repeatable Read, Serializable) handle this scenario. How does Multi-Version Concurrency Control (MVCC) affect read vs write locking?',
    interviewObjective:
      'Assess database transaction isolation knowledge, phantom reads, write skew, two-phase locking, and MVCC snapshot isolation.',
    expectedKnowledge: [
      'Lost update anomaly under Read Committed if using non-atomic read-then-write',
      'MVCC provides point-in-time snapshots for reads without taking shared locks (readers do not block writers)',
      'Under Repeatable Read, snapshot isolation detects write-write conflicts on the same row in many engines (PostgreSQL), aborting one transaction',
      'Write skew anomaly can still occur under Repeatable Read if constraints span multiple rows',
      'Serializable isolation guarantees equivalent serial ordering, preventing all anomalies (via SSI or two-phase locking)',
      'Practical production pattern: atomic decrement (`UPDATE inventory SET stock = stock - 1 WHERE id = :id AND stock > 0`) or `SELECT FOR UPDATE`',
    ],
    evaluationCriteria: {
      rubricCriteria: [
        'Explains why naive read-then-write causes lost updates under Read Committed',
        'Explains MVCC snapshot mechanics (readers see consistent version; writers take exclusive row locks)',
        'Contrasts optimistic concurrency control / snapshot isolation with pessimistic locking (`SELECT ... FOR UPDATE`)',
        'Proposes atomic SQL update as the idiomatic, high-throughput solution',
      ],
      expectedConcepts: ['ACID', 'MVCC', 'Isolation levels', 'Lost update', 'Write skew', 'Row-level locking'],
      failurePatterns: [
        'Believes Read Committed prevents lost updates without atomic operations',
        'Claims MVCC requires readers to lock rows during queries',
      ],
    },
    relevantEdgeCases: [
      'Deadlock when two transactions lock items in different order',
      'Long-running transactions causing table bloat in PostgreSQL due to vacuum delay',
    ],
    expectedAnswerCharacteristics: [
      'Provides the exact SQL update with a guard predicate `WHERE stock > 0`',
      'Distinguishes PostgreSQL snapshot isolation behavior from MySQL InnoDB next-key locking',
    ],
    followUpOpportunities: [
      'How does PostgreSQL vacuuming clean up dead tuples generated by MVCC updates?',
      'What is Write-Ahead Logging (WAL) and how does it guarantee durability and crash recovery?',
    ],
    timeBudgetMinutes: 20,
    tags: ['computer_science', 'databases', 'acid', 'isolation_levels', 'mvcc', 'concurrency'],
  },

  // ─────────────────────────────────────────────────────────────
  // 9. Software Engineering: System Design (Advanced Problem Solving)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'cq_sysdesign_01',
    curriculumTopicId: 'se_system_design',
    conceptReference: 'Distributed system components: load balancers (Layer 4 vs Layer 7), reverse proxies, API gateways',
    questionType: 'advanced_problem_solving',
    difficultyTier: 'expert',
    difficultyNumeric: 5,
    prompt:
      'Design a globally distributed URL shortening service (like bit.ly) handling 500 million new URLs per month and 50 billion redirects per month with 99.99% availability and sub-10ms redirect latency. Address unique ID generation, data partitioning, caching strategy, and cache invalidation.',
    interviewObjective:
      'Evaluate comprehensive large-scale system architecture: capacity estimation, key generation, database sharding, caching, and CDN.',
    expectedKnowledge: [
      'Traffic estimation: ~200 writes/sec, ~20,000 reads/sec (100:1 read-to-write ratio)',
      'Storage calculation: ~500M * 500 bytes = 250 GB/month, ~15 TB for 5 years',
      'Unique ID generation: Base62 encoding of 64-bit integer, Snowflake ID generator or distributed token range allocator (ZooKeeper)',
      'Database choice: NoSQL key-value store (DynamoDB/Cassandra) or sharded RDBMS',
      'Caching tier: Redis cluster using LRU eviction, caching the top 20% hottest URLs (80-20 rule) to absorb 80%+ of reads',
      'Edge routing: Anycast DNS and GeoDNS directing user to closest regional POP; HTTP 302 vs 301 status code trade-off for analytics tracking',
    ],
    evaluationCriteria: {
      rubricCriteria: [
        'Performs back-of-the-envelope calculations for storage, write QPS, and read QPS',
        'Explains why Base62 encoding is chosen and calculates URL length (62^7 ~ 3.5 trillion URLs)',
        'Addresses ID collision prevention and distributed counter coordination',
        'Compares HTTP 301 (Permanent, client caches, loses analytics) vs 302 (Found, hits server every time, accurate metrics)',
        'Architects multi-region read replicas with Redis caching',
      ],
      expectedConcepts: ['Capacity estimation', 'Base62 encoding', 'Distributed ID generation', 'Cache eviction', 'HTTP redirect semantics'],
      failurePatterns: [
        'Relies on random MD5 hash without collision resolution or range management',
        'Proposes a single SQL instance without sharding or caching for 20k QPS',
      ],
    },
    relevantEdgeCases: [
      'Sudden viral traffic spikes on a single key causing cache hot spot',
      'Handling expired URL cleanup without table-locking batch deletes',
    ],
    expectedAnswerCharacteristics: [
      'Draws or articulates clear end-to-end architecture (Client -> DNS -> CDN/Edge -> API Gateway -> Redis -> Distributed DB)',
      'Discusses trade-offs between eventual consistency and read-your-writes consistency',
    ],
    followUpOpportunities: [
      'How would you prevent a cache stampede / thundering herd when a popular short URL expires from Redis?',
      'How would you implement custom user-defined alias URLs with atomic uniqueness guarantees?',
    ],
    timeBudgetMinutes: 25,
    tags: ['software_engineering', 'system_design', 'scalability', 'url_shortener', 'caching', 'distributed_systems'],
  },

  // ─────────────────────────────────────────────────────────────
  // 10. Software Engineering: Scalability (Follow-Up Question)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'cq_scalability_followup_01',
    curriculumTopicId: 'se_scalability',
    conceptReference: 'Fault tolerance patterns: Circuit Breaker, Exponential Backoff with Jitter, Bulkhead, Fallback',
    questionType: 'follow_up',
    difficultyTier: 'advanced',
    difficultyNumeric: 4,
    prompt:
      'Following up on your circuit breaker implementation: what happens if multiple client instances all trip their circuit breakers simultaneously and enter the HALF-OPEN probe state at the exact same moment? How do you prevent the recovering downstream service from immediate collapse?',
    interviewObjective:
      'Assess ability to handle distributed synchronization stampedes, thundering herd risks, and rate-limited canary recovery probes.',
    expectedKnowledge: [
      'Synchronized half-open transitions cause a thundering herd that re-triggers the breaker',
      'Randomized backoff jitter in recovery timeout intervals',
      'Canary trial traffic: allowing only a single probe request or small percentage (1%) through in half-open state',
      'Distributed coordination vs decentralized probabilistic rate limiting (e.g. token bucket per instance vs Redis script)',
    ],
    evaluationCriteria: {
      rubricCriteria: [
        'Recognizes the thundering herd danger when thousands of client instances probe simultaneously',
        'Proposes decorrelated/jittered probe schedules across instances',
        'Explains canary / fractional traffic admission during half-open trial phase',
      ],
      expectedConcepts: ['Circuit breaker half-open', 'Thundering herd', 'Exponential backoff jitter', 'Canary probing'],
      failurePatterns: [
        'Believes each instance can query downstream without coordination or fractional limiting',
        'Suggests hardcoding a fixed 30-second reset timeout across all client nodes',
      ],
    },
    relevantEdgeCases: [
      'Downstream service is partially degraded, passing canary health check but failing real customer requests',
      'Network partitions isolating some client instances while others remain connected',
    ],
    expectedAnswerCharacteristics: [
      'Explicitly discusses Netflix Hystrix / Resilience4j design principles',
      'Contrasts local in-process circuit breaker state with distributed circuit breaker state',
    ],
    followUpOpportunities: [
      'How does adaptive concurrency limits (e.g. TCP Vegas style queuing delay tracking) replace static circuit breaker thresholds?',
    ],
    timeBudgetMinutes: 15,
    tags: ['software_engineering', 'scalability', 'circuit_breaker', 'follow_up', 'resilience'],
  },
];
