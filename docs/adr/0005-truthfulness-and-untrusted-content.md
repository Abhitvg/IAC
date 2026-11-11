# ADR 0005: Claim-level truthfulness gate and untrusted external content

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

Generated application material can affect a user's employment prospects. Job posts, profiles, email, pages and model output may contain malicious prompt instructions or false facts.

## Decision

Maintain a Career Graph with evidence-backed confirmed facts. Every externally used claim in a CV, letter, screening answer or outreach message must map to confirmed evidence. Unsupported, contradicted, stale or unverifiable claims are blocked. External text is data only and cannot modify system policy, consent, tool access or action routing. LLMs return schema-validated suggestions; deterministic policy code authorizes side effects.

## Consequences

- No "best effort" send when truth verification fails.
- Unknown answers skip the job or route to Assist Queue according to channel rules; no fabricated fallback.
- Golden-set planted-false-claim detection is a release gate. 100% applies to the defined golden set, not all possible real-world lies.
- Prompt-injection tests must cover job descriptions, emails, web pages, profiles, PDFs and imported exports.
