# CampaignTwin frontend

A React, TypeScript and Vite workspace for planning a campaign, rehearsing it and reviewing the evidence. The Plan screen pairs a conversation with an editable form. The Arena restores the top-down market from the original pixel prototype. The interface uses matte neutral surfaces, system typography and text controls.

## Run the connected workspace

Use the sibling CampaignTwin backend on the `dev` branch with the implemented v1 review workflow. With its Python environment active, run the following in the backend checkout.

```sh
python -m pip install -e .
python -m uvicorn main:app --port 8000
```

In this frontend directory, use a Node version supported by Vite 7 (20.19+ or 22.12+).

```sh
npm ci
npm run dev
```

Open the URL printed by Vite on the computer running it. Vite forwards `/api` to `http://127.0.0.1:8000`. A separately hosted frontend can set `VITE_API_BASE_URL` to the API origin at build time and use the backend’s CORS configuration. Keep provider keys on the server.

1. Start a chat or enter planner fields. **Use sample brief** pre-fills an editable example for the supported synthetic product. **Send** submits the brief or replies to a follow-up question.
2. Review suggestions and source quotes, correct or confirm the intended values, and check the assumptions. Explicitly approve the exact revision to start a run.
3. Read the evaluated comparisons in the Arena. Open **View verdict** for the evaluator’s decision and scenario evidence. The service returns aggregate results. The live market illustration therefore shows no individual shoppers.

The backend owns the exact catalog match, cost basis, evaluation settings and results. The handoff describes the planner’s inputs, system-provided evidence, error handling, and the implemented wire contract. [Backend integration handoff](docs/backend-v1-handoff.md)

## Use the offline demo

**Demo arena** opens an independent synthetic rehearsal. Click a shopper on the market floor, inspect a switcher or search by ID. Choose a plan, move the timeline, or compare with the baseline overlay. Use **Back to planner** to return to the connected review. A direct link to the sample Arena is `/?mode=demo&view=arena`.

```sh
npm run build
npm run build:demo
```

The production site is in `dist/`. The self-contained `dist-demo/CampaignTwin.html` opens directly in a browser with no server and no network assets. Its sample Plan, Arena and Verdict use the local multipack fixture. The connected site uses Big’s v1 API and its own catalog and economics. [UI verification](docs/ui-audit.md)
