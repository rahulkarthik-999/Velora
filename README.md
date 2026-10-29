# Velora — Production-Ready AI Task Execution Platform

> **Start with a goal. Finish with a result.**  
> Domain: [veloraweb.online](https://veloraweb.online)  
> Repository: [rahulkarthik99/Velora](https://github.com/rahulkarthik99/Velora)

Velora turns intentions into actionable workflows and carries them through to completion. It does not stop after generating text: it provides a state machine with ordered steps, dependencies, background handlers, editable deliverables, user approval gates, and persistent task history.

---

## Architecture Overview

```mermaid
flowchart TD
    UserWeb["Web App (Next.js 14 App Router)"] --> API["Shared API Gateway / Next.js API Routes"]
    UserMobile["Android App (Expo / React Native)"] --> API
    API --> Auth["Google OAuth (NextAuth.js)"]
    API --> Planner["AI Workflow Planner (Zod Structured Output)"]
    API --> Engine["Workflow Execution Engine & Handler Registry"]
    API --> Storage["Private File Storage & Text Extractor"]
    API --> Billing["Dodo Payments Adapter"]
    Engine --> DB[("PostgreSQL (Prisma ORM)")]
    Engine --> AI["AI Model Provider (OpenAI Compatible)"]
```

### Monorepo Structure

```
apps/
  web/                     # Next.js 14 App Router, Tailwind CSS, Lucide icons, NextAuth
  mobile/                  # React Native + Expo companion app for Android
packages/
  schemas/                 # Shared Zod schemas, state machines, tier quotas, and event types
```

---

## 1. Quick Start (Local Development)

### Prerequisites
- Node.js >= 18 (Tested on v24.15.0)
- pnpm >= 9
- PostgreSQL database (Local or hosted via Neon / Supabase)

### Installation
```bash
# Clone the repository
git clone https://github.com/rahulkarthik99/Velora.git
cd Velora

# Install monorepo dependencies
pnpm install

# Copy environment template
cp .env.example .env
```

### Setup Database & Prisma
```bash
# Generate Prisma Client
pnpm --filter @velora/web db:generate

# Push database schema to PostgreSQL
pnpm --filter @velora/web db:push
```

### Run Web Application
```bash
pnpm --filter @velora/web dev
# Web app running at http://localhost:3000
```

### Run Android Application
```bash
cd apps/mobile
pnpm start
# Press 'a' to launch in Android Emulator or scan QR via Expo Go
```

---

## 2. Environment Variables (.env)

| Variable | Description | Example / Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/velora?sslmode=require` |
| `NEXTAUTH_URL` | Application root URL | `http://localhost:3000` (or `https://veloraweb.online`) |
| `NEXTAUTH_SECRET` | 32-byte secret for session signing | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | `*.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | String |
| `AI_PROVIDER` | AI provider selector | `openai` |
| `AI_BASE_URL` | AI endpoint base URL | `https://api.openai.com/v1` |
| `AI_API_KEY` | Model API key | `sk-...` |
| `AI_MODEL` | Primary execution model | `gpt-4o` |
| `AI_FALLBACK_MODEL` | Fallback model for failover | `gpt-4o-mini` |
| `DODO_API_KEY` | Dodo Payments API Key | String |
| `DODO_WEBHOOK_SECRET` | Dodo Webhook Verification Secret | String |
| `DODO_PRODUCT_PLUS` | Product ID for Plus tier (₹499) | String |
| `DODO_PRODUCT_PRO` | Product ID for Pro tier (₹999) | String |

---

## 3. Testing

Run the automated test suites verifying schemas, state transitions, engine security, and tier entitlements:

```bash
# Run all unit tests
pnpm --filter @velora/schemas test
pnpm --filter @velora/web test
```

---

## 4. Vercel Deployment Instructions

1. **Push to GitHub**:
   Ensure all changes are pushed to `rahulkarthik99/Velora`.

2. **Connect Project on Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new).
   - Select repository `rahulkarthik99/Velora`.
   - Root Directory: select `apps/web`.
   - Framework Preset: **Next.js**.

3. **Configure Environment Variables**:
   Add the following in Vercel Project Settings:
   - `DATABASE_URL`
   - `NEXTAUTH_URL` = `https://veloraweb.online`
   - `NEXTAUTH_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `AI_API_KEY`
   - `DODO_WEBHOOK_SECRET`

4. **Build Command & Output**:
   - Build Command: `pnpm run build`
   - Install Command: `pnpm install`

5. **Custom Domain**:
   - Add domain `veloraweb.online` and follow the DNS CNAME records provided by Vercel.

---

## 5. Android Build Instructions (EAS)

1. Configure Google OAuth client ID for Android package `com.velora.app`.
2. Build installable APK or AAB:
```bash
cd apps/mobile
pnpm install
npx eas-cli build --platform android --profile production
```

---

## 6. Security & Consequential Action Controls

- **Approval Gates**: Any action classified as consequential (e.g. email sending, publishing, deletion) pauses the state machine at `WAITING_FOR_APPROVAL` until the authenticated user reviews and clicks Approve or Reject.
- **Tenant Isolation**: Every database query enforces `userId === session.user.id`.
- **Server-Side Credentials**: Zero AI keys, database credentials, or payment secrets are accessible on client bundles.
- **Rate Limiting**: Built-in per-user rate limiters protect workflow generation, uploads, and execution.
