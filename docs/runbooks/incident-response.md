# Incident Response Runbook

## 1. Severity Classification Matrix

| Level | Definition | Response SLA | Escalation / Alert |
| :--- | :--- | :--- | :--- |
| **P0 - Critical** | Data breach, unauthorized cross-tenant data access, uncontained runaway email loop, or widespread prompt-injection compromise. | **< 15 minutes** | On-call engineer, Security Lead, Engineering Director, Legal Counsel. |
| **P1 - Major** | Outage of primary workflow pipeline (Temporal scheduler halted, ATS submissions blocked, or provider webhook failure). | **< 30 minutes** | On-call engineer, Platform Lead. |
| **P2 - Moderate** | Degraded performance, single connector failure (e.g. Ashby ATS error spike), or individual tenant auto-pause failure. | **< 2 hours** | On-call engineer. |
| **P3 - Minor** | Non-blocking bug, UI cosmetic glitch, or isolated analytics query timeout. | Next business day | Sprint triage backlog. |

---

## 2. Immediate Containment Protocols

### 2.1 P0 Emergency Stop: Global Kill Switch
If an uncontained error loop or suspicious activity is detected, trigger the tenant global kill switch immediately:

```bash
# REST API Emergency Stop
curl -X POST https://api.careerops.internal/v1/tenant/controls/global-kill-switch \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "x-tenant-id: $AFFECTED_TENANT" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "reason": "P0 emergency containment invoked"}'
```
*Effect*: Instantly aborts all active Temporal workflows, freezes the outreach queue, and suspends all outbound network dispatch.

### 2.2 Channel-Specific Auto-Pause
To isolate a specific failing channel (e.g., email bounce spike or ATS connector malfunction):

```bash
curl -X POST https://api.careerops.internal/v1/tenant/controls/channel-pause \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "x-tenant-id: $AFFECTED_TENANT" \
  -H "Content-Type: application/json" \
  -d '{"channel": "email", "paused": true}'
```

### 2.3 Emergency Crypto-Shredding (Data Compromise)
If a tenant's database records or storage keys have been exposed:

```bash
curl -X POST https://api.careerops.internal/v1/privacy/crypto-shred \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "x-tenant-id: $AFFECTED_TENANT" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Emergency security compromise containment"}'
```
*Effect*: Overwrites the tenant's AES-256 DEK buffer in memory and storage with zeroes, rendering all tenant ciphertext mathematically unrecoverable.

---

## 3. Investigation & Evidence Collection
1. **Request Tracking**: Every request carries an `x-request-id`. Trace request IDs in structured logs to reconstruct call stacks.
2. **Audit Hash Chain**: Query `/v1/tenant/audit-log` to verify actor identity, timestamps, and ensure cryptographic hash chain integrity (`eventHash === sha256(...)`).
3. **Temporal Workflow Inspection**: Inspect workflow histories in Temporal Web UI (`/namespaces/careerops/workflows/sprint-{tenantId}`) for activity execution logs and failure payloads.

---

## 4. Post-Incident Review (PIR)
Within 48 hours of resolving any P0 or P1 incident, the team must complete a blameless post-mortem covering:
1. Root Cause Summary (5 Whys).
2. Timeline of events (Detection, Escalation, Containment, Recovery).
3. Impact Assessment (Number of affected tenants, emails sent, data exposure).
4. Corrective Action Items (Assigned owner, target deployment date).
