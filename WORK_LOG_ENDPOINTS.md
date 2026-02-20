# Endpoint Worklog

Generated: 2026-02-20T06:17:54.981Z

This file is auto-generated from `server/index.js` and updates when new Express routes are added.

| Method | Path | Access | Helper | Source |
| --- | --- | --- | --- | --- |
| GET | `/` | Public | Application API route. | `server/index.js:2048` |
| GET | `/api/admin/users` | Auth (ADMIN) | Application API route. | `server/index.js:2647` |
| POST | `/api/admin/users` | Auth (ADMIN) | Application API route. | `server/index.js:2656` |
| DELETE | `/api/admin/users/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2689` |
| PUT | `/api/admin/users/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2671` |
| GET | `/api/auth/policy` | Public | Application API route. | `server/index.js:1404` |
| POST | `/api/billing/stripe/checkout` | Auth (ADMIN) | Stripe billing checkout/config for top-up and plans. | `server/index.js:2554` |
| GET | `/api/billing/stripe/config` | Auth (ADMIN) | Stripe billing checkout/config for top-up and plans. | `server/index.js:2537` |
| POST | `/api/broadcasts/:id/archive` | Auth (ADMIN) | Admin broadcast creation and archive actions. | `server/index.js:2525` |
| POST | `/api/broadcasts/send` | Auth (ADMIN) | Admin broadcast creation and archive actions. | `server/index.js:2453` |
| GET | `/api/calendar/events` | Public | Application API route. | `server/index.js:3189` |
| POST | `/api/calendar/events` | Public | Application API route. | `server/index.js:3369` |
| DELETE | `/api/calendar/events/:id` | Public | Application API route. | `server/index.js:3386` |
| PUT | `/api/calendar/events/:id` | Public | Application API route. | `server/index.js:3378` |
| POST | `/api/calendar/sync` | Public | Application API route. | `server/index.js:3393` |
| POST | `/api/calendar/webhook` | Public | Application API route. | `server/index.js:3401` |
| GET | `/api/calls` | Auth | Fetch call logs or a single call. | `server/index.js:2883` |
| POST | `/api/calls` | Auth | Create/update call session state. | `server/index.js:2952` |
| GET | `/api/calls/:id` | Auth | Fetch call logs or a single call. | `server/index.js:2926` |
| PUT | `/api/calls/:id` | Auth | Create/update call session state. | `server/index.js:2978` |
| GET | `/api/campaigns` | Public | Application API route. | `server/index.js:2761` |
| POST | `/api/campaigns` | Public | Application API route. | `server/index.js:2770` |
| DELETE | `/api/campaigns/:id` | Public | Application API route. | `server/index.js:2807` |
| PUT | `/api/campaigns/:id` | Public | Application API route. | `server/index.js:2787` |
| POST | `/api/crm/:provider/connect` | Public | CRM provider integration and synchronization. | `server/index.js:3473` |
| POST | `/api/crm/:provider/sync` | Public | CRM provider integration and synchronization. | `server/index.js:3498` |
| GET | `/api/crm/contacts` | Public | CRM provider integration and synchronization. | `server/index.js:3406` |
| POST | `/api/crm/contacts` | Public | CRM provider integration and synchronization. | `server/index.js:3417` |
| GET | `/api/crm/deals` | Public | CRM provider integration and synchronization. | `server/index.js:3431` |
| GET | `/api/crm/hubspot/status` | Auth (ADMIN, SUPERVISOR) | HubSpot status/connect/sync operations. | `server/index.js:3457` |
| POST | `/api/crm/sync` | Public | CRM provider integration and synchronization. | `server/index.js:3445` |
| GET | `/api/crm/tasks` | Public | CRM provider integration and synchronization. | `server/index.js:3426` |
| POST | `/api/crm/tasks` | Public | CRM provider integration and synchronization. | `server/index.js:3436` |
| POST | `/api/crm/webhook` | Public | CRM provider integration and synchronization. | `server/index.js:3453` |
| GET | `/api/dispositions` | Public | Application API route. | `server/index.js:2822` |
| POST | `/api/dispositions` | Public | Application API route. | `server/index.js:2831` |
| DELETE | `/api/dispositions/:id` | Public | Application API route. | `server/index.js:2868` |
| PUT | `/api/dispositions/:id` | Public | Application API route. | `server/index.js:2848` |
| GET | `/api/export` | Auth (ADMIN) | Data export and reporting endpoints. | `server/index.js:3765` |
| POST | `/api/gemini/analysis` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2298` |
| POST | `/api/gemini/campaign-draft` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2203` |
| POST | `/api/gemini/draft` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2187` |
| POST | `/api/gemini/help` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2282` |
| POST | `/api/gemini/intel` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2162` |
| POST | `/api/gemini/lead-brief` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2382` |
| POST | `/api/gemini/lead-enrich` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2246` |
| POST | `/api/gemini/live-token` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:4365` |
| POST | `/api/gemini/tool-actions` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2342` |
| POST | `/api/gemini/tts` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:4332` |
| GET | `/api/health` | Public | Service heartbeat and env readiness check. | `server/index.js:2044` |
| GET | `/api/health/deps` | Public | Application API route. | `server/index.js:2113` |
| GET | `/api/integrations/status` | Public | Aggregate integration status snapshot. | `server/index.js:3775` |
| GET | `/api/invites` | Auth (ADMIN) | Create and accept user invitation workflow. | `server/index.js:1425` |
| POST | `/api/invites` | Auth (ADMIN) | Create and accept user invitation workflow. | `server/index.js:1430` |
| POST | `/api/invites/accept` | Public | Create and accept user invitation workflow. | `server/index.js:1452` |
| GET | `/api/jobs` | Auth (ADMIN, SUPERVISOR) | Queue and inspect async background jobs. | `server/index.js:3017` |
| POST | `/api/jobs` | Auth (ADMIN, SUPERVISOR) | Queue and inspect async background jobs. | `server/index.js:3026` |
| POST | `/api/jobs/process` | Public | Queue and inspect async background jobs. | `server/index.js:2139` |
| POST | `/api/marketing/:provider/connect` | Public | Marketing provider connect/sync workflow. | `server/index.js:3636` |
| POST | `/api/marketing/:provider/sync` | Public | Marketing provider connect/sync workflow. | `server/index.js:3645` |
| GET | `/api/marketing/campaigns` | Public | Marketing provider connect/sync workflow. | `server/index.js:3600` |
| POST | `/api/marketing/campaigns` | Public | Marketing provider connect/sync workflow. | `server/index.js:3605` |
| DELETE | `/api/marketing/campaigns/:id` | Public | Marketing provider connect/sync workflow. | `server/index.js:3629` |
| PUT | `/api/marketing/campaigns/:id` | Public | Marketing provider connect/sync workflow. | `server/index.js:3617` |
| GET | `/api/metrics/calls` | Auth (ADMIN, SUPERVISOR) | Operations and usage metrics summary. | `server/index.js:3781` |
| GET | `/api/metrics/summary` | Auth (ADMIN, SUPERVISOR) | Operations and usage metrics summary. | `server/index.js:3786` |
| GET | `/api/oauth/google/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:3212` |
| GET | `/api/oauth/google/start` | Public | OAuth initialization/callback for integrations. | `server/index.js:3194` |
| GET | `/api/oauth/hubspot/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:3337` |
| GET | `/api/oauth/hubspot/readiness` | Auth (ADMIN, SUPERVISOR) | OAuth initialization/callback for integrations. | `server/index.js:3325` |
| GET | `/api/oauth/hubspot/start` | Auth (ADMIN, SUPERVISOR) | OAuth initialization/callback for integrations. | `server/index.js:3310` |
| GET | `/api/oauth/microsoft/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:3279` |
| GET | `/api/oauth/microsoft/start` | Public | OAuth initialization/callback for integrations. | `server/index.js:3262` |
| GET | `/api/public/desktop-release` | Public | Desktop release metadata for download UI. | `server/index.js:2082` |
| GET | `/api/queues` | Public | Application API route. | `server/index.js:2398` |
| POST | `/api/rag/ingest` | Auth | AI generation and retrieval-assisted endpoints. | `server/index.js:1923` |
| POST | `/api/rag/query` | Auth | AI generation and retrieval-assisted endpoints. | `server/index.js:1950` |
| GET | `/api/recordings` | Public | List, fetch, or serve call recordings. | `server/index.js:3035` |
| POST | `/api/recordings` | Public | List, fetch, or serve call recordings. | `server/index.js:3047` |
| PUT | `/api/recordings/:id` | Public | List, fetch, or serve call recordings. | `server/index.js:3064` |
| POST | `/api/recordings/:id/signed-url` | Public | List, fetch, or serve call recordings. | `server/index.js:3131` |
| GET | `/api/recordings/download` | Public | List, fetch, or serve call recordings. | `server/index.js:3149` |
| POST | `/api/recordings/upload` | Public | List, fetch, or serve call recordings. | `server/index.js:3084` |
| GET | `/api/reports/summary` | Public | Application API route. | `server/index.js:3748` |
| GET | `/api/rooms/:roomId` | Auth | Application API route. | `server/index.js:1370` |
| POST | `/api/rooms/join` | Auth | Application API route. | `server/index.js:1377` |
| POST | `/api/rooms/leave` | Auth | Application API route. | `server/index.js:1391` |
| GET | `/api/settings` | Public | Read/save tenant application settings. | `server/index.js:2427` |
| PUT | `/api/settings` | Public | Read/save tenant application settings. | `server/index.js:2445` |
| GET | `/api/startup-guard` | Public | Application API route. | `server/index.js:2402` |
| POST | `/api/supervisor/monitor` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3798` |
| POST | `/api/supervisor/monitor/status` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3857` |
| POST | `/api/supervisor/monitor/stop` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3834` |
| GET | `/api/supervisor/stats` | Auth (ADMIN, SUPERVISOR) | Application API route. | `server/index.js:1470` |
| GET | `/api/tenants` | Auth (ADMIN) | Application API route. | `server/index.js:2606` |
| POST | `/api/tenants` | Auth (ADMIN) | Application API route. | `server/index.js:2614` |
| PUT | `/api/tenants/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2629` |
| POST | `/api/termii/webhook` | Public | Application API route. | `server/index.js:3665` |
| POST | `/api/termii/whatsapp/send` | Auth (ADMIN, SUPERVISOR) | Application API route. | `server/index.js:3654` |
| GET | `/api/twilio/capabilities` | Auth (ADMIN, SUPERVISOR) | Twilio monitor/listen readiness diagnostics. | `server/index.js:3242` |
| GET | `/api/twilio/token` | Public | Twilio webhook/callflow endpoint. | `server/index.js:2702` |
| POST | `/api/twilio/transfer` | Auth (ADMIN, SUPERVISOR, AGENT) | Twilio webhook/callflow endpoint. | `server/index.js:2728` |
| POST | `/twilio/recording/status` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3987` |
| POST | `/twilio/transcription/status` | Public | Twilio webhook/callflow endpoint. | `server/index.js:4065` |
| POST | `/twilio/voice` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3896` |
| POST | `/twilio/voice/handle` | Public | Twilio webhook/callflow endpoint. | `server/index.js:4245` |
| POST | `/twilio/voice/incoming` | Public | Twilio webhook/callflow endpoint. | `server/index.js:4125` |
| POST | `/twilio/voice/route-next` | Public | Twilio webhook/callflow endpoint. | `server/index.js:4190` |

Total endpoints discovered: **108**

> Do not edit manually. Run `npm run worklog:endpoints`.
