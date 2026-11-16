# LinkedIn Content Studio

CareerOps provides a local content workspace and a permission-gated connection to LinkedIn's official APIs.

## Drafting and review

- Preserves URLs and email addresses during cleanup.
- Preserves ZWNJ / ZWJ characters used in Indic scripts and emoji.
- Normalizes selected invisible formatting characters and typography.
- Applies the editable upstream plain-language lexicon and lists each replacement so the author can check for meaning changes.
- Reports structural patterns for manual review rather than blindly rewriting sentence structure.
- Calculates a local writing-quality heuristic using sentence variation, number/name markers, stock-language density, formatting artifacts and voice signals.
- Returns insufficient-sample status when the text is too short for meaningful scoring.
- Uses separate character-count targets for connection invite notes (200) and direct messages (300) in the CareerOps editor.

## Playbook Workbench

- Searchable library of 21 post-hook structures, including examples, best uses and common traps.
- A 12-part profile self-assessment rubric worth 100 points. Scores are entered by the user; the app does not inspect a live LinkedIn profile.
- A four-slot weekly content planner: proof, opinion, teaching and story / offer.

## Connected Account & API

Open **CareerOps > LinkedIn Studio > Connected Account & API**.

- Configure the HTTPS CareerOps cloud API origin and provide an OIDC bearer JWT from the deployment's identity provider.
- The bearer token is stored with Electron OS-backed secure storage. The renderer cannot read it; a narrow IPC allowlist sends authorized API calls from the Electron main process.
- Start LinkedIn OAuth in the system browser and complete the one-time, tenant-bound callback on the cloud API.
- View connection status, granted capability states and expiry; disconnect the member account when required.
- Publish member text posts, create member comments/reactions, and use approved organization Page operations through explicit buttons.
- Tenant owners can pause or resume the LinkedIn channel. Every write is independently checked against the global kill switch and channel pause by the cloud API.

The connection panel supports immediate user-triggered actions and optional, cloud-scheduled member text posts when the deployment enables the scheduler. LinkedIn invitations, direct messages and inbox reading stay disabled until the exact partner API permissions and implementation are available.

## Deployment

The cloud integration must be enabled and configured by the API operator with LinkedIn client credentials, an exact HTTPS redirect URI and an AWS KMS key. The LinkedIn developer application must have the appropriate product approvals and scopes. See [DEPLOYMENT.md](./DEPLOYMENT.md).

## Boundaries

Scores are deterministic writing heuristics, not a detector, authorship classifier, deliverability estimate, moderation prediction or guarantee about LinkedIn performance. A passing result does not prove authorship. The profile scorecard is a manual self-assessment, not a live profile audit. Verify every number, name, claim and anecdote. Never add fabricated metrics, clients, endorsements, credentials or personal stories to improve a score.

CareerOps does not scrape LinkedIn pages or inboxes, inject into the DOM, use Playwright against LinkedIn, or collect passwords, browser cookies, session tokens or browser profiles. Do not bypass LinkedIn approval gates using undocumented endpoints.
