import { describe, it, expect } from 'vitest';
import { useInterviewScheduleStore, ScheduledInterview } from '../src/store/useInterviewScheduleStore';
import { predictInterviewLoop } from '../src/services/careerOps/jobInterviewPredictor';

describe('CareerOps Screen 6: Interviews & Debrief Loop', () => {
  it('manages interview rounds in store (add, update, delete)', () => {
    const store = useInterviewScheduleStore.getState();
    store.clearAll();

    const id = store.addInterview({
      jobId: 'job-stripe-1',
      company: 'Stripe',
      role: 'Staff Infrastructure Engineer',
      roundName: 'Distributed Consensus Screen',
      roundType: 'technical_coding',
      scheduledAt: Date.now() + 86400000 * 2,
      durationMinutes: 60,
      interviewerName: 'Sarah Jenkins',
      status: 'upcoming',
    });

    let item = useInterviewScheduleStore.getState().interviews.find((i) => i.id === id);
    expect(item).toBeDefined();
    expect(item?.company).toBe('Stripe');
    expect(item?.status).toBe('upcoming');

    // Update meeting link
    useInterviewScheduleStore.getState().updateInterview(id, { meetingLink: 'https://zoom.us/j/123456' });
    item = useInterviewScheduleStore.getState().interviews.find((i) => i.id === id);
    expect(item?.meetingLink).toBe('https://zoom.us/j/123456');

    // Delete
    useInterviewScheduleStore.getState().deleteInterview(id);
    item = useInterviewScheduleStore.getState().interviews.find((i) => i.id === id);
    expect(item).toBeUndefined();
  });

  it('predicts accurate interview loops and questions for target company & stack', () => {
    const loop = predictInterviewLoop(
      'Anthropic',
      'Research Systems Engineer',
      'Python, Rust, distributed clusters, model weights streaming'
    );

    expect(loop.company).toBe('Anthropic');
    expect(loop.stages.length).toBeGreaterThanOrEqual(3);
    expect(loop.technicalQuestions.length).toBeGreaterThan(0);
    expect(loop.behavioralQuestions.length).toBeGreaterThan(0);
  });

  it('records post-interview debrief and updates round status to completed', () => {
    const store = useInterviewScheduleStore.getState();
    store.clearAll();

    const id = store.addInterview({
      jobId: 'job-datadog-1',
      company: 'Datadog',
      role: 'Staff Distributed Systems Engineer',
      roundName: 'Kafka Ingestion System Design',
      roundType: 'system_design',
      scheduledAt: Date.now() - 3600000,
      durationMinutes: 60,
      status: 'upcoming',
    });

    useInterviewScheduleStore.getState().saveDebrief(id, {
      completedAt: Date.now(),
      rating: 5,
      questionsAsked: ['Design high-throughput Kafka partition consumer with exactly-once delivery'],
      whatWentWell: 'Clear explanation of consumer group rebalance protocol and dead letter queues',
      areasToImprove: 'Deepen discussion on tiered storage compaction',
      followUpNoteDraft: 'Hi team, thank you for the engaging discussion on Kafka partitioning!',
    });

    const updated = useInterviewScheduleStore.getState().interviews.find((i) => i.id === id);
    expect(updated?.status).toBe('completed');
    expect(updated?.debrief).toBeDefined();
    expect(updated?.debrief?.rating).toBe(5);
    expect(updated?.debrief?.questionsAsked[0]).toContain('Kafka');
  });

  it('filters interviews by upcoming and completed correctly', () => {
    useInterviewScheduleStore.getState().resetToDemo();
    const all = useInterviewScheduleStore.getState().interviews;
    expect(all.length).toBeGreaterThanOrEqual(2);

    const upcoming = all.filter((i) => i.status === 'upcoming');
    const completed = all.filter((i) => i.status === 'completed');

    expect(upcoming.length).toBeGreaterThan(0);
    expect(completed.length).toBeGreaterThan(0);
    expect(upcoming.length + completed.length).toBe(all.length);
  });
});
