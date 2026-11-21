# Campaign Rehearsal frontend

- Phee owns the frontend. Build the Input, Arena, and Verdict screens from the team's approved mockup with React, Vite, Tailwind, and Recharts.
- Before coding opens at 10:00 Bangkok time on 21 November 2026, prepare specs, decisions, and prompts only.
- Start integration work with [the frozen contract summary](docs/contract-brief.md). Once available, check the backend's published schemas or OpenAPI at the agreed revision. Raise a proposed field change with Big and Phee before either side implements it.
- Require human confirmation of AI-extracted inputs before using them. Show the source quote for each extracted value. Identify fixture and live results clearly.
- Present scenario ranges, profit after costs next to ROAS, brand outcomes, assumptions, and the backend's confidence label. Treat the three demo proofs as the priority: scenario stress test, strategist comparison, and held-out back-test.
- Use `$campaign-ui` for screen and integration work and `$campaign-playwright` for the demo walkthrough. Use `$campaign-debug` and `$campaign-code-review` for diagnosis and review.
- Delegate frontend work to `frontend_ui` when delegation is requested. Record what Codex built and the verification evidence for the team log.
