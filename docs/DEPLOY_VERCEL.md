# Deploying the Velora web app to Vercel

The deployable app is `apps/web` (Next.js 14, Prisma, NextAuth). It lives in a
pnpm/Turborepo monorepo and imports the workspace package `@velora/schemas`.

## 1. Create the project

1. Import the Git repository in Vercel.
2. **Root Directory:** `apps/web` (keep "Include files outside the root directory" enabled; it is on by default, and the app needs `packages/schemas`).
3. Framework preset: **Next.js** (auto-detected). Leave build and install commands at their defaults.
   - Build runs `prisma generate && next build` (from `apps/web/package.json`).
4. Add the environment variable `ENABLE_EXPERIMENTAL_COREPACK=1` so Vercel uses the
   pnpm version pinned in the root `package.json` (`packageManager`).

## 2. Database (Neon or Supabase, free tier)

One Postgres database holds everything, **including uploaded files** (the `StoredFile`
table). There is no separate storage service to set up.

| Provider | `DATABASE_URL` on Vercel |
|---|---|
| Neon | The **pooled** connection string (host contains `-pooler`), `?sslmode=require` |
| Supabase | Settings → Database → Connection pooling (port **6543**), with `?pgbouncer=true` appended |

Serverless functions open many short connections, which is why the pooled URL matters.

Files are served only through the authenticated `/api/files/[fileId]` route.
Free-tier storage is small (Neon 0.5 GB, Supabase 500 MB) and uploads count towards it.

The repo has no Prisma migrations yet, so create or update the schema from your machine.
Use the **direct** (non-pooled) URL here, because schema changes don't work through PgBouncer:

```bash
DATABASE_URL="<direct url>" pnpm --filter @velora/web db:push
```

## 3. Environment variables (Production)

| Variable | Value |
|---|---|
| `NEXTAUTH_URL` | `https://veloraweb.online` |
| `NEXTAUTH_SECRET` | output of `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth client |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | OpenAI; see `.env.example` |
| `DEEPSEEK_API_KEY`, `GROQ_API_KEY` (+ optional `*_MODEL`, `*_BASE_URL`) | optional extra providers; skipped when unset |
| `DODO_API_KEY`, `DODO_WEBHOOK_SECRET`, `DODO_PRODUCT_PLUS`, `DODO_PRODUCT_PRO` | Dodo Payments |
| `APP_URL` | `https://veloraweb.online` |

Do not set `NODE_ENV`; Vercel manages it.

In Google Cloud Console add the authorized redirect URI
`https://veloraweb.online/api/auth/callback/google`.

Point the Dodo Payments webhook at `https://veloraweb.online/api/webhooks/billing`.

## 4. Domain

In the Vercel project, add `veloraweb.online` and `www.veloraweb.online`, then create
exactly the DNS records Vercel shows for them at your registrar.

## Known limitations on Vercel

- **Upload size:** Vercel functions accept request bodies up to 4.5 MB. Uploads go through
  `/api/upload`, so files above ~4.5 MB fail even though the Plus/Pro plans advertise
  15/20 MB. Raising it needs chunked uploads, or an object store with direct
  browser uploads.
- **Rate limiting** (`checkRateLimit` in `src/lib/api-utils.ts`) is in-memory, so it is
  per function instance, not global. Use Upstash Redis if strict limits matter.
