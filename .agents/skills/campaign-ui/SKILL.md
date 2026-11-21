---
name: campaign-ui
description: Build or review Campaign Rehearsal's Input, Arena, and Verdict screens against the approved mockup and frozen API contracts.
---

Open the team's approved mockup and the repo's [contract summary](../../../docs/contract-brief.md). Locate the published backend schema or a team-approved fixture before binding a field. If the mockup or schema is unavailable, name what is missing and continue with the parts that have a source.

- **Input:** Keep the brief and the editable form side by side. Display source quotes for extracted values and require explicit confirmation before simulation. Editing a previously confirmed extracted value should require confirmation of the new value. Expose missing required values and request errors clearly.
- **Arena:** Bind the day, brand preference, competitor moves, and shopper panel to the corresponding result or trace. Identify simulated shoppers as such. If a shopper trace or explanation is unavailable, show that state. Base the Strategist panel's copy on the provided summaries and change reasons.
- **Verdict:** Show P10/P50/P90 profit after costs, ROAS, and brand attitude with the guardrails, scenario comparison, and back-test evidence. Use the backend's units, assumptions, and confidence. Keep calibration evidence scoped to the held-out campaign.

Keep fixture mode explicit throughout the flow. Test loading, failure, and unavailable states for the changed screen. For the complete demo, use the repo's `campaign-playwright` skill.
