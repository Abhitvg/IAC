import { CompanyPracticePlan } from './types';

const TECH_KEYWORD_MAP: Record<string, string[]> = {
  Languages: ['typescript', 'javascript', 'python', 'golang', 'go', 'java', 'c++', 'rust', 'ruby'],
  Databases: [
    'postgres',
    'postgresql',
    'mysql',
    'mongodb',
    'redis',
    'dynamodb',
    'cassandra',
    'elasticsearch',
  ],
  Cloud_Infra: [
    'aws',
    'gcp',
    'azure',
    'docker',
    'kubernetes',
    'k8s',
    'terraform',
    'ci/cd',
    'kafka',
    'rabbitmq',
  ],
  Frameworks: [
    'react',
    'next.js',
    'node.js',
    'express',
    'nest',
    'spring boot',
    'django',
    'fastapi',
  ],
};

export class CompanyPlanGenerator {
  /**
   * Generates a tailored 7 or 14-day study plan with resume gap analysis and persistent notes.
   */
  public static generatePlan(
    companyName: string,
    targetRole: string,
    jobDescription: string,
    resumeText: string,
    durationDays: 7 | 14 = 7
  ): CompanyPracticePlan {
    const jdClean = (jobDescription || '').trim();
    const jdLower = jdClean.toLowerCase();
    const resumeLower = (resumeText || '').toLowerCase();

    // 1. Extract Stack
    const extractedStack: string[] = [];
    for (const [_, keywords] of Object.entries(TECH_KEYWORD_MAP)) {
      for (const kw of keywords) {
        if (jdLower.includes(kw) && !extractedStack.includes(kw)) {
          extractedStack.push(kw.charAt(0).toUpperCase() + kw.slice(1));
        }
      }
    }

    // 2. Determine Seniority
    let seniority: 'Junior' | 'Mid' | 'Senior' | 'Staff/Lead';
    if (
      jdLower.includes('staff') ||
      jdLower.includes('principal') ||
      jdLower.includes('architect') ||
      jdLower.includes('director')
    ) {
      seniority = 'Staff/Lead';
    } else if (jdLower.includes('senior') || jdLower.includes('lead') || jdLower.includes('sr.')) {
      seniority = 'Senior';
    } else if (
      jdLower.includes('junior') ||
      jdLower.includes('associate') ||
      jdLower.includes('entry')
    ) {
      seniority = 'Junior';
    } else {
      seniority = 'Mid';
    }

    // 3. Identify Likely Round Themes based on Company Culture & JD
    const likelyRoundThemes: string[] = [];
    const compLower = companyName.toLowerCase();

    if (compLower.includes('google') || compLower.includes('alphabet')) {
      likelyRoundThemes.push('Algorithmic Rigor & Optimal Big-O Boundaries');
      likelyRoundThemes.push('Graph & Tree Traversals (DFS/BFS, Topological Sort)');
      likelyRoundThemes.push('System Design: Global Distribution & Consensus (Spanner/Paxos)');
      likelyRoundThemes.push('Googliness: Navigating Ethical Trade-offs & Ambiguity');
    } else if (compLower.includes('meta') || compLower.includes('facebook')) {
      likelyRoundThemes.push('Speed Coding: 2 Medium LeetCode problems in 45 minutes');
      likelyRoundThemes.push('System Design: Social Graph, Newsfeed, & Live Comments at Scale');
      likelyRoundThemes.push('Behavioral: Resolving Technical Conflicts with Peers');
    } else if (compLower.includes('amazon') || compLower.includes('aws')) {
      likelyRoundThemes.push('16 Leadership Principles: Customer Obsession & Ownership');
      likelyRoundThemes.push('System Design: Multi-Region High-Availability & S3/DynamoDB');
      likelyRoundThemes.push('Behavioral: Delivering Results under Impossible Deadlines');
    } else if (compLower.includes('stripe')) {
      likelyRoundThemes.push('Practical Coding: Clean API design, error resilience, idempotency');
      likelyRoundThemes.push('Bug Squashing & Refactoring existing codebases');
      likelyRoundThemes.push('System Design: Financial Ledger & Distributed Lock Orchestration');
    } else {
      likelyRoundThemes.push('Data Structures & Algorithmic Problem Solving');
      likelyRoundThemes.push('System Architecture: Scalability, Caching, & Failure Recovery');
      likelyRoundThemes.push('Behavioral: STAR Ownership, Cross-Functional Leadership, & Impact');
    }

    // 4. Resume Gap Analysis
    const matchedStrengths: string[] = [];
    const missingCompetencies: string[] = [];
    const recommendedFocusAreas: string[] = [];

    for (const tech of extractedStack) {
      if (resumeLower.includes(tech.toLowerCase())) {
        matchedStrengths.push(tech);
      } else {
        missingCompetencies.push(tech);
      }
    }

    if (missingCompetencies.length > 0) {
      recommendedFocusAreas.push(
        `Focus on building 1-2 talking points around ${missingCompetencies.slice(0, 3).join(', ')}, which appear heavily in the JD but are absent in your resume.`
      );
    }

    if (seniority === 'Senior' || seniority === 'Staff/Lead') {
      recommendedFocusAreas.push(
        'Emphasize cross-team consensus, architectural trade-offs, and mentoring junior engineers rather than individual ticket delivery.'
      );
    } else {
      recommendedFocusAreas.push(
        'Demonstrate rapid problem solving, clean test coverage, and eager receptiveness to interviewer hints.'
      );
    }

    // 5. Generate Structured Daily Drills
    const dailyDrills = [];
    if (durationDays === 7) {
      dailyDrills.push({
        day: 1,
        title: 'Baseline Audit & Resume Story Bank',
        focusCategory: 'Behavioral',
        targetExercise:
          'Map 5 core resume projects to STAR stories (Conflict, Failure, Leadership, Scale, Ambiguity).',
        completed: false,
      });
      dailyDrills.push({
        day: 2,
        title: 'Coding Sprint: Arrays, Two-Pointers & Sliding Window',
        focusCategory: 'DSA',
        targetExercise:
          'Solve 2 problems under 20-minute visible timer. State Big-O time and space before writing code.',
        completed: false,
      });
      dailyDrills.push({
        day: 3,
        title: 'System Design: Scale Math & Caching Architecture',
        focusCategory: 'System Design',
        targetExercise:
          'Design a high-throughput URL shortener or rate limiter. Include peak QPS calculation and Redis invalidation.',
        completed: false,
      });
      dailyDrills.push({
        day: 4,
        title: 'Coding Sprint: Trees, Graphs & Traversal Invariants',
        focusCategory: 'DSA',
        targetExercise: 'Complete 2 graph traversal problems with verbal dry-run tracing.',
        completed: false,
      });
      dailyDrills.push({
        day: 5,
        title: 'System Design: Distributed Storage & Resilient Queues',
        focusCategory: 'System Design',
        targetExercise:
          'Design an async notification or payment processing service with Kafka DLQ and idempotency keys.',
        completed: false,
      });
      dailyDrills.push({
        day: 6,
        title: 'Pressure Testing: Interruption Drills & Delivery Polish',
        focusCategory: 'Delivery & Pressure',
        targetExercise:
          "Run a mock session with 'Simulate Pressure Interruptions' enabled. Keep filler words below 3%.",
        completed: false,
      });
      dailyDrills.push({
        day: 7,
        title: 'Full 45-Minute Dress Rehearsal',
        focusCategory: 'Dress Rehearsal',
        targetExercise:
          'Execute complete end-to-end rehearsal (Icebreaker -> STAR -> Coding -> Design -> Your Questions).',
        completed: false,
      });
    } else {
      // 14-day comprehensive roadmap
      for (let d = 1; d <= 14; d++) {
        let title: string;
        let cat: string;
        let ex: string;

        if (d === 1) {
          title = 'Company Alignment & Story Bank Extraction';
          cat = 'Behavioral';
          ex = 'Audit JD themes against resume bullet points and draft 5 STAR narratives.';
        } else if (d === 2 || d === 3) {
          title = 'Data Structures Core: Arrays, Strings, Sliding Windows';
          cat = 'DSA';
          ex = 'Practice 2 timed problems each day with zero initial hints.';
        } else if (d === 4 || d === 5) {
          title = 'Trees, Binary Search & Monotonic Stacks';
          cat = 'DSA';
          ex = 'Solve recursive vs iterative traversals. Focus on boundary conditions.';
        } else if (d === 6 || d === 7) {
          title = 'System Design Foundations: Scaling Math & Database Choices';
          cat = 'System Design';
          ex = 'Back-of-the-envelope estimations and SQL vs NoSQL trade-offs.';
        } else if (d === 8 || d === 9) {
          title = 'Graphs, BFS/DFS & Topological Sort';
          cat = 'DSA';
          ex = 'Cycle detection and dependency resolution algorithms.';
        } else if (d === 10 || d === 11) {
          title = 'Advanced System Design: Caching, Queues & Circuit Breakers';
          cat = 'System Design';
          ex = 'Deep dive into cache stampedes, Kafka consumer groups, and SPOF mitigation.';
        } else if (d === 12) {
          title = 'Behavioral Mock: Tough Probes & Conflict Mastery';
          cat = 'Behavioral';
          ex = 'Practice handling probing follow-up questions without defensive body language.';
        } else if (d === 13) {
          title = 'Pressure & Interruption Conditioning';
          cat = 'Delivery';
          ex = 'Run mock with interruption setting on. Monitor WPM pacing and rambling alerts.';
        } else {
          title = 'Full 45-Minute Dress Rehearsal & Consolidated Scorecard';
          cat = 'Dress Rehearsal';
          ex = 'Run full 45-min loop under strict Big Tech persona. Review quoted evidence report.';
        }

        dailyDrills.push({
          day: d,
          title,
          focusCategory: cat,
          targetExercise: ex,
          completed: false,
        });
      }
    }

    return {
      companyName,
      targetRole: targetRole || 'Software Engineer',
      jobDescriptionText: jdClean,
      extractedStack,
      seniority,
      likelyRoundThemes,
      resumeGapAnalysis: {
        matchedStrengths,
        missingCompetencies,
        recommendedFocusAreas,
      },
      durationDays,
      dailyDrills,
      persistentNotes: [
        `[Plan Created on ${new Date().toLocaleDateString()}] Initialized tailored ${durationDays}-day roadmap for ${companyName} (${seniority} ${targetRole}).`,
      ],
      createdAt: Date.now(),
    };
  }

  /**
   * Appends candidate notes from a completed round to inform the next round.
   */
  public static addRoundNote(
    plan: CompanyPracticePlan,
    roundName: string,
    note: string
  ): CompanyPracticePlan {
    const updatedNotes = [
      ...plan.persistentNotes,
      `[${new Date().toLocaleDateString()} - ${roundName}] ${note.trim()}`,
    ];
    return {
      ...plan,
      persistentNotes: updatedNotes,
    };
  }
}
