# Endpoint Worklog

Generated: 2026-02-20T01:28:55.296Z

This file is auto-generated from `server/index.js` and updates when new Express routes are added.

| Method | Path | Access | Helper | Source |
| --- | --- | --- | --- | --- |
| GET | `/` | Public | Application API route. | `server/index.js:1929` |
| GET | `/api/admin/users` | Auth (ADMIN) | Application API route. | `server/index.js:2504` |
| POST | `/api/admin/users` | Auth (ADMIN) | Application API route. | `server/index.js:2513` |
| DELETE | `/api/admin/users/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2546` |
| PUT | `/api/admin/users/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2528` |
| GET | `/api/auth/policy` | Public | Application API route. | `server/index.js:1292` |
| POST | `/api/billing/stripe/checkout` | Auth (ADMIN) | Stripe billing checkout/config for top-up and plans. | `server/index.js:2411` |
| GET | `/api/billing/stripe/config` | Auth (ADMIN) | Stripe billing checkout/config for top-up and plans. | `server/index.js:2394` |
| POST | `/api/broadcasts/:id/archive` | Auth (ADMIN) | Admin broadcast creation and archive actions. | `server/index.js:2382` |
| POST | `/api/broadcasts/send` | Auth (ADMIN) | Admin broadcast creation and archive actions. | `server/index.js:2310` |
| GET | `/api/calendar/events` | Public | Application API route. | `server/index.js:3046` |
| POST | `/api/calendar/events` | Public | Application API route. | `server/index.js:3226` |
| DELETE | `/api/calendar/events/:id` | Public | Application API route. | `server/index.js:3243` |
| PUT | `/api/calendar/events/:id` | Public | Application API route. | `server/index.js:3235` |
| POST | `/api/calendar/sync` | Public | Application API route. | `server/index.js:3250` |
| POST | `/api/calendar/webhook` | Public | Application API route. | `server/index.js:3258` |
| GET | `/api/calls` | Auth | Fetch call logs or a single call. | `server/index.js:2740` |
| POST | `/api/calls` | Auth | Create/update call session state. | `server/index.js:2809` |
| GET | `/api/calls/:id` | Auth | Fetch call logs or a single call. | `server/index.js:2783` |
| PUT | `/api/calls/:id` | Auth | Create/update call session state. | `server/index.js:2835` |
| GET | `/api/campaigns` | Public | Application API route. | `server/index.js:2618` |
| POST | `/api/campaigns` | Public | Application API route. | `server/index.js:2627` |
| DELETE | `/api/campaigns/:id` | Public | Application API route. | `server/index.js:2664` |
| PUT | `/api/campaigns/:id` | Public | Application API route. | `server/index.js:2644` |
| POST | `/api/crm/:provider/connect` | Public | CRM provider integration and synchronization. | `server/index.js:3330` |
| POST | `/api/crm/:provider/sync` | Public | CRM provider integration and synchronization. | `server/index.js:3355` |
| GET | `/api/crm/contacts` | Public | CRM provider integration and synchronization. | `server/index.js:3263` |
| POST | `/api/crm/contacts` | Public | CRM provider integration and synchronization. | `server/index.js:3274` |
| GET | `/api/crm/deals` | Public | CRM provider integration and synchronization. | `server/index.js:3288` |
| GET | `/api/crm/hubspot/status` | Auth (ADMIN, SUPERVISOR) | HubSpot status/connect/sync operations. | `server/index.js:3314` |
| POST | `/api/crm/sync` | Public | CRM provider integration and synchronization. | `server/index.js:3302` |
| GET | `/api/crm/tasks` | Public | CRM provider integration and synchronization. | `server/index.js:3283` |
| POST | `/api/crm/tasks` | Public | CRM provider integration and synchronization. | `server/index.js:3293` |
| POST | `/api/crm/webhook` | Public | CRM provider integration and synchronization. | `server/index.js:3310` |
| GET | `/api/dispositions` | Public | Application API route. | `server/index.js:2679` |
| POST | `/api/dispositions` | Public | Application API route. | `server/index.js:2688` |
| DELETE | `/api/dispositions/:id` | Public | Application API route. | `server/index.js:2725` |
| PUT | `/api/dispositions/:id` | Public | Application API route. | `server/index.js:2705` |
| GET | `/api/export` | Auth (ADMIN) | Data export and reporting endpoints. | `server/index.js:3622` |
| POST | `/api/gemini/analysis` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2179` |
| POST | `/api/gemini/campaign-draft` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2084` |
| POST | `/api/gemini/draft` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2068` |
| POST | `/api/gemini/help` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2163` |
| POST | `/api/gemini/intel` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2043` |
| POST | `/api/gemini/lead-brief` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2263` |
| POST | `/api/gemini/lead-enrich` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2127` |
| POST | `/api/gemini/live-token` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:4222` |
| POST | `/api/gemini/tool-actions` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2223` |
| POST | `/api/gemini/tts` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:4189` |
| GET | `/api/health` | Public | Service heartbeat and env readiness check. | `server/index.js:1925` |
| GET | `/api/health/deps` | Public | Application API route. | `server/index.js:1994` |
| GET | `/api/integrations/status` | Public | Aggregate integration status snapshot. | `server/index.js:3632` |
| GET | `/api/invites` | Auth (ADMIN) | Create and accept user invitation workflow. | `server/index.js:1313` |
| POST | `/api/invites` | Auth (ADMIN) | Create and accept user invitation workflow. | `server/index.js:1318` |
| POST | `/api/invites/accept` | Public | Create and accept user invitation workflow. | `server/index.js:1340` |
| GET | `/api/jobs` | Auth (ADMIN, SUPERVISOR) | Queue and inspect async background jobs. | `server/index.js:2874` |
| POST | `/api/jobs` | Auth (ADMIN, SUPERVISOR) | Queue and inspect async background jobs. | `server/index.js:2883` |
| POST | `/api/jobs/process` | Public | Queue and inspect async background jobs. | `server/index.js:2020` |
| POST | `/api/marketing/:provider/connect` | Public | Marketing provider connect/sync workflow. | `server/index.js:3493` |
| POST | `/api/marketing/:provider/sync` | Public | Marketing provider connect/sync workflow. | `server/index.js:3502` |
| GET | `/api/marketing/campaigns` | Public | Marketing provider connect/sync workflow. | `server/index.js:3457` |
| POST | `/api/marketing/campaigns` | Public | Marketing provider connect/sync workflow. | `server/index.js:3462` |
| DELETE | `/api/marketing/campaigns/:id` | Public | Marketing provider connect/sync workflow. | `server/index.js:3486` |
| PUT | `/api/marketing/campaigns/:id` | Public | Marketing provider connect/sync workflow. | `server/index.js:3474` |
| GET | `/api/metrics/calls` | Auth (ADMIN, SUPERVISOR) | Operations and usage metrics summary. | `server/index.js:3638` |
| GET | `/api/metrics/summary` | Auth (ADMIN, SUPERVISOR) | Operations and usage metrics summary. | `server/index.js:3643` |
| GET | `/api/oauth/google/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:3069` |
| GET | `/api/oauth/google/start` | Public | OAuth initialization/callback for integrations. | `server/index.js:3051` |
| GET | `/api/oauth/hubspot/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:3194` |
| GET | `/api/oauth/hubspot/readiness` | Auth (ADMIN, SUPERVISOR) | OAuth initialization/callback for integrations. | `server/index.js:3182` |
| GET | `/api/oauth/hubspot/start` | Auth (ADMIN, SUPERVISOR) | OAuth initialization/callback for integrations. | `server/index.js:3167` |
| GET | `/api/oauth/microsoft/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:3136` |
| GET | `/api/oauth/microsoft/start` | Public | OAuth initialization/callback for integrations. | `server/index.js:3119` |
| GET | `/api/public/desktop-release` | Public | Desktop release metadata for download UI. | `server/index.js:1963` |
| GET | `/api/queues` | Public | Application API route. | `server/index.js:2279` |
| POST | `/api/rag/ingest` | Auth | AI generation and retrieval-assisted endpoints. | `server/index.js:1804` |
| POST | `/api/rag/query` | Auth | AI generation and retrieval-assisted endpoints. | `server/index.js:1831` |
| GET | `/api/recordings` | Public | List, fetch, or serve call recordings. | `server/index.js:2892` |
| POST | `/api/recordings` | Public | List, fetch, or serve call recordings. | `server/index.js:2904` |
| PUT | `/api/recordings/:id` | Public | List, fetch, or serve call recordings. | `server/index.js:2921` |
| POST | `/api/recordings/:id/signed-url` | Public | List, fetch, or serve call recordings. | `server/index.js:2988` |
| GET | `/api/recordings/download` | Public | List, fetch, or serve call recordings. | `server/index.js:3006` |
| POST | `/api/recordings/upload` | Public | List, fetch, or serve call recordings. | `server/index.js:2941` |
| GET | `/api/reports/summary` | Public | Application API route. | `server/index.js:3605` |
| GET | `/api/rooms/:roomId` | Auth | Application API route. | `server/index.js:1258` |
| POST | `/api/rooms/join` | Auth | Application API route. | `server/index.js:1265` |
| POST | `/api/rooms/leave` | Auth | Application API route. | `server/index.js:1279` |
| GET | `/api/settings` | Public | Read/save tenant application settings. | `server/index.js:2284` |
| PUT | `/api/settings` | Public | Read/save tenant application settings. | `server/index.js:2302` |
| POST | `/api/supervisor/monitor` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3655` |
| POST | `/api/supervisor/monitor/status` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3714` |
| POST | `/api/supervisor/monitor/stop` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3691` |
| GET | `/api/supervisor/stats` | Auth (ADMIN, SUPERVISOR) | Application API route. | `server/index.js:1358` |
| GET | `/api/tenants` | Auth (ADMIN) | Application API route. | `server/index.js:2463` |
| POST | `/api/tenants` | Auth (ADMIN) | Application API route. | `server/index.js:2471` |
| PUT | `/api/tenants/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2486` |
| POST | `/api/termii/webhook` | Public | Application API route. | `server/index.js:3522` |
| POST | `/api/termii/whatsapp/send` | Auth (ADMIN, SUPERVISOR) | Application API route. | `server/index.js:3511` |
| GET | `/api/twilio/capabilities` | Auth (ADMIN, SUPERVISOR) | Twilio monitor/listen readiness diagnostics. | `server/index.js:3099` |
| GET | `/api/twilio/token` | Public | Twilio webhook/callflow endpoint. | `server/index.js:2559` |
| POST | `/api/twilio/transfer` | Auth (ADMIN, SUPERVISOR, AGENT) | Twilio webhook/callflow endpoint. | `server/index.js:2585` |
| POST | `/twilio/recording/status` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3844` |
| POST | `/twilio/transcription/status` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3922` |
| POST | `/twilio/voice` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3753` |
| POST | `/twilio/voice/handle` | Public | Twilio webhook/callflow endpoint. | `server/index.js:4102` |
| POST | `/twilio/voice/incoming` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3982` |
| POST | `/twilio/voice/route-next` | Public | Twilio webhook/callflow endpoint. | `server/index.js:4047` |

Total endpoints discovered: **107**

> Do not edit manually. Run `npm run worklog:endpoints`.
