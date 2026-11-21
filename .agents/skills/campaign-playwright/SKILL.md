---
name: campaign-playwright
description: Rehearse Campaign Rehearsal's Input to Arena to Verdict flow in a real browser and collect evidence of demo failures.
---

Use the repo's available Playwright tooling and the team-provided local app URL. For the CLI, use `playwright-cli` or, if npm tools are available and package downloads are allowed, `npx --package @playwright/cli playwright-cli`. Start with `open` and `snapshot`. Refresh the snapshot after navigation or major UI changes. If Playwright is unavailable, use the connected browser when available and name the tool used. See [OpenAI's Playwright skill](https://github.com/openai/skills/tree/main/skills/.curated/playwright) for CLI commands and tracing.

1. Paste the prepared brief. Check that extracted fields show source quotes and that simulation waits for explicit confirmation. Confirm the fields and start a run.
2. In the Arena, move the timeline and click a shopper. Verify that its segment, memory, events, and available explanation agree with the trace. Confirm that competitor actions display on the right days.
3. In the Verdict, verify scenario ranges, Plan A versus the strategist's plan, guardrails, profit and ROAS, and the back-test confidence and error. Compare suspicious values against the actual response when available.
4. Record the input mode (live, cached demo run, or fixture), pass or fail, and the first broken step. Capture a screenshot or trace for a failure when useful. If the app cannot run, report that the walkthrough was unavailable and why.
