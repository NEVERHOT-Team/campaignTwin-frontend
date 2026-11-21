# Deploy CampaignTwin

Deploy the frontend repository to Vercel to get a shareable Plan → Arena → Verdict demo. It runs on synthetic data in the browser and needs no API account or keys. When Big has an HTTPS API with the versioned planner endpoints, you can connect the same frontend to it.

## 1. Publish the frontend on Vercel

1. Sign in to Vercel, select the team that should own the site, and choose **Add New → Project**. Under **Import Git Repository**, select **NEVERHOT-Team/campaignTwin-frontend**. If the repo is missing, grant the Vercel GitHub App access to it in the NEVERHOT-Team organization. [Vercel project import](https://vercel.com/new)
2. Use the repository root for **Root Directory**. Select **Vite** and Node.js **22.x**. Leave the build and output overrides off so the checked-in [vercel.json](../vercel.json) supplies the hosted build command and the `dist` output directory. Vercel can install the npm dependencies using the checked-in lockfile. [Vercel’s Vite settings](https://vercel.com/docs/frameworks/frontend/vite)
3. For the browser-only demo, leave `VITE_API_BASE_URL` unset. Click **Deploy**. Once ready, open the assigned domain. In the project's **Settings → Environments → Production**, verify that the tracked branch is **main**. Pushes to that branch update production. Pull requests and pushes to other tracked branches receive preview deployments. [Vercel Git deployments](https://vercel.com/docs/deployments/git)
4. On the site, choose **Use sample brief**, send it, confirm the quoted fields, select **Review campaign**, approve the selected plans, and start the simulation. Open the Verdict from Arena. For a direct rehearsal walkthrough, append `/?mode=demo&view=arena` to the frontend origin.
5. To share the demo, copy the project's **production domain** and open it in a private browser window while signed out of Vercel. If it asks the viewer to sign in, review the project's deployment protection for that domain. [Vercel deployment protection](https://vercel.com/docs/deployment-protection)

## 2. Get an HTTPS API origin

If the backend team already operates an API, obtain its public origin and proceed to step 3. The backend's `dev` revision [0c3e6a2](https://github.com/NEVERHOT-Team/campaignTwin-backend/tree/0c3e6a2d6b08a6835e948a3aec156b35e77047fc) includes the runnable planner, report, historical comparison, and synthetic catalog. The repository documents local startup and supplies no hosted API address.

For a new service, one supported layout is a **Render Python web service** for the separate **campaignTwin-backend** repo and a **Render Postgres** database in the same region. A regular Python service can install the backend's NumPy, pandas, PyArrow, and scikit-learn dependencies and run the existing FastAPI entry point. [Render’s FastAPI guide](https://render.com/docs/deploy-fastapi) · [Render Postgres connections](https://render.com/docs/postgresql-creating-connecting)

1. Create the PostgreSQL database in Render. From a backend checkout on a machine that can reach the database, set the shell's `DATABASE_URL` to its connection string. Use the internal URL on Render's private network or the external URL from your own machine. Apply the repository's schema once with the PostgreSQL client:

   ```sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/init.sql
   ```

   The script creates the `rehearsal_workspace` table used to save reviews, approvals, and v1 runs. It also works on an existing database that already contains the earlier run tables. [Backend schema](https://github.com/NEVERHOT-Team/campaignTwin-backend/blob/0c3e6a2d6b08a6835e948a3aec156b35e77047fc/db/init.sql)
2. Create **New → Web Service** in Render. Connect **NEVERHOT-Team/campaignTwin-backend**, select **dev** (or a release containing the v1 workflow), and use the repository root. Set the language to **Python 3**, select a supported Python 3.11+ patch, and enter these settings. [Render Python version configuration](https://render.com/docs/python-version)

   | Setting | Value |
   | --- | --- |
   | Build command | `python -m pip install -e .` |
   | Start command | `python -m uvicorn main:app --host 0.0.0.0 --port "$PORT"` |
   | Health check path | `/api/health` |
   | `DB_MODE` | `postgres` |
   | `DATABASE_URL` | Database's **internal connection URL** |

   The backend defaults to local JSON files if `DB_MODE` is omitted. PostgreSQL retains the rehearsal workspace across service restarts and deploys. The bundled synthetic interview works without an OpenAI key. For a provider-backed interview, set `OPENAI_API_KEY` on the API service. Keep database credentials and model keys exclusively on the server. [Backend setup](https://github.com/NEVERHOT-Team/campaignTwin-backend/blob/0c3e6a2d6b08a6835e948a3aec156b35e77047fc/README.md)
3. Deploy the service. Copy its public **HTTPS origin** from the dashboard. A health request should return `{"ok":true,"db_mode":"postgres"}`. Also check that the running service publishes the v1 review and run-report paths. In a shell, set `API_ORIGIN` to the copied origin and run:

   ```sh
   curl -fsS "$API_ORIGIN/api/health"
   curl -fsS "$API_ORIGIN/openapi.json" | python -c 'import json, sys; p = json.load(sys.stdin)["paths"]; assert "post" in p["/api/v1/campaign-reviews"]; assert "get" in p["/api/v1/runs/{run_id}/report"]; print("Planner and report routes present")'
   ```

## 3. Connect the site and verify a full run

1. In Vercel **Project Settings → Environment Variables**, add `VITE_API_BASE_URL`. Paste the public API origin, including `https://`, with no trailing path such as `/api` or `/api/v1`. Select **Production** and any **Preview** environments that should call it. Leave it unset for previews where you want the browser demo. Vite embeds this value in the browser bundle. [Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables)
2. Check the frontend origin accepted by FastAPI. The audited backend revision already accepts HTTPS hosts matching `[a-z0-9-]+.vercel.app`, including standard Vercel preview hosts. For a custom production or preview domain, add each exact frontend origin to the API service's `CORS_ORIGINS` as a comma-separated list and restart the service. Use the origin from the browser address bar, with the scheme and no path or trailing slash. [Backend CORS settings](https://github.com/NEVERHOT-Team/campaignTwin-backend/blob/0c3e6a2d6b08a6835e948a3aec156b35e77047fc/main.py)
3. Open **Deployments** in Vercel and **Redeploy** the corresponding branch deployment, or push a new commit to that branch. Environment changes take effect at build time. Open the site's root URL in a fresh tab. A configured site starts in the connected planner and displays errors from an unavailable API.
4. Send **“I want to promote toilet tissue.”** Answer the follow-up with **“Use the synthetic demo for all buyers, target incremental profit, budget 1000 THB, 10 THB voucher, next week.”** Review the quoted values and dates, choose **Confirm selected**, and resolve any remaining blocking questions. Approve the displayed revision and choose **Approve and start simulation**.
5. In the browser's Network panel, verify a successful `POST /api/v1/campaign-reviews`, at least one `POST …/revisions`, then `POST …/approvals` and `POST /api/v1/runs`. The frontend follows the returned status and report URLs. Open Arena, then Verdict, and verify the submitted offer, comparison offer, and no-campaign baseline. This exercises the review database, approval, evaluation, and report retrieval that a health check alone cannot cover. [Runtime contract](https://github.com/NEVERHOT-Team/campaignTwin-backend/blob/0c3e6a2d6b08a6835e948a3aec156b35e77047fc/docs/campaigntwin-api-v1.openapi.yaml)

| Symptom | What to check |
| --- | --- |
| Root still opens the browser demo | Check the Vercel environment selected for the variable, redeploy that branch, and open the root without `?mode=demo`. |
| Browser blocks the request but the API health URL opens | Check the exact frontend origin against FastAPI's CORS settings. |
| Versioned review route returns 404 | Check the service's deployed backend branch and `/openapi.json`. |
| Health passes but creating a review fails with a missing table | Apply `db/init.sql` to the same database used by the running API. |
