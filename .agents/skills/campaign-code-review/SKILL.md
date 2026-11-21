---
name: campaign-code-review
description: Review Campaign Rehearsal changes for contract drift, misleading results, privacy issues, and demo regressions.
---

Review the actual diff and any changed contract against the [frozen summary](../../../docs/contract-brief.md) and published schema. Inspect the demonstrated behavior or existing check for any change to the demo path.

- For UI changes, check the confirmation gate, source quotes, fixture labels, and whether displayed metrics match the response.
- For API and simulation changes, check invalid output handling, privacy boundaries, cost accounting, seed pairing, and back-test holdout isolation as applicable.
- Lead with actionable findings, their impact, and file and line evidence. Distinguish observed failures from risks and state which checks ran. Keep review tasks read-only unless the user asks for fixes.
