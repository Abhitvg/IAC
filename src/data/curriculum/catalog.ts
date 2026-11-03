import { CurriculumTopic } from './types';

export const CURRICULUM_CATALOG: CurriculumTopic[] = [
  {
    "id": "ds_arrays_strings",
    "name": "Arrays and Strings",
    "category": "data_structures",
    "subcategory": "Linear Structures",
    "description": "Contiguous memory representations, dynamic arrays, geometric growth amortized O(1) resizing, and string manipulation patterns including two-pointer and sliding window traversals.",
    "coreConcepts": [
      "Contiguous memory allocation, byte indexing, and cache line locality",
      "Dynamic array doubling strategy providing amortized O(1) append",
      "Two-pointer inward contraction and outward expansion techniques",
      "Dynamic sliding window state maintenance using frequency tables",
      "Kadane algorithm for maximum contiguous subarray in O(N) time and O(1) space",
      "String immutability tradeoffs, StringBuilder buffers, and prefix arrays"
    ],
    "prerequisites": [],
    "difficulty": "beginner",
    "commonMisconceptions": [
      "Assuming dynamic array insertion is always O(1) without accounting for reallocation spikes",
      "Assuming string concatenation in loops is O(N) rather than O(N^2) due to repeated buffer allocation",
      "Confusing subarray (contiguous) with subsequence (non-contiguous ordered)"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Implement dynamic arrays with geometric reallocation from scratch",
      "Apply two-pointer and sliding window patterns in optimal O(N) time",
      "Analyze memory layout and cache performance of array structures"
    ],
    "relatedTopics": [
      "algo_big_o",
      "ds_linked_lists",
      "ds_hash_tables"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Arrays",
      "ciuSectionReference": "jwasham/coding-interview-university#arrays",
      "referenceNotes": "CLRS Chapter 10 (Elementary Data Structures)",
      "iacAdditionNote": "Expanded with migrated sliding window and Kadane key concepts from GFG_CODING_PATTERNS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Contiguous memory allocation, byte indexing, and cache line locality",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#arrays_strings"
      },
      {
        "text": "Dynamic array doubling strategy providing amortized O(1) append",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#arrays_strings"
      },
      {
        "text": "Two-pointer inward contraction and outward expansion techniques",
        "provenance": "other",
        "sourceReference": "GFG_CODING_PATTERNS (migrated)"
      },
      {
        "text": "Dynamic sliding window state maintenance using frequency tables",
        "provenance": "other",
        "sourceReference": "GFG_CODING_PATTERNS (migrated)"
      },
      {
        "text": "Kadane algorithm for maximum contiguous subarray in O(N) time and O(1) space",
        "provenance": "other",
        "sourceReference": "GFG_CODING_PATTERNS (migrated); Bentley Programming Pearls (1984)"
      },
      {
        "text": "String immutability tradeoffs, StringBuilder buffers, and prefix arrays",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#arrays_strings"
      }
    ]
  },
  {
    "id": "ds_linked_lists",
    "name": "Linked Lists",
    "category": "data_structures",
    "subcategory": "Linear Structures",
    "description": "Pointer-based node chains covering singly, doubly, circular, and sentinel-headed linked lists with in-place pointer manipulation and cycle detection.",
    "coreConcepts": [
      "Node structure with data and successor/predecessor pointer links",
      "In-place reversal via iterative three-pointer sliding window (prev, curr, next)",
      "Floyd cycle detection (tortoise and hare) and cycle entry point calculation",
      "Doubly linked lists with sentinel head and tail nodes for O(1) arbitrary deletion",
      "Memory overhead of pointer metadata compared to contiguous arrays"
    ],
    "prerequisites": [
      "ds_arrays_strings"
    ],
    "difficulty": "easy",
    "commonMisconceptions": [
      "Assuming linked list random lookup is O(1) like arrays instead of sequential O(N)",
      "Losing references to successor nodes during in-place pointer updates",
      "Overlooking empty list or single-node boundary cases"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Reverse singly and doubly linked lists iteratively and recursively in-place",
      "Detect cycles and find cycle starts using Floyd algorithm with O(1) space",
      "Construct LRU cache building blocks using doubly linked sentinel lists"
    ],
    "relatedTopics": [
      "ds_arrays_strings",
      "ds_stacks_queues",
      "ds_hash_tables"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Linked Lists",
      "ciuSectionReference": "jwasham/coding-interview-university#linked-lists",
      "referenceNotes": "CLRS Chapter 10.2 (Linked lists)",
      "iacAdditionNote": "Integrated Floyd cycle detection and doubly-linked sentinel caches from GFG_CODING_PATTERNS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Node structure with data and successor/predecessor pointer links",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#linked_lists"
      },
      {
        "text": "In-place reversal via iterative three-pointer sliding window (prev, curr, next)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#linked_lists"
      },
      {
        "text": "Floyd cycle detection (tortoise and hare) and cycle entry point calculation",
        "provenance": "other",
        "sourceReference": "GFG_CODING_PATTERNS (migrated); Floyd (1967)"
      },
      {
        "text": "Doubly linked lists with sentinel head and tail nodes for O(1) arbitrary deletion",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#linked_lists"
      },
      {
        "text": "Memory overhead of pointer metadata compared to contiguous arrays",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#linked_lists"
      }
    ]
  },
  {
    "id": "ds_stacks_queues",
    "name": "Stacks and Queues",
    "category": "data_structures",
    "subcategory": "Linear Structures",
    "description": "LIFO and FIFO abstract data types, circular buffer implementations, monotonic stacks for nearest smaller/greater problems, and dual-stack queue adaptations.",
    "coreConcepts": [
      "LIFO stack semantics and call-stack frame simulation",
      "FIFO queue semantics and bounded circular buffer pointer wraparound",
      "Monotonic stack invariants for nearest greater/smaller element queries in O(N)",
      "Two-stack queue construction with amortized O(1) enqueue and dequeue",
      "Deque (double-ended queue) representation and sliding window maximum"
    ],
    "prerequisites": [
      "ds_arrays_strings",
      "ds_linked_lists"
    ],
    "difficulty": "easy",
    "commonMisconceptions": [
      "Assuming queue implementation via dynamic array shift() is O(1) instead of O(N)",
      "Failing to maintain strict monotonicity when popping equal elements in monotonic stacks",
      "Assuming two-stack queue operations are worst-case O(1) rather than amortized O(1)"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Implement circular ring buffers and dual-stack queues correctly",
      "Solve histogram and next-greater-element problems using monotonic stacks in O(N)",
      "Evaluate stack-based recursion simulation to prevent call stack overflow"
    ],
    "relatedTopics": [
      "ds_linked_lists",
      "algo_recursion",
      "algo_dfs",
      "algo_bfs"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Stack & Queue",
      "ciuSectionReference": "jwasham/coding-interview-university#stack and #queue",
      "referenceNotes": "CLRS Chapter 10.1 (Stacks and queues)",
      "iacAdditionNote": "Added monotonic queue/stack patterns from GFG_CODING_PATTERNS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "LIFO stack semantics and call-stack frame simulation",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#stacks_queues"
      },
      {
        "text": "FIFO queue semantics and bounded circular buffer pointer wraparound",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#stacks_queues"
      },
      {
        "text": "Monotonic stack invariants for nearest greater/smaller element queries in O(N)",
        "provenance": "other",
        "sourceReference": "GFG_CODING_PATTERNS (migrated)"
      },
      {
        "text": "Two-stack queue construction with amortized O(1) enqueue and dequeue",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#stacks_queues"
      },
      {
        "text": "Deque (double-ended queue) representation and sliding window maximum",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#stacks_queues"
      }
    ]
  },
  {
    "id": "ds_hash_tables",
    "name": "Hash Tables",
    "category": "data_structures",
    "subcategory": "Associative Structures",
    "description": "Key-value associative mapping using deterministic hash functions, collision resolution mechanisms (separate chaining vs open addressing), load factors, and cryptographic vs non-cryptographic distribution.",
    "coreConcepts": [
      "Deterministic uniform hashing and modulo table indexing",
      "Collision resolution via separate chaining (linked lists or self-balancing trees)",
      "Open addressing strategies: linear probing, quadratic probing, and double hashing",
      "Primary and secondary clustering phenomena in open addressing",
      "Load factor thresholds, tombstone markers for deletion, and O(N) dynamic rehashing"
    ],
    "prerequisites": [
      "ds_arrays_strings",
      "ds_linked_lists"
    ],
    "difficulty": "easy",
    "commonMisconceptions": [
      "Believing hash table lookup is guaranteed O(1) worst-case rather than average-case",
      "Deleting elements in open addressing by nulling the slot instead of marking with tombstones",
      "Assuming any arbitrary mathematical function is a valid hash function without distribution uniformity"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Compare collision resolution strategies with concrete space, latency, and cache-locality tradeoffs",
      "Calculate load factors and trigger dynamic resize with rehashing",
      "Identify hash DOS attacks and mitigation using randomized seeds"
    ],
    "relatedTopics": [
      "ds_arrays_strings",
      "ds_trees_bst",
      "ds_sets_maps"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Hash table",
      "ciuSectionReference": "jwasham/coding-interview-university#hash-table",
      "referenceNotes": "CLRS Chapter 11 (Hash Tables)",
      "iacAdditionNote": "Expanded collision resolution mechanics and load-factor management"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Deterministic uniform hashing and modulo table indexing",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#hash_tables"
      },
      {
        "text": "Collision resolution via separate chaining (linked lists or self-balancing trees)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#hash_tables"
      },
      {
        "text": "Open addressing strategies: linear probing, quadratic probing, and double hashing",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#hash_tables"
      },
      {
        "text": "Primary and secondary clustering phenomena in open addressing",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#hash_tables"
      },
      {
        "text": "Load factor thresholds, tombstone markers for deletion, and O(N) dynamic rehashing",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#hash_tables"
      }
    ]
  },
  {
    "id": "ds_trees_bst",
    "name": "Trees and Binary Search Trees",
    "category": "data_structures",
    "subcategory": "Hierarchical Structures",
    "description": "Hierarchical tree topologies, binary tree traversals (pre/in/post/level), binary search tree (BST) invariants, lowest common ancestor, and self-balancing tree principles (AVL and Red-Black).",
    "coreConcepts": [
      "Binary tree recursive definitions, height, depth, and diameter calculations",
      "In-order traversal yielding monotonic sorted sequences for BSTs",
      "BST insertion, lookup, and deletion (handling two-child node replacement with successor)",
      "Self-balancing tree guarantees (AVL height-balance rotations, Red-Black color invariants)",
      "Lowest Common Ancestor (LCA) in general binary trees and BSTs"
    ],
    "prerequisites": [
      "ds_stacks_queues",
      "algo_recursion"
    ],
    "difficulty": "intermediate",
    "commonMisconceptions": [
      "Validating BST by checking only direct child nodes rather than passing bounded recursive ranges [min, max]",
      "Assuming binary tree search is O(log N) without verifying balance (degenerate linked list is O(N))",
      "Confusing complete binary trees with full or balanced binary trees"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Validate BST invariants using bounded ranges in O(N) time and O(H) space",
      "Implement tree traversals iteratively using explicit stacks to avoid stack overflow",
      "Find Lowest Common Ancestor across arbitrary and binary search trees"
    ],
    "relatedTopics": [
      "algo_recursion",
      "algo_dfs",
      "algo_bfs",
      "ds_heaps"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Trees",
      "ciuSectionReference": "jwasham/coding-interview-university#trees and #binary-search-trees",
      "referenceNotes": "CLRS Chapters 12 (BST) and 13 (Red-Black Trees)",
      "iacAdditionNote": "Preserved BST invariant range checks and LCA properties from GFG_CODING_PATTERNS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Binary tree recursive definitions, height, depth, and diameter calculations",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#trees_bst"
      },
      {
        "text": "In-order traversal yielding monotonic sorted sequences for BSTs",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#trees_bst"
      },
      {
        "text": "BST insertion, lookup, and deletion (handling two-child node replacement with successor)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#trees_bst"
      },
      {
        "text": "Self-balancing tree guarantees (AVL height-balance rotations, Red-Black color invariants)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#trees_bst"
      },
      {
        "text": "Lowest Common Ancestor (LCA) in general binary trees and BSTs",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#trees_bst"
      }
    ]
  },
  {
    "id": "ds_heaps",
    "name": "Heaps and Priority Queues",
    "category": "data_structures",
    "subcategory": "Hierarchical Structures",
    "description": "Complete binary tree representations stored in flat arrays, min/max heap properties, heapify operations, priority queue abstractions, and running streaming median algorithms.",
    "coreConcepts": [
      "Zero-indexed array representation: left child = 2i + 1, right child = 2i + 2, parent = floor((i - 1)/2)",
      "Sift-up and sift-down operations maintaining heap-order property in O(log N)",
      "Linear-time bottom-up heap construction (buildHeap in O(N))",
      "Top-K element tracking with bounded min-heap in O(N log K)",
      "Dual-heap partition (max-heap for lower half, min-heap for upper half) for O(1) streaming median"
    ],
    "prerequisites": [
      "ds_arrays_strings",
      "ds_trees_bst"
    ],
    "difficulty": "intermediate",
    "commonMisconceptions": [
      "Assuming buildHeap by N sequential pushes is O(N) instead of O(N log N); bottom-up sift-down is required for O(N)",
      "Assuming elements in a heap array are sorted; only root ancestor guarantees hold",
      "Searching an arbitrary element in a heap is O(log N) instead of O(N)"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Implement binary min/max heap with array backing from scratch",
      "Solve top-K frequent and streaming running median problems using priority queues",
      "Explain the mathematical proof for O(N) bottom-up heapification"
    ],
    "relatedTopics": [
      "algo_sorting",
      "algo_graph_algorithms",
      "ds_trees_bst"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Binary search tree & Heaps",
      "ciuSectionReference": "jwasham/coding-interview-university#heap--priority-queue--binary-heap",
      "referenceNotes": "CLRS Chapter 6 (Heapsort / Priority Queues)",
      "iacAdditionNote": "Preserved two-heap running median and heapification mechanics from GFG_CODING_PATTERNS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Zero-indexed array representation: left child = 2i + 1, right child = 2i + 2, parent = floor((i - 1)/2)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#heaps"
      },
      {
        "text": "Sift-up and sift-down operations maintaining heap-order property in O(log N)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#heaps"
      },
      {
        "text": "Linear-time bottom-up heap construction (buildHeap in O(N))",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#heaps"
      },
      {
        "text": "Top-K element tracking with bounded min-heap in O(N log K)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#heaps"
      },
      {
        "text": "Dual-heap partition (max-heap for lower half, min-heap for upper half) for O(1) streaming median",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#heaps"
      }
    ]
  },
  {
    "id": "ds_tries",
    "name": "Tries and Prefix Trees",
    "category": "data_structures",
    "subcategory": "Hierarchical Structures",
    "description": "Re-retrieval tree structures optimized for prefix lookup, string dictionary validation, autocomplete, IP routing, and bitwise prefix matching.",
    "coreConcepts": [
      "Trie node alphabet branching maps and terminal word indicators",
      "Prefix search and full-word lookup in O(L) time where L is word length",
      "Space-saving variants: compressed tries (radix trees / Patricia tries)",
      "Bitwise tries for maximum XOR subarray complement searches",
      "Wildcard search and prefix autocomplete exploration via recursive traversal"
    ],
    "prerequisites": [
      "ds_trees_bst",
      "ds_hash_tables"
    ],
    "difficulty": "intermediate",
    "commonMisconceptions": [
      "Using fixed 26-element array nodes when character alphabet is dynamic, leading to extreme memory bloat",
      "Failing to mark terminal nodes, causing substring prefixes to register as complete words",
      "Assuming trie lookup is faster than hash table for single exact key matches"
    ],
    "interviewRelevance": "frequently_tested",
    "expectedLearningOutcomes": [
      "Implement insert, search, and startsWith operations in O(L) time",
      "Build prefix autocomplete and word-search dictionary solvers",
      "Analyze space complexity trade-offs between node pointers and compressed radix edges"
    ],
    "relatedTopics": [
      "ds_trees_bst",
      "algo_dfs",
      "algo_backtracking"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Tries",
      "ciuSectionReference": "jwasham/coding-interview-university#tries",
      "referenceNotes": "Algorithms (Sedgewick & Wayne) Chapter 5.2",
      "iacAdditionNote": "Preserved Trie prefix matching patterns from GFG_CODING_PATTERNS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Trie node alphabet branching maps and terminal word indicators",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#tries"
      },
      {
        "text": "Prefix search and full-word lookup in O(L) time where L is word length",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#tries"
      },
      {
        "text": "Space-saving variants: compressed tries (radix trees / Patricia tries)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#tries"
      },
      {
        "text": "Bitwise tries for maximum XOR subarray complement searches",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#tries"
      },
      {
        "text": "Wildcard search and prefix autocomplete exploration via recursive traversal",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#tries"
      }
    ]
  },
  {
    "id": "ds_graphs",
    "name": "Graph Representations and Properties",
    "category": "data_structures",
    "subcategory": "Network Structures",
    "description": "Vertex and edge modeling, adjacency lists vs adjacency matrices, directed/undirected, cyclic/acyclic graphs, topological properties, and disjoint set union (DSU).",
    "coreConcepts": [
      "Adjacency list (sparse graph space O(V + E)) vs Adjacency matrix (dense graph O(V^2))",
      "Degree, connectivity, components, and DAG (Directed Acyclic Graph) invariants",
      "Disjoint Set Union (Union-Find) with path compression and union-by-rank in alpha(N) amortized time",
      "Bipartite graph verification using 2-color BFS/DFS",
      "Transpose graph construction for strongly connected component discovery"
    ],
    "prerequisites": [
      "ds_arrays_strings",
      "ds_linked_lists",
      "ds_hash_tables"
    ],
    "difficulty": "intermediate",
    "commonMisconceptions": [
      "Using an adjacency matrix for sparse graphs with millions of vertices, causing memory exhaustion",
      "Forgetting visited sets when traversing graphs with cycles, leading to infinite loops",
      "Assuming Union-Find handles directed cycle detection or path finding"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Select optimal graph representation based on edge density and query patterns",
      "Implement Disjoint Set Union with path compression and rank optimization",
      "Detect cycles in directed and undirected graphs accurately"
    ],
    "relatedTopics": [
      "algo_bfs",
      "algo_dfs",
      "algo_graph_algorithms"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Graphs",
      "ciuSectionReference": "jwasham/coding-interview-university#graphs",
      "referenceNotes": "CLRS Chapter 22 (Elementary Graph Algorithms)",
      "iacAdditionNote": "Incorporated DSU path compression and rank heuristics from GFG_CODING_PATTERNS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Adjacency list (sparse graph space O(V + E)) vs Adjacency matrix (dense graph O(V^2))",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#graphs"
      },
      {
        "text": "Degree, connectivity, components, and DAG (Directed Acyclic Graph) invariants",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#graphs"
      },
      {
        "text": "Disjoint Set Union (Union-Find) with path compression and union-by-rank in alpha(N) amortized time",
        "provenance": "other",
        "sourceReference": "GFG_CODING_PATTERNS (migrated); Tarjan (1975)"
      },
      {
        "text": "Bipartite graph verification using 2-color BFS/DFS",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#graphs"
      },
      {
        "text": "Transpose graph construction for strongly connected component discovery",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#graphs"
      }
    ]
  },
  {
    "id": "ds_sets_maps",
    "name": "Sets and Maps",
    "category": "data_structures",
    "subcategory": "Associative Structures",
    "description": "Hash-based and tree-based set and map collections, ordering guarantees, uniqueness enforcement, and collision mitigation.",
    "coreConcepts": [
      "HashSet / HashMap using hashing with O(1) average lookup and no order guarantees",
      "TreeSet / TreeMap backed by Red-Black trees with O(log N) lookup and ordered key iteration",
      "Set mathematical operations: union, intersection, difference, and subset checks",
      "Key immutability requirements (mutating key hashcode breaks map retrieval)",
      "Concurrent collections and bucket-level striping vs global locks"
    ],
    "prerequisites": [
      "ds_hash_tables",
      "ds_trees_bst"
    ],
    "difficulty": "easy",
    "commonMisconceptions": [
      "Assuming elements in a standard HashSet retain insertion order; LinkedHashSet is required",
      "Mutating an object after inserting it as a key into a HashSet/HashMap",
      "Assuming TreeMap has O(1) lookup because it is called a map"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Distinguish HashSet from TreeSet performance and ordering semantics",
      "Design composite cache keys with reliable equality and hashcode implementations",
      "Apply set operations to solve duplicate detection and complement problems"
    ],
    "relatedTopics": [
      "ds_hash_tables",
      "ds_trees_bst"
    ],
    "sourceAttribution": {
      "attributionType": "general_cs",
      "inCodingInterviewUniversity": false,
      "referenceNotes": "Standard CS Abstract Data Types: CLRS Chapter 11 (Hash Tables) & Set theory",
      "iacAdditionNote": "Explicitly separated from basic hash tables for language-agnostic collection analysis"
    },
    "version": 1,
    "concepts": [
      {
        "text": "HashSet / HashMap using hashing with O(1) average lookup and no order guarantees",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "TreeSet / TreeMap backed by Red-Black trees with O(log N) lookup and ordered key iteration",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Set mathematical operations: union, intersection, difference, and subset checks",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Key immutability requirements (mutating key hashcode breaks map retrieval)",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Concurrent collections and bucket-level striping vs global locks",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      }
    ]
  },
  {
    "id": "algo_big_o",
    "name": "Big-O Asymptotic Complexity Analysis",
    "category": "algorithms",
    "subcategory": "Analysis & Theory",
    "description": "Formal mathematical bounds (Big-O upper bound, Big-Omega lower bound, Big-Theta tight bound), time and space complexity, amortized analysis, and recurrence relations.",
    "coreConcepts": [
      "Asymptotic growth rates: O(1), O(log N), O(N), O(N log N), O(N^2), O(2^N), O(N!)",
      "Worst-case, average-case, and best-case performance distinctions",
      "Auxiliary space vs total space complexity (including recursion call stack frames)",
      "Amortized analysis using aggregate, accounting, and potential methods",
      "Master theorem for divide-and-conquer recurrences: T(N) = aT(N/b) + f(N)"
    ],
    "prerequisites": [],
    "difficulty": "beginner",
    "commonMisconceptions": [
      "Confusing worst-case runtime with Big-O notation (Big-O is an asymptotic upper bound for any function, not solely worst case)",
      "Ignoring recursion stack space when stating auxiliary space complexity is O(1)",
      "Treating constant factors as irrelevant when comparing two algorithms with identical asymptotic bounds on small datasets"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Calculate time and space complexity for iterative and recursive algorithms",
      "State complexity in formal Big-O notation before writing code in interviews",
      "Apply Master Theorem to divide-and-conquer recurrence equations"
    ],
    "relatedTopics": [
      "algo_recursion",
      "algo_divide_and_conquer"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Algorithmic complexity / Big-O / Asymptotic analysis",
      "ciuSectionReference": "jwasham/coding-interview-university#algorithmic-complexity--big-o--asymptotic-analysis",
      "referenceNotes": "CLRS Chapter 3 (Growth of Functions)",
      "iacAdditionNote": "Preserved Big-O interview best practices from GFG_CODING_PATTERNS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Asymptotic growth rates: O(1), O(log N), O(N), O(N log N), O(N^2), O(2^N), O(N!)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#big_o"
      },
      {
        "text": "Worst-case, average-case, and best-case performance distinctions",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#big_o"
      },
      {
        "text": "Auxiliary space vs total space complexity (including recursion call stack frames)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#big_o"
      },
      {
        "text": "Amortized analysis using aggregate, accounting, and potential methods",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#big_o"
      },
      {
        "text": "Master theorem for divide-and-conquer recurrences: T(N) = aT(N/b) + f(N)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#big_o"
      }
    ]
  },
  {
    "id": "algo_binary_search",
    "name": "Binary Search & Monotonic Space",
    "category": "algorithms",
    "subcategory": "Searching & Partitioning",
    "description": "Logarithmic search on sorted arrays and monotonic predicate spaces, mid-point calculation avoiding integer overflow, and lower/upper bound binary search.",
    "coreConcepts": [
      "Mid-point computation without integer overflow: mid = low + floor((high - low) / 2)",
      "Boundary update invariants: closed intervals [low, high] vs half-open [low, high)",
      "Lower bound (first index where val >= target) and upper bound (first index where val > target)",
      "Binary search on answer/solution space (optimizing a monotonic feasibility predicate)",
      "Search in rotated sorted arrays with discontinuity detection"
    ],
    "prerequisites": [
      "ds_arrays_strings",
      "algo_big_o"
    ],
    "difficulty": "easy",
    "commonMisconceptions": [
      "Computing mid = (low + high) / 2 which causes 32-bit signed integer overflow when low + high > 2^31 - 1",
      "Off-by-one errors in while condition (while (low <= high) vs while (low < high)) causing infinite loops",
      "Thinking binary search only works on pre-sorted arrays rather than any monotonic boolean function"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Implement bug-free standard and boundary binary search templates",
      "Apply binary search on monotonic predicate solution spaces in O(N log(range))",
      "Solve rotated sorted array search and peak element detection"
    ],
    "relatedTopics": [
      "ds_arrays_strings",
      "algo_divide_and_conquer"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Binary search",
      "ciuSectionReference": "jwasham/coding-interview-university#binary-search",
      "referenceNotes": "CLRS Chapter 2 (Getting Started)",
      "iacAdditionNote": "Incorporated binary search on solution space from GFG_CODING_PATTERNS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Mid-point computation without integer overflow: mid = low + floor((high - low) / 2)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#binary_search"
      },
      {
        "text": "Boundary update invariants: closed intervals [low, high] vs half-open [low, high)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#binary_search"
      },
      {
        "text": "Lower bound (first index where val >= target) and upper bound (first index where val > target)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#binary_search"
      },
      {
        "text": "Binary search on answer/solution space (optimizing a monotonic feasibility predicate)",
        "provenance": "other",
        "sourceReference": "GFG_CODING_PATTERNS (migrated)"
      },
      {
        "text": "Search in rotated sorted arrays with discontinuity detection",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#binary_search"
      }
    ]
  },
  {
    "id": "algo_sorting",
    "name": "Sorting Algorithms",
    "category": "algorithms",
    "subcategory": "Sorting & Selection",
    "description": "Comparison-based sorting (Merge Sort, Quick Sort, Heap Sort) and non-comparison sorting (Counting Sort, Radix Sort), stability, in-place mechanics, and median of three pivot selection.",
    "coreConcepts": [
      "Stability definition: preserving relative input order of identical key records",
      "Merge Sort: guaranteed O(N log N) time, stable, auxiliary space O(N)",
      "Quick Sort: in-place Lomuto/Hoare partitioning, O(N log N) average, O(N^2) worst-case with poor pivots",
      "Median-of-three pivot selection and 3-way Dutch National Flag partitioning for duplicate handling",
      "Non-comparison integer sorting: Counting Sort O(N + K) and Radix Sort O(d * (N + K))"
    ],
    "prerequisites": [
      "ds_arrays_strings",
      "algo_big_o",
      "algo_recursion"
    ],
    "difficulty": "intermediate",
    "commonMisconceptions": [
      "Believing comparison sorts can beat the theoretical lower bound of Omega(N log N)",
      "Assuming Quick Sort is always in-place with O(1) space; call stack requires O(log N) auxiliary space",
      "Using Quick Sort on data with massive duplicate keys without 3-way partitioning, degrading to O(N^2)"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Implement Merge Sort and 3-way Quick Sort correctly",
      "Analyze stability, memory locality, and worst-case performance trade-offs",
      "Identify when non-comparison linear-time sorting is applicable"
    ],
    "relatedTopics": [
      "ds_heaps",
      "algo_divide_and_conquer"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Sorting",
      "ciuSectionReference": "jwasham/coding-interview-university#sorting",
      "referenceNotes": "CLRS Chapters 7 (Quicksort) and 8 (Sorting in Linear Time)",
      "iacAdditionNote": "Expanded with Dutch National Flag 3-way partitioning and stability analysis"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Stability definition: preserving relative input order of identical key records",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#sorting"
      },
      {
        "text": "Merge Sort: guaranteed O(N log N) time, stable, auxiliary space O(N)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#sorting"
      },
      {
        "text": "Quick Sort: in-place Lomuto/Hoare partitioning, O(N log N) average, O(N^2) worst-case with poor pivots",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#sorting"
      },
      {
        "text": "Median-of-three pivot selection and 3-way Dutch National Flag partitioning for duplicate handling",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#sorting"
      },
      {
        "text": "Non-comparison integer sorting: Counting Sort O(N + K) and Radix Sort O(d * (N + K))",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#sorting"
      }
    ]
  },
  {
    "id": "algo_recursion",
    "name": "Recursion and Recurrence",
    "category": "algorithms",
    "subcategory": "Paradigm & Control Flow",
    "description": "Self-referential function definitions, base cases, recursion tree analysis, call-stack memory growth, and tail-call optimization.",
    "coreConcepts": [
      "Base cases preventing unbounded recursion and stack overflow errors",
      "State progression towards termination invariants at each recursive invocation",
      "Recursion tree visualization for branching factor and depth analysis",
      "Call stack frame memory consumption O(depth) and stack overflow risks",
      "Tail recursion transformation and iterative conversion techniques"
    ],
    "prerequisites": [
      "algo_big_o"
    ],
    "difficulty": "easy",
    "commonMisconceptions": [
      "Missing base cases or designing base cases that cannot be reached, leading to Maximum Call Stack Exceeded",
      "Recalculating overlapping subproblems exponentially instead of recognizing overlapping substructure",
      "Assuming tail call optimization is supported across all production runtimes without compiler support"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Deconstruct complex problems into verified base and recursive induction steps",
      "Draw recursion trees to derive exact recurrence relations",
      "Convert recursive formulations to iterative stack-based loops to prevent stack overflow"
    ],
    "relatedTopics": [
      "algo_big_o",
      "algo_backtracking",
      "algo_dynamic_programming"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Recursion",
      "ciuSectionReference": "jwasham/coding-interview-university#recursion",
      "referenceNotes": "CLRS Chapter 4 (Divide-and-Conquer Recurrences)",
      "iacAdditionNote": "Standardized call-stack frame analysis and recursion tree visualization"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Base cases preventing unbounded recursion and stack overflow errors",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#recursion"
      },
      {
        "text": "State progression towards termination invariants at each recursive invocation",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#recursion"
      },
      {
        "text": "Recursion tree visualization for branching factor and depth analysis",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#recursion"
      },
      {
        "text": "Call stack frame memory consumption O(depth) and stack overflow risks",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#recursion"
      },
      {
        "text": "Tail recursion transformation and iterative conversion techniques",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#recursion"
      }
    ]
  },
  {
    "id": "algo_backtracking",
    "name": "Backtracking and State Space Search",
    "category": "algorithms",
    "subcategory": "Exhaustive Search",
    "description": "Systematic exploration of decision trees, choice-explore-unchoose paradigm, constraint satisfaction, and branch pruning.",
    "coreConcepts": [
      "State space decision tree traversal with three steps: make choice, recurse, undo choice (backtrack)",
      "Pruning invalid candidate search branches early using bounding constraints",
      "Combinatorial generation: subsets, permutations, combinations, and partitions",
      "Constraint satisfaction problems (N-Queens, Sudoku solver, Word Search)",
      "Time complexity estimation: O(K^N) or O(N!) bounded by effective pruning"
    ],
    "prerequisites": [
      "algo_recursion"
    ],
    "difficulty": "intermediate",
    "commonMisconceptions": [
      "Forgetting to undo state changes (unchoose) when returning from recursive calls, corrupting subsequent branches",
      "Generating duplicate subsets/permutations by not sorting and skipping adjacent equal elements",
      "Passing copies of large state buffers at every level instead of mutating and restoring a single shared buffer"
    ],
    "interviewRelevance": "frequently_tested",
    "expectedLearningOutcomes": [
      "Apply the choice-explore-unchoose paradigm reliably",
      "Implement branch pruning to dramatically reduce effective state space search",
      "Solve permutation and combination problems with duplicate suppression"
    ],
    "relatedTopics": [
      "algo_recursion",
      "algo_dfs",
      "ds_trees_bst"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Recursion",
      "ciuSectionReference": "jwasham/coding-interview-university#recursion",
      "referenceNotes": "Algorithm Design (Kleinberg & Tardos) Chapter 6",
      "iacAdditionNote": "Dedicated topic for constraint satisfaction and decision tree pruning"
    },
    "version": 1,
    "concepts": [
      {
        "text": "State space decision tree traversal with three steps: make choice, recurse, undo choice (backtrack)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#backtracking"
      },
      {
        "text": "Pruning invalid candidate search branches early using bounding constraints",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#backtracking"
      },
      {
        "text": "Combinatorial generation: subsets, permutations, combinations, and partitions",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#backtracking"
      },
      {
        "text": "Constraint satisfaction problems (N-Queens, Sudoku solver, Word Search)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#backtracking"
      },
      {
        "text": "Time complexity estimation: O(K^N) or O(N!) bounded by effective pruning",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#backtracking"
      }
    ]
  },
  {
    "id": "algo_bfs",
    "name": "Breadth-First Search (BFS)",
    "category": "algorithms",
    "subcategory": "Graph & Tree Traversals",
    "description": "Level-order traversal using queues, shortest path exploration on unweighted graphs, multi-source BFS, and topological discovery.",
    "coreConcepts": [
      "FIFO queue discipline exploring nodes in strict increasing order of distance from source",
      "Shortest path optimality property on unweighted graphs",
      "Level-by-level batch processing (tracking queue length at current depth)",
      "Multi-source BFS initialization (pushing all start nodes before traversal)",
      "Visited set tracking upon enqueue (not dequeue) to avoid duplicate queue insertions"
    ],
    "prerequisites": [
      "ds_stacks_queues",
      "ds_graphs"
    ],
    "difficulty": "easy",
    "commonMisconceptions": [
      "Marking nodes as visited when dequeuing rather than when enqueuing, causing redundant memory bloat",
      "Using BFS to find shortest path on weighted graphs (requires Dijkstra instead)",
      "Confusing BFS memory consumption O(width of tree/graph) with DFS O(height)"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Implement single-source and multi-source BFS on graphs and grids",
      "Extract shortest path distances on unweighted networks",
      "Analyze peak memory utilization across wide graphs"
    ],
    "relatedTopics": [
      "ds_stacks_queues",
      "ds_graphs",
      "algo_dfs",
      "algo_graph_algorithms"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Breadth-First Search",
      "ciuSectionReference": "jwasham/coding-interview-university#breadth-first-search-bfs",
      "referenceNotes": "CLRS Chapter 22.2 (Breadth-first search)",
      "iacAdditionNote": "Included multi-source BFS and grid traversal mechanics from GFG_CODING_PATTERNS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "FIFO queue discipline exploring nodes in strict increasing order of distance from source",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#bfs"
      },
      {
        "text": "Shortest path optimality property on unweighted graphs",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#bfs"
      },
      {
        "text": "Level-by-level batch processing (tracking queue length at current depth)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#bfs"
      },
      {
        "text": "Multi-source BFS initialization (pushing all start nodes before traversal)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#bfs"
      },
      {
        "text": "Visited set tracking upon enqueue (not dequeue) to avoid duplicate queue insertions",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#bfs"
      }
    ]
  },
  {
    "id": "algo_dfs",
    "name": "Depth-First Search (DFS)",
    "category": "algorithms",
    "subcategory": "Graph & Tree Traversals",
    "description": "Deep exploration of branches using recursion or explicit stacks, connected component counting, cycle detection with three-state coloring, and path finding.",
    "coreConcepts": [
      "LIFO traversal exploring path to terminal leaf before backtracking",
      "Connected components counting in undirected graphs and matrix grids",
      "Three-state coloring (white/unvisited, gray/visiting, black/visited) for directed cycle detection",
      "Eulerian path and Hamiltonian path distinctions",
      "Recursion call stack vs explicit stack implementation for deep trees"
    ],
    "prerequisites": [
      "ds_stacks_queues",
      "ds_graphs",
      "algo_recursion"
    ],
    "difficulty": "easy",
    "commonMisconceptions": [
      "Assuming DFS finds the shortest path between two nodes (it finds any path, not necessarily shortest)",
      "Using simple boolean visited arrays for directed cycle detection instead of three-color states",
      "Triggering stack overflow on deep graphs (N > 10,000) by not switching to an explicit iterative stack"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Implement recursive and iterative DFS with visited state management",
      "Detect cycles in directed graphs using three-color vertex classification",
      "Solve grid island counting and flood fill problems in O(V + E) time"
    ],
    "relatedTopics": [
      "algo_bfs",
      "ds_graphs",
      "algo_backtracking",
      "algo_graph_algorithms"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Depth-First Search",
      "ciuSectionReference": "jwasham/coding-interview-university#depth-first-search-dfs",
      "referenceNotes": "CLRS Chapter 22.3 (Depth-first search)",
      "iacAdditionNote": "Incorporated three-state graph coloring and island counting patterns from GFG_CODING_PATTERNS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "LIFO traversal exploring path to terminal leaf before backtracking",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#dfs"
      },
      {
        "text": "Connected components counting in undirected graphs and matrix grids",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#dfs"
      },
      {
        "text": "Three-state coloring (white/unvisited, gray/visiting, black/visited) for directed cycle detection",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#dfs"
      },
      {
        "text": "Eulerian path and Hamiltonian path distinctions",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#dfs"
      },
      {
        "text": "Recursion call stack vs explicit stack implementation for deep trees",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#dfs"
      }
    ]
  },
  {
    "id": "algo_greedy",
    "name": "Greedy Algorithms",
    "category": "algorithms",
    "subcategory": "Optimization",
    "description": "Locally optimal choice heuristics leading to global optimums, optimal substructure, greedy-choice property verification, and counterexamples.",
    "coreConcepts": [
      "Greedy-choice property: global optimum achieved via locally optimal steps without backtracking",
      "Optimal substructure: optimal solution contains optimal solutions to subproblems",
      "Activity selection / interval scheduling by sorting endpoints",
      "Huffman optimal prefix coding and fractional knapsack problem",
      "Proving correctness via exchange arguments (showing no other choice can beat greedy choice)"
    ],
    "prerequisites": [
      "algo_sorting",
      "algo_big_o"
    ],
    "difficulty": "intermediate",
    "commonMisconceptions": [
      "Applying greedy heuristics to 0/1 knapsack or arbitrary coin change where local choices fail globally",
      "Assuming greedy algorithms are always correct without formulating an exchange proof or checking counterexamples",
      "Failing to sort input prior to making greedy choices"
    ],
    "interviewRelevance": "frequently_tested",
    "expectedLearningOutcomes": [
      "Identify whether a problem satisfies the greedy-choice property",
      "Construct exchange arguments to prove greedy optimality",
      "Solve interval scheduling and minimum platform allocation problems in O(N log N)"
    ],
    "relatedTopics": [
      "algo_sorting",
      "algo_dynamic_programming",
      "ds_heaps"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Greedy algorithms",
      "ciuSectionReference": "jwasham/coding-interview-university#greedy-algorithms",
      "referenceNotes": "CLRS Chapter 16 (Greedy Algorithms)",
      "iacAdditionNote": "Added interval scheduling and exchange argument verification"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Greedy-choice property: global optimum achieved via locally optimal steps without backtracking",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#greedy"
      },
      {
        "text": "Optimal substructure: optimal solution contains optimal solutions to subproblems",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#greedy"
      },
      {
        "text": "Activity selection / interval scheduling by sorting endpoints",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#greedy"
      },
      {
        "text": "Huffman optimal prefix coding and fractional knapsack problem",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#greedy"
      },
      {
        "text": "Proving correctness via exchange arguments (showing no other choice can beat greedy choice)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#greedy"
      }
    ]
  },
  {
    "id": "algo_dynamic_programming",
    "name": "Dynamic Programming",
    "category": "algorithms",
    "subcategory": "Optimization",
    "description": "Overlapping subproblems, optimal substructure, top-down memoization, bottom-up tabulation, state transition formulation, and rolling buffer space optimization.",
    "coreConcepts": [
      "Overlapping subproblems and optimal substructure identification",
      "Top-down memoization (recursive caching) vs bottom-up tabulation (iterative state tables)",
      "State transition equations: defining dp[i] or dp[i][j] rigorously",
      "Classical archetypes: 0/1 Knapsack, Longest Common Subsequence (LCS), Longest Increasing Subsequence (LIS), Matrix Chain Multiplication",
      "Space reduction via rolling buffers (reducing O(N * M) auxiliary space to O(M) or O(1))"
    ],
    "prerequisites": [
      "algo_recursion",
      "algo_big_o"
    ],
    "difficulty": "advanced",
    "commonMisconceptions": [
      "Attempting to memorize specific DP code instead of identifying state variables and transitions",
      "Failing to verify base cases for state boundaries (e.g. dp[0] or empty string transitions)",
      "Allocating full 2D tables when current state only depends on the immediately preceding row"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Formulate state definitions and recurrence relations for 1D and 2D dynamic programming",
      "Translate recursive solutions into bottom-up tabulated implementations",
      "Optimize space complexity using rolling buffers from O(N * M) to O(M)"
    ],
    "relatedTopics": [
      "algo_recursion",
      "algo_greedy",
      "algo_divide_and_conquer"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Dynamic Programming",
      "ciuSectionReference": "jwasham/coding-interview-university#dynamic-programming",
      "referenceNotes": "CLRS Chapter 15 (Dynamic Programming)",
      "iacAdditionNote": "Preserved state reduction, knapsack, and LCS patterns from GFG_CODING_PATTERNS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Overlapping subproblems and optimal substructure identification",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#dynamic_programming"
      },
      {
        "text": "Top-down memoization (recursive caching) vs bottom-up tabulation (iterative state tables)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#dynamic_programming"
      },
      {
        "text": "State transition equations: defining dp[i] or dp[i][j] rigorously",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#dynamic_programming"
      },
      {
        "text": "Classical archetypes: 0/1 Knapsack, Longest Common Subsequence (LCS), Longest Increasing Subsequence (LIS), Matrix Chain Multiplication",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#dynamic_programming"
      },
      {
        "text": "Space reduction via rolling buffers (reducing O(N * M) auxiliary space to O(M) or O(1))",
        "provenance": "other",
        "sourceReference": "GFG_CODING_PATTERNS (migrated); CLRS Chapter 15"
      }
    ]
  },
  {
    "id": "algo_divide_and_conquer",
    "name": "Divide and Conquer",
    "category": "algorithms",
    "subcategory": "Paradigm & Control Flow",
    "description": "Decomposing problems into independent subproblems of the same type, solving subproblems recursively, and combining results (Merge Sort, Closest Pair, Strassen matrix multiplication).",
    "coreConcepts": [
      "Three phases: Divide into smaller subproblems, Conquer via recursion, Combine subproblem solutions",
      "Independence of subproblems (contrasting with overlapping subproblems in Dynamic Programming)",
      "Solving recurrences via Master Theorem and substitution",
      "Closest pair of points in 2D space in O(N log N) time",
      "Fast exponentiation and Karatsuba integer multiplication"
    ],
    "prerequisites": [
      "algo_recursion",
      "algo_big_o"
    ],
    "difficulty": "intermediate",
    "commonMisconceptions": [
      "Confusing Divide and Conquer with Dynamic Programming (D&C subproblems are independent; DP subproblems overlap)",
      "Assuming the combine step is always O(1); combine cost often dominates overall runtime",
      "Dividing unevenly causing worst-case degradation"
    ],
    "interviewRelevance": "frequently_tested",
    "expectedLearningOutcomes": [
      "Design divide and conquer algorithms with verified combine steps",
      "Apply Master Theorem to analyze recurrence relations",
      "Implement fast modular exponentiation in O(log N)"
    ],
    "relatedTopics": [
      "algo_recursion",
      "algo_sorting",
      "algo_dynamic_programming"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Divide and conquer",
      "ciuSectionReference": "jwasham/coding-interview-university#divide-and-conquer",
      "referenceNotes": "CLRS Chapter 4 (Divide-and-Conquer)",
      "iacAdditionNote": "Formalized divide-conquer-combine phases and Master Theorem application"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Three phases: Divide into smaller subproblems, Conquer via recursion, Combine subproblem solutions",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#divide_and_conquer"
      },
      {
        "text": "Independence of subproblems (contrasting with overlapping subproblems in Dynamic Programming)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#divide_and_conquer"
      },
      {
        "text": "Solving recurrences via Master Theorem and substitution",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#divide_and_conquer"
      },
      {
        "text": "Closest pair of points in 2D space in O(N log N) time",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#divide_and_conquer"
      },
      {
        "text": "Fast exponentiation and Karatsuba integer multiplication",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#divide_and_conquer"
      }
    ]
  },
  {
    "id": "algo_graph_algorithms",
    "name": "Advanced Graph Algorithms",
    "category": "algorithms",
    "subcategory": "Network Structures",
    "description": "Shortest paths (Dijkstra, Bellman-Ford), Minimum Spanning Trees (Kruskal, Prim), and Topological Sorting (Kahn algorithm and DFS reverse post-order).",
    "coreConcepts": [
      "Dijkstra shortest path algorithm with priority queues in O((V + E) log V)",
      "Negative weight edges and negative cycle detection using Bellman-Ford O(V * E)",
      "Kahn algorithm for topological sorting via in-degree tracking in O(V + E)",
      "Cycle detection via topological sort (incomplete ordering implies presence of cycle)",
      "Minimum Spanning Trees: Kruskal with Disjoint Set Union vs Prim with priority queues"
    ],
    "prerequisites": [
      "ds_graphs",
      "ds_heaps",
      "algo_bfs",
      "algo_dfs"
    ],
    "difficulty": "advanced",
    "commonMisconceptions": [
      "Running Dijkstra algorithm on graphs with negative edge weights, producing incorrect distances or infinite loops",
      "Forgetting that topological sorting is strictly valid only on Directed Acyclic Graphs (DAGs)",
      "Confusing shortest path tree with Minimum Spanning Tree (MST minimizes total edge cost, not path from root)"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Implement Dijkstra algorithm and Kahn topological sort in O((V + E) log V) and O(V + E)",
      "Detect cycles and dependencies in build systems and package managers",
      "Build Minimum Spanning Trees using Kruskal with Disjoint Set Union"
    ],
    "relatedTopics": [
      "ds_graphs",
      "ds_heaps",
      "algo_bfs",
      "algo_dfs"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Graphs",
      "ciuSectionReference": "jwasham/coding-interview-university#graphs",
      "referenceNotes": "CLRS Chapters 23 (Minimum Spanning Trees) and 24 (Single-Source Shortest Paths)",
      "iacAdditionNote": "Preserved Dijkstra, Kahn in-degree, and DSU Kruskal from GFG_CODING_PATTERNS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Dijkstra shortest path algorithm with priority queues in O((V + E) log V)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#graph_algorithms"
      },
      {
        "text": "Negative weight edges and negative cycle detection using Bellman-Ford O(V * E)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#graph_algorithms"
      },
      {
        "text": "Kahn algorithm for topological sorting via in-degree tracking in O(V + E)",
        "provenance": "other",
        "sourceReference": "GFG_CODING_PATTERNS (migrated); Kahn (1962)"
      },
      {
        "text": "Cycle detection via topological sort (incomplete ordering implies presence of cycle)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#graph_algorithms"
      },
      {
        "text": "Minimum Spanning Trees: Kruskal with Disjoint Set Union vs Prim with priority queues",
        "provenance": "other",
        "sourceReference": "GFG_CODING_PATTERNS (migrated); Tarjan (1975)"
      }
    ]
  },
  {
    "id": "algo_bit_manipulation",
    "name": "Bit Manipulation and Binary Arithmetic",
    "category": "algorithms",
    "subcategory": "Low-Level Operations",
    "description": "Bitwise operators (&, |, ^, ~, <<, >>), two complement signed representation, mask extraction, Brian Kernighan bit count, and bitmask dynamic programming.",
    "coreConcepts": [
      "Bitwise operations and truths: AND, OR, XOR (self-canceling property: x ^ x = 0), NOT",
      "Bit shifting: arithmetic shift preserving sign vs logical shift filling zeros",
      "Brian Kernighan algorithm for counting set bits: n = n & (n - 1) in O(set bits)",
      "Isolating lowest set bit: n & (-n) using two complement arithmetic",
      "Bitmask state representation for compact subset and dynamic programming tracking"
    ],
    "prerequisites": [
      "algo_big_o"
    ],
    "difficulty": "easy",
    "commonMisconceptions": [
      "Assuming bit shifts > word size (e.g. shift 32 bits on 32-bit int) is valid; causes undefined behavior in C/C++",
      "Confusing logical AND (&&) with bitwise AND (&) and operator precedence (bitwise operators bind lower than equality)",
      "Overlooking signed integer overflow when shifting into sign bit"
    ],
    "interviewRelevance": "frequently_tested",
    "expectedLearningOutcomes": [
      "Manipulate bits to set, clear, toggle, and query single bit positions in O(1)",
      "Apply XOR properties to find non-paired elements in linear time with O(1) space",
      "Construct bitmasks to represent sets up to size 64 compactly"
    ],
    "relatedTopics": [
      "algo_big_o",
      "cs_operating_systems"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Bit manipulation",
      "ciuSectionReference": "jwasham/coding-interview-university#bit-manipulation",
      "referenceNotes": "Hacker's Delight (Henry S. Warren Jr.)",
      "iacAdditionNote": "Standardized bitmask operations and two complement arithmetic"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Bitwise operations and truths: AND, OR, XOR (self-canceling property: x ^ x = 0), NOT",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#bit_manipulation"
      },
      {
        "text": "Bit shifting: arithmetic shift preserving sign vs logical shift filling zeros",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#bit_manipulation"
      },
      {
        "text": "Brian Kernighan algorithm for counting set bits: n = n & (n - 1) in O(set bits)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#bit_manipulation"
      },
      {
        "text": "Isolating lowest set bit: n & (-n) using two complement arithmetic",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#bit_manipulation"
      },
      {
        "text": "Bitmask state representation for compact subset and dynamic programming tracking",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#bit_manipulation"
      }
    ]
  },
  {
    "id": "cs_operating_systems",
    "name": "Operating Systems & Process Management",
    "category": "cs_fundamentals",
    "subcategory": "Systems",
    "description": "Kernel and user modes, system calls, process state lifecycles, context switching, CPU scheduling, inter-process communication (IPC), and Linux signals.",
    "coreConcepts": [
      "Dual-mode operation: User mode vs privileged Kernel mode and trap/system call transitions",
      "Process Control Block (PCB), process memory layout (text, data, BSS, heap, stack)",
      "Context switching overhead: register saving, program counter, and cache pollution",
      "Inter-Process Communication (IPC): pipes, shared memory, message queues, Unix domain sockets",
      "CPU scheduling algorithms: Round Robin, Multi-Level Feedback Queues (MLFQ), and CFS"
    ],
    "prerequisites": [],
    "difficulty": "intermediate",
    "commonMisconceptions": [
      "Assuming system calls execute at the same speed as standard user function calls",
      "Confusing process isolation with thread shared-memory spaces",
      "Believing context switches only consume CPU instruction cycles without cache flushing penalties"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Differentiate process creation (fork/exec) and memory inheritance",
      "Explain context switch sequence and hardware registers preservation",
      "Select appropriate IPC mechanisms based on throughput and isolation requirements"
    ],
    "relatedTopics": [
      "cs_threads_concurrency",
      "cs_memory_management"
    ],
    "sourceAttribution": {
      "attributionType": "general_cs",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Threads, Processes",
      "ciuSectionReference": "jwasham/coding-interview-university#threads-processes",
      "referenceNotes": "Operating Systems: Three Easy Pieces (OSTEP); Remzi & Andrea Arpaci-Dusseau",
      "iacAdditionNote": "Preserved Linux process management and PCB models from GFG_CORE_CS_SUBJECTS and GFG_DEVOPS_KNOWLEDGE"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Dual-mode operation: User mode vs privileged Kernel mode and trap/system call transitions",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Process Control Block (PCB), process memory layout (text, data, BSS, heap, stack)",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Context switching overhead: register saving, program counter, and cache pollution",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Inter-Process Communication (IPC): pipes, shared memory, message queues, Unix domain sockets",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "CPU scheduling algorithms: Round Robin, Multi-Level Feedback Queues (MLFQ), and CFS",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      }
    ]
  },
  {
    "id": "cs_threads_concurrency",
    "name": "Processes, Threads, and Concurrency",
    "category": "cs_fundamentals",
    "subcategory": "Systems",
    "description": "Thread models, shared memory race conditions, synchronization primitives (mutexes, semaphores, condition variables, reader-writer locks), and deadlock analysis.",
    "coreConcepts": [
      "Threads sharing process address space while maintaining independent stacks and program counters",
      "Race conditions and critical section protection via mutual exclusion",
      "Synchronization primitives: Mutexes vs Counting Semaphores vs Condition Variables",
      "Coffman four deadlock conditions: Mutual Exclusion, Hold & Wait, No Preemption, Circular Wait",
      "Atomic operations, compare-and-swap (CAS), and lock-free data structures"
    ],
    "prerequisites": [
      "cs_operating_systems"
    ],
    "difficulty": "intermediate",
    "commonMisconceptions": [
      "Assuming volatile keyword in languages like C++/Java guarantees atomic thread-safe increments",
      "Believing multiple threads on a single CPU core cannot experience race conditions",
      "Assuming locks only cost CPU cycles without considering thread contention and priority inversion"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Identify race conditions and synchronize shared state using appropriate primitives",
      "Diagnose and resolve deadlocks using Coffman condition analysis and lock ordering",
      "Evaluate reader-writer lock efficiency for read-heavy workloads"
    ],
    "relatedTopics": [
      "cs_operating_systems",
      "cs_memory_management"
    ],
    "sourceAttribution": {
      "attributionType": "general_cs",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Threads & Processes",
      "ciuSectionReference": "jwasham/coding-interview-university#threads-processes",
      "referenceNotes": "The Art of Multiprocessor Programming; Herlihy & Shavit",
      "iacAdditionNote": "Preserved deadlock conditions and mutual exclusion from GFG_CORE_CS_SUBJECTS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Threads sharing process address space while maintaining independent stacks and program counters",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Race conditions and critical section protection via mutual exclusion",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Synchronization primitives: Mutexes vs Counting Semaphores vs Condition Variables",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Coffman four deadlock conditions: Mutual Exclusion, Hold & Wait, No Preemption, Circular Wait",
        "provenance": "other",
        "sourceReference": "GFG_CORE_CS_SUBJECTS (migrated); Coffman et al. (1971)"
      },
      {
        "text": "Atomic operations, compare-and-swap (CAS), and lock-free data structures",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      }
    ]
  },
  {
    "id": "cs_memory_management",
    "name": "Memory Management and Virtual Memory",
    "category": "cs_fundamentals",
    "subcategory": "Systems",
    "description": "Virtual address translation, paging, Page Tables, Translation Lookaside Buffers (TLB), page fault handling, segmentation, and heap memory allocators.",
    "coreConcepts": [
      "Virtual memory abstraction isolating processes and enabling overcommitment",
      "Address translation via multi-level Page Tables and Memory Management Unit (MMU)",
      "Translation Lookaside Buffer (TLB) caching and TLB shootdown penalties",
      "Page fault workflow: trap to kernel, disk fetch from swap/backing file, frame mapping, resume",
      "Heap allocation fragmentation: internal vs external fragmentation, free lists, buddy allocators"
    ],
    "prerequisites": [
      "cs_operating_systems"
    ],
    "difficulty": "advanced",
    "commonMisconceptions": [
      "Assuming virtual addresses map 1:1 to physical RAM pins without MMU translation",
      "Thinking a page fault always terminates the process (distinguishing demand paging from segmentation fault)",
      "Believing free() immediately returns memory to the OS kernel instead of retaining in allocator bins"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Trace virtual to physical address translation through multi-level page tables and TLB",
      "Explain page fault mechanics from user space trap to disk I/O resolution",
      "Diagnose memory leaks and heap fragmentation patterns"
    ],
    "relatedTopics": [
      "cs_operating_systems",
      "cs_threads_concurrency"
    ],
    "sourceAttribution": {
      "attributionType": "general_cs",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Memory management",
      "ciuSectionReference": "jwasham/coding-interview-university#memory-management",
      "referenceNotes": "Operating Systems: Three Easy Pieces (OSTEP) Virtualization chapters",
      "iacAdditionNote": "Preserved virtual memory, paging, and TLB concepts from GFG_CORE_CS_SUBJECTS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Virtual memory abstraction isolating processes and enabling overcommitment",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Address translation via multi-level Page Tables and Memory Management Unit (MMU)",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Translation Lookaside Buffer (TLB) caching and TLB shootdown penalties",
        "provenance": "other",
        "sourceReference": "GFG_CORE_CS_SUBJECTS (migrated); OSTEP Chapter 19"
      },
      {
        "text": "Page fault workflow: trap to kernel, disk fetch from swap/backing file, frame mapping, resume",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Heap allocation fragmentation: internal vs external fragmentation, free lists, buddy allocators",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      }
    ]
  },
  {
    "id": "cs_networking",
    "name": "Computer Networking and OSI / TCP/IP Models",
    "category": "cs_fundamentals",
    "subcategory": "Networking",
    "description": "Layered networking models (OSI and TCP/IP), socket programming, IP addressing, DNS resolution hierarchy, routing, and reliable packet transport.",
    "coreConcepts": [
      "Encapsulation and decapsulation across Physical, Data Link, Network, Transport, and Application layers",
      "IP routing: subnet masks, CIDR notation, NAT, and BGP/OSPF overview",
      "DNS resolution hierarchy: Root, TLD, Authoritative servers, and recursive resolvers",
      "Socket API workflow: socket, bind, listen, accept, connect, send, recv",
      "TCP vs UDP tradeoffs: reliable byte stream vs low-latency datagram transport"
    ],
    "prerequisites": [],
    "difficulty": "intermediate",
    "commonMisconceptions": [
      "Confusing MAC address forwarding at Layer 2 with IP routing at Layer 3",
      "Assuming DNS lookup occurs on every outbound HTTP request without local OS and browser caching",
      "Believing UDP packets are inherently encrypted or error-checked by transport"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Describe what happens when you type a URL into a browser navigation bar from DNS to socket connection",
      "Compare TCP and UDP protocols for streaming, gaming, and web applications",
      "Inspect IP subnetting and CIDR block allocations"
    ],
    "relatedTopics": [
      "cs_http_tcp",
      "se_system_design"
    ],
    "sourceAttribution": {
      "attributionType": "general_cs",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Networking",
      "ciuSectionReference": "jwasham/coding-interview-university#networking",
      "referenceNotes": "Computer Networking: A Top-Down Approach (Kurose & Ross)",
      "iacAdditionNote": "Preserved computer networking fundamentals from GFG_CORE_CS_SUBJECTS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Encapsulation and decapsulation across Physical, Data Link, Network, Transport, and Application layers",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "IP routing: subnet masks, CIDR notation, NAT, and BGP/OSPF overview",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "DNS resolution hierarchy: Root, TLD, Authoritative servers, and recursive resolvers",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Socket API workflow: socket, bind, listen, accept, connect, send, recv",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "TCP vs UDP tradeoffs: reliable byte stream vs low-latency datagram transport",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      }
    ]
  },
  {
    "id": "cs_http_tcp",
    "name": "HTTP Protocol Evolution and TCP/IP Internals",
    "category": "cs_fundamentals",
    "subcategory": "Networking",
    "description": "TCP 3-way handshake, 4-way teardown, sliding window congestion control, TLS handshake, and HTTP evolution (HTTP/1.1 keep-alive, HTTP/2 multiplexing, HTTP/3 QUIC).",
    "coreConcepts": [
      "TCP 3-way handshake (SYN, SYN-ACK, ACK) and 4-way connection teardown (FIN, ACK, TIME_WAIT)",
      "TCP congestion control: slow start, congestion avoidance, fast retransmit, and fast recovery",
      "TLS 1.3 cryptographic handshake: key exchange, digital certificates, forward secrecy",
      "HTTP/1.1 head-of-line blocking and keep-alive connection reuse",
      "HTTP/2 binary framing and stream multiplexing over a single TCP connection",
      "HTTP/3 QUIC protocol running over UDP to eliminate transport-layer head-of-line blocking"
    ],
    "prerequisites": [
      "cs_networking"
    ],
    "difficulty": "intermediate",
    "commonMisconceptions": [
      "Assuming HTTP/2 multiplexing solves packet loss stalls; single TCP packet loss still halts all multiplexed streams",
      "Confusing TIME_WAIT state with an error rather than safe socket draining and duplicate packet absorption",
      "Believing HTTPS encrypts IP addresses and DNS domains (SNI reveals destination without Encrypted Client Hello)"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Trace TCP handshakes, window sizing, and retransmission timeouts",
      "Contrast HTTP/1.1, HTTP/2, and HTTP/3 performance characteristics under packet loss",
      "Evaluate TLS certificate chain validation and symmetric session encryption"
    ],
    "relatedTopics": [
      "cs_networking",
      "se_api_design",
      "se_system_design"
    ],
    "sourceAttribution": {
      "attributionType": "general_cs",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Networking",
      "ciuSectionReference": "jwasham/coding-interview-university#networking",
      "referenceNotes": "RFC 9110 (HTTP Semantics), RFC 9113 (HTTP/2), RFC 9000 (QUIC)",
      "iacAdditionNote": "Preserved HTTP protocol evolution, head-of-line blocking, and TCP congestion from GFG_WEB_TECHNOLOGY and GFG_CORE_CS_SUBJECTS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "TCP 3-way handshake (SYN, SYN-ACK, ACK) and 4-way connection teardown (FIN, ACK, TIME_WAIT)",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "TCP congestion control: slow start, congestion avoidance, fast retransmit, and fast recovery",
        "provenance": "other",
        "sourceReference": "GFG_CORE_CS_SUBJECTS (migrated); RFC 5681 (TCP Congestion Control)"
      },
      {
        "text": "TLS 1.3 cryptographic handshake: key exchange, digital certificates, forward secrecy",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "HTTP/1.1 head-of-line blocking and keep-alive connection reuse",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "HTTP/2 binary framing and stream multiplexing over a single TCP connection",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "HTTP/3 QUIC protocol running over UDP to eliminate transport-layer head-of-line blocking",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      }
    ]
  },
  {
    "id": "cs_databases",
    "name": "Relational Database Internals & Storage Engines",
    "category": "cs_fundamentals",
    "subcategory": "Data Management",
    "description": "Relational database architecture, page layout, B+ Tree indexing, Write-Ahead Logging (WAL), buffer pool management, and query execution plans.",
    "coreConcepts": [
      "Disk-oriented storage engine layout: pages, slotted pages, and row tuple formats",
      "B+ Tree storage: balanced search tree with high fan-out, root-to-leaf paths, and sequential leaf pointers",
      "Clustered indexes (table ordered physically by key) vs secondary non-clustered indexes",
      "Buffer pool caching: LRU eviction, dirty page flushing, and checkpointing",
      "Write-Ahead Logging (WAL) and ARIES recovery protocol ensuring crash durability"
    ],
    "prerequisites": [
      "ds_trees_bst",
      "algo_binary_search"
    ],
    "difficulty": "intermediate",
    "commonMisconceptions": [
      "Believing secondary indexes contain the full row data rather than row IDs or clustered primary keys",
      "Assuming adding indexes has zero write cost; every index adds I/O overhead on insert/update/delete",
      "Confusing index seek (logarithmic traversal) with index scan (sequential traversal across leaves)"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Explain how B+ Tree fan-out minimizes disk block reads compared to binary search trees",
      "Describe Write-Ahead Logging and how it guarantees durability before modifying data pages",
      "Interpret database EXPLAIN query execution plans to optimize slow queries"
    ],
    "relatedTopics": [
      "cs_transactions",
      "se_system_design"
    ],
    "sourceAttribution": {
      "attributionType": "general_cs",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Databases",
      "ciuSectionReference": "jwasham/coding-interview-university#databases",
      "referenceNotes": "Database System Concepts (Silberschatz); Designing Data-Intensive Applications (Kleppmann)",
      "iacAdditionNote": "Preserved B+ Tree indexing and WAL recovery from GFG_CORE_CS_SUBJECTS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Disk-oriented storage engine layout: pages, slotted pages, and row tuple formats",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "B+ Tree storage: balanced search tree with high fan-out, root-to-leaf paths, and sequential leaf pointers",
        "provenance": "other",
        "sourceReference": "GFG_CORE_CS_SUBJECTS (migrated); Comer B-Tree Survey (1979)"
      },
      {
        "text": "Clustered indexes (table ordered physically by key) vs secondary non-clustered indexes",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Buffer pool caching: LRU eviction, dirty page flushing, and checkpointing",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Write-Ahead Logging (WAL) and ARIES recovery protocol ensuring crash durability",
        "provenance": "other",
        "sourceReference": "GFG_CORE_CS_SUBJECTS (migrated); Mohan et al. ARIES (1992)"
      }
    ]
  },
  {
    "id": "cs_transactions",
    "name": "ACID Transactions & Concurrency Isolation Levels",
    "category": "cs_fundamentals",
    "subcategory": "Data Management",
    "description": "ACID transactional guarantees, ANSI SQL isolation levels, concurrency anomalies (dirty read, non-repeatable read, phantom read, write skew), and two-phase locking vs MVCC.",
    "coreConcepts": [
      "ACID properties: Atomicity (all-or-nothing), Consistency (invariants), Isolation (concurrency), Durability (persisted)",
      "Concurrency anomalies: Dirty Reads, Non-Repeatable Reads, Phantom Reads, and Write Skew",
      "ANSI SQL Isolation Levels: Read Uncommitted, Read Committed, Repeatable Read, Serializable",
      "Two-Phase Locking (2PL) and Strict 2PL for pessimistic serializability",
      "Multi-Version Concurrency Control (MVCC) enabling readers to not block writers and writers to not block readers"
    ],
    "prerequisites": [
      "cs_databases",
      "cs_threads_concurrency"
    ],
    "difficulty": "intermediate",
    "commonMisconceptions": [
      "Believing \"Repeatable Read\" prevents phantom reads in standard PostgreSQL/MySQL without serializable isolation or range locks",
      "Assuming ACID atomicity means thread-safe parallel access (Atomicity is crash recovery; Isolation governs concurrency)",
      "Assuming MVCC has zero storage overhead without garbage collecting old tuple versions (vacuuming)"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Differentiate ACID isolation levels and their susceptibility to specific anomalies",
      "Explain MVCC snapshot isolation mechanics using transaction timestamps",
      "Select isolation levels that balance business consistency requirements with query throughput"
    ],
    "relatedTopics": [
      "cs_databases",
      "cs_threads_concurrency",
      "se_system_design"
    ],
    "sourceAttribution": {
      "attributionType": "general_cs",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Databases",
      "ciuSectionReference": "jwasham/coding-interview-university#databases",
      "referenceNotes": "Principles of Transaction Processing (Bernstein & Newcomer); DDIA Chapter 7",
      "iacAdditionNote": "Preserved transaction isolation levels and concurrency phenomena from GFG_CORE_CS_SUBJECTS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "ACID properties: Atomicity (all-or-nothing), Consistency (invariants), Isolation (concurrency), Durability (persisted)",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Concurrency anomalies: Dirty Reads, Non-Repeatable Reads, Phantom Reads, and Write Skew",
        "provenance": "other",
        "sourceReference": "GFG_CORE_CS_SUBJECTS (migrated); Berenson et al. ANSI SQL-92 Critique (1995)"
      },
      {
        "text": "ANSI SQL Isolation Levels: Read Uncommitted, Read Committed, Repeatable Read, Serializable",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Two-Phase Locking (2PL) and Strict 2PL for pessimistic serializability",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Multi-Version Concurrency Control (MVCC) enabling readers to not block writers and writers to not block readers",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      }
    ]
  },
  {
    "id": "cs_caching",
    "name": "Caching Strategies and Cache Coherence",
    "category": "cs_fundamentals",
    "subcategory": "Distributed Systems",
    "description": "Multi-tier caching (CPU cache, memory, Redis, CDN), cache patterns (Cache-Aside, Read-Through, Write-Through, Write-Back), eviction policies (LRU, LFU, FIFO), and thundering herd mitigations.",
    "coreConcepts": [
      "Multi-level caching hierarchy and latency numbers every engineer should know (L1 vs RAM vs NVMe vs Network)",
      "Cache access patterns: Cache-Aside (Lazy Loading), Read-Through, Write-Through, Write-Back (Write-Behind)",
      "Eviction algorithms: Least Recently Used (LRU), Least Frequently Used (LFU), First In First Out (FIFO)",
      "Cache Stampede / Thundering Herd and mitigation via mutex locking or probabilistic early expiration",
      "Cache Penetration, Cache Breakdown, and Cache Avalanche failure modes and defenses"
    ],
    "prerequisites": [
      "ds_hash_tables",
      "ds_linked_lists",
      "cs_databases"
    ],
    "difficulty": "intermediate",
    "commonMisconceptions": [
      "Assuming Write-Back caching is safe for mission-critical payment data without handling battery-backed RAM or crash loss",
      "Using identical TTL for all keys, creating simultaneous expiration waves (Cache Avalanche)",
      "Neglecting cache invalidation complexity, leading to stale reads and data divergence"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Implement an in-memory LRU cache using hash table and doubly linked list in O(1)",
      "Design caching architectures matching read/write ratios and consistency tolerance",
      "Prevent cache stampedes using distributed locks and staggered TTL jitters"
    ],
    "relatedTopics": [
      "ds_hash_tables",
      "se_system_design",
      "cs_databases"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "System design, scalability, data handling",
      "ciuSectionReference": "jwasham/coding-interview-university#system-design-scalability-data-handling",
      "referenceNotes": "Designing Data-Intensive Applications; Cache-aside and invalidation patterns",
      "iacAdditionNote": "Preserved Cache-Aside, Write-Through, and CDN caching patterns from GFG_WEB_TECHNOLOGY"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Multi-level caching hierarchy and latency numbers every engineer should know (L1 vs RAM vs NVMe vs Network)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#system-design-scalability-data-handling"
      },
      {
        "text": "Cache access patterns: Cache-Aside (Lazy Loading), Read-Through, Write-Through, Write-Back (Write-Behind)",
        "provenance": "other",
        "sourceReference": "GFG_WEB_TECHNOLOGY (migrated); Microsoft Cloud Design Patterns"
      },
      {
        "text": "Eviction algorithms: Least Recently Used (LRU), Least Frequently Used (LFU), First In First Out (FIFO)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#system-design-scalability-data-handling"
      },
      {
        "text": "Cache Stampede / Thundering Herd and mitigation via mutex locking or probabilistic early expiration",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#system-design-scalability-data-handling"
      },
      {
        "text": "Cache Penetration, Cache Breakdown, and Cache Avalanche failure modes and defenses",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#system-design-scalability-data-handling"
      }
    ]
  },
  {
    "id": "cs_distributed_systems",
    "name": "Distributed Systems & Consensus",
    "category": "cs_fundamentals",
    "subcategory": "Distributed Systems",
    "description": "Fallacies of distributed computing, CAP theorem, PACELC theorem, event-driven architectures, replication, partitioning, and consensus protocols (Raft, Paxos).",
    "coreConcepts": [
      "Fallacies of distributed computing (network is reliable, latency is zero, bandwidth is infinite)",
      "CAP Theorem (Consistency, Availability, Partition Tolerance) and PACELC extension for latency/consistency",
      "Data replication models: Single-Leader, Multi-Leader, Leaderless (Dynamo-style quorum: W + R > N)",
      "Data partitioning / sharding: range-based vs consistent hashing with virtual nodes",
      "Distributed consensus essentials: Raft leader election, log replication, and split-brain prevention"
    ],
    "prerequisites": [
      "cs_networking",
      "cs_databases",
      "cs_transactions"
    ],
    "difficulty": "advanced",
    "commonMisconceptions": [
      "Treating CAP as \"pick any 2\" in production (network partitions are inevitable; you must choose Availability or Consistency during partitions)",
      "Believing distributed transactions with Two-Phase Commit (2PC) are fast and resilient to coordinator failure",
      "Assuming clock synchronization across machines is exact without clock skew and drift (NTP limitations)"
    ],
    "interviewRelevance": "senior_staff_level",
    "expectedLearningOutcomes": [
      "Apply CAP and PACELC theorems to justify distributed database trade-offs",
      "Design consistent hashing rings to partition data with minimal rebalancing keys",
      "Explain quorum consensus and how Raft prevents split-brain scenarios"
    ],
    "relatedTopics": [
      "cs_transactions",
      "se_system_design",
      "se_scalability"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "System design, scalability, data handling",
      "ciuSectionReference": "jwasham/coding-interview-university#system-design-scalability-data-handling",
      "referenceNotes": "Designing Data-Intensive Applications (Kleppmann)",
      "iacAdditionNote": "Preserved event-driven architectures and distributed storage models from GFG_WEB_TECHNOLOGY and GFG_CORE_CS_SUBJECTS"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Fallacies of distributed computing (network is reliable, latency is zero, bandwidth is infinite)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#system-design-scalability-data-handling"
      },
      {
        "text": "CAP Theorem (Consistency, Availability, Partition Tolerance) and PACELC extension for latency/consistency",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#system-design-scalability-data-handling"
      },
      {
        "text": "Data replication models: Single-Leader, Multi-Leader, Leaderless (Dynamo-style quorum: W + R > N)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#system-design-scalability-data-handling"
      },
      {
        "text": "Data partitioning / sharding: range-based vs consistent hashing with virtual nodes",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#system-design-scalability-data-handling"
      },
      {
        "text": "Distributed consensus essentials: Raft leader election, log replication, and split-brain prevention",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#system-design-scalability-data-handling"
      }
    ]
  },
  {
    "id": "cs_testing_debugging",
    "name": "Testing, Debugging, and Production Reliability",
    "category": "cs_fundamentals",
    "subcategory": "Engineering Practices",
    "description": "Test pyramid (Unit, Integration, End-to-End), regression suites, mock verification, static analysis, structured logging, distributed tracing, and incident postmortems.",
    "coreConcepts": [
      "Testing pyramid: high-volume unit tests, integration boundaries, minimal flaky E2E tests",
      "Test doubles: dummies, stubs, spies, mocks, and fakes",
      "Boundary value analysis and property-based fuzz testing",
      "Distributed tracing using OpenTelemetry, trace IDs, and span context propagation",
      "Root cause analysis (RCA), blameless postmortems, and regression test guards"
    ],
    "prerequisites": [],
    "difficulty": "easy",
    "commonMisconceptions": [
      "Relying solely on 100% line coverage without testing edge cases and negative assertions",
      "Mocking every collaborator until tests verify mock implementation details rather than real contract behavior",
      "Treating debugging as random trial-and-error instead of hypothesis-driven isolation"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Design unit and integration test suites that prevent regressions without test brittleness",
      "Diagnose production defects systematically using logs and distributed trace spans",
      "Author blameless incident postmortems with verifiable prevention action items"
    ],
    "relatedTopics": [
      "se_clean_code",
      "se_scalability"
    ],
    "sourceAttribution": {
      "attributionType": "general_cs",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Testing",
      "ciuSectionReference": "jwasham/coding-interview-university#testing",
      "referenceNotes": "Google Software Engineering at Scale; Continuous Delivery (Humble & Farley)",
      "iacAdditionNote": "Preserved OpenTelemetry distributed tracing and reliability engineering from GFG_DEVOPS_KNOWLEDGE"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Testing pyramid: high-volume unit tests, integration boundaries, minimal flaky E2E tests",
        "provenance": "other",
        "sourceReference": "GFG_CORE_CS_SUBJECTS (migrated); Mohan et al. ARIES (1992)"
      },
      {
        "text": "Test doubles: dummies, stubs, spies, mocks, and fakes",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Boundary value analysis and property-based fuzz testing",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      },
      {
        "text": "Distributed tracing using OpenTelemetry, trace IDs, and span context propagation",
        "provenance": "other",
        "sourceReference": "GFG_DEVOPS_KNOWLEDGE (migrated); W3C Trace Context Recommendation"
      },
      {
        "text": "Root cause analysis (RCA), blameless postmortems, and regression test guards",
        "provenance": "general_cs",
        "sourceReference": "Standard Academic CS Curriculum (CLRS, OSTEP, Kurose & Ross, Silberschatz)"
      }
    ]
  },
  {
    "id": "se_oop_design_patterns",
    "name": "Object-Oriented Design & GoF Patterns",
    "category": "software_engineering",
    "subcategory": "Architecture & Design",
    "description": "Object-oriented programming principles (encapsulation, abstraction, inheritance, polymorphism), composition over inheritance, and Gang of Four design patterns.",
    "coreConcepts": [
      "Four OOP pillars: Encapsulation, Abstraction, Polymorphism (dynamic dispatch), Inheritance",
      "Composition over inheritance principle preventing fragile base class hierarchies",
      "Creational patterns: Factory Method, Abstract Factory, Builder, Singleton",
      "Structural patterns: Adapter, Decorator, Facade, Composite, Proxy",
      "Behavioral patterns: Strategy, Observer, Command, State, Template Method"
    ],
    "prerequisites": [],
    "difficulty": "intermediate",
    "commonMisconceptions": [
      "Applying Singleton everywhere as a disguised global variable, breaking modularity and testability",
      "Creating deep inheritance hierarchies (4+ levels) instead of composing focused behavioral interfaces",
      "Over-engineering simple problems with unnecessary design patterns before complexity justifies them"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Refactor coupled procedural code into decoupled object-oriented designs",
      "Select and implement appropriate GoF patterns (Strategy, Factory, Decorator, Observer)",
      "Explain dynamic dispatch and virtual method table (vtable) mechanics"
    ],
    "relatedTopics": [
      "se_solid_principles",
      "se_clean_code",
      "se_api_design"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Design patterns",
      "ciuSectionReference": "jwasham/coding-interview-university#design-patterns",
      "referenceNotes": "Design Patterns: Elements of Reusable Object-Oriented Software (GoF)",
      "iacAdditionNote": "Expanded with composition over inheritance and vtable dispatch concepts"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Four OOP pillars: Encapsulation, Abstraction, Polymorphism (dynamic dispatch), Inheritance",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#design-patterns"
      },
      {
        "text": "Composition over inheritance principle preventing fragile base class hierarchies",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#design-patterns"
      },
      {
        "text": "Creational patterns: Factory Method, Abstract Factory, Builder, Singleton",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#design-patterns"
      },
      {
        "text": "Structural patterns: Adapter, Decorator, Facade, Composite, Proxy",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#design-patterns"
      },
      {
        "text": "Behavioral patterns: Strategy, Observer, Command, State, Template Method",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#design-patterns"
      }
    ]
  },
  {
    "id": "se_solid_principles",
    "name": "SOLID Principles and Architectural Decoupling",
    "category": "software_engineering",
    "subcategory": "Architecture & Design",
    "description": "Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, and Dependency Inversion principles for maintainable software engineering.",
    "coreConcepts": [
      "Single Responsibility Principle (SRP): one reason to change, high cohesion",
      "Open/Closed Principle (OCP): open for extension, closed for modification via polymorphism",
      "Liskov Substitution Principle (LSP): subtypes must be substitutable for base types without breaking invariants",
      "Interface Segregation Principle (ISP): clients should not depend on interfaces they do not use",
      "Dependency Inversion Principle (DIP): high-level modules should depend on abstractions, not concrete implementations"
    ],
    "prerequisites": [
      "se_oop_design_patterns"
    ],
    "difficulty": "intermediate",
    "commonMisconceptions": [
      "Interpreting Single Responsibility as \"a class does only one function\" rather than \"a class has one business actor to serve\"",
      "Violating Liskov Substitution by throwing UnsupportedOperationException in derived class methods",
      "Confusing Dependency Inversion Principle (architectural rule) with Dependency Injection (implementation technique)"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Audit existing codebases to identify and remediate SOLID violations",
      "Design modular components that can be extended without modifying source code",
      "Apply Dependency Inversion to allow mock implementations in automated testing"
    ],
    "relatedTopics": [
      "se_oop_design_patterns",
      "se_clean_code",
      "se_api_design"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "Design patterns",
      "ciuSectionReference": "jwasham/coding-interview-university#design-patterns",
      "referenceNotes": "Clean Architecture: A Craftsman Guide to Software Structure and Design (Robert C. Martin)",
      "iacAdditionNote": "Dedicated topic with concrete violation patterns and refactoring criteria"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Single Responsibility Principle (SRP): one reason to change, high cohesion",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#design-patterns"
      },
      {
        "text": "Open/Closed Principle (OCP): open for extension, closed for modification via polymorphism",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#design-patterns"
      },
      {
        "text": "Liskov Substitution Principle (LSP): subtypes must be substitutable for base types without breaking invariants",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#design-patterns"
      },
      {
        "text": "Interface Segregation Principle (ISP): clients should not depend on interfaces they do not use",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#design-patterns"
      },
      {
        "text": "Dependency Inversion Principle (DIP): high-level modules should depend on abstractions, not concrete implementations",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#design-patterns"
      }
    ]
  },
  {
    "id": "se_clean_code",
    "name": "Clean Code, Refactoring & Code Quality",
    "category": "software_engineering",
    "subcategory": "Engineering Practices",
    "description": "Meaningful naming, small functions, side-effect elimination, error handling without exceptions for control flow, code smells, and disciplined refactoring.",
    "coreConcepts": [
      "Intention-revealing naming for variables, methods, and types",
      "Function single level of abstraction and command-query separation (CQS)",
      "Side-effect elimination and pure functional transformations where feasible",
      "Defensive programming vs fail-fast principles",
      "Code smells identification (long methods, god classes, feature envy, primitive obsession)"
    ],
    "prerequisites": [],
    "difficulty": "easy",
    "commonMisconceptions": [
      "Writing redundant comments that repeat what the code already says instead of documenting \"why\"",
      "Using exceptions for normal control flow in business logic, incurring performance penalties",
      "Premature abstraction before understanding the third repetition of a pattern (Rule of Three)"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Refactor convoluted functions into self-documenting clean code",
      "Apply Command-Query Separation and eliminate unexpected mutations",
      "Formulate clean error handling strategies with typed errors or result types"
    ],
    "relatedTopics": [
      "se_solid_principles",
      "cs_testing_debugging"
    ],
    "sourceAttribution": {
      "attributionType": "iac_authored",
      "inCodingInterviewUniversity": false,
      "referenceNotes": "Clean Code: A Handbook of Agile Software Craftsmanship (Martin)",
      "iacAdditionNote": "IAC addition grounded in software engineering best practices and clean code standards"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Intention-revealing naming for variables, methods, and types",
        "provenance": "iac_authored",
        "sourceReference": "IAC Engineering Standards; Clean Code (Martin, 2008)",
        "notes": "Authored for technical interview live code evaluation"
      },
      {
        "text": "Function single level of abstraction and command-query separation (CQS)",
        "provenance": "iac_authored",
        "sourceReference": "IAC Engineering Standards; Clean Code (Martin, 2008)",
        "notes": "Authored for technical interview live code evaluation"
      },
      {
        "text": "Side-effect elimination and pure functional transformations where feasible",
        "provenance": "iac_authored",
        "sourceReference": "IAC Engineering Standards; Clean Code (Martin, 2008)",
        "notes": "Authored for technical interview live code evaluation"
      },
      {
        "text": "Defensive programming vs fail-fast principles",
        "provenance": "iac_authored",
        "sourceReference": "IAC Engineering Standards; Clean Code (Martin, 2008)",
        "notes": "Authored for technical interview live code evaluation"
      },
      {
        "text": "Code smells identification (long methods, god classes, feature envy, primitive obsession)",
        "provenance": "iac_authored",
        "sourceReference": "IAC Engineering Standards; Clean Code (Martin, 2008)",
        "notes": "Authored for technical interview live code evaluation"
      }
    ]
  },
  {
    "id": "se_api_design",
    "name": "API Design and Integration Standards",
    "category": "software_engineering",
    "subcategory": "Architecture & Design",
    "description": "RESTful API conventions, resource URI naming, HTTP verb idempotency, GraphQL vs gRPC vs REST, versioning, pagination, rate limiting, and webhook designs.",
    "coreConcepts": [
      "RESTful resource naming conventions (nouns, plurals, hierarchical nesting)",
      "HTTP verbs and idempotency guarantees (GET, PUT, DELETE are idempotent; POST is non-idempotent)",
      "Idempotency keys and replay protection for financial transactions",
      "RPC protocols: gRPC with Protocol Buffers vs GraphQL field queries vs REST",
      "API versioning strategies (URI path, header, query parameter) and deprecation lifecycles",
      "Pagination patterns: offset/limit vs keyset/cursor-based pagination for high-volume feeds"
    ],
    "prerequisites": [
      "cs_http_tcp"
    ],
    "difficulty": "intermediate",
    "commonMisconceptions": [
      "Using offset/limit pagination on large tables (OFFSET 1000000 causes database to scan and discard 1M rows)",
      "Designing RPC-style endpoints in REST APIs (e.g. POST /deleteUser instead of DELETE /users/:id)",
      "Assuming PUT and PATCH are identical; PUT replaces entire resource while PATCH performs partial updates"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Design clean, secure, and idempotent RESTful APIs with predictable error structures",
      "Compare gRPC, GraphQL, and REST performance and schema governance tradeoffs",
      "Implement cursor-based pagination that remains performant at arbitrary scale"
    ],
    "relatedTopics": [
      "cs_http_tcp",
      "se_system_design"
    ],
    "sourceAttribution": {
      "attributionType": "iac_authored",
      "inCodingInterviewUniversity": false,
      "referenceNotes": "API Design Patterns (Geewax); RFC 7231 (HTTP/1.1 Semantics)",
      "iacAdditionNote": "IAC addition migrating RESTful API design, idempotency, and WebSockets from GFG_WEB_TECHNOLOGY"
    },
    "version": 1,
    "concepts": [
      {
        "text": "RESTful resource naming conventions (nouns, plurals, hierarchical nesting)",
        "provenance": "iac_authored",
        "sourceReference": "IAC Engineering Standards; RESTful API Guidelines",
        "notes": "Authored for web/backend technical interview interviews"
      },
      {
        "text": "HTTP verbs and idempotency guarantees (GET, PUT, DELETE are idempotent; POST is non-idempotent)",
        "provenance": "iac_authored",
        "sourceReference": "IAC Engineering Standards; RESTful API Guidelines",
        "notes": "Authored for web/backend technical interview interviews"
      },
      {
        "text": "Idempotency keys and replay protection for financial transactions",
        "provenance": "other",
        "sourceReference": "GFG_WEB_TECHNOLOGY (migrated); IETF Draft: The Idempotency-Key HTTP Header Field"
      },
      {
        "text": "RPC protocols: gRPC with Protocol Buffers vs GraphQL field queries vs REST",
        "provenance": "iac_authored",
        "sourceReference": "IAC Engineering Standards; RESTful API Guidelines",
        "notes": "Authored for web/backend technical interview interviews"
      },
      {
        "text": "API versioning strategies (URI path, header, query parameter) and deprecation lifecycles",
        "provenance": "iac_authored",
        "sourceReference": "IAC Engineering Standards; RESTful API Guidelines",
        "notes": "Authored for web/backend technical interview interviews"
      },
      {
        "text": "Pagination patterns: offset/limit vs keyset/cursor-based pagination for high-volume feeds",
        "provenance": "iac_authored",
        "sourceReference": "IAC Engineering Standards; RESTful API Guidelines",
        "notes": "Authored for web/backend technical interview interviews"
      }
    ]
  },
  {
    "id": "se_system_design",
    "name": "System Design & High-Level Architecture",
    "category": "software_engineering",
    "subcategory": "System Design",
    "description": "End-to-end distributed system design, requirement scoping (functional vs non-functional), back-of-the-envelope calculations, load balancers, database sharding, and message queues.",
    "coreConcepts": [
      "Framework for system design interviews: Requirements scoping, High-level design, Detailed design, Bottlenecks",
      "Back-of-the-envelope capacity estimations (QPS, storage, bandwidth, memory caching requirements)",
      "Load balancing algorithms: Round Robin, Weighted Least Connections, IP Hash",
      "Reverse proxies (Nginx, Envoy) vs Forward proxies and API Gateways",
      "Message brokers (Kafka, RabbitMQ) for asynchronous decoupling and peak smoothing",
      "Data modeling and schema choices: Relational vs Document vs Columnar vs Graph databases"
    ],
    "prerequisites": [
      "cs_databases",
      "cs_caching",
      "cs_distributed_systems",
      "se_api_design"
    ],
    "difficulty": "advanced",
    "commonMisconceptions": [
      "Jumping directly into microservices architecture before clarifying scale, throughput, and requirements",
      "Designing systems without single point of failure (SPOF) audits",
      "Confusing message queues (RabbitMQ, point-to-point) with distributed append-only commit logs (Kafka, stream replay)"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Drive structured 45-minute technical system design interviews end-to-end",
      "Calculate realistic QPS, storage, and network bandwidth estimates under pressure",
      "Synthesize multi-tier architectures with load balancers, caches, databases, and message brokers"
    ],
    "relatedTopics": [
      "cs_caching",
      "cs_distributed_systems",
      "se_scalability"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "System design, scalability, data handling",
      "ciuSectionReference": "jwasham/coding-interview-university#system-design-scalability-data-handling",
      "referenceNotes": "System Design Interview – An Insider Guide (Alex Xu); Designing Data-Intensive Applications",
      "iacAdditionNote": "Preserved reverse proxy, load balancing, and async message queue patterns from GFG_WEB_TECHNOLOGY"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Framework for system design interviews: Requirements scoping, High-level design, Detailed design, Bottlenecks",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#system-design-scalability-data-handling"
      },
      {
        "text": "Back-of-the-envelope capacity estimations (QPS, storage, bandwidth, memory caching requirements)",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#system-design-scalability-data-handling"
      },
      {
        "text": "Load balancing algorithms: Round Robin, Weighted Least Connections, IP Hash",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#system-design-scalability-data-handling"
      },
      {
        "text": "Reverse proxies (Nginx, Envoy) vs Forward proxies and API Gateways",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#system-design-scalability-data-handling"
      },
      {
        "text": "Message brokers (Kafka, RabbitMQ) for asynchronous decoupling and peak smoothing",
        "provenance": "other",
        "sourceReference": "GFG_WEB_TECHNOLOGY (migrated); Kleppmann DDIA Chapter 11"
      },
      {
        "text": "Data modeling and schema choices: Relational vs Document vs Columnar vs Graph databases",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#system-design-scalability-data-handling"
      }
    ]
  },
  {
    "id": "se_scalability",
    "name": "Scalability, Reliability, and Fault Tolerance",
    "category": "software_engineering",
    "subcategory": "System Design",
    "description": "Horizontal vs vertical scaling, high availability (99.99%), disaster recovery (RTO/RPO), circuit breakers, rate limiters, bulkhead isolation, and chaos engineering.",
    "coreConcepts": [
      "Horizontal scale-out (stateless application tiers) vs vertical scale-up limitations",
      "Service-Level Indicators (SLIs), Service-Level Objectives (SLOs), and Error Budgets",
      "Recovery Time Objective (RTO) and Recovery Point Objective (RPO) disaster recovery metrics",
      "Fault tolerance patterns: Circuit Breaker, Exponential Backoff with Jitter, Bulkhead, Fallback",
      "Rate limiting algorithms: Token Bucket, Leaky Bucket, Fixed Window, Sliding Window Counter",
      "Canary deployments and automated blue/green traffic splitting"
    ],
    "prerequisites": [
      "se_system_design",
      "cs_caching"
    ],
    "difficulty": "advanced",
    "commonMisconceptions": [
      "Retrying failed network requests immediately without exponential backoff and jitter, worsening server outages",
      "Assuming multi-region deployments are instantly active-active without resolving cross-region replication lag",
      "Treating three-nines (99.9%) and four-nines (99.99%) availability as equivalent; 99.9% permits 8.7 hours downtime/year while 99.99% permits only 52 minutes"
    ],
    "interviewRelevance": "core_must_know",
    "expectedLearningOutcomes": [
      "Design rate limiters using Token Bucket and Redis scripts",
      "Protect downstream services using Circuit Breakers and Bulkhead thread pools",
      "Define SLIs and SLOs to manage production blast radius"
    ],
    "relatedTopics": [
      "se_system_design",
      "cs_distributed_systems"
    ],
    "sourceAttribution": {
      "attributionType": "ciu_derived",
      "inCodingInterviewUniversity": true,
      "ciuSection": "System design, scalability, data handling",
      "ciuSectionReference": "jwasham/coding-interview-university#system-design-scalability-data-handling",
      "referenceNotes": "Site Reliability Engineering (Beyer et al., Google SRE)",
      "iacAdditionNote": "Preserved SLIs/SLOs, Error Budgets, and Canary deployments from GFG_DEVOPS_KNOWLEDGE"
    },
    "version": 1,
    "concepts": [
      {
        "text": "Horizontal scale-out (stateless application tiers) vs vertical scale-up limitations",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#system-design-scalability-data-handling"
      },
      {
        "text": "Service-Level Indicators (SLIs), Service-Level Objectives (SLOs), and Error Budgets",
        "provenance": "other",
        "sourceReference": "GFG_DEVOPS_KNOWLEDGE (migrated); Google Site Reliability Engineering"
      },
      {
        "text": "Recovery Time Objective (RTO) and Recovery Point Objective (RPO) disaster recovery metrics",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#system-design-scalability-data-handling"
      },
      {
        "text": "Fault tolerance patterns: Circuit Breaker, Exponential Backoff with Jitter, Bulkhead, Fallback",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#system-design-scalability-data-handling"
      },
      {
        "text": "Rate limiting algorithms: Token Bucket, Leaky Bucket, Fixed Window, Sliding Window Counter",
        "provenance": "ciu_derived",
        "sourceReference": "jwasham/coding-interview-university#system-design-scalability-data-handling"
      },
      {
        "text": "Canary deployments and automated blue/green traffic splitting",
        "provenance": "other",
        "sourceReference": "GFG_DEVOPS_KNOWLEDGE (migrated); Google SRE Book"
      }
    ]
  }
];
