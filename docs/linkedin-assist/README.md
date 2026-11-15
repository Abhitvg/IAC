# CareerOps LinkedIn Assist

CareerOps LinkedIn Assist is an API-first LinkedIn integration and content toolkit. It is designed
to expose the full workflow while enabling each execution capability only when the connected
LinkedIn application has the required product access and the member has granted the relevant OAuth
scopes.

## Included

- `CAPABILITIES.md`: capability map, access tiers, and implementation status.
- `hooks.json`: 21 post-hook formulas.
- `profile-rubric.json`: 12-part, 100-point profile review rubric.
- `humanizer/`: local text-cleanup and heuristic quality scripts.
- `humanizer/slop.json`: cleanup lexicon and character / typography rules.
- `LICENSE.upstream`: MIT attribution and license.
- `../../apps/api/src/linkedin/`: OAuth, API client, encrypted persistence, and composition
  factory.
- `../../apps/api/migrations/0006_linkedin_oauth.sql`: tenant-isolated OAuth state and connection
  tables.

## Cloud API

When a deployment injects a KMS-backed `LinkedInCloudIntegration` into the cloud runtime, these
authenticated routes are available:

- `GET /v1/linkedin/status`
- `POST /v1/linkedin/oauth/start`
- `POST /v1/linkedin/oauth/callback`
- `DELETE /v1/linkedin/connection`
- `POST /v1/linkedin/posts`
- `POST /v1/linkedin/comments`
- `POST /v1/linkedin/reactions`
- `DELETE /v1/linkedin/reactions?entityUrn=...`
- `POST /v1/linkedin/organization/posts`
- `POST /v1/linkedin/organization/comments`
- `POST /v1/linkedin/organization/reactions`
- `DELETE /v1/linkedin/organization/reactions?organizationUrn=...&entityUrn=...`

The current cloud executable does not yet instantiate a KMS provider or configure LinkedIn
credentials. Until deployment supplies those dependencies, LinkedIn routes intentionally return
HTTP 503 rather than storing tokens insecurely or pretending the integration is active.

## Security boundaries

- OAuth 2.0 only; tokens are encrypted with the tenant envelope cipher before database persistence.
- No LinkedIn password, browser cookie, session token, or local browser profile collection.
- No page scraping, DOM injection, Playwright, or undocumented endpoint fallback.
- Restricted partner features remain unavailable until the exact LinkedIn product access is approved
  and their API clients are implemented.
- Scheduled and unattended actions require owner configuration, clear auditability, pause / revoke
  controls, and duplicate prevention before they are enabled.

The integration must be validated against an approved LinkedIn developer application before
production use.
