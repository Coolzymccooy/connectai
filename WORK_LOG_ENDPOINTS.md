# Endpoint Worklog

Generated: 2026-02-18T04:06:45.817Z

This file is auto-generated from `server/index.js` and updates when new Express routes are added.

| Method | Path | Access | Helper | Source |
| --- | --- | --- | --- | --- |
| GET | `/` | Public | Application API route. | `server/index.js:1826` |
| GET | `/api/admin/users` | Auth (ADMIN) | Application API route. | `server/index.js:2401` |
| POST | `/api/admin/users` | Auth (ADMIN) | Application API route. | `server/index.js:2410` |
| DELETE | `/api/admin/users/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2443` |
| PUT | `/api/admin/users/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2425` |
| GET | `/api/auth/policy` | Public | Application API route. | `server/index.js:1193` |
| POST | `/api/billing/stripe/checkout` | Auth (ADMIN) | Stripe billing checkout/config for top-up and plans. | `server/index.js:2308` |
| GET | `/api/billing/stripe/config` | Auth (ADMIN) | Stripe billing checkout/config for top-up and plans. | `server/index.js:2291` |
| POST | `/api/broadcasts/:id/archive` | Auth (ADMIN) | Admin broadcast creation and archive actions. | `server/index.js:2279` |
| POST | `/api/broadcasts/send` | Auth (ADMIN) | Admin broadcast creation and archive actions. | `server/index.js:2207` |
| GET | `/api/calendar/events` | Public | Application API route. | `server/index.js:2944` |
| POST | `/api/calendar/events` | Public | Application API route. | `server/index.js:3124` |
| DELETE | `/api/calendar/events/:id` | Public | Application API route. | `server/index.js:3141` |
| PUT | `/api/calendar/events/:id` | Public | Application API route. | `server/index.js:3133` |
| POST | `/api/calendar/sync` | Public | Application API route. | `server/index.js:3148` |
| POST | `/api/calendar/webhook` | Public | Application API route. | `server/index.js:3156` |
| GET | `/api/calls` | Auth | Fetch call logs or a single call. | `server/index.js:2637` |
| POST | `/api/calls` | Auth | Create/update call session state. | `server/index.js:2706` |
| GET | `/api/calls/:id` | Auth | Fetch call logs or a single call. | `server/index.js:2680` |
| PUT | `/api/calls/:id` | Auth | Create/update call session state. | `server/index.js:2729` |
| GET | `/api/campaigns` | Public | Application API route. | `server/index.js:2515` |
| POST | `/api/campaigns` | Public | Application API route. | `server/index.js:2524` |
| DELETE | `/api/campaigns/:id` | Public | Application API route. | `server/index.js:2561` |
| PUT | `/api/campaigns/:id` | Public | Application API route. | `server/index.js:2541` |
| POST | `/api/crm/:provider/connect` | Public | CRM provider integration and synchronization. | `server/index.js:3228` |
| POST | `/api/crm/:provider/sync` | Public | CRM provider integration and synchronization. | `server/index.js:3253` |
| GET | `/api/crm/contacts` | Public | CRM provider integration and synchronization. | `server/index.js:3161` |
| POST | `/api/crm/contacts` | Public | CRM provider integration and synchronization. | `server/index.js:3172` |
| GET | `/api/crm/deals` | Public | CRM provider integration and synchronization. | `server/index.js:3186` |
| GET | `/api/crm/hubspot/status` | Auth (ADMIN, SUPERVISOR) | HubSpot status/connect/sync operations. | `server/index.js:3212` |
| POST | `/api/crm/sync` | Public | CRM provider integration and synchronization. | `server/index.js:3200` |
| GET | `/api/crm/tasks` | Public | CRM provider integration and synchronization. | `server/index.js:3181` |
| POST | `/api/crm/tasks` | Public | CRM provider integration and synchronization. | `server/index.js:3191` |
| POST | `/api/crm/webhook` | Public | CRM provider integration and synchronization. | `server/index.js:3208` |
| GET | `/api/dispositions` | Public | Application API route. | `server/index.js:2576` |
| POST | `/api/dispositions` | Public | Application API route. | `server/index.js:2585` |
| DELETE | `/api/dispositions/:id` | Public | Application API route. | `server/index.js:2622` |
| PUT | `/api/dispositions/:id` | Public | Application API route. | `server/index.js:2602` |
| GET | `/api/export` | Auth (ADMIN) | Data export and reporting endpoints. | `server/index.js:3520` |
| POST | `/api/gemini/analysis` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2076` |
| POST | `/api/gemini/campaign-draft` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:1981` |
| POST | `/api/gemini/draft` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:1965` |
| POST | `/api/gemini/help` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2060` |
| POST | `/api/gemini/intel` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:1940` |
| POST | `/api/gemini/lead-brief` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2160` |
| POST | `/api/gemini/lead-enrich` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2024` |
| POST | `/api/gemini/live-token` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:4104` |
| POST | `/api/gemini/tool-actions` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2120` |
| POST | `/api/gemini/tts` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:4071` |
| GET | `/api/health` | Public | Service heartbeat and env readiness check. | `server/index.js:1822` |
| GET | `/api/health/deps` | Public | Application API route. | `server/index.js:1891` |
| GET | `/api/integrations/status` | Public | Aggregate integration status snapshot. | `server/index.js:3530` |
| GET | `/api/invites` | Auth (ADMIN) | Create and accept user invitation workflow. | `server/index.js:1214` |
| POST | `/api/invites` | Auth (ADMIN) | Create and accept user invitation workflow. | `server/index.js:1219` |
| POST | `/api/invites/accept` | Public | Create and accept user invitation workflow. | `server/index.js:1241` |
| GET | `/api/jobs` | Auth (ADMIN, SUPERVISOR) | Queue and inspect async background jobs. | `server/index.js:2772` |
| POST | `/api/jobs` | Auth (ADMIN, SUPERVISOR) | Queue and inspect async background jobs. | `server/index.js:2781` |
| POST | `/api/jobs/process` | Public | Queue and inspect async background jobs. | `server/index.js:1917` |
| POST | `/api/marketing/:provider/connect` | Public | Marketing provider connect/sync workflow. | `server/index.js:3391` |
| POST | `/api/marketing/:provider/sync` | Public | Marketing provider connect/sync workflow. | `server/index.js:3400` |
| GET | `/api/marketing/campaigns` | Public | Marketing provider connect/sync workflow. | `server/index.js:3355` |
| POST | `/api/marketing/campaigns` | Public | Marketing provider connect/sync workflow. | `server/index.js:3360` |
| DELETE | `/api/marketing/campaigns/:id` | Public | Marketing provider connect/sync workflow. | `server/index.js:3384` |
| PUT | `/api/marketing/campaigns/:id` | Public | Marketing provider connect/sync workflow. | `server/index.js:3372` |
| GET | `/api/metrics/calls` | Auth (ADMIN, SUPERVISOR) | Operations and usage metrics summary. | `server/index.js:3536` |
| GET | `/api/metrics/summary` | Auth (ADMIN, SUPERVISOR) | Operations and usage metrics summary. | `server/index.js:3541` |
| GET | `/api/oauth/google/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:2967` |
| GET | `/api/oauth/google/start` | Public | OAuth initialization/callback for integrations. | `server/index.js:2949` |
| GET | `/api/oauth/hubspot/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:3092` |
| GET | `/api/oauth/hubspot/readiness` | Auth (ADMIN, SUPERVISOR) | OAuth initialization/callback for integrations. | `server/index.js:3080` |
| GET | `/api/oauth/hubspot/start` | Auth (ADMIN, SUPERVISOR) | OAuth initialization/callback for integrations. | `server/index.js:3065` |
| GET | `/api/oauth/microsoft/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:3034` |
| GET | `/api/oauth/microsoft/start` | Public | OAuth initialization/callback for integrations. | `server/index.js:3017` |
| GET | `/api/public/desktop-release` | Public | Desktop release metadata for download UI. | `server/index.js:1860` |
| GET | `/api/queues` | Public | Application API route. | `server/index.js:2176` |
| POST | `/api/rag/ingest` | Auth | AI generation and retrieval-assisted endpoints. | `server/index.js:1701` |
| POST | `/api/rag/query` | Auth | AI generation and retrieval-assisted endpoints. | `server/index.js:1728` |
| GET | `/api/recordings` | Public | List, fetch, or serve call recordings. | `server/index.js:2790` |
| POST | `/api/recordings` | Public | List, fetch, or serve call recordings. | `server/index.js:2802` |
| PUT | `/api/recordings/:id` | Public | List, fetch, or serve call recordings. | `server/index.js:2819` |
| POST | `/api/recordings/:id/signed-url` | Public | List, fetch, or serve call recordings. | `server/index.js:2886` |
| GET | `/api/recordings/download` | Public | List, fetch, or serve call recordings. | `server/index.js:2904` |
| POST | `/api/recordings/upload` | Public | List, fetch, or serve call recordings. | `server/index.js:2839` |
| GET | `/api/reports/summary` | Public | Application API route. | `server/index.js:3503` |
| GET | `/api/rooms/:roomId` | Auth | Application API route. | `server/index.js:1159` |
| POST | `/api/rooms/join` | Auth | Application API route. | `server/index.js:1166` |
| POST | `/api/rooms/leave` | Auth | Application API route. | `server/index.js:1180` |
| GET | `/api/settings` | Public | Read/save tenant application settings. | `server/index.js:2181` |
| PUT | `/api/settings` | Public | Read/save tenant application settings. | `server/index.js:2199` |
| POST | `/api/supervisor/monitor` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3553` |
| POST | `/api/supervisor/monitor/status` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3612` |
| POST | `/api/supervisor/monitor/stop` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3589` |
| GET | `/api/supervisor/stats` | Auth (ADMIN, SUPERVISOR) | Application API route. | `server/index.js:1259` |
| GET | `/api/tenants` | Auth (ADMIN) | Application API route. | `server/index.js:2360` |
| POST | `/api/tenants` | Auth (ADMIN) | Application API route. | `server/index.js:2368` |
| PUT | `/api/tenants/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2383` |
| POST | `/api/termii/webhook` | Public | Application API route. | `server/index.js:3420` |
| POST | `/api/termii/whatsapp/send` | Auth (ADMIN, SUPERVISOR) | Application API route. | `server/index.js:3409` |
| GET | `/api/twilio/capabilities` | Auth (ADMIN, SUPERVISOR) | Twilio monitor/listen readiness diagnostics. | `server/index.js:2997` |
| GET | `/api/twilio/token` | Public | Twilio webhook/callflow endpoint. | `server/index.js:2456` |
| POST | `/api/twilio/transfer` | Auth (ADMIN, SUPERVISOR, AGENT) | Twilio webhook/callflow endpoint. | `server/index.js:2482` |
| POST | `/twilio/recording/status` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3742` |
| POST | `/twilio/transcription/status` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3820` |
| POST | `/twilio/voice` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3651` |
| POST | `/twilio/voice/handle` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3984` |
| POST | `/twilio/voice/incoming` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3865` |
| POST | `/twilio/voice/route-next` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3927` |

Total endpoints discovered: **107**

> Do not edit manually. Run `npm run worklog:endpoints`.
