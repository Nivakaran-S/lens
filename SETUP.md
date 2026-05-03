# Lens — local setup

This is what you need to do to get **Phase 1** running on your machine. Once it works locally you can deploy both apps to Vercel.

Phase 1 gives you: sign-up/sign-in, a dashboard, and an upload flow that PUTs a ZIP into Supabase Storage and creates a `jobs` row. **No AI yet** — that comes in Phase 2.

---

## 1. Provision Supabase

1. Sign up at https://supabase.com and create a new project. Region: pick `eu-west-2 (London)` since this is a UK product.
2. Once the project is ready, open it and go to **Project settings → API**. Copy:
   - `Project URL` → this is `SUPABASE_URL`
   - `anon` `public` key → `SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY` (keep server-only — never put in frontend)
3. Open **SQL Editor → New query**, paste the contents of [supabase/schema.sql](supabase/schema.sql), and run it. This creates the `jobs`, `documents`, `chat_messages` tables, the `legal-packs` storage bucket, and all RLS policies.
4. **Authentication → Providers**:
   - **Email**: enable email/password sign-up. For local dev, turn off "Confirm email" so sign-up gives you a session immediately. (Re-enable for production.)
   - **Google** (optional): enable if you want the "Continue with Google" button to work. Add the OAuth client ID/secret per Supabase's instructions.
5. **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000`
   - **Redirect URLs**: add `http://localhost:3000/auth/callback`

---

## 2. Configure environment files

### Backend (`backend/.env.local`)

Copy `backend/.env.example` to `backend/.env.local` and fill in:

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
CORS_ORIGINS=http://localhost:3000
```

`GEMINI_API_KEY` and `INNGEST_*` can be left blank for Phase 1.

### Frontend (`frontend/.env.local`)

Copy `frontend/.env.example` to `frontend/.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_API_BASE_URL=http://localhost:8787
```

---

## 3. Run locally

Open two terminals.

**Terminal A — backend:**

```powershell
cd c:\Users\LENOVO\Desktop\VIJI\backend
npm install   # only the first time
npm run dev   # listens on http://localhost:8787
```

You should see `[lens-api] listening on http://localhost:8787`. Hit http://localhost:8787/api/health in a browser — should return `{"ok":true,...}`.

**Terminal B — frontend:**

```powershell
cd c:\Users\LENOVO\Desktop\VIJI\frontend
npm install   # only the first time
npm run dev   # listens on http://localhost:3000
```

---

## 4. Verify Phase 1 end-to-end

1. Open http://localhost:3000.
2. Click **Get started** → sign up with any email + password (≥8 chars).
3. You should be redirected to `/dashboard` with an empty list.
4. Click **Analyse a new pack** → drop the sample ZIP at the repo root: `Lot_Mansfield_NG19 6HN_DocumentArchive.zip`.
5. After upload completes you'll be redirected to `/jobs/<id>` with status pill "Uploaded". *(It will stay "Uploaded" — Phase 2 wires the AI pipeline.)*
6. **In Supabase**, go to **Table editor → `jobs`** — you should see a row with `status = uploaded`.
7. **Storage → `legal-packs`** — you should see `<your-user-id>/<job-id>/Lot_Mansfield_NG19_6HN_DocumentArchive.zip`.
8. **RLS sanity check**: open an incognito window, sign up as a different user, and try to navigate to the first user's `/jobs/<id>` URL — the API will return 403 and the page will show an error.

If all of the above works, Phase 1 is done.

---

## 5. Deploy to Vercel

> ⚠️ **Critical**: this is a monorepo with **two** apps that need **two separate Vercel projects**. Importing the repo root as a single project will fail with `Invalid export found in module ".../backend/src/app.js"` because Vercel can't find a framework at the root and bundles the wrong files.
>
> If you already created a single project for the repo root, **delete it** first (Vercel dashboard → project → Settings → Advanced → Delete Project) before following the steps below.

### A. Backend project — `lens-api`

1. Vercel dashboard → **Add New… → Project** → import `Nivakaran-S/lens`.
2. **Project Name**: `lens-api`
3. **Root Directory**: click **Edit** and set to `backend` (this is the most important step).
4. **Framework Preset**: leave as **Other** (Vercel will auto-detect the `vercel.json`).
5. **Build & Output Settings**: leave defaults — `vercel.json` controls them.
6. **Environment Variables** — add all of these:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY`
   - `INNGEST_EVENT_KEY` (from app.inngest.com)
   - `INNGEST_SIGNING_KEY`
   - `CORS_ORIGINS` — set to the frontend Vercel URL once you have it (e.g. `https://lens-web.vercel.app`). For now leave as `https://lens-web.vercel.app` — you can always edit later.
7. Click **Deploy**.
8. After deploy, hit `https://<your-backend>.vercel.app/api/health` — should return `{"ok":true,"service":"lens-api",...}`. If you get the "Invalid export" error, double-check **Root Directory = `backend`**.

### B. Frontend project — `lens-web`

1. Vercel dashboard → **Add New… → Project** → import `Nivakaran-S/lens` again (same repo, second project).
2. **Project Name**: `lens-web`
3. **Root Directory**: click **Edit** and set to `frontend`.
4. **Framework Preset**: should auto-detect as **Next.js**.
5. **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_BASE_URL` — set to the backend's Vercel URL (e.g. `https://lens-api.vercel.app`)
6. Click **Deploy**.

### C. After both projects exist

1. Go back to `lens-api` → **Settings → Environment Variables** → update `CORS_ORIGINS` to the actual frontend URL (e.g. `https://lens-web.vercel.app`). Redeploy `lens-api` so the CORS env reloads.
2. **Supabase → Authentication → URL Configuration**:
   - Add `https://lens-web.vercel.app` to **Site URL**.
   - Add `https://lens-web.vercel.app/auth/callback` to **Redirect URLs**.
3. **Inngest dashboard → Apps**: register the production app pointing at `https://lens-api.vercel.app/api/inngest`. Inngest will send a sync request to validate.

### Why two projects, not one?

Vercel's monorepo support works by treating each subfolder as an independent project with its own Root Directory. There's no good way to deploy `frontend/` (Next.js, edge-friendly) and `backend/` (Node.js serverless functions) as a single project because they have incompatible build pipelines. Two projects pointing at the same Git repo is the canonical pattern — both auto-deploy on every push to `main`.

---

---

# Phase 2 — AI extraction pipeline

Phase 2 wires up Gemini + Inngest so an upload kicks off the analysis pipeline:
**extract PDFs from ZIP → upload each to Gemini File API → classify each → per-doc structured extraction**. Synthesis (the cross-document risk report) lands in Phase 3.

## 6. Get a Gemini API key

1. Open https://aistudio.google.com/apikey and create an API key. Free tier is fine for development.
2. Add it to `backend/.env.local`:
   ```
   GEMINI_API_KEY=AIza...
   ```

## 7. Set up Inngest

For local dev you only need the Inngest Dev Server — no account required.

**Terminal C — Inngest Dev Server:**

```powershell
cd c:\Users\LENOVO\Desktop\VIJI\backend
npx inngest-cli@latest dev -u http://localhost:8787/api/inngest
```

This launches the dev server at http://localhost:8288 and auto-registers the `analyze-pack` function. You'll watch every step run in the dashboard.

For production: sign up at https://app.inngest.com, create an app, copy `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` into `backend/.env.local`, and configure the Inngest app to point at `https://lens-api.vercel.app/api/inngest`.

## 8. Verify Phase 2 end-to-end

With **all three** terminals running (backend, frontend, Inngest dev):

1. Sign in and upload `Lot_Mansfield_NG19 6HN_DocumentArchive.zip` again (or re-use a previous job's URL).
2. The job page will cycle: **Uploaded → Extracting → Classifying → Analyzing → Done**.
3. In the Inngest dashboard at http://localhost:8288, you'll see the `analyze-pack` run with steps: `extract`, `classify-status`, `classify-0`...`classify-N`, `analyzing-status`, `reload-docs`, `extract-0`...`extract-N`, `mark-analyzed`.
4. In Supabase **Table editor → `documents`**: each row should have a `doc_type` (e.g. `title_register`, `epc`) and an `extraction` JSON blob with structured facts.
5. Sanity-check the extractions for the sample pack:
   - The `title_register` row should have `title_number = "NT247893"`, `class_of_title`, registered proprietors, and any restrictive covenants.
   - The `epc` row should have a `current_band` letter and score.
   - The `local_search` row should have `road_status` and any planning history.
   - The `grant_of_probate` row should have `executors_or_administrators`.
   - The `special_conditions` row should have `buyers_premium_gbp` and `completion_period_days` if visible.

If any document gets classified as `other` or extraction returns mostly empty fields, that's signal for Phase 3 prompt iteration.

---

# Phase 3 — Cross-document synthesis report

Phase 3 adds the final step to the pipeline: Gemini 2.5 Pro reads **all** the per-doc extractions plus the file URIs, produces a risk-scored report, and a deterministic post-processing layer elevates UK-auction-specific severities (EPC F/G ⇒ MEES critical, probate executor mismatch ⇒ completion blocker, restrictive covenants ⇒ medium with indemnity recommendation, etc.).

**No new env vars** — same `GEMINI_API_KEY` covers `gemini-2.5-pro`.

## 9. Verify Phase 3

Re-upload the sample pack (or click an existing job that's stuck at the Phase-2 stop point — a fresh re-upload is simpler).

You should see:

1. Status pill cycle: **Uploaded → Extracting → Classifying → Analyzing → Synthesizing → Done** (~2–3 minutes total).
2. The job page renders the `ReportView` with:
   - **Overall risk** pill (low / medium / high / critical).
   - **Headline findings** — 3–5 bullets a buyer reads first.
   - **Findings** — severity-coded cards with category, evidence (filename + page + quote), and recommended action.
   - **Questions for your solicitor** — 5–10 specific questions.
3. For the Mansfield sample, the rule layer should surface at least:
   - Probate cross-check: deceased name on the grant of probate vs. registered proprietor (will be `critical` if mismatched).
   - Restrictive covenants from the 1989 conveyance referenced in the title register.
   - EPC band flag if the certificate is F/G.
   - Buyer-paid fees from the special conditions of sale.
   - Road status / planning history from the local search.
4. In Supabase **Table editor → `jobs`**, the `report` column is now populated with structured JSON.

If the report looks thin, check the Inngest dashboard — the `synthesize` step's input prompt is logged and you can iterate on the per-doc extractions if they're missing fields.

---

# Phase 4 — Chat Q&A

Phase 4 adds a chat panel to the job page. Chat uses `gemini-2.5-flash-lite` with the file URIs attached as evidence and the synthesis report seeded as the system context. Files are auto-refreshed if the URI is older than 40 hours.

## 10. Verify Phase 4

On a `done` job page:

1. The chat panel at the bottom shows starter-question chips.
2. Click a chip (or type) — answer arrives in ~5–10 seconds.
3. Try: *"Are there any restrictive covenants?"* — answer should quote the title register or 1989 conveyance and cite the source filename.
4. Try a question with no answer in the pack — the assistant should say so explicitly rather than speculate.
5. Refresh the page — chat history persists from the `chat_messages` table.

---

## Phase 5 — Production polish (optional, when ready to ship)

- **Stripe paywall** — out of scope here, but the natural integration point is `/upload` (gate behind a paid tier) and `/api/jobs` POST (server-side check).
- **Sentry / Vercel error tracking** — install `@sentry/nextjs` in frontend and `@sentry/node` in backend.
- **Email confirmation on completion** — Inngest `functions[]` can include a notify-on-completion function that calls Resend or Postmark.

See [the plan](C:\Users\LENOVO\.claude\plans\i-wanna-create-a-logical-pebble.md) for the full roadmap.
