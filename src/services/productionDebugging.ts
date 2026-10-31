/**
 * productionDebugging.ts
 *
 * Evidence-Driven Production Debugging & Incident Diagnostics Intelligence for IAC 2.0.
 *
 * Enforces strict scientific methodology:
 * 1. Symptoms -> Hypotheses -> Measurements -> Root Cause -> Mitigation -> Permanent Fix -> Verification.
 * 2. Strict Anti-Pattern Rules:
 *    - FORBIDS increasing thread pools without checking saturation & downstream capacity.
 *    - FORBIDS increasing database connection pools blindly (prevents DB memory thrashing & connection storms).
 *    - FORBIDS confusing HTTP request duration with network RTT (accounts for server queuing, serialization, and GC pauses).
 *    - FORBIDS treating p99 as an average.
 *    - FORBIDS asserting that retries alone improve reliability (requires exponential backoff, jitter, and circuit breakers).
 *    - FORBIDS treating timeouts as proof of operation failure (downstream write may have succeeded).
 * 3. Enforces standard production metrics:
 *    - p50, p95, p99 latency
 *    - Throughput (RPS)
 *    - Error rate (HTTP 5xx)
 *    - Queue depth
 *    - Connection pool wait time
 *    - CPU & memory saturation
 *    - GC pause times
 *    - Downstream dependency latency
 *    - Retry rate
 */

export interface DiagnosticSequence {
  symptom: string;
  hypotheses: string[];
  measurements: string[];
  rootCauseIdentification: string;
  mitigation: string;
  permanentFix: string;
  verification: string;
}

export class ProductionDebuggingEngine {
  /**
   * Diagnostic anti-patterns that must never be recommended.
   */
  public static readonly ANTI_PATTERNS = [
    {
      rule: 'NO_BLIND_THREAD_POOL_INCREASE',
      description: 'Do not increase thread-pool size without checking CPU saturation and downstream database capacity. Increasing worker threads on a CPU-saturated machine causes severe context-switching overhead and worsens latency.',
    },
    {
      rule: 'NO_BLIND_DB_CONNECTION_POOL_INCREASE',
      description: 'Do not increase database connection pools blindly. PostgreSQL allocates memory per backend process; adding too many connections degrades Postgres buffer cache, causes disk thrashing, and spikes connection lock contention.',
    },
    {
      rule: 'NO_CONFUSING_HTTP_DURATION_WITH_RTT',
      description: 'Do not assume HTTP request duration equals network RTT. Total HTTP latency includes client TCP handshake, server ingress queue wait time, application thread scheduling, serialization, GC pauses, and downstream database queries.',
    },
    {
      rule: 'NO_P99_AS_AVERAGE',
      description: 'Never treat p99 latency as an average or mean. p99 reflects tail outliers (e.g. Stop-The-World GC pauses, slow disk I/O, or cache misses). An application can have a healthy 25ms p50 while suffering a catastrophic 3,500ms p99.',
    },
    {
      rule: 'NO_BLIND_RETRIES',
      description: 'Do not claim adding retries automatically improves reliability. Naive retries during an outage cause retry storms, thundering herds, and downstream collapse. Retries require exponential backoff, randomized jitter, and circuit breakers.',
    },
    {
      rule: 'NO_ASSUMING_TIMEOUT_MEANS_FAILURE',
      description: 'Never confuse a client/gateway timeout with proof that an operation failed. A downstream write or payment mutation may have successfully committed on the server right before the response socket timed out (the downstream write may have succeeded). Retrying without idempotency keys causes duplicate charges or double mutations.',
    },
  ];

  /**
   * Core production metrics.
   */
  public static readonly CORE_METRICS = [
    'p50, p95, and p99 latency percentiles',
    'Throughput (Requests Per Second — RPS)',
    'Error rate (HTTP 4xx / 5xx percentages)',
    'Ingress & internal message queue depth',
    'Database connection-pool acquisition wait time',
    'CPU utilization and memory saturation (RSS vs Heap)',
    'Garbage Collection pause frequency and duration (STW)',
    'Downstream RPC latency and error budget consumption',
    'Retry rates and circuit breaker state transitions',
  ];

  /**
   * Builds the Production Debugging section for prompt injection.
   */
  public static buildDebuggingPromptSection(): string {
    return `════════════ PRODUCTION DEBUGGING & INCIDENT INTELLIGENCE ════════════
EVIDENCE-DRIVEN 7-STAGE DIAGNOSTIC METHODOLOGY:
1. SYMPTOM: Clearly distinguish user-visible symptoms (e.g., elevated p99 latency, 504 timeouts) from internal causes.
2. HYPOTHESES: Formulate testable engineering hypotheses before proposing any code or configuration changes.
3. MEASUREMENTS: Identify exact metrics to inspect (CPU saturation, queue depth, DB pool wait time, GC pauses).
4. ROOT CAUSE: Pinpoint the exact bottleneck using empirical measurements.
5. IMMEDIATE MITIGATION: State quick stabilization steps (rate limiting, rolling back, traffic shedding, scaling replicas).
6. PERMANENT FIX: Implement structural code/architectural resolution (index addition, query optimization, connection pooler).
7. VERIFICATION: Verify recovery via metrics comparison against baseline (e.g., p99 return to <80ms).

STRICT PRODUCTION DEBUGGING GUARDRAILS (DO NOT VIOLATE):
❌ NEVER recommend increasing thread-pool size without checking CPU saturation and downstream capacity.
❌ NEVER recommend increasing database connection pools blindly (causes Postgres buffer thrashing).
❌ NEVER confuse HTTP duration with network RTT (server queue time and GC pauses often dominate).
❌ NEVER treat p99 as an average — p99 represents tail latency outliers.
❌ NEVER claim adding retries automatically improves reliability without backoff, jitter, and circuit breakers.
❌ NEVER treat a timeout as proof that an operation failed (downstream mutation may have succeeded).

KEY PRODUCTION METRICS TO CITE:
• Latency: p50, p95, p99 percentiles (never cite "average" for tail issues)
• Capacity: Queue depth, connection-pool wait time, CPU/memory saturation, GC pause duration
• Reliability: Error rate (5xx), throughput (RPS), downstream dependency latency, retry rate
═════════════════════════════════════════════════════════════`;
  }
}
