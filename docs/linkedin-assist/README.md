# CareerOps LinkedIn Assist

CareerOps LinkedIn Assist is an API-first LinkedIn integration and content toolkit. It is designed
to expose the full workflow while enabling each execution capability only when the connected
LinkedIn application has the required product access and the member has granted the relevant OAuth
scopes.

## Included

- `CAPABILITIES.md`: capability map, access tiers, and implementation status.
- `DEPLOYMENT.md`: cloud configuration, AWS KMS permissions, LinkedIn OAuth setup and operational checks.
- `hooks.json`: searchable 21-formula post-hook library in the Playbook Workbench.
- `profile-rubric.json`: 12-part, 100-point user-scored profile self-assessment.
- Playbook Workbench: four-slot weekly content planner for proof, opinion, teaching and story / offer.
- `humanizer/`: local text-cleanup and heuristic quality scripts.
- `humanizer/slop.json`: cleanup lexicon and character / typography rules.
- LinkedIn Studio: separate 200-character connection-invite and 300-character DM targets, plus explicit lexical replacement review.
- `LICENSE.upstream`: MIT attribution and license.
- `../../apps/api/src/linkedin/`: OAuth, API client, encrypted persistence, and composition
  factory.
- `../../apps/api/migrations/0006_linkedin_oauth.sql` and `0007_linkedin_oauth_callback.sql`: tenant-isolated OAuth state, encrypted connections and one-time public callback consumption.

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

The API entry point now composes the LinkedIn cloud integration when `LINKEDIN_ENABLED=true` and the required client, callback, AWS region and KMS key configuration is present. When disabled or misconfigured, LinkedIn routes fail closed rather than storing tokens insecurely.

The OAuth browser redirect is handled by the public, one-time-state route `GET /oauth/linkedin/callback`. The callback does not require the desktop OIDC bearer token because the 256-bit state is bound server-side to the authenticated tenant/member when OAuth starts. The token exchange and OpenID Connect identity check remain server-side; access and refresh tokens are persisted through the tenant envelope cipher backed by AWS KMS.

## Security boundaries

- OAuth 2.0 only; tokens are encrypted with the tenant envelope cipher before database persistence.
- No LinkedIn password, browser cookie, session token, or local browser profile collection.
- No page scraping, DOM injection, Playwright, or undocumented endpoint fallback.
- Restricted partner features remain unavailable until the exact LinkedIn product access is approved
  and their API clients are implemented.
- The desktop app stores its CareerOps cloud OIDC bearer token using Electron OS-backed secure storage. A narrow IPC bridge limits requests to documented LinkedIn and tenant-control routes; the token never crosses to renderer code.
- All LinkedIn write routes check the tenant-wide kill switch and the `linkedin_assist` channel pause before recording and executing the action.
- The Connected Account panel exposes explicit member post, comment and reaction actions and approved organization Page actions. There is no background scheduler, automatic commenting, invitation sender, DM sender or inbox reader in the current build.

The integration must be validated against an approved LinkedIn developer application before
production use.
