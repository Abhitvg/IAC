import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProgressMetricsService } from '../../src/services/practice/feedback/ProgressMetricsService';
import { ProgressExporter } from '../../src/services/practice/feedback/ProgressExporter';
import { ProgressView } from '../../src/components/practice/ProgressView';
import SettingsPanel from '../../src/components/SettingsPanel';
import { usePracticeStore } from '../../src/store/usePracticeStore';
import { useAppStore } from '../../src/store/useAppStore';
import { MockSessionState, FeedbackRecord } from '../../src/services/practice/types';

describe('Phase 6 - Progress and Honesty in Reporting Suite', () => {
  const secretTranscript1 =
    'CONFIDENTIAL_TRANSCRIPT_1: In our stealth checkout engine, we handled 50k QPS using RocksDB.';
  const secretTranscript2 =
    'CONFIDENTIAL_TRANSCRIPT_2: We partitioned customer payment events across Kafka topics.';
  const secretTranscript3 =
    'CONFIDENTIAL_TRANSCRIPT_3: I resolved distributed lock deadlocks using leases with monotonic fences.';

  const createMockSession = (
    id: string,
    transcript: string,
    structureScore: number,
    concretenessScore: number,
    deliveryScore: number,
    isHeuristic: boolean = false
  ): MockSessionState => ({
    isActive: false,
    roundType: 'system_design',
    persona: 'strict_big_tech',
    pressure: 'normal',
    totalTimeSeconds: 1800,
    timeRemainingSeconds: 0,
    interruptionEnabled: false,
    isInterviewerSpeaking: false,
    interviewerThinkingSeconds: 0,
    currentQuestion: 'Design checkout engine',
    questionHistory: [
      {
        question: 'Design checkout engine',
        category: 'system_design',
        isFollowUp: false,
        candidateTranscript: transcript,
        hintsUsed: [],
        evaluation: {
          overallScore: (structureScore + concretenessScore) / 2,
          percentage: 80,
          isHeuristicEstimate: isHeuristic,
          dimensions: [
            {
              name: 'Structure',
              category: 'system_design',
              score: structureScore,
              maxScore: 5,
              weight: 1.0,
              feedback: 'Clear headline first',
            },
            {
              name: 'Concreteness',
              category: 'system_design',
              score: concretenessScore,
              maxScore: 5,
              weight: 1.0,
              feedback: 'Named concrete tools',
            },
          ],
          topLeverageFixes: [],
          modelAnswer: '',
          diffMissingPoints: [],
          assessedAt: Date.now(),
        },
        delivery: {
          durationSeconds: 60,
          wordCount: 140,
          speakingPaceWpm: 140,
          totalFillerWords: 2,
          fillerBreakdown: { um: 1, like: 1 },
          longestPauseSeconds: 1.2,
          timeToFirstWordSeconds: 0.8,
          deliveryScore,
          isRambling: false,
        },
      },
    ],
    overallScorecard: {
      finalRating: 'Hire',
      averageScore: (structureScore + concretenessScore) / 2,
      deliveryScore,
      structureScore,
      concretenessScore,
      keyStrengths: ['Structured roadmap', 'Concrete sizing numbers'],
      topImprovementPriorities: ['Elaborate on database partitioning'],
    },
  });

  describe('Task 1: Minimum 3 Sessions for Trend Line & Thin Data Labeling', () => {
    it('proves no trend line renders with fewer than three sessions (0, 1, or 2 sessions)', () => {
      // 1. Zero sessions
      usePracticeStore.setState({ sessionHistory: [] });
      const summary0 = ProgressMetricsService.computeProgressSummary([], []);
      expect(summary0.sessionCount).toBe(0);
      expect(summary0.shouldRenderTrendLine).toBe(false);
      expect(summary0.isDataThin).toBe(true);

      const html0 = renderToStaticMarkup(React.createElement(ProgressView, { sessionHistory: [] }));
      expect(html0).not.toContain('data-testid="progress-trend-line"');
      expect(html0).toContain('data-testid="data-thin-banner"');
      expect(html0).toContain('Establishing Baseline: Data is Thin');

      // 2. One session
      const s1 = createMockSession('s1', secretTranscript1, 4.0, 3.5, 4.0);
      usePracticeStore.setState({ sessionHistory: [s1] });
      const summary1 = ProgressMetricsService.computeProgressSummary([s1], []);
      expect(summary1.sessionCount).toBe(1);
      expect(summary1.shouldRenderTrendLine).toBe(false);
      expect(summary1.isDataThin).toBe(true);

      const html1 = renderToStaticMarkup(React.createElement(ProgressView, { sessionHistory: [s1] }));
      expect(html1).not.toContain('data-testid="progress-trend-line"');
      expect(html1).toContain('1 / 3 Sessions');

      // 3. Two sessions (still under 3)
      const s2 = createMockSession('s2', secretTranscript2, 4.5, 4.0, 4.2);
      usePracticeStore.setState({ sessionHistory: [s1, s2] });
      const summary2 = ProgressMetricsService.computeProgressSummary([s1, s2], []);
      expect(summary2.sessionCount).toBe(2);
      expect(summary2.shouldRenderTrendLine).toBe(false);
      expect(summary2.isDataThin).toBe(true);

      const html2 = renderToStaticMarkup(React.createElement(ProgressView, { sessionHistory: [s1, s2] }));
      expect(html2).not.toContain('data-testid="progress-trend-line"');
      expect(html2).toContain('2 / 3 Sessions');
    });

    it('renders the trend line once at least three sessions exist', () => {
      const s1 = createMockSession('s1', secretTranscript1, 3.0, 2.5, 3.5);
      const s2 = createMockSession('s2', secretTranscript2, 4.0, 3.5, 4.0);
      const s3 = createMockSession('s3', secretTranscript3, 4.5, 4.5, 4.5);

      usePracticeStore.setState({ sessionHistory: [s1, s2, s3] });
      const summary3 = ProgressMetricsService.computeProgressSummary([s1, s2, s3], []);
      expect(summary3.sessionCount).toBe(3);
      expect(summary3.shouldRenderTrendLine).toBe(true);
      expect(summary3.isDataThin).toBe(false);

      const html3 = renderToStaticMarkup(React.createElement(ProgressView, { sessionHistory: [s1, s2, s3] }));
      // Trend line renders!
      expect(html3).toContain('data-testid="progress-trend-line"');
      // Thin data banner does NOT render!
      expect(html3).not.toContain('data-testid="data-thin-banner"');
      expect(html3).toContain('Cross-Session Skill Trend Lines');
    });
  });

  describe('Task 2: Confidence Indicators (High vs Low)', () => {
    it('shows Low Confidence indicator when score is a heuristic estimate, and High Confidence for verified LLM evaluations', () => {
      const verifiedSession = createMockSession('s1', 'verified transcript', 4.5, 4.0, 4.5, false);
      const estimatedSession = createMockSession('s2', 'heuristic transcript', 3.0, 2.5, 3.0, true);

      usePracticeStore.setState({ sessionHistory: [verifiedSession, estimatedSession] });
      const summary = ProgressMetricsService.computeProgressSummary([verifiedSession, estimatedSession], []);

      expect(summary.metrics[0].confidence).toBe('high');
      expect(summary.metrics[1].confidence).toBe('low');

      const html = renderToStaticMarkup(React.createElement(ProgressView, { sessionHistory: [verifiedSession, estimatedSession] }));
      expect(html).toContain('High Confidence (LLM Verified)');
      expect(html).toContain('Low Confidence (Estimated)');
    });
  });

  describe('Task 3: Calibration Reminder in Settings and Progress View', () => {
    it('displays calibration reminder explaining AI scores are estimates and may be wrong in plain language', () => {
      // 1. In Progress View
      const progressHtml = renderToStaticMarkup(React.createElement(ProgressView, { sessionHistory: [] }));
      expect(progressHtml).toContain('Calibration Reminder');
      expect(progressHtml).toContain('AI scores are mathematical estimates');
      expect(progressHtml).toContain('compare them against feedback from real human interviewers');

      // 2. In Settings Panel
      useAppStore.setState({
        settings: {
          aiProvider: 'groq',
          aiModel: 'llama-3.3-70b-versatile',
          preferredLanguage: 'typescript',
          systemPrompt: '',
          theme: 'dark',
          speechRate: 1.0,
          enableAudioFeedback: true,
          stealthLevel: 'standard',
          autoListen: false,
          transcriptionService: 'groq',
          transcriptionModel: 'whisper-large-v3',
          browserIntegration: false,
        },
      });

      const settingsHtml = renderToStaticMarkup(React.createElement(SettingsPanel));
      expect(settingsHtml).toContain('Calibration Reminder');
      expect(settingsHtml).toContain(
        'AI scores are estimates, may be wrong, and should be compared against feedback from real people'
      );
    });
  });

  describe('Task 4: Export Guardrails - Zero Transcripts by Default', () => {
    const feedbackRecords: FeedbackRecord[] = [
      {
        id: 'fb-1',
        date: '2026-04-12',
        company: 'Stripe',
        role: 'Senior Backend Engineer',
        redactedText: 'Candidate had good structure but missed concrete examples on distributed locks.',
        sourceHash: 'stripe-hash-1',
        strengths: [{ topic: 'Structure', skill: 'structure', evidence: 'good structure' }],
        weaknesses: [
          {
            topic: 'Distributed Locks',
            skill: 'concreteness',
            severity: 2,
            evidence: 'missed concrete examples on distributed locks',
            requestedFix: 'provide worked failure examples for lease renewals',
          },
        ],
      },
    ];

    it('contains NO raw transcript text in default export', () => {
      const s1 = createMockSession('s1', secretTranscript1, 4.0, 3.5, 4.0);
      const s2 = createMockSession('s2', secretTranscript2, 4.5, 4.0, 4.2);
      const s3 = createMockSession('s3', secretTranscript3, 4.5, 4.5, 4.5);

      const defaultExport = ProgressExporter.generateMarkdownReport({
        sessionHistory: [s1, s2, s3],
        feedbackRecords,
        weaknessMap: {
          rankedWeaknesses: [
            {
              topic: 'Distributed Locks',
              skill: 'concreteness',
              severity: 2,
              score: 2.5,
              reportCount: 1,
              isRecurring: false,
              requestedFixes: ['provide worked failure examples'],
              evidence: ['missed concrete examples'],
            },
          ],
          recurringWeaknesses: [],
          missingContentTopics: [],
        },
      });

      // CRITICAL ACCEPTANCE CHECK: Must NOT contain candidate transcripts
      expect(defaultExport).not.toContain(secretTranscript1);
      expect(defaultExport).not.toContain(secretTranscript2);
      expect(defaultExport).not.toContain(secretTranscript3);
      expect(defaultExport).not.toContain('CONFIDENTIAL_TRANSCRIPT');

      // Must contain weakness map, progress metrics, and calibration reminder
      expect(defaultExport).toContain('Distributed Locks');
      expect(defaultExport).toContain('Calibration Reminder');
      expect(defaultExport).toContain('Practice Sessions Log');
    });

    it('includes raw transcripts ONLY when user explicitly opts in with includeTranscripts: true', () => {
      const s1 = createMockSession('s1', secretTranscript1, 4.0, 3.5, 4.0);

      const optInExport = ProgressExporter.generateMarkdownReport(
        {
          sessionHistory: [s1],
          feedbackRecords,
        },
        {
          includeTranscripts: true, // Explicit opt-in
        }
      );

      // Contains transcripts when explicitly opted in
      expect(optInExport).toContain(secretTranscript1);
      expect(optInExport).toContain('Full Practice Transcripts (User Opt-In)');
    });
  });
});
