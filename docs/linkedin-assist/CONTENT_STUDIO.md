# LinkedIn Content Studio

CareerOps now provides a local content-quality workspace for posts, comments, replies and DMs.

## Behavior
- Preserves URLs and email addresses while cleaning surrounding text.
- Normalizes selected invisible formatting characters and typography.
- Applies the vendored, editable plain-language lexicon.
- Reports structural patterns for manual review rather than blindly rewriting sentence structure.
- Scores readability, specificity signals, stock-language density, typography and voice.
- Returns unavailable scores for short samples instead of treating missing evidence as a failing or passing result.

## Boundaries
Scores are deterministic writing heuristics, not a detector, authorship classifier, deliverability estimate or guarantee about LinkedIn moderation. Specificity scoring is deliberately conservative and asks the author to verify concrete evidence. Never add fabricated metrics, anecdotes, endorsements or credentials to improve a score.

## Use
Open CareerOps > LinkedIn Studio. Select the content type, paste or write a draft, choose **Clean draft**, review the resulting text and flags, then copy it manually. This feature does not publish, comment, send DMs, scrape LinkedIn or access browser sessions.
