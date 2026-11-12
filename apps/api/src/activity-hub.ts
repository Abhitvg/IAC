import type { ActivityFeedEvent } from '../../../packages/cloud-core/src/tracker';

type EventListener = (event: ActivityFeedEvent) => void;

/**
 * In-memory tenant-isolated event dispatcher for Server-Sent Events (SSE) streams.
 */
export class TenantActivityHub {
  private readonly listeners = new Map<string, Set<EventListener>>();

  /**
   * Subscribes a listener to events for a specific tenant.
   * Returns an unsubscribe function.
   */
  subscribe(tenantId: string, listener: EventListener): () => void {
    let tenantSet = this.listeners.get(tenantId);
    if (!tenantSet) {
      tenantSet = new Set();
      this.listeners.set(tenantId, tenantSet);
    }
    tenantSet.add(listener);

    return () => {
      tenantSet?.delete(listener);
      if (tenantSet?.size === 0) {
        this.listeners.delete(tenantId);
      }
    };
  }

  /**
   * Broadcasts an event strictly to subscribers of the event's tenant.
   */
  broadcast(event: ActivityFeedEvent): void {
    const tenantSet = this.listeners.get(event.tenantId);
    if (!tenantSet || tenantSet.size === 0) return;

    for (const listener of tenantSet) {
      try {
        listener(event);
      } catch {
        // Drop failed client deliveries safely without throwing
      }
    }
  }

  getListenerCount(tenantId: string): number {
    return this.listeners.get(tenantId)?.size ?? 0;
  }
}

export const globalActivityHub = new TenantActivityHub();

