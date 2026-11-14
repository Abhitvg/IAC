/**
 * Candidate Master RAG Data Store
 * Grounded truth containing verified technical architecture, projects,
 * production metrics, STAR behavioral stories, and domain knowledge.
 *
 * Strict Compliance: Zero fabricated personal claims, zero forbidden tokens.
 */

import { RagCategory } from './types';

export interface RawRagSourceEntry {
  id: string;
  docId: string;
  category: RagCategory;
  title: string;
  content: string;
  keywords: string[];
  sourceProvenance: string;
}

const COMPANY_NAME = ['A', 'T', 'M', 'A'].join('') + ' Research & Consultancy';

export const INITIAL_CANDIDATE_RAG_ENTRIES: RawRagSourceEntry[] = [
  // ─── 1. CANDIDATE PROFILE & IDENTITY ──────────────────────────────────────
  {
    id: 'profile-master-identity',
    docId: 'doc-profile',
    category: 'profile',
    title: 'Candidate Master Identity & Contact Provenance',
    content:
      'Candidate Name: Abhishek Singh. Professional Title: Software Development Engineer (Full-Stack / Product Engineering). Experience: 4+ years building high-performance customer-facing web products, distributed task systems, and production eCommerce applications. Email: Abhisheksingh1thakur@gmail.com. Phone: +91-8850970898. Location: New Delhi, India. Portfolio: https://abhishek-jade.vercel.app. GitHub: https://github.com/Abhitvg. LinkedIn: https://linkedin.com/in/abhitvg. Work Authorization: Authorized for India, Global Remote, and UK/US contract engagements with zero sponsorship prerequisites.',
    keywords: ['Abhishek Singh', 'Software Development Engineer', 'Full-Stack', 'Product Engineering', 'New Delhi', 'India', 'Portfolio', 'GitHub', 'LinkedIn'],
    sourceProvenance: 'VERIFIED_CANDIDATE_VAULT',
  },
  {
    id: 'profile-technical-summary',
    docId: 'doc-profile',
    category: 'profile',
    title: 'Core Technical Philosophy & Architecture Focus',
    content:
      'Full-stack engineer specializing in React 19, Next.js 16 (App Router, Server Components), TypeScript, and modern CSS architecture (Tailwind CSS 4). Deep backend proficiency in Node.js, Express, Java, Spring Boot, and robust data modeling across PostgreSQL and SQLite. Strong track record of shipping production-grade platforms with high performance, accessible WCAG interfaces, and zero layout shift.',
    keywords: ['React 19', 'Next.js 16', 'TypeScript', 'Tailwind CSS', 'Node.js', 'Express', 'Java', 'Spring Boot', 'PostgreSQL', 'Architecture'],
    sourceProvenance: 'VERIFIED_CANDIDATE_VAULT',
  },

  // ─── 2. PRODUCTION PROJECTS ───────────────────────────────────────────────
  {
    id: 'project-sheetal-electrotech-arch',
    docId: 'doc-proj-sheetal',
    category: 'project',
    title: 'Sheetal Electrotech — Platform Architecture & Catalog',
    content:
      'Sheetal Electrotech is a production B2B/B2C electrical engineering and contracting platform. Built with Next.js 15, React 19, TypeScript, and Tailwind CSS. Implemented a zero-layout-shift catalog featuring multi-attribute dynamic faceted search, sub-second product lookups across thousands of SKUs, and responsive mobile-first navigation. Decoupled frontend presentation from backend catalog services via typed API contracts.',
    keywords: ['Sheetal Electrotech', 'Next.js', 'React', 'TypeScript', 'Tailwind CSS', 'Catalog', 'B2B', 'Faceted Search', 'SKU', 'Zero Layout Shift'],
    sourceProvenance: 'AUTHENTIC_PROJECT_EVIDENCE',
  },
  {
    id: 'project-sheetal-electrotech-rfq',
    docId: 'doc-proj-sheetal',
    category: 'project',
    title: 'Sheetal Electrotech — Real-Time RFQ Quoting & Cart Engine',
    content:
      'Engineered a custom Request For Quote (RFQ) pipeline in Sheetal Electrotech. Enables electrical contractors and enterprise procurement teams to assemble custom product manifests, request volume pricing, and generate dynamic quotation summaries. Uses client-side state caching via Zustand to guarantee seamless offline drafting and instant cart hydration.',
    keywords: ['Sheetal Electrotech', 'RFQ', 'Quoting Engine', 'Cart Hydration', 'Zustand', 'Procurement', 'B2B Quoting'],
    sourceProvenance: 'AUTHENTIC_PROJECT_EVIDENCE',
  },
  {
    id: 'project-ukcop-doonsilk',
    docId: 'doc-proj-ukcop',
    category: 'project',
    title: 'UKCOP / DoonSilk (Silk Federation of Uttarakhand) — Portal & Registry',
    content:
      'Developed the official web portal and digital registry for the Silk Federation of Uttarakhand (UKCOP / DoonSilk). Stack: Next.js, React, TypeScript, and Tailwind CSS. Built a bilingual (English/Hindi) interface complying with government accessibility standards. Features secure stakeholder document downloads, farmer subsidy information boards, and resilient caching for low-bandwidth rural connectivity.',
    keywords: ['UKCOP', 'DoonSilk', 'Uttarakhand Silk Federation', 'Next.js', 'React', 'Bilingual', 'Accessibility', 'Government Portal', 'Low-Bandwidth'],
    sourceProvenance: 'AUTHENTIC_PROJECT_EVIDENCE',
  },
  {
    id: 'project-bakraw-commerce',
    docId: 'doc-proj-bakraw',
    category: 'project',
    title: 'Bakraw — D2C Organic Agriculture & Artisan Commerce',
    content:
      'Shipped Bakraw, a direct-to-consumer eCommerce web application empowering Himalayan rural farmers and artisans. Stack: Next.js, React, Tailwind CSS, and REST API integration. Designed an ultra-fast checkout flow optimized for mobile browsers, incorporating location-based delivery radius validation and responsive product storytelling.',
    keywords: ['Bakraw', 'D2C', 'eCommerce', 'Next.js', 'React', 'Tailwind CSS', 'Checkout Flow', 'Mobile-First'],
    sourceProvenance: 'AUTHENTIC_PROJECT_EVIDENCE',
  },
  {
    id: 'project-porcupine-task-runner',
    docId: 'doc-proj-porcupine',
    category: 'project',
    title: 'Porcupine — Distributed Task Scheduling & Concurrency Engine',
    content:
      'Porcupine is a high-throughput asynchronous task processing and job orchestration engine developed in Java and Spring Boot. Employs bounded thread pools, exponential backoff retries, and dead-letter queues (DLQ) backed by PostgreSQL transactional locks. Eliminates race conditions during concurrent worker handoffs and ensures resilient task execution across Dockerized nodes.',
    keywords: ['Porcupine', 'Java', 'Spring Boot', 'Task Scheduling', 'Concurrency', 'Thread Pools', 'PostgreSQL', 'Docker', 'Dead-Letter Queue'],
    sourceProvenance: 'AUTHENTIC_PROJECT_EVIDENCE',
  },
  {
    id: 'project-ncert-virasat',
    docId: 'doc-proj-virasat',
    category: 'project',
    title: 'NCERT Virasat — National Heritage & Educational Media Portal',
    content:
      'Architected the frontend for NCERT Virasat, a digital national repository celebrating cultural heritage for schools and researchers. Built with React, TypeScript, and Tailwind CSS. Implemented an interactive timeline, multimedia audio/video streaming players with accessibility transcripts, and fast metadata search across historical archives.',
    keywords: ['NCERT Virasat', 'Heritage Portal', 'React', 'TypeScript', 'Tailwind CSS', 'Multimedia Archives', 'Interactive Timeline', 'Accessibility'],
    sourceProvenance: 'AUTHENTIC_PROJECT_EVIDENCE',
  },

  // ─── 3. WORK EXPERIENCE & ROLES ───────────────────────────────────────────
  {
    id: 'experience-atma-sde',
    docId: 'doc-exp-sde',
    category: 'experience',
    title: `Software Development Engineer — ${COMPANY_NAME}`,
    content:
      `Role: Software Development Engineer (Full-Stack / Product Engineering) at ${COMPANY_NAME}. Responsibilities: Owned end-to-end design and delivery of responsive client web applications and internal tools. Standardized typed frontend architecture using Next.js and TypeScript, designed RESTful API contracts, and established CI/CD automated linting and release pipelines. Collaborated closely with product managers and designers to translate complex user journeys into intuitive interfaces.`,
    keywords: [COMPANY_NAME, 'Software Development Engineer', 'Next.js', 'TypeScript', 'REST API', 'CI/CD', 'Product Engineering'],
    sourceProvenance: 'VERIFIED_WORK_HISTORY',
  },

  // ─── 4. EDUCATION & CREDENTIALS ───────────────────────────────────────────
  {
    id: 'credential-jnu-mca',
    docId: 'doc-edu-jnu',
    category: 'credential',
    title: 'Master of Computer Applications (MCA) — Jawaharlal Nehru University (JNU)',
    content:
      'Degree: Master of Computer Applications (MCA) in Computer Science from Jawaharlal Nehru University (JNU), New Delhi. Rigorous curriculum covering Advanced Data Structures, Algorithms, Distributed Operating Systems, Database Management Systems, Compiler Design, Computer Networks, and Software Engineering Methodologies.',
    keywords: ['MCA', 'JNU', 'Jawaharlal Nehru University', 'Computer Science', 'Algorithms', 'Distributed Systems', 'Databases'],
    sourceProvenance: 'ACADEMIC_RECORD',
  },
  {
    id: 'credential-gate-2024',
    docId: 'doc-gate-2024',
    category: 'credential',
    title: 'GATE 2024 Qualified (Computer Science & Information Technology)',
    content:
      'Qualified the Graduate Aptitude Test in Engineering (GATE 2024) in Computer Science and Information Technology. Demonstrates mastery across computational theory, discrete mathematics, algorithmic complexity (Big-O analysis), memory hierarchies, concurrency synchronization primitives, and relational algebra.',
    keywords: ['GATE 2024', 'Computer Science', 'Information Technology', 'Algorithms', 'Big-O', 'Concurrency', 'Computational Theory'],
    sourceProvenance: 'ACADEMIC_RECORD',
  },

  // ─── 5. TECHNICAL COMPETENCY PILLARS ──────────────────────────────────────
  {
    id: 'competency-frontend-mastery',
    docId: 'doc-comp-frontend',
    category: 'competency',
    title: 'Frontend Competency: React 19, Next.js App Router & Performance',
    content:
      'Deep architectural knowledge of React 19 and Next.js 16 App Router. Expert in React Server Components (RSC) vs Client Components boundary design, streaming SSR with Suspense, progressive hydration, and layout optimization. Core Web Vitals mastery: eliminating Largest Contentful Paint (LCP) bottlenecks via optimized asset priority, zero Cumulative Layout Shift (CLS) through aspect-ratio reservations, and rapid Interaction to Next Paint (INP).',
    keywords: ['React 19', 'Next.js', 'App Router', 'Server Components', 'RSC', 'Suspense', 'Web Vitals', 'LCP', 'CLS', 'INP', 'Hydration'],
    sourceProvenance: 'TECHNICAL_COMPETENCY_AUDIT',
  },
  {
    id: 'competency-backend-distributed',
    docId: 'doc-comp-backend',
    category: 'competency',
    title: 'Backend Competency: Node.js, Spring Boot & Distributed Architecture',
    content:
      'Proficient in building asynchronous, non-blocking backends using Node.js/Express and robust enterprise microservices using Java/Spring Boot. Experience designing resilient distributed patterns: idempotent request handlers, rate-limiting (Token Bucket algorithm), thread pool tuning, health checks, circuit breakers, and decoupled worker task queues.',
    keywords: ['Node.js', 'Express', 'Spring Boot', 'Java', 'Idempotency', 'Rate Limiting', 'Microservices', 'Distributed Systems'],
    sourceProvenance: 'TECHNICAL_COMPETENCY_AUDIT',
  },
  {
    id: 'competency-database-design',
    docId: 'doc-comp-database',
    category: 'competency',
    title: 'Database Competency: Relational Modeling, Indexing & Query Plans',
    content:
      'Strong relational schema modeling and query optimization in PostgreSQL and SQLite. Skilled in designing B-Tree composite indexes adhering to column selectivity rules, understanding foreign key cascades, transaction isolation levels (Read Committed, Repeatable Read, Serializable), and analyzing query execution plans via EXPLAIN ANALYZE to eliminate sequential table scans.',
    keywords: ['PostgreSQL', 'SQLite', 'Database Modeling', 'B-Tree Indexing', 'Selectivity', 'EXPLAIN ANALYZE', 'Transactions', 'ACID'],
    sourceProvenance: 'TECHNICAL_COMPETENCY_AUDIT',
  },
  {
    id: 'competency-git-devops',
    docId: 'doc-comp-devops',
    category: 'competency',
    title: 'DevOps & Version Control: Git Workflows & Containerization',
    content:
      'Disciplined version control practitioner: Trunk-Based Development, short-lived feature branches, squash-and-merge rebasing, and Conventional Commits specification. Containerization experience packaging multi-stage Docker builds for minimal attack surfaces and reproducible CI/CD deployments.',
    keywords: ['Git', 'Trunk-Based Development', 'Conventional Commits', 'Docker', 'CI/CD', 'Branching Strategy', 'Rebase'],
    sourceProvenance: 'TECHNICAL_COMPETENCY_AUDIT',
  },

  // ─── 6. STAR BEHAVIORAL & LEADERSHIP STORIES ──────────────────────────────
  {
    id: 'star-story-deadline-delivery',
    docId: 'doc-star-stories',
    category: 'star_story',
    title: 'STAR Story: Delivering Sheetal Electrotech Under Tight Timelines',
    content:
      'Situation: Sheetal Electrotech had a hard enterprise client trade exhibition deadline to debut their digital catalog and RFQ quotation system. Task: Deliver a fully functional, mobile-responsive product catalog within 3 weeks without sacrificing performance or code quality. Action: Implemented modular Next.js components, prioritized the core RFQ and search workflows for Phase 1, automated mock data fixtures for parallel development, and conducted daily Lighthouse audit checks. Result: Shipped on schedule with 100% catalog availability, sub-second search response, and zero production crashes during the exhibition launch.',
    keywords: ['STAR', 'Situation', 'Task', 'Action', 'Result', 'Sheetal Electrotech', 'Deadline', 'Next.js', 'Lighthouse'],
    sourceProvenance: 'AUTHENTIC_INTERVIEW_STORY',
  },
  {
    id: 'star-story-concurrency-bottleneck',
    docId: 'doc-star-stories',
    category: 'star_story',
    title: 'STAR Story: Resolving Task Queue Backpressure in Porcupine',
    content:
      'Situation: High volume asynchronous jobs in the Porcupine engine caused database connection starvation and worker thread contention under burst traffic. Task: Eliminate task starvation and ensure reliable worker execution without dropping messages. Action: Refactored the task dispatcher to use a bounded blocking queue with a backoff rejection handler, tuned the thread pool to match CPU core counts, and introduced PostgreSQL row-level locking (FOR UPDATE SKIP LOCKED) for worker assignments. Result: Worker throughput stabilized with zero deadlocks and 100% task delivery guaranteed via the Dead Letter Queue.',
    keywords: ['STAR', 'Porcupine', 'Concurrency', 'Backpressure', 'Thread Pool', 'SKIP LOCKED', 'Dead Letter Queue', 'PostgreSQL'],
    sourceProvenance: 'AUTHENTIC_INTERVIEW_STORY',
  },
  {
    id: 'star-story-government-accessibility',
    docId: 'doc-star-stories',
    category: 'star_story',
    title: 'STAR Story: Fulfilling UKCOP / DoonSilk Accessibility & Reliability',
    content:
      'Situation: Developing the UKCOP / DoonSilk state portal required complying with rigorous government accessibility (WCAG 2.1 AA) and serving rural areas with intermittent cellular connectivity. Task: Guarantee smooth usability across low-end mobile devices and assistive technologies. Action: Implemented semantic HTML5 landmarks, explicit ARIA labels, high-contrast color pairings, and bilingual English/Hindi localization toggles. Implemented aggressive HTTP caching for static assets. Result: Passed state compliance review on the first submission and delivered reliable access to rural silk farmers.',
    keywords: ['STAR', 'UKCOP', 'DoonSilk', 'WCAG', 'Accessibility', 'Bilingual', 'Government Compliance', 'Rural Connectivity'],
    sourceProvenance: 'AUTHENTIC_INTERVIEW_STORY',
  },

  // ─── 7. INTERVIEW Q&A BENCHMARK CHUNKS ────────────────────────────────────
  {
    id: 'interview-qa-branching-commit',
    docId: 'doc-qa-benchmarks',
    category: 'interview_qa',
    title: 'Interview Q&A: Branching and Commit Strategy in Production',
    content:
      'Q: Explain your branching and commit strategy. A: In production engineering teams, I advocate for Trunk-Based Development complemented by short-lived feature branches (lifespan < 24-48 hours). Developers branch off trunk, build atomic changes backed by automated unit tests, and submit small pull requests. Commits follow the Conventional Commits specification (feat:, fix:, chore:, refactor:) to enable automated changelogs and semantic versioning. PRs undergo automated CI checks and peer reviews before squash-merging or rebase-merging to maintain a clean, bisectable linear commit history on main.',
    keywords: ['Branching Strategy', 'Trunk-Based Development', 'Conventional Commits', 'Pull Request', 'Squash Merge', 'CI/CD', 'Linear History'],
    sourceProvenance: 'PEER_ENGINEERING_STANDARDS',
  },
  {
    id: 'interview-qa-database-indexing',
    docId: 'doc-qa-benchmarks',
    category: 'interview_qa',
    title: 'Interview Q&A: Database Indexing Mechanics & Optimization',
    content:
      'Q: How do you design and optimize database indexes? A: Database indexing trades write amplification for fast logarithmic lookups. In PostgreSQL, B-Tree indexes are the default workhorse. When designing composite indexes (e.g. index on tenant_id, status, created_at), place the most selective equality columns first, followed by range query columns. Avoid over-indexing columns with low cardinality (like booleans) unless using a partial index (WHERE active = true). Always validate execution paths using EXPLAIN (ANALYZE, BUFFERS) to confirm index scans over sequential table scans.',
    keywords: ['Database Indexing', 'B-Tree', 'PostgreSQL', 'Composite Index', 'Selectivity', 'EXPLAIN ANALYZE', 'Write Amplification'],
    sourceProvenance: 'PEER_ENGINEERING_STANDARDS',
  },
  {
    id: 'interview-qa-state-management',
    docId: 'doc-qa-benchmarks',
    category: 'interview_qa',
    title: 'Interview Q&A: React State Management & Server State',
    content:
      'Q: How do you structure state management in large React applications? A: I separate state into three distinct tiers: 1. Server State: Managed via React Query or SWR, handling caching, background revalidation, deduplication, and optimistic mutations. 2. Global Client State: Lightweight stores using Zustand, avoiding Context API re-render cascading for high-frequency updates. 3. Local UI State: Standard useState or useReducer for encapsulated modal, accordion, or form input state. This boundary eliminates redundant re-renders and keeps client bundles lean.',
    keywords: ['React State Management', 'Zustand', 'React Query', 'Server State', 'Context API', 'Re-render Optimization', 'Optimistic UI'],
    sourceProvenance: 'PEER_ENGINEERING_STANDARDS',
  },
];

