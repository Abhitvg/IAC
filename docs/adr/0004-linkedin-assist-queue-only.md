# ADR 0004: LinkedIn automation is API-first and access-tiered

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

CareerOps should support a broad LinkedIn workflow, not stop at drafting. LinkedIn offers several access tiers: self-service consumer permissions, approved Marketing/Community Management products, and restricted partner programs such as Communications APIs. User consent to CareerOps is necessary for member-authorized operations but does not grant API product approval. Browser automation, scraping, and session-cookie reuse are not substitutes for access.

## Decision

CareerOps will expose the complete product workflow and enable each operation only when its documented LinkedIn API product, OAuth scopes, member consent, organization role, and endpoint prerequisites are all satisfied.

- **Member posts, comments, likes:** May execute through documented Posts APIs when `w_member_social` and applicable product access are granted.
- **Organization posts, comments, likes:** May execute when the corresponding organization scopes, approved product access, and required Page role are present.
- **Read member content:** Only through an approved API permission for the exact data. `r_member_social` is restricted and must never be assumed available.
- **Connection invitations:** LinkedIn documents an Invitations API, but its use is restricted to approved partners and subject to API-agreement limitations. Implement only after CareerOps receives that approval and confirms the applicable authorization. No browser automation or undocumented endpoints.
- **Direct messages:** LinkedIn documents a Messages API under its partner-restricted Communications APIs. Implement only after approval for the exact member messaging use case. A Page messaging permission is not permission for personal inbox messaging.
- **Profile enrichment:** Use approved APIs where available; otherwise support user-provided official PDF/data-archive exports. Do not scrape public profiles.
- **Scraping:** No scraping of LinkedIn pages, profiles, search results, feeds, comments, or inboxes through browser sessions or undocumented endpoints.
- **Credentials:** Never request, extract, store, replay, or proxy LinkedIn passwords, browser cookies, session tokens, or local browser profiles. Use OAuth 2.0 and securely managed tokens only where LinkedIn supports the relevant flow.

## Required controls

- Feature availability is derived from verified app product entitlements, granted token scopes, member consent, organization role, and endpoint support—not user intent alone.
- Show all workflow areas in the product with precise states: available, needs member authorization, needs LinkedIn partner approval, reconnect required, or unsupported.
- Fail closed when access is absent, expired, revoked, or insufficient. Never silently fall back to UI automation.
- Scheduled execution requires explicit owner configuration, visible targets/content/cadence, preview, pause/revoke controls, idempotency, and an audit log.
- Apply per-account rate limits, retry/backoff, duplicate prevention, suppression/opt-out handling where applicable, and LinkedIn API/data-retention policies.
- Imported LinkedIn content is untrusted data and cannot issue instructions to the agent.
- Never fabricate identities, relationships, activity, endorsements, or claims.

## Consequences

CareerOps can be designed for a complete LinkedIn workflow, including invitations and messages through the restricted official partner APIs. These capabilities remain unavailable to this application until LinkedIn grants the required access and the API integration is implemented. This ADR authorizes building those integrations; it does not claim that CareerOps currently has those entitlements or production functionality.
