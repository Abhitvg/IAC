import { describe, it, expect } from 'vitest';
import { CoachingEngine } from '../../src/services/practice/CoachingEngine';
import { CompanyPlanGenerator } from '../../src/services/practice/CompanyPlanGenerator';
import { StoryBank } from '../../src/services/practice/StoryBank';
import { ModelAnswerBuilder } from '../../src/services/practice/ModelAnswerBuilder';
import { SpacedScheduler } from '../../src/services/practice/SpacedScheduler';
import { RubricScorer } from '../../src/services/practice/RubricScorer';
import { MockInterviewerEngine } from '../../src/services/practice/MockInterviewerEngine';
import { QuestionEntry, BehavioralStory } from '../../src/services/practice/types';

describe('Practice Engines Full Coverage Suite', () => {
  describe('CoachingEngine Branches', () => {
    it('generates tiered hints for sliding window, system design, and behavioral questions', () => {
      const slidingHints = CoachingEngine.getTieredHints(
        'Longest substring sliding window',
        'coding'
      );
      expect(slidingHints).toHaveLength(3);
      expect(slidingHints[0].title).toBe('Gentle Nudge');

      const defaultCodingHints = CoachingEngine.getTieredHints('Invert binary tree', 'coding');
      expect(defaultCodingHints).toHaveLength(3);

      const sysDesignHints = CoachingEngine.getTieredHints(
        'Design Twitter timeline',
        'system_design'
      );
      expect(sysDesignHints).toHaveLength(3);
      expect(sysDesignHints[1].content).toContain('scale');

      const behHints = CoachingEngine.getTieredHints(
        'Tell me about a leadership project',
        'behavioral'
      );
      expect(behHints).toHaveLength(3);
      expect(behHints[0].content).toContain('STAR');
    });

    it('generates model answer comparison for system design and behavioral answers', () => {
      // System design comparison with omissions
      const sdComparison = CoachingEngine.compareWithModelAnswer(
        'Design YouTube video upload',
        'system_design',
        'We will upload videos to a server and save metadata.'
      );
      expect(sdComparison.keyOmissions.length).toBeGreaterThan(0);
      expect(sdComparison.modelAnswer).toContain('DynamoDB');
      expect(sdComparison.suggestedPhrasing).toContain('DAU');

      // Behavioral comparison with missing ownership and metrics
      const behComparison = CoachingEngine.compareWithModelAnswer(
        'Describe a difficult project',
        'behavioral',
        'We did a project and team was very busy with many meetings.'
      );
      expect(
        behComparison.keyOmissions.some((o) => o.includes('ownership') || o.includes('I'))
      ).toBe(true);
      expect(behComparison.modelAnswer).toContain('STAR Method');
    });
  });

  describe('CompanyPlanGenerator Branches', () => {
    it('generates 14-day study plans tailored to Google, Meta, and Amazon', () => {
      const jdGoogle =
        'Software Engineer at Google working with C++, Go, Bigtable, Spanner, and Kubernetes.';
      const resume = 'Experienced in C++, Go, and Docker.';

      const planGoogle = CompanyPlanGenerator.generatePlan(
        'Google',
        'Software Engineer II',
        jdGoogle,
        resume,
        14
      );
      expect(planGoogle.dailyDrills).toHaveLength(14);
      expect(planGoogle.seniority).toBe('Mid');
      expect(
        planGoogle.likelyRoundThemes.some(
          (t) => t.includes('Googliness') || t.includes('Algorithmic Rigor')
        )
      ).toBe(true);

      const planMeta = CompanyPlanGenerator.generatePlan(
        'Meta',
        'Staff Software Engineer',
        'Staff Engineer with React, Hack, Memcached, Thrift, and distributed storage.',
        resume,
        7
      );
      expect(planMeta.seniority).toBe('Staff/Lead');
      expect(planMeta.extractedStack).toContain('React');

      const planAmazon = CompanyPlanGenerator.generatePlan(
        'Amazon',
        'SDE III',
        'Java, AWS, DynamoDB, S3, ECS, microservices.',
        resume,
        7
      );
      expect(planAmazon.extractedStack).toContain('Aws');
    });

    it('manages round notes and toggles drill completion status', () => {
      const plan = CompanyPlanGenerator.generatePlan(
        'Stripe',
        'Senior Engineer',
        'Ruby, Go, API',
        'Go',
        7
      );
      expect(plan.dailyDrills[0].completed).toBe(false);

      const noted = CompanyPlanGenerator.addRoundNote(
        plan,
        'Coding Round 1',
        'Emphasize idempotency keys'
      );
      expect(noted.persistentNotes.some((n) => n.includes('idempotency'))).toBe(true);
    });
  });

  describe('StoryBank Matching', () => {
    const stories: BehavioralStory[] = [
      {
        id: 's1',
        title: 'Database Lock Conflict',
        companyProject: 'Stripe',
        competencies: ['conflict'],
        situation: 'Two teams disagreed on database transaction isolation levels.',
        task: 'Resolve architectural conflict.',
        action: 'Benchmarked repeatable read vs read committed with load tests.',
        result: 'Aligned both teams, avoiding deadlock incidents.',
        metrics: ['0 deadlock incidents', 'p99 15ms'],
      },
      {
        id: 's2',
        title: 'Major Payment Outage',
        companyProject: 'Uber',
        competencies: ['failure_postmortem'],
        situation: 'Payment gateway timed out during New Year surge.',
        task: 'Mitigate live incident and establish postmortem.',
        action: 'Implemented circuit breaker pattern with exponential backoff.',
        result: 'Restored service in 12 minutes, saving $2M.',
        metrics: ['12 minutes MTTR', '$2M saved'],
      },
      {
        id: 's3',
        title: 'Vague Product Spec Migration',
        companyProject: 'Airbnb',
        competencies: ['ambiguity'],
        situation: 'Received an ambiguous mandate to modernize guest messaging.',
        task: 'Define scope and drive forward without formal requirements.',
        action: 'Interviewed 5 core stakeholders and published RFC in 4 days.',
        result: 'Delivered v1 MVP in 3 weeks.',
        metrics: ['3 weeks delivery', '5 stakeholders'],
      },
      {
        id: 's4',
        title: 'Mentoring Junior Developers',
        companyProject: 'Netflix',
        competencies: ['leadership'],
        situation: 'Team scaled rapidly with 4 junior engineers.',
        task: 'Upskill engineers to independently ship production microservices.',
        action: 'Established pair-programming rotations and weekly architecture teardowns.',
        result: 'All 4 engineers promoted within 12 months.',
        metrics: ['4 engineers promoted'],
      },
    ];

    it('matches questions to specific competencies and falls back to most metrics', () => {
      expect(
        StoryBank.matchStory('Tell me about a time you had a technical conflict', stories)?.id
      ).toBe('s1');
      expect(
        StoryBank.matchStory('Tell me about a production outage or failure you led', stories)?.id
      ).toBe('s2');
      expect(
        StoryBank.matchStory('How do you handle ambiguous requirements without direction?', stories)
          ?.id
      ).toBe('s3');
      expect(
        StoryBank.matchStory('Tell me about a time you had to mentor or lead others', stories)?.id
      ).toBe('s4');
      expect(StoryBank.matchStory('General question about engineering', stories)?.id).toBeDefined();
      expect(StoryBank.matchStory('Question', [])).toBeNull();
    });
  });

  describe('ModelAnswerBuilder Outlines & Authentic Story Binding', () => {
    it('binds stories matching fail, lead, scale, and ambiguity keywords in ModelAnswerBuilder', () => {
      const stories: BehavioralStory[] = [
        {
          id: 'fail-1',
          title: 'Outage',
          companyProject: 'Cloud Inc',
          competencies: ['failure_postmortem'],
          situation: 'Incident',
          task: 'Restore',
          action: 'Patched',
          result: 'Restored',
          metrics: ['5 min'],
        },
        {
          id: 'lead-1',
          title: 'Lead',
          companyProject: 'Team Corp',
          competencies: ['leadership'],
          situation: 'Mentored',
          task: 'Train',
          action: 'Taught',
          result: 'Promoted',
          metrics: ['2 eng'],
        },
        {
          id: 'scale-1',
          title: 'Scale',
          companyProject: 'High Volume',
          competencies: ['high_impact_scale'],
          situation: 'High pressure deadline',
          task: 'Ship',
          action: 'Optimized',
          result: 'Scaled',
          metrics: ['100k QPS'],
        },
        {
          id: 'ambig-1',
          title: 'Ambig',
          companyProject: 'Stealth',
          competencies: ['ambiguity'],
          situation: 'Unclear direction',
          task: 'Define',
          action: 'Researched',
          result: 'Shipped',
          metrics: ['1 RFC'],
        },
      ];

      expect(
        ModelAnswerBuilder.build('Tell me about an outage or failure', 'behavioral', [], stories)
          .sourceLabel
      ).toContain('Cloud Inc');
      expect(
        ModelAnswerBuilder.build('Tell me about a leadership initiative', 'behavioral', [], stories)
          .sourceLabel
      ).toContain('Team Corp');
      expect(
        ModelAnswerBuilder.build('Tell me about high pressure scale', 'behavioral', [], stories)
          .sourceLabel
      ).toContain('High Volume');
      expect(
        ModelAnswerBuilder.build(
          'Tell me about handling unclear direction',
          'behavioral',
          [],
          stories
        ).sourceLabel
      ).toContain('Stealth');
    });

    it('evaluates behavioral answers with individual ownership and quantified metrics in RubricScorer', () => {
      const transcript =
        'I decided to refactor the pipeline. I led the team alignment. I built the new queue. I reduced latency by 45% and saved 10k dollars.';
      const res = RubricScorer.evaluate({
        category: 'behavioral',
        question: 'Tell me about a project you led.',
        candidateAnswer: transcript,
      });

      expect(res.dimensions.some((d) => d.name.includes('Ownership'))).toBe(true);
      expect(res.dimensions.some((d) => d.name.includes('Impact'))).toBe(true);
    });

    it('builds authentic model answers from user stories for behavioral rounds', () => {
      const userStories: BehavioralStory[] = [
        {
          id: 'story-1',
          title: 'Migration',
          companyProject: 'Fintech Co',
          competencies: ['conflict'],
          situation: 'Tech lead wanted MongoDB, I recommended Postgres.',
          task: 'Drive alignment.',
          action: 'Ran migration benchmarks.',
          result: 'Saved $50k and guaranteed ACID.',
          metrics: ['$50k saved'],
        },
      ];

      const res = ModelAnswerBuilder.build(
        'Tell me about a disagreement with leadership',
        'behavioral',
        [],
        userStories
      );
      expect(res.isUserStory).toBe(true);
      expect(res.sourceLabel).toContain('Fintech Co');
      expect(res.content).toContain('ACID');
    });

    it('builds generic structured outlines when no stories match or for technical rounds', () => {
      const codingRes = ModelAnswerBuilder.build('Design LRU Cache', 'coding');
      expect(codingRes.isUserStory).toBe(false);
      expect(codingRes.content).toContain('[Generic Framework Outline]');
    });
  });

  describe('SpacedScheduler Topic Identification', () => {
    it('identifies topic IDs from QuestionEntry tags and strings', () => {
      const entry: QuestionEntry = {
        id: 'q-test-1',
        title: 'Binary Tree Level Order Traversal',
        prompt: 'Return the level order traversal of its nodes values.',
        type: 'coding',
        topic: 'dsa_trees_graphs',
        tags: ['tree', 'bfs'],
        difficulty: 'medium',
        expectedPoints: ['Queue based BFS', 'O(N) time'],
      };

      expect(SpacedScheduler.identifyTopicForQuestion(entry)).toBe('dsa_trees_graphs');

      expect(SpacedScheduler.identifyTopicForQuestion('Implement two sum with two pointers')).toBe(
        'dsa_arrays_pointers'
      );
      expect(
        SpacedScheduler.identifyTopicForQuestion(
          'Search in a rotated sorted array with binary search'
        )
      ).toBe('dsa_binary_search');
      expect(
        SpacedScheduler.identifyTopicForQuestion(
          'Design Redis caching layer with cache invalidation'
        )
      ).toBe('sd_caching');
    });
  });

  describe('MockInterviewerEngine Session Transitions & Probes', () => {
    it('creates sessions across different round types and personas', () => {
      const codingSession = MockInterviewerEngine.createSession(
        'coding_deep_dive',
        'friendly_coach'
      );
      expect(codingSession.totalTimeSeconds).toBe(30 * 60);

      const sysSession = MockInterviewerEngine.createSession(
        'system_design_architecture',
        'startup_founder'
      );
      expect(sysSession.totalTimeSeconds).toBe(30 * 60);

      const behSession = MockInterviewerEngine.createSession(
        'behavioral_leadership',
        'strict_big_tech'
      );
      expect(behSession.totalTimeSeconds).toBe(30 * 60);
    });

    it('generates targeted weakness probes for coding, system design, and behavioral questions', () => {
      const codingProbe = MockInterviewerEngine.generateWeaknessProbe(
        'I used linear scan with O(N) time.',
        'Find target sum in array',
        'coding'
      );
      expect(codingProbe).toContain('auxiliary space');

      const behProbe = MockInterviewerEngine.generateWeaknessProbe(
        'We decided to build this together with our team.',
        'Describe your proudest engineering project',
        'behavioral'
      );
      expect(behProbe).toContain('personally');
    });
  });
});
