# CareerOps LinkedIn Assist

CareerOps LinkedIn Assist is designed as a capability-complete, API-first integration. The product can expose the full workflow—profile import, content planning, publishing, engagement, inbox workflows, and connection workflows—while enabling each execution capability only when the connected LinkedIn application has the required approved product access and the member has granted the relevant OAuth scopes.

- `CAPABILITIES.md`: capability matrix, access tiers, and execution requirements.
- `hooks.json`: 21 post-hook formulas.
- `profile-rubric.json`: 12-part, 100-point profile review rubric.
- `humanizer/`: local text-cleanup and heuristic quality scripts.
- `humanizer/slop.json`: cleanup lexicon and character/typography rules.
- `LICENSE.upstream`: MIT attribution and license.

## Integration principles

- Use LinkedIn OAuth 2.0 and documented APIs only.
- Treat API product approval, granted OAuth scopes, member consent, organization role, and endpoint availability as separate checks.
- Show unavailable capabilities with a precise reason and an access-request path; do not silently hide them or pretend that user consent grants partner access.
- Support user-provided official exports for profile enrichment when API read access is unavailable.
- Never collect passwords, browser cookies, session tokens, or browser profiles; never scrape LinkedIn pages or use UI automation as an API fallback.
- Scheduled actions require explicit owner configuration, clear previews, pause/revoke controls, idempotency, and audit records.

This directory currently contains the content toolkit and integration policy. It does not yet constitute a production LinkedIn OAuth client or live publishing/messaging implementation.
