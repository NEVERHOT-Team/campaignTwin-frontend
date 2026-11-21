# CampaignTwin frontend

A React, TypeScript and Vite workspace for planning a campaign, rehearsing it and reviewing the evidence. The Plan screen pairs a conversation with an editable form. The Arena offers an isometric market, the original top-down pixel map and a workflow diagram. All three share the selected scenario and plan.

## Run the connected workspace

The Vercel build can publish a working browser demo before the API is hosted. Set `VITE_API_BASE_URL` to the public FastAPI origin and redeploy to enable the connected planner. [Publish the frontend and connect the backend](docs/vercel-deployment.md)

Use the sibling CampaignTwin backend on the `dev` branch with the v1 Arena service. With its Python environment active, run the following in the backend checkout.

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

### Rehearse a campaign

Open the connected site and choose **Use sample brief** in chat or **Fill sample fields** in the form. Confirm the suggested values or edit the requested field directly. Approve the exact revision to open the Arena, then choose **View verdict**. **Open shopper replay** opens a separate animated example. **Back to planner** restores the evaluated run. [Arena integration contract](docs/backend-v1-handoff.md)

### Optional v2 seller decision

Select **Debug v2** in the top right or open `/?mode=seller` with a backend started through `api.v2.app:app`.

1. Open the connected site's root. Select **Fill demo**, inspect the decision inputs, and choose **Create review**. Approve the revision and start the simulation.
2. The example uses a ฿2 fee per kept order and a minimum contribution of ฿32 per redeemed pack. **Revise** identifies an eligible alternative. Its ฿5 voucher leaves ฿33 per redeemed pack.
3. Choose **Edit order fee**, enter **7**, save the revision, then approve and run again. **Hold** shows why the same alternative now falls short at ฿28 per redeemed pack.
4. Under **Approved evidence**, switch between the two approvals and inspect a saved settlement by plan, scenario and seed. Use the contribution check to explain the recommendation and the order count and fee line to audit what the seller paid.

## Use the offline demo

**Demo arena** opens an independent synthetic rehearsal. Click a shopper on the market floor, inspect a switcher or search by ID. Choose a rival scenario at the top of the page. Use **2D map** for an overhead view, or **Workflow** to jump to the next checkpoint. The map and inspector show purchases by group for the selected day. A shopper who skipped a purchase can still prefer a brand. The trend chart measures that preference across the full sample, and the Arena identifies the subset of non-buyers waiting for a promotion. Open the Verdict to compare the median and downside, repeat-purchase rate and goal attainment. Use **Back to planner** to return to the connected review. A direct link to the sample Arena is `/?mode=demo&view=arena`.

```sh
npm test
npm run build
npm run build:demo
```

The production site is in `dist/`. The self-contained `dist-demo/CampaignTwin.html` opens directly in a browser with no server and no network assets. Its sample Plan, Arena and Verdict use the local multipack fixture. The connected seller planner uses the v2 API and saved ledgers. The connected Arena uses the v1 API. To exercise the fee integration test locally, run `V2_TEST_ORIGIN=http://127.0.0.1:8000 npm test` against a disposable combined backend. The test creates two approvals and runs. [UI verification](docs/ui-audit.md)

The editable Blender model includes both orthographic cameras. The browser combines their rendered views with depth maps and animated shopper portraits. Node and Vite build the site directly from the committed assets. [Open the Blender model](art/Market-square.blend) · [Rebuild the artwork](src/isometric/build_market.py)
