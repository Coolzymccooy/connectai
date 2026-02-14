# Endpoint Worklog

Generated: 2026-02-14T17:40:06.480Z

This file is auto-generated from `server/index.js` and updates when new Express routes are added.

| Method | Path | Access | Helper | Source |
| --- | --- | --- | --- | --- |
| GET | `/` | Public | Application API route. | `server/index.js:1795` |
| GET | `/api/admin/users` | Auth (ADMIN) | Application API route. | `server/index.js:2359` |
| POST | `/api/admin/users` | Auth (ADMIN) | Application API route. | `server/index.js:2368` |
| DELETE | `/api/admin/users/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2401` |
| PUT | `/api/admin/users/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2383` |
| GET | `/api/auth/policy` | Public | Application API route. | `server/index.js:1173` |
| POST | `/api/billing/stripe/checkout` | Auth (ADMIN) | Stripe billing checkout/config for top-up and plans. | `server/index.js:2266` |
| GET | `/api/billing/stripe/config` | Auth (ADMIN) | Stripe billing checkout/config for top-up and plans. | `server/index.js:2249` |
| POST | `/api/broadcasts/:id/archive` | Auth (ADMIN) | Admin broadcast creation and archive actions. | `server/index.js:2237` |
| POST | `/api/broadcasts/send` | Auth (ADMIN) | Admin broadcast creation and archive actions. | `server/index.js:2165` |
| GET | `/api/calendar/events` | Public | Application API route. | `server/index.js:2902` |
| POST | `/api/calendar/events` | Public | Application API route. | `server/index.js:3082` |
| DELETE | `/api/calendar/events/:id` | Public | Application API route. | `server/index.js:3099` |
| PUT | `/api/calendar/events/:id` | Public | Application API route. | `server/index.js:3091` |
| POST | `/api/calendar/sync` | Public | Application API route. | `server/index.js:3106` |
| POST | `/api/calendar/webhook` | Public | Application API route. | `server/index.js:3114` |
| GET | `/api/calls` | Auth | Fetch call logs or a single call. | `server/index.js:2595` |
| POST | `/api/calls` | Auth | Create/update call session state. | `server/index.js:2664` |
| GET | `/api/calls/:id` | Auth | Fetch call logs or a single call. | `server/index.js:2638` |
| PUT | `/api/calls/:id` | Auth | Create/update call session state. | `server/index.js:2687` |
| GET | `/api/campaigns` | Public | Application API route. | `server/index.js:2473` |
| POST | `/api/campaigns` | Public | Application API route. | `server/index.js:2482` |
| DELETE | `/api/campaigns/:id` | Public | Application API route. | `server/index.js:2519` |
| PUT | `/api/campaigns/:id` | Public | Application API route. | `server/index.js:2499` |
| POST | `/api/crm/:provider/connect` | Public | CRM provider integration and synchronization. | `server/index.js:3186` |
| POST | `/api/crm/:provider/sync` | Public | CRM provider integration and synchronization. | `server/index.js:3211` |
| GET | `/api/crm/contacts` | Public | CRM provider integration and synchronization. | `server/index.js:3119` |
| POST | `/api/crm/contacts` | Public | CRM provider integration and synchronization. | `server/index.js:3130` |
| GET | `/api/crm/deals` | Public | CRM provider integration and synchronization. | `server/index.js:3144` |
| GET | `/api/crm/hubspot/status` | Auth (ADMIN, SUPERVISOR) | HubSpot status/connect/sync operations. | `server/index.js:3170` |
| POST | `/api/crm/sync` | Public | CRM provider integration and synchronization. | `server/index.js:3158` |
| GET | `/api/crm/tasks` | Public | CRM provider integration and synchronization. | `server/index.js:3139` |
| POST | `/api/crm/tasks` | Public | CRM provider integration and synchronization. | `server/index.js:3149` |
| POST | `/api/crm/webhook` | Public | CRM provider integration and synchronization. | `server/index.js:3166` |
| GET | `/api/dispositions` | Public | Application API route. | `server/index.js:2534` |
| POST | `/api/dispositions` | Public | Application API route. | `server/index.js:2543` |
| DELETE | `/api/dispositions/:id` | Public | Application API route. | `server/index.js:2580` |
| PUT | `/api/dispositions/:id` | Public | Application API route. | `server/index.js:2560` |
| GET | `/api/export` | Auth (ADMIN) | Data export and reporting endpoints. | `server/index.js:3478` |
| POST | `/api/gemini/analysis` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2040` |
| POST | `/api/gemini/campaign-draft` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:1945` |
| POST | `/api/gemini/draft` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:1929` |
| POST | `/api/gemini/help` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2024` |
| POST | `/api/gemini/intel` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:1904` |
| POST | `/api/gemini/lead-brief` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2124` |
| POST | `/api/gemini/lead-enrich` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:1988` |
| POST | `/api/gemini/live-token` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:4062` |
| POST | `/api/gemini/tool-actions` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2084` |
| POST | `/api/gemini/tts` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:4029` |
| GET | `/api/health` | Public | Service heartbeat and env readiness check. | `server/index.js:1791` |
| GET | `/api/health/deps` | Public | Application API route. | `server/index.js:1855` |
| GET | `/api/integrations/status` | Public | Aggregate integration status snapshot. | `server/index.js:3488` |
| GET | `/api/invites` | Auth (ADMIN) | Create and accept user invitation workflow. | `server/index.js:1194` |
| POST | `/api/invites` | Auth (ADMIN) | Create and accept user invitation workflow. | `server/index.js:1199` |
| POST | `/api/invites/accept` | Public | Create and accept user invitation workflow. | `server/index.js:1221` |
| GET | `/api/jobs` | Auth (ADMIN, SUPERVISOR) | Queue and inspect async background jobs. | `server/index.js:2730` |
| POST | `/api/jobs` | Auth (ADMIN, SUPERVISOR) | Queue and inspect async background jobs. | `server/index.js:2739` |
| POST | `/api/jobs/process` | Public | Queue and inspect async background jobs. | `server/index.js:1881` |
| POST | `/api/marketing/:provider/connect` | Public | Marketing provider connect/sync workflow. | `server/index.js:3349` |
| POST | `/api/marketing/:provider/sync` | Public | Marketing provider connect/sync workflow. | `server/index.js:3358` |
| GET | `/api/marketing/campaigns` | Public | Marketing provider connect/sync workflow. | `server/index.js:3313` |
| POST | `/api/marketing/campaigns` | Public | Marketing provider connect/sync workflow. | `server/index.js:3318` |
| DELETE | `/api/marketing/campaigns/:id` | Public | Marketing provider connect/sync workflow. | `server/index.js:3342` |
| PUT | `/api/marketing/campaigns/:id` | Public | Marketing provider connect/sync workflow. | `server/index.js:3330` |
| GET | `/api/metrics/calls` | Auth (ADMIN, SUPERVISOR) | Operations and usage metrics summary. | `server/index.js:3494` |
| GET | `/api/metrics/summary` | Auth (ADMIN, SUPERVISOR) | Operations and usage metrics summary. | `server/index.js:3499` |
| GET | `/api/oauth/google/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:2925` |
| GET | `/api/oauth/google/start` | Public | OAuth initialization/callback for integrations. | `server/index.js:2907` |
| GET | `/api/oauth/hubspot/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:3050` |
| GET | `/api/oauth/hubspot/readiness` | Auth (ADMIN, SUPERVISOR) | OAuth initialization/callback for integrations. | `server/index.js:3038` |
| GET | `/api/oauth/hubspot/start` | Auth (ADMIN, SUPERVISOR) | OAuth initialization/callback for integrations. | `server/index.js:3023` |
| GET | `/api/oauth/microsoft/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:2992` |
| GET | `/api/oauth/microsoft/start` | Public | OAuth initialization/callback for integrations. | `server/index.js:2975` |
| GET | `/api/public/desktop-release` | Public | Desktop release metadata for download UI. | `server/index.js:1829` |
| GET | `/api/queues` | Public | Application API route. | `server/index.js:2140` |
| POST | `/api/rag/ingest` | Auth | AI generation and retrieval-assisted endpoints. | `server/index.js:1670` |
| POST | `/api/rag/query` | Auth | AI generation and retrieval-assisted endpoints. | `server/index.js:1697` |
| GET | `/api/recordings` | Public | List, fetch, or serve call recordings. | `server/index.js:2748` |
| POST | `/api/recordings` | Public | List, fetch, or serve call recordings. | `server/index.js:2760` |
| PUT | `/api/recordings/:id` | Public | List, fetch, or serve call recordings. | `server/index.js:2777` |
| POST | `/api/recordings/:id/signed-url` | Public | List, fetch, or serve call recordings. | `server/index.js:2844` |
| GET | `/api/recordings/download` | Public | List, fetch, or serve call recordings. | `server/index.js:2862` |
| POST | `/api/recordings/upload` | Public | List, fetch, or serve call recordings. | `server/index.js:2797` |
| GET | `/api/reports/summary` | Public | Application API route. | `server/index.js:3461` |
| GET | `/api/rooms/:roomId` | Auth | Application API route. | `server/index.js:1139` |
| POST | `/api/rooms/join` | Auth | Application API route. | `server/index.js:1146` |
| POST | `/api/rooms/leave` | Auth | Application API route. | `server/index.js:1160` |
| GET | `/api/settings` | Public | Read/save tenant application settings. | `server/index.js:2145` |
| PUT | `/api/settings` | Public | Read/save tenant application settings. | `server/index.js:2157` |
| POST | `/api/supervisor/monitor` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3511` |
| POST | `/api/supervisor/monitor/status` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3570` |
| POST | `/api/supervisor/monitor/stop` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3547` |
| GET | `/api/supervisor/stats` | Auth (ADMIN, SUPERVISOR) | Application API route. | `server/index.js:1239` |
| GET | `/api/tenants` | Auth (ADMIN) | Application API route. | `server/index.js:2318` |
| POST | `/api/tenants` | Auth (ADMIN) | Application API route. | `server/index.js:2326` |
| PUT | `/api/tenants/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2341` |
| POST | `/api/termii/webhook` | Public | Application API route. | `server/index.js:3378` |
| POST | `/api/termii/whatsapp/send` | Auth (ADMIN, SUPERVISOR) | Application API route. | `server/index.js:3367` |
| GET | `/api/twilio/capabilities` | Auth (ADMIN, SUPERVISOR) | Twilio monitor/listen readiness diagnostics. | `server/index.js:2955` |
| GET | `/api/twilio/token` | Public | Twilio webhook/callflow endpoint. | `server/index.js:2414` |
| POST | `/api/twilio/transfer` | Auth (ADMIN, SUPERVISOR, AGENT) | Twilio webhook/callflow endpoint. | `server/index.js:2440` |
| POST | `/twilio/recording/status` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3700` |
| POST | `/twilio/transcription/status` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3778` |
| POST | `/twilio/voice` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3609` |
| POST | `/twilio/voice/handle` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3942` |
| POST | `/twilio/voice/incoming` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3823` |
| POST | `/twilio/voice/route-next` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3885` |

Total endpoints discovered: **107**

> Do not edit manually. Run `npm run worklog:endpoints`.
