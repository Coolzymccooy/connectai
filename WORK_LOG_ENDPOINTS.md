# Endpoint Worklog

Generated: 2026-02-19T23:54:00.301Z

This file is auto-generated from `server/index.js` and updates when new Express routes are added.

| Method | Path | Access | Helper | Source |
| --- | --- | --- | --- | --- |
| GET | `/` | Public | Application API route. | `server/index.js:1845` |
| GET | `/api/admin/users` | Auth (ADMIN) | Application API route. | `server/index.js:2420` |
| POST | `/api/admin/users` | Auth (ADMIN) | Application API route. | `server/index.js:2429` |
| DELETE | `/api/admin/users/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2462` |
| PUT | `/api/admin/users/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2444` |
| GET | `/api/auth/policy` | Public | Application API route. | `server/index.js:1212` |
| POST | `/api/billing/stripe/checkout` | Auth (ADMIN) | Stripe billing checkout/config for top-up and plans. | `server/index.js:2327` |
| GET | `/api/billing/stripe/config` | Auth (ADMIN) | Stripe billing checkout/config for top-up and plans. | `server/index.js:2310` |
| POST | `/api/broadcasts/:id/archive` | Auth (ADMIN) | Admin broadcast creation and archive actions. | `server/index.js:2298` |
| POST | `/api/broadcasts/send` | Auth (ADMIN) | Admin broadcast creation and archive actions. | `server/index.js:2226` |
| GET | `/api/calendar/events` | Public | Application API route. | `server/index.js:2963` |
| POST | `/api/calendar/events` | Public | Application API route. | `server/index.js:3143` |
| DELETE | `/api/calendar/events/:id` | Public | Application API route. | `server/index.js:3160` |
| PUT | `/api/calendar/events/:id` | Public | Application API route. | `server/index.js:3152` |
| POST | `/api/calendar/sync` | Public | Application API route. | `server/index.js:3167` |
| POST | `/api/calendar/webhook` | Public | Application API route. | `server/index.js:3175` |
| GET | `/api/calls` | Auth | Fetch call logs or a single call. | `server/index.js:2656` |
| POST | `/api/calls` | Auth | Create/update call session state. | `server/index.js:2725` |
| GET | `/api/calls/:id` | Auth | Fetch call logs or a single call. | `server/index.js:2699` |
| PUT | `/api/calls/:id` | Auth | Create/update call session state. | `server/index.js:2748` |
| GET | `/api/campaigns` | Public | Application API route. | `server/index.js:2534` |
| POST | `/api/campaigns` | Public | Application API route. | `server/index.js:2543` |
| DELETE | `/api/campaigns/:id` | Public | Application API route. | `server/index.js:2580` |
| PUT | `/api/campaigns/:id` | Public | Application API route. | `server/index.js:2560` |
| POST | `/api/crm/:provider/connect` | Public | CRM provider integration and synchronization. | `server/index.js:3247` |
| POST | `/api/crm/:provider/sync` | Public | CRM provider integration and synchronization. | `server/index.js:3272` |
| GET | `/api/crm/contacts` | Public | CRM provider integration and synchronization. | `server/index.js:3180` |
| POST | `/api/crm/contacts` | Public | CRM provider integration and synchronization. | `server/index.js:3191` |
| GET | `/api/crm/deals` | Public | CRM provider integration and synchronization. | `server/index.js:3205` |
| GET | `/api/crm/hubspot/status` | Auth (ADMIN, SUPERVISOR) | HubSpot status/connect/sync operations. | `server/index.js:3231` |
| POST | `/api/crm/sync` | Public | CRM provider integration and synchronization. | `server/index.js:3219` |
| GET | `/api/crm/tasks` | Public | CRM provider integration and synchronization. | `server/index.js:3200` |
| POST | `/api/crm/tasks` | Public | CRM provider integration and synchronization. | `server/index.js:3210` |
| POST | `/api/crm/webhook` | Public | CRM provider integration and synchronization. | `server/index.js:3227` |
| GET | `/api/dispositions` | Public | Application API route. | `server/index.js:2595` |
| POST | `/api/dispositions` | Public | Application API route. | `server/index.js:2604` |
| DELETE | `/api/dispositions/:id` | Public | Application API route. | `server/index.js:2641` |
| PUT | `/api/dispositions/:id` | Public | Application API route. | `server/index.js:2621` |
| GET | `/api/export` | Auth (ADMIN) | Data export and reporting endpoints. | `server/index.js:3539` |
| POST | `/api/gemini/analysis` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2095` |
| POST | `/api/gemini/campaign-draft` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2000` |
| POST | `/api/gemini/draft` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:1984` |
| POST | `/api/gemini/help` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2079` |
| POST | `/api/gemini/intel` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:1959` |
| POST | `/api/gemini/lead-brief` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2179` |
| POST | `/api/gemini/lead-enrich` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2043` |
| POST | `/api/gemini/live-token` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:4123` |
| POST | `/api/gemini/tool-actions` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2139` |
| POST | `/api/gemini/tts` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:4090` |
| GET | `/api/health` | Public | Service heartbeat and env readiness check. | `server/index.js:1841` |
| GET | `/api/health/deps` | Public | Application API route. | `server/index.js:1910` |
| GET | `/api/integrations/status` | Public | Aggregate integration status snapshot. | `server/index.js:3549` |
| GET | `/api/invites` | Auth (ADMIN) | Create and accept user invitation workflow. | `server/index.js:1233` |
| POST | `/api/invites` | Auth (ADMIN) | Create and accept user invitation workflow. | `server/index.js:1238` |
| POST | `/api/invites/accept` | Public | Create and accept user invitation workflow. | `server/index.js:1260` |
| GET | `/api/jobs` | Auth (ADMIN, SUPERVISOR) | Queue and inspect async background jobs. | `server/index.js:2791` |
| POST | `/api/jobs` | Auth (ADMIN, SUPERVISOR) | Queue and inspect async background jobs. | `server/index.js:2800` |
| POST | `/api/jobs/process` | Public | Queue and inspect async background jobs. | `server/index.js:1936` |
| POST | `/api/marketing/:provider/connect` | Public | Marketing provider connect/sync workflow. | `server/index.js:3410` |
| POST | `/api/marketing/:provider/sync` | Public | Marketing provider connect/sync workflow. | `server/index.js:3419` |
| GET | `/api/marketing/campaigns` | Public | Marketing provider connect/sync workflow. | `server/index.js:3374` |
| POST | `/api/marketing/campaigns` | Public | Marketing provider connect/sync workflow. | `server/index.js:3379` |
| DELETE | `/api/marketing/campaigns/:id` | Public | Marketing provider connect/sync workflow. | `server/index.js:3403` |
| PUT | `/api/marketing/campaigns/:id` | Public | Marketing provider connect/sync workflow. | `server/index.js:3391` |
| GET | `/api/metrics/calls` | Auth (ADMIN, SUPERVISOR) | Operations and usage metrics summary. | `server/index.js:3555` |
| GET | `/api/metrics/summary` | Auth (ADMIN, SUPERVISOR) | Operations and usage metrics summary. | `server/index.js:3560` |
| GET | `/api/oauth/google/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:2986` |
| GET | `/api/oauth/google/start` | Public | OAuth initialization/callback for integrations. | `server/index.js:2968` |
| GET | `/api/oauth/hubspot/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:3111` |
| GET | `/api/oauth/hubspot/readiness` | Auth (ADMIN, SUPERVISOR) | OAuth initialization/callback for integrations. | `server/index.js:3099` |
| GET | `/api/oauth/hubspot/start` | Auth (ADMIN, SUPERVISOR) | OAuth initialization/callback for integrations. | `server/index.js:3084` |
| GET | `/api/oauth/microsoft/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:3053` |
| GET | `/api/oauth/microsoft/start` | Public | OAuth initialization/callback for integrations. | `server/index.js:3036` |
| GET | `/api/public/desktop-release` | Public | Desktop release metadata for download UI. | `server/index.js:1879` |
| GET | `/api/queues` | Public | Application API route. | `server/index.js:2195` |
| POST | `/api/rag/ingest` | Auth | AI generation and retrieval-assisted endpoints. | `server/index.js:1720` |
| POST | `/api/rag/query` | Auth | AI generation and retrieval-assisted endpoints. | `server/index.js:1747` |
| GET | `/api/recordings` | Public | List, fetch, or serve call recordings. | `server/index.js:2809` |
| POST | `/api/recordings` | Public | List, fetch, or serve call recordings. | `server/index.js:2821` |
| PUT | `/api/recordings/:id` | Public | List, fetch, or serve call recordings. | `server/index.js:2838` |
| POST | `/api/recordings/:id/signed-url` | Public | List, fetch, or serve call recordings. | `server/index.js:2905` |
| GET | `/api/recordings/download` | Public | List, fetch, or serve call recordings. | `server/index.js:2923` |
| POST | `/api/recordings/upload` | Public | List, fetch, or serve call recordings. | `server/index.js:2858` |
| GET | `/api/reports/summary` | Public | Application API route. | `server/index.js:3522` |
| GET | `/api/rooms/:roomId` | Auth | Application API route. | `server/index.js:1178` |
| POST | `/api/rooms/join` | Auth | Application API route. | `server/index.js:1185` |
| POST | `/api/rooms/leave` | Auth | Application API route. | `server/index.js:1199` |
| GET | `/api/settings` | Public | Read/save tenant application settings. | `server/index.js:2200` |
| PUT | `/api/settings` | Public | Read/save tenant application settings. | `server/index.js:2218` |
| POST | `/api/supervisor/monitor` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3572` |
| POST | `/api/supervisor/monitor/status` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3631` |
| POST | `/api/supervisor/monitor/stop` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3608` |
| GET | `/api/supervisor/stats` | Auth (ADMIN, SUPERVISOR) | Application API route. | `server/index.js:1278` |
| GET | `/api/tenants` | Auth (ADMIN) | Application API route. | `server/index.js:2379` |
| POST | `/api/tenants` | Auth (ADMIN) | Application API route. | `server/index.js:2387` |
| PUT | `/api/tenants/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2402` |
| POST | `/api/termii/webhook` | Public | Application API route. | `server/index.js:3439` |
| POST | `/api/termii/whatsapp/send` | Auth (ADMIN, SUPERVISOR) | Application API route. | `server/index.js:3428` |
| GET | `/api/twilio/capabilities` | Auth (ADMIN, SUPERVISOR) | Twilio monitor/listen readiness diagnostics. | `server/index.js:3016` |
| GET | `/api/twilio/token` | Public | Twilio webhook/callflow endpoint. | `server/index.js:2475` |
| POST | `/api/twilio/transfer` | Auth (ADMIN, SUPERVISOR, AGENT) | Twilio webhook/callflow endpoint. | `server/index.js:2501` |
| POST | `/twilio/recording/status` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3761` |
| POST | `/twilio/transcription/status` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3839` |
| POST | `/twilio/voice` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3670` |
| POST | `/twilio/voice/handle` | Public | Twilio webhook/callflow endpoint. | `server/index.js:4003` |
| POST | `/twilio/voice/incoming` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3884` |
| POST | `/twilio/voice/route-next` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3946` |

Total endpoints discovered: **107**

> Do not edit manually. Run `npm run worklog:endpoints`.
