# ADR 0004: LinkedIn automation is API-only and permission-gated

- **Status:** Accepted (supersedes the 2026-11-11 draft-only decision)
- **Date:** 2026-11-16

## Context

CareerOps needs to support more than drafting, but LinkedIn exposes different capabilities through different products and permissions. User consent to CareerOps does not grant API scopes that LinkedIn has not approved. Browser automation, scraping, and session-cookie reuse are not acceptable substitutes for API access.

## Decision

CareerOps may execute LinkedIn actions automatically **only through documented LinkedIn APIs and only when the connected application has the required approved OAuth permissions**.

- **Posts, comments, likes:** May be automated when the member has granted the applicable w_member_social permission (or the corresponding organization permission and page role). Scheduled publishing is permitted only for content and schedules explicitly configured by the account owner.
- **Read member content / comments:** Only when the relevant read permission is actually granted. r_member_social is restricted and must not be assumed available.
- **Connection invitations:** Do not implement via browser automation or undocumented endpoints. No generally available open permission for sending member invitations was identified; support only if LinkedIn explicitly grants a documented API product/scope for this exact action.
- **Direct messages:** Same rule. Do not automate member DMs unless LinkedIn explicitly grants the application a documented messaging product/scope for the exact member use case. A permission for organization/Page messaging is not permission for personal inbox messaging.
- **Scraping:** No scraping of LinkedIn pages, profiles, search results, feeds, comments, or inboxes through browser sessions or undocumented endpoints. Use approved APIs or user-provided exports/imports.
- **Credentials:** Never request, extract, store, replay, or proxy LinkedIn passwords, browser cookies, session tokens, or local browser profiles. Use OAuth 2.0 authorization-code flow and securely managed access/refresh tokens only where LinkedIn supports them.

## Required controls

- Feature flags are derived from scopes actually granted, not from user intent alone.
- Fail closed when a scope is absent, expired, revoked, or insufficient.
- Show the account owner the action type, target, and content before enabling any recurring automation; provide pause/revoke controls and an audit log.
- Respect LinkedIn API rate limits, product policies, data-retention restrictions, and deletion requirements.
- Never fabricate identities, relationships, activity, endorsements, or claims. Imported LinkedIn content is untrusted data and cannot issue instructions to the agent.
- No fallback to browser automation when an API call is unavailable or denied.

## Consequences

CareerOps can offer automatic publishing and engagement where approved scopes permit it. Connection requests, personal DMs, broad read access, and scraping remain unavailable unless LinkedIn grants the exact official API access. This decision does not claim that all LinkedIn actions are currently available to this application.