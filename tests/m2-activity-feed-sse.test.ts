import { describe, expect, it } from 'vitest';
import { TenantActivityHub } from '../apps/api/src/activity-hub';
import type { ActivityFeedEvent } from '../packages/cloud-core/src/tracker';

describe('M2: Real-time Activity Feed SSE Hub', () => {
  const tenantA = '10000000-0000-4000-8000-000000000001';
  const tenantB = '10000000-0000-4000-8000-000000000002';

  it('broadcasts events strictly to listeners of the matching tenant', () => {
    const hub = new TenantActivityHub();

    const receivedA: ActivityFeedEvent[] = [];
    const receivedB: ActivityFeedEvent[] = [];

    const unsubscribeA = hub.subscribe(tenantA, (e) => receivedA.push(e));
    const unsubscribeB = hub.subscribe(tenantB, (e) => receivedB.push(e));

    const eventForA: ActivityFeedEvent = {
      id: 'evt-1',
      tenantId: tenantA,
      eventType: 'application.created',
      severity: 'info',
      title: 'Application Created',
      description: 'Submitted to Stripe',
      actorSubject: 'candidate:alice',
      metadata: {},
      createdAt: '2026-11-12T00:00:00.000Z',
    };

    const eventForB: ActivityFeedEvent = {
      id: 'evt-2',
      tenantId: tenantB,
      eventType: 'application.status_changed',
      severity: 'success',
      title: 'Interview Scheduled',
      description: 'Interview at Google',
      actorSubject: 'candidate:bob',
      metadata: {},
      createdAt: '2026-11-12T00:01:00.000Z',
    };

    hub.broadcast(eventForA);
    hub.broadcast(eventForB);

    expect(receivedA).toHaveLength(1);
    expect(receivedA[0].id).toBe('evt-1');

    expect(receivedB).toHaveLength(1);
    expect(receivedB[0].id).toBe('evt-2');

    // Clean up
    unsubscribeA();
    unsubscribeB();
    expect(hub.getListenerCount(tenantA)).toBe(0);
    expect(hub.getListenerCount(tenantB)).toBe(0);
  });

  it('unsubscribes listeners cleanly and does not leak callbacks', () => {
    const hub = new TenantActivityHub();
    const received: ActivityFeedEvent[] = [];

    const unsubscribe = hub.subscribe(tenantA, (e) => received.push(e));
    expect(hub.getListenerCount(tenantA)).toBe(1);

    hub.broadcast({
      id: 'evt-1',
      tenantId: tenantA,
      eventType: 'test',
      severity: 'info',
      title: 'Test',
      description: 'Test',
      actorSubject: 'user',
      metadata: {},
      createdAt: '2026-11-12T00:00:00.000Z',
    });

    expect(received).toHaveLength(1);

    unsubscribe();
    expect(hub.getListenerCount(tenantA)).toBe(0);

    hub.broadcast({
      id: 'evt-2',
      tenantId: tenantA,
      eventType: 'test-after-unsub',
      severity: 'info',
      title: 'Test',
      description: 'Test',
      actorSubject: 'user',
      metadata: {},
      createdAt: '2026-11-12T00:01:00.000Z',
    });

    expect(received).toHaveLength(1); // No new events delivered
  });
});
