# LinkedIn Cloud Integration Deployment

This guide configures the official LinkedIn API integration in the CareerOps cloud API and desktop app. The API fails closed when the required secrets or KMS dependencies are missing.

## 1. LinkedIn Developer application

Create or use an approved LinkedIn developer application and configure the exact OAuth redirect URI:

`https://YOUR-CAREEROPS-API-HOST/oauth/linkedin/callback`

For member text publishing, request the **Share on LinkedIn** product and the `w_member_social` scope. The integration also requests OpenID Connect `openid`, `profile` and `email` so the cloud API can verify which member authorized the connection.

The app can request Community Management scopes only when the LinkedIn application has actually been approved for the corresponding Community Management API product. A requested scope is not proof of approval. The UI receives the deployment entitlement flags and shows unavailable capabilities with their reason.

Invitations, Messages and Communications APIs are partner-restricted. Keep their entitlement flags false unless LinkedIn has approved the exact application and use case. The repository does not provide a cookie, browser-session or scraping fallback.

## 2. Cloud environment

Set these variables on the API service:

| Variable                                 |    Required | Purpose                                                 |
| ---------------------------------------- | ----------: | ------------------------------------------------------- |
| `LINKEDIN_ENABLED`                       |         Yes | Set to `true` to compose the official integration       |
| `LINKEDIN_CLIENT_ID`                     |         Yes | LinkedIn developer application client ID                |
| `LINKEDIN_CLIENT_SECRET`                 |         Yes | LinkedIn client secret; server-side only                |
| `LINKEDIN_REDIRECT_URI`                  |         Yes | Exact HTTPS callback URI registered in the LinkedIn app |
| `LINKEDIN_API_VERSION`                   | Recommended | Versioned Marketing API header; default is `202610`     |
| `LINKEDIN_KMS_KEY_ID`                    |         Yes | AWS KMS symmetric key ID or ARN                         |
| `AWS_REGION`                             |         Yes | AWS region containing the KMS key                       |
| `LINKEDIN_COMMUNITY_MANAGEMENT_APPROVED` |          No | Set true only after approval                            |
| `LINKEDIN_COMMUNICATIONS_API_APPROVED`   |          No | Set true only after partner approval                    |
| `LINKEDIN_INVITATIONS_API_APPROVED`      |          No | Set true only after partner approval                    |
| `LINKEDIN_MESSAGES_API_APPROVED`         |          No | Set true only after partner approval                    |

The API also needs its normal CareerOps OIDC issuer, audience, JWKS URL, database URL and distinct signing / rate-limit secrets.

### AWS KMS role

The API service's IAM task role should have only these KMS actions on the configured key:

- `kms:GenerateDataKey`
- `kms:Decrypt`

The provider supports AWS environment credentials or ECS task-role credentials from the fixed ECS link-local credentials endpoint. Prefer the task role in production. There is no local-file or plaintext key fallback.

The token vault uses tenant-bound encryption context values for both generation and decryption. Changing tenant ID or purpose makes the wrapped data key unusable. Never reuse the KMS key as an application data key.

## 3. API and OAuth flow

The desktop app needs the HTTPS origin of the deployed API and an OIDC bearer JWT accepted by the API's configured identity provider. The desktop bridge stores that JWT with Electron OS-backed secure storage; it does not return the token to React.

1. In CareerOps > LinkedIn Studio > Connected Account & API, enter the API origin.
2. Provide the OIDC JWT issued by the deployment's identity provider and save it. The app validates the JWT shape locally; the API remains responsible for signature, issuer, audience and expiry verification.
3. Refresh status, then select **Connect / authorize**.
4. The cloud API creates a cryptographically random one-time state bound to the authenticated tenant and subject. The desktop opens the LinkedIn consent URL in the system browser.
5. LinkedIn redirects to the public `GET /oauth/linkedin/callback` route. That route consumes the state once, exchanges the code server-side, verifies member identity through OpenID Connect userinfo, and stores encrypted tokens. Access tokens are never placed in the callback page or returned to the renderer.
6. Return to the desktop app and refresh status.

The callback is rate-limited by IP and accepts no tenant ID, bearer token or browser session. Do not expose or log OAuth codes, state values, client secrets or access / refresh tokens.

## 4. Supported API actions

The Connected Account panel exposes explicit user-triggered operations:

- Member text posts through the versioned Posts API.
- Member comments and reactions when the Community Management API and member social feed write scope are available.
- Organization posts, comments and reactions only when the app has Community Management approval, the relevant organization scopes, and the member has the required Page role.
- Account status, disconnect and the tenant owner's LinkedIn pause control.
- Optional scheduled member text posts when `LINKEDIN_SCHEDULER_ENABLED=true`. The worker checks tenant membership, connection scopes, global kill switch and channel pause before the external write. Schedule creation is limited to 2 minutes–90 days ahead, and the UI shows statuses and allows cancellation while a post remains scheduled.

Every write is checked server-side against the tenant-wide kill switch and the `linkedin_assist` channel pause immediately before auditing and calling LinkedIn. Writes fail with HTTP 423 when either control blocks the channel. The cloud API records requested write actions in the tenant audit trail.

Refresh tokens are used only when LinkedIn returns one for the approved application. Otherwise, an expired access token requires the member to reconnect; the integration does not claim that all LinkedIn apps can refresh tokens.

## 5. Scheduled publishing and remaining limitations

Scheduled member text publishing is implemented but disabled by default. To enable it:

1. Apply `apps/api/migrations/0008_linkedin_scheduled_posts.sql` with the migration role. It creates a tenant/subject RLS table and narrowly scoped worker functions. The application role does not receive `BYPASSRLS` or membership in the no-login worker function role.
2. Set `LINKEDIN_SCHEDULER_ENABLED=true` on the API service and optionally configure `LINKEDIN_SCHEDULER_POLL_MS`.
3. Confirm the Share on LinkedIn product and `w_member_social` scope are approved and granted.
4. Run a staging schedule, pause the tenant, cancel a pending post, and test worker restart / ambiguous outcomes before enabling production traffic.

The queue supports text-only member posts. It does not retry ambiguous external outcomes: the row becomes `unknown_outcome` to avoid publishing duplicates. A worker outage that misses a scheduled time by over one hour results in `needs_review` rather than a late public post.

Media uploads, carousel creation, member feed / inbox reads, direct messages and connection invitations are not implemented. Some of these require additional API clients; others require partner approval. Their presence in the adapted skill pack does not grant LinkedIn API access.

No LinkedIn browser scraping, DOM injection, Playwright automation, session-cookie access, account-password collection or undocumented endpoint fallback is implemented.

## 6. Operational checks

Before enabling production traffic:

- Confirm the LinkedIn developer app's product approval and exact scopes.
- Confirm the callback URI exactly matches the registered redirect.
- Confirm the API task role can call KMS on the selected key.
- Verify tenant isolation, token encryption, audit writes and the tenant pause / kill switch in a staging environment.
- Test account disconnect and reconnection.
- Set Community Management and partner entitlement flags only from verified LinkedIn approval records.
- Monitor rate limits and reconnect-required errors without logging sensitive authorization values.
