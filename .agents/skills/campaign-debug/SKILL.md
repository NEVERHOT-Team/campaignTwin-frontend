---
name: campaign-debug
description: Reproduce and isolate Campaign Rehearsal runtime errors, misleading metrics, and frontend or backend integration failures.
---

Reproduce the issue with the smallest available brief, fixture, scenario, or seed. Record the inputs needed to replay it, expected behavior, observed behavior, and the command or screen used. Distinguish mock, cached, and live runs.

Identify the first divergence across the UI, API schema, engine, data, or model output. Compare actual payloads with the [contract summary](../../../docs/contract-brief.md) and published schemas. Inspect the evidence before choosing a fix. Keep secrets and household records out of debugging output.

If asked to fix it, change the owner layer and rerun the original repro. Report the cause with evidence, the fix, and what remains unverified. If the issue cannot be reproduced, report the closest observation and missing inputs.
