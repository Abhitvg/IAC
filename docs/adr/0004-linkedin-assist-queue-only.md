# ADR 0004: LinkedIn is limited to official identity, imports and user-gesture Assist Queue

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

Unattended LinkedIn activity, scraping and credential/session-cookie collection are disallowed by the product's hard constraints and create material platform and account risk.

## Decision

Support official OAuth/OpenID sign-in/basic profile, user-uploaded LinkedIn data export, profile optimization guidance and ranked Assist Queue preparation. The extension performs no LinkedIn action unless the user explicitly gestures in their own browser for that single action. No LinkedIn passwords or session cookies are stored or used server-side.

## Consequences

- No server-side LinkedIn scraper, Playwright flows, connection/message sender, profile visitor or auto-like.
- Assist Queue is a prepared-action UI; every action is user initiated and individually confirmed.
- Extension permissions are minimized and tests assert that unattended LinkedIn side effects cannot occur.
