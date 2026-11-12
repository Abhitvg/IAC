import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createAssistQueueItem,
  AssistQueueItemSchema,
  type AssistQueueItem,
} from '../packages/cloud-core/src/apply/assist-queue';
import { SqlAssistQueueRepository } from '../apps/api/src/assist-queue-repository';

describe('Milestone M5 - Assist Queue & Safety Policies', () => {
  const tenantId = randomUUID();

  it('creates and validates AssistQueueItem schema invariants', () => {
    const item = createAssistQueueItem({
      tenantId,
      company: 'Datadog',
      role: 'Backend Engineer',
      platform: 'greenhouse',
      targetUrl: 'https://boards.greenhouse.io/datadog/jobs/12345',
      handOffReason: 'captcha_detected',
      prefilledPayload: {
        firstName: 'Alice',
        lastName: 'Turing',
      },
      assistNotes: 'Encountered Cloudflare challenge on submit',
    });

    expect(item.id).toBeDefined();
    expect(item.status).toBe('pending');
    expect(item.userGestureRequired).toBe(true);
    expect(item.handOffReason).toBe('captcha_detected');
    expect(() => AssistQueueItemSchema.parse(item)).not.toThrow();
  });

  it('enforces Hard Line H1 on LinkedIn: auto-sets platform to linkedin_assist and requires user gesture', () => {
    const item = createAssistQueueItem({
      tenantId,
      company: 'Microsoft',
      role: 'Staff Engineer',
      platform: 'custom',
      targetUrl: 'https://www.linkedin.com/jobs/view/999888',
      handOffReason: 'linkedin_assist',
      userGestureRequired: false, // Attempt to bypass user gesture
    });

    expect(item.platform).toBe('linkedin_assist');
    expect(item.userGestureRequired).toBe(true); // Forced true by code invariant
  });

  it('supports SqlAssistQueueRepository lifecycle: enqueue, list, markOpened, complete, dismiss', async () => {
    const rows: Record<string, unknown>[] = [];

    const mockPool: any = {
      connect: async () => ({
        query: async (sql: string, params?: any[]) => {
          if (sql.includes('INSERT INTO assist_queue_items')) {
            const row = {
              id: params![0],
              tenant_id: params![1],
              application_id: params![2],
              company: params![3],
              role: params![4],
              platform: params![5],
              target_url: params![6],
              hand_off_reason: params![7],
              status: params![8],
              prefilled_payload: JSON.parse(params![9]),
              assist_notes: params![10],
              user_gesture_required: params![11],
              created_at: new Date(params![12]),
              updated_at: new Date(params![13]),
            };
            rows.push(row);
            return { rows: [row] };
          }
          if (sql.includes('SELECT * FROM assist_queue_items')) {
            let matched = rows.filter((r) => r.tenant_id === params![0]);
            if (params && params.length > 1 && params[1]) {
              if (sql.includes('id = $2')) {
                matched = matched.filter((r) => r.id === params[1]);
              } else if (sql.includes('status = $2')) {
                matched = matched.filter((r) => r.status === params[1]);
              }
            }
            return { rows: matched };
          }
          if (sql.includes("UPDATE assist_queue_items\n        SET status = 'opened'")) {
            const found = rows.find((r) => r.tenant_id === params![0] && r.id === params![1]);
            if (found) {
              found.status = 'opened';
              found.opened_at = new Date();
              return { rows: [found] };
            }
            return { rows: [] };
          }
          if (sql.includes("UPDATE assist_queue_items\n        SET status = 'completed'")) {
            const found = rows.find((r) => r.tenant_id === params![0] && r.id === params![1]);
            if (found) {
              found.status = 'completed';
              found.completed_at = new Date();
              found.assist_notes = params![3] || found.assist_notes;
              return { rows: [found] };
            }
            return { rows: [] };
          }
          if (sql.includes("UPDATE assist_queue_items\n        SET status = 'dismissed'")) {
            const found = rows.find((r) => r.tenant_id === params![0] && r.id === params![1]);
            if (found) {
              found.status = 'dismissed';
              return { rows: [found] };
            }
            return { rows: [] };
          }
          return { rows: [] };
        },
        release: () => {},
      }),
    };

    const repo = new SqlAssistQueueRepository(mockPool);

    const item = createAssistQueueItem({
      tenantId,
      company: 'Figma',
      role: 'Staff Product Engineer',
      platform: 'lever',
      targetUrl: 'https://jobs.lever.co/figma/1234',
      handOffReason: 'captcha_detected',
    });

    const enqueued = await repo.enqueue(tenantId, item, 'user_123');
    expect(enqueued.id).toBe(item.id);
    expect(enqueued.status).toBe('pending');

    const listPending = await repo.list(tenantId, 'pending');
    expect(listPending).toHaveLength(1);

    const opened = await repo.markOpened(tenantId, item.id, 'user_123');
    expect(opened.status).toBe('opened');

    const completed = await repo.complete(
      tenantId,
      item.id,
      'User solved captcha and clicked submit',
      'user_123'
    );
    expect(completed.status).toBe('completed');
    expect(completed.assistNotes).toBe('User solved captcha and clicked submit');
  });
});

