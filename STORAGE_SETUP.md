# Lens — MongoDB + Cloudflare R2 setup

Replaces the previous Supabase Postgres + Storage setup. Supabase is still used for auth (JWT issuance and verification only).

## 1. MongoDB (Atlas — free tier is fine)

1. Sign up at https://www.mongodb.com/cloud/atlas, create a project, then create a new free cluster (M0). Region: `eu-west-2` (London) or whatever's closest to your Vercel region.
2. **Database Access** → Add Database User → username/password. Save the password.
3. **Network Access** → Add IP Address → **Allow Access from Anywhere** (`0.0.0.0/0`). Required for Vercel functions whose IPs are not fixed. Lock this down later with Vercel's static-IP feature if you upgrade plans.
4. **Connect → Drivers → Node.js → Copy the connection string**. Looks like:
   ```
   mongodb+srv://USER:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   Replace `<password>` with your real password (URL-encoded if it has special chars). This is your `MONGODB_URL`.
5. No schema/index setup needed — `ensureIndexes()` runs lazily on first DB use and creates everything the app needs.

## 2. Cloudflare R2

1. Sign up at https://dash.cloudflare.com — free tier includes 10 GB storage and zero egress fees.
2. Sidebar → **R2 Object Storage** → enable it (asks for a credit card for verification but won't charge under free tier).
3. **Create bucket** named `lens-packs`. Location: `Automatic`.
4. After creating, copy the **Account ID** from the right-hand panel — that's `R2_ACCOUNT_ID`.
5. **R2 → Manage R2 API Tokens → Create API Token**:
   - Permissions: **Object Read & Write**
   - Specify bucket: select `lens-packs`
   - Save
6. From the result page copy:
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`
   You can never see the secret again, so save it now.

## 3. Configure CORS on the R2 bucket (one-time, important)

Without this, the browser's `PUT` to the presigned URL will fail with a CORS error.

R2 dashboard → click `lens-packs` → **Settings tab → CORS Policy → Add CORS Policy**. Paste:

```json
[
  {
    "AllowedOrigins": [
      "https://lens-auck.vercel.app",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Replace `https://lens-auck.vercel.app` with your actual frontend URL. If you have a custom domain, add it too.

## 4. Add env vars to Vercel (lens-api / lens-ochre project)

Settings → Environment Variables, tick all three environments:

| Name | Value |
|---|---|
| `MONGODB_URL` | the Atlas connection string from step 1.4 |
| `MONGODB_DB_NAME` | `lens` (default — only override if you want a different DB name) |
| `R2_ACCOUNT_ID` | from R2 dashboard right-hand panel |
| `R2_ACCESS_KEY_ID` | from step 2.6 |
| `R2_SECRET_ACCESS_KEY` | from step 2.6 |
| `R2_BUCKET` | `lens-packs` |

Keep these from before:

| Name | Notes |
|---|---|
| `SUPABASE_URL` | Auth-only now |
| `SUPABASE_ANON_KEY` | Used by frontend; backend ignores |
| `SUPABASE_JWT_SECRET` | Optional — only for HS256 projects |
| `SUPABASE_JWT_AUD` | `authenticated` |
| `GEMINI_API_KEY` | Required for the AI pipeline |
| `CORS_ORIGINS` | Frontend Vercel URL |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | When you connect Inngest cloud |

You can **remove**:
- `SUPABASE_SERVICE_ROLE_KEY` — backend no longer uses Supabase Postgres or Storage.

## 5. Redeploy and verify

Deployments tab → ⋯ → Redeploy (untick "Use existing build cache").

Then hit `https://<your-lens-api>.vercel.app/api/diag/services` — you should see four green probes:

```json
{
  "results": [
    { "label": "mongo_ping", "ok": true, "ms": 80 },
    { "label": "mongo_jobs_count", "ok": true, "ms": 30 },
    { "label": "r2_presign_upload", "ok": true, "ms": 120 },
    { "label": "r2_object_exists_probe", "ok": true, "ms": 80 }
  ]
}
```

If `mongo_ping` is slow or errors → MongoDB Atlas IP allow list isn't open, or the connection string is wrong.
If `r2_presign_upload` errors → R2 keys are wrong or the bucket name doesn't match `R2_BUCKET`.

Once all four are green, the full upload-and-analyse flow will work. The frontend's CORS policy on R2 (step 3) is the one thing you must set in the Cloudflare dashboard, not via env var.
