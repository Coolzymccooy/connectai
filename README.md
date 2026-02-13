<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# ConnectAI End-to-End Guide

This README documents how to run, configure, and deploy the ConnectAI app end-to-end.

## Architecture Overview
- **Frontend:** Vite + React (Agent Console, Softphone, Wrap-up, Campaigns, Inbox, Video)
- **Backend:** Express (Twilio Voice, AI endpoints, campaigns, dispositions, recordings, reports)
- **Data:** MongoDB in production (JSON fallback in dev)
- **AI:** Gemini (summaries, QA analysis, draft replies, TTS)

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local)
3. Start the backend + frontend together:
   `npm run dev:all`

   Or run them separately:
   - Backend: `npm run dev:server`
   - Frontend: `npm run dev`

## Local Team Invite + Video Test (Quick Runbook)
Use this flow when you want to test internal calls/video with real team members locally.

1. Start app and server:
   - `npm run dev:all`
2. Open two browser sessions:
   - Session A: normal browser window
   - Session B: Incognito/Private window (or a different browser)
3. Sign in as Admin in Session A.
4. Create team invite(s):
   - Go to `Admin Settings` -> invite section
   - Enter teammate email and role
   - Create invite
5. In Session B, sign in with invited email and accept invite flow.
6. Confirm both users are visible in `Team` tab and marked online.
7. Start video test:
   - From Session A, open `Team` and click video call on Session B user
   - Accept call in Session B
8. Verify expected behavior:
   - Your own camera tile appears immediately
   - Remote participant tile appears after join
   - `People` count reflects connected participants
9. Add a third member (optional):
   - Use `Invite Someone` inside video call or create another invite from Admin
   - Join from a third browser profile/device

Tips:
- If camera is blank, confirm browser camera/mic permissions are allowed for `localhost`.
- If invite does not appear, refresh Session B after invite creation.
- If using invite-only auth, ensure invite email matches login email exactly.

## Core Flows
### 1) Inbound Voice Call (Twilio → App → Agent)
1. Twilio sends webhook to `/twilio/voice/incoming`
2. Server routes to available agent **extension** (e.g., `101`)
3. If no answer, server retries next agent
4. Call state + metrics are persisted

### 2) Outbound Call (Agent → Twilio)
1. Agent dials a number
2. Twilio webhook `/twilio/voice` handles call
3. Call state persisted + recordings stored

### 3) Wrap-Up Cluster
- QA Admission → stored as `qaEvaluation`
- Disposition Link → stored in call analysis
- CRM Sync → stored in call `crmData`
- Follow-up meeting → stored in Calendar events

### 4) AI Jobs (Background)
- Transcription → Summary → Report (queued jobs every 30 seconds)
- Job status can be checked via `/api/jobs`

## Twilio Webhook URLs
**Production default:**
```
POST https://YOUR_PUBLIC_URL/twilio/voice/incoming
```

**Force routing to a single client (testing only):**
```
POST https://YOUR_PUBLIC_URL/twilio/voice/incoming?identity=agent
```

Remove `identity=` for production routing across multiple agents.

## Backend Environment Variables (Render)
**Required**
- `PUBLIC_URL` (Render URL)
- `TWILIO_AUTH_TOKEN` (webhook verification)
- `AUTH_MODE` (`strict`)
- `AUTH_JWT_SECRET` (JWT validation)
- `DEFAULT_TENANT_ID`
- `MONGO_URI`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_API_KEY`
- `TWILIO_API_SECRET`
- `TWILIO_TWIML_APP_SID`
- `TWILIO_CALLER_ID`
- `GEMINI_API_KEY`
- `RECORDINGS_SIGNING_SECRET`

**Optional**
- `RECORDING_RETENTION_DAYS`
- `CLIENT_URL` (CORS allowlist)
- `SENDGRID_API_KEY` (enables invite email delivery)
- `SENDGRID_FROM_EMAIL` (sender address for invite emails)
- `TWILIO_HOLD_MUSIC_URL` (music played while callers wait)
- `TWILIO_WAIT_SECONDS` (wait-loop pause per cycle, default `15`)
- `TWILIO_MAX_WAIT_CYCLES` (max retry cycles before graceful hangup, default `2`)
- `HUBSPOT_CLIENT_ID` (for real HubSpot OAuth)
- `HUBSPOT_CLIENT_SECRET` (for real HubSpot OAuth)
- `HUBSPOT_OAUTH_REDIRECT_URI` (must match HubSpot app redirect URI, e.g. `http://localhost:3090/api/oauth/hubspot/callback`)

If `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` are not set, invites are still created but no email is sent.

## Twilio Auth Token: Where to get it
1. Open Twilio Console: `https://console.twilio.com/`
2. Go to `Account` -> `API keys & tokens`
3. Copy the account `Auth Token` and set:
   - `TWILIO_AUTH_TOKEN=<your_auth_token>`

Use the **Auth Token** for webhook verification + monitor APIs.  
Do not use your API Secret as `TWILIO_AUTH_TOKEN` (they are different values).

## Verify Monitor Capability
While logged in as **Admin** or **Supervisor**, call:
`GET /api/twilio/capabilities`

Expected healthy result:
- `configured: true`
- `monitoringEnabled: true`
- `canMonitor: true`

If any is `false`, check missing envs returned in `missing[]`.

You can check this in 3 ways:
1. **Admin UI:** `Admin Settings` -> `Integrations` -> `Twilio Health` panel (uses the same endpoint).
2. **Browser (dev mode):** open `http://localhost:3090/api/twilio/capabilities`.
3. **Postman:** include `Authorization: Bearer <token>` and `X-Tenant-Id` in strict auth mode.

## HubSpot OAuth + Live Sync
1. Set backend env vars:
   - `HUBSPOT_CLIENT_ID`
   - `HUBSPOT_CLIENT_SECRET`
   - `HUBSPOT_OAUTH_REDIRECT_URI`
2. In HubSpot developer app, add the exact same redirect URI.
3. In Admin UI:
   - `Admin Settings` -> `Integrations` -> `Connect hubspot`
   - Complete OAuth in popup.
   - Click `Sync HubSpot Now`.
4. API endpoints used:
   - `GET /api/oauth/hubspot/start`
   - `GET /api/oauth/hubspot/callback`
   - `GET /api/crm/hubspot/status`
   - `POST /api/crm/hubspot/sync`
5. Synced data:
   - Contacts -> `/api/crm/contacts` (`platform: HubSpot`)
   - Deals -> `/api/crm/deals`

## Frontend Environment Variables (Vercel / Local)
Set these in Vercel or `.env.local`:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` (optional)
- `VITE_FIREBASE_DISABLED` (optional)
- `VITE_FIREBASE_SILENT` (optional)

## Auth (JWT) Setup
This backend expects a JWT in the header:
```
Authorization: Bearer <JWT>
```
JWT payload must include:
```
{
  "sub": "user-id",
  "email": "user@domain.com",
  "role": "ADMIN",
  "tenantId": "tenant-1"
}
```

## Rate Limits
- `/twilio/*`: 120 req/min
- `/api/gemini/*` and `/api/rag/*`: 60 req/min

## Metrics
- `GET /api/metrics/calls` (Admin/Supervisor)

## Jobs
- `GET /api/jobs`
- `POST /api/jobs`

## Deployment (Vercel + Render)
### Backend (Render)
1. Build: `npm install`
2. Start: `node server/index.js`
3. Add env vars listed above

### Frontend (Vercel)
1. Build: `npm run build`
2. Output: `dist`
3. Set env vars listed above
4. `vercel.json` rewrites `/api/*` and `/twilio/*` to backend

## Beta Testing Checklist
- `TWILIO_AUTH_TOKEN` set and verified
- `PUBLIC_URL` correct
- MongoDB connected
- `AUTH_MODE=strict` enabled
- JWTs being issued and attached by frontend
- Twilio spend limits set
