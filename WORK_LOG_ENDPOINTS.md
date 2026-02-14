# Endpoint Worklog

Generated: 2026-02-14T19:33:33.173Z

This file is auto-generated from `server/index.js` and updates when new Express routes are added.

| Method | Path | Access | Helper | Source |
| --- | --- | --- | --- | --- |
| GET | `/` | Public | Application API route. | `server/index.js:1814` |
| GET | `/api/admin/users` | Auth (ADMIN) | Application API route. | `server/index.js:2383` |
| POST | `/api/admin/users` | Auth (ADMIN) | Application API route. | `server/index.js:2392` |
| DELETE | `/api/admin/users/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2425` |
| PUT | `/api/admin/users/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2407` |
| GET | `/api/auth/policy` | Public | Application API route. | `server/index.js:1192` |
| POST | `/api/billing/stripe/checkout` | Auth (ADMIN) | Stripe billing checkout/config for top-up and plans. | `server/index.js:2290` |
| GET | `/api/billing/stripe/config` | Auth (ADMIN) | Stripe billing checkout/config for top-up and plans. | `server/index.js:2273` |
| POST | `/api/broadcasts/:id/archive` | Auth (ADMIN) | Admin broadcast creation and archive actions. | `server/index.js:2261` |
| POST | `/api/broadcasts/send` | Auth (ADMIN) | Admin broadcast creation and archive actions. | `server/index.js:2189` |
| GET | `/api/calendar/events` | Public | Application API route. | `server/index.js:2926` |
| POST | `/api/calendar/events` | Public | Application API route. | `server/index.js:3106` |
| DELETE | `/api/calendar/events/:id` | Public | Application API route. | `server/index.js:3123` |
| PUT | `/api/calendar/events/:id` | Public | Application API route. | `server/index.js:3115` |
| POST | `/api/calendar/sync` | Public | Application API route. | `server/index.js:3130` |
| POST | `/api/calendar/webhook` | Public | Application API route. | `server/index.js:3138` |
| GET | `/api/calls` | Auth | Fetch call logs or a single call. | `server/index.js:2619` |
| POST | `/api/calls` | Auth | Create/update call session state. | `server/index.js:2688` |
| GET | `/api/calls/:id` | Auth | Fetch call logs or a single call. | `server/index.js:2662` |
| PUT | `/api/calls/:id` | Auth | Create/update call session state. | `server/index.js:2711` |
| GET | `/api/campaigns` | Public | Application API route. | `server/index.js:2497` |
| POST | `/api/campaigns` | Public | Application API route. | `server/index.js:2506` |
| DELETE | `/api/campaigns/:id` | Public | Application API route. | `server/index.js:2543` |
| PUT | `/api/campaigns/:id` | Public | Application API route. | `server/index.js:2523` |
| POST | `/api/crm/:provider/connect` | Public | CRM provider integration and synchronization. | `server/index.js:3210` |
| POST | `/api/crm/:provider/sync` | Public | CRM provider integration and synchronization. | `server/index.js:3235` |
| GET | `/api/crm/contacts` | Public | CRM provider integration and synchronization. | `server/index.js:3143` |
| POST | `/api/crm/contacts` | Public | CRM provider integration and synchronization. | `server/index.js:3154` |
| GET | `/api/crm/deals` | Public | CRM provider integration and synchronization. | `server/index.js:3168` |
| GET | `/api/crm/hubspot/status` | Auth (ADMIN, SUPERVISOR) | HubSpot status/connect/sync operations. | `server/index.js:3194` |
| POST | `/api/crm/sync` | Public | CRM provider integration and synchronization. | `server/index.js:3182` |
| GET | `/api/crm/tasks` | Public | CRM provider integration and synchronization. | `server/index.js:3163` |
| POST | `/api/crm/tasks` | Public | CRM provider integration and synchronization. | `server/index.js:3173` |
| POST | `/api/crm/webhook` | Public | CRM provider integration and synchronization. | `server/index.js:3190` |
| GET | `/api/dispositions` | Public | Application API route. | `server/index.js:2558` |
| POST | `/api/dispositions` | Public | Application API route. | `server/index.js:2567` |
| DELETE | `/api/dispositions/:id` | Public | Application API route. | `server/index.js:2604` |
| PUT | `/api/dispositions/:id` | Public | Application API route. | `server/index.js:2584` |
| GET | `/api/export` | Auth (ADMIN) | Data export and reporting endpoints. | `server/index.js:3502` |
| POST | `/api/gemini/analysis` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2064` |
| POST | `/api/gemini/campaign-draft` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:1969` |
| POST | `/api/gemini/draft` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:1953` |
| POST | `/api/gemini/help` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2048` |
| POST | `/api/gemini/intel` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:1928` |
| POST | `/api/gemini/lead-brief` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2148` |
| POST | `/api/gemini/lead-enrich` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2012` |
| POST | `/api/gemini/live-token` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:4086` |
| POST | `/api/gemini/tool-actions` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2108` |
| POST | `/api/gemini/tts` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:4053` |
| GET | `/api/health` | Public | Service heartbeat and env readiness check. | `server/index.js:1810` |
| GET | `/api/health/deps` | Public | Application API route. | `server/index.js:1879` |
| GET | `/api/integrations/status` | Public | Aggregate integration status snapshot. | `server/index.js:3512` |
| GET | `/api/invites` | Auth (ADMIN) | Create and accept user invitation workflow. | `server/index.js:1213` |
| POST | `/api/invites` | Auth (ADMIN) | Create and accept user invitation workflow. | `server/index.js:1218` |
| POST | `/api/invites/accept` | Public | Create and accept user invitation workflow. | `server/index.js:1240` |
| GET | `/api/jobs` | Auth (ADMIN, SUPERVISOR) | Queue and inspect async background jobs. | `server/index.js:2754` |
| POST | `/api/jobs` | Auth (ADMIN, SUPERVISOR) | Queue and inspect async background jobs. | `server/index.js:2763` |
| POST | `/api/jobs/process` | Public | Queue and inspect async background jobs. | `server/index.js:1905` |
| POST | `/api/marketing/:provider/connect` | Public | Marketing provider connect/sync workflow. | `server/index.js:3373` |
| POST | `/api/marketing/:provider/sync` | Public | Marketing provider connect/sync workflow. | `server/index.js:3382` |
| GET | `/api/marketing/campaigns` | Public | Marketing provider connect/sync workflow. | `server/index.js:3337` |
| POST | `/api/marketing/campaigns` | Public | Marketing provider connect/sync workflow. | `server/index.js:3342` |
| DELETE | `/api/marketing/campaigns/:id` | Public | Marketing provider connect/sync workflow. | `server/index.js:3366` |
| PUT | `/api/marketing/campaigns/:id` | Public | Marketing provider connect/sync workflow. | `server/index.js:3354` |
| GET | `/api/metrics/calls` | Auth (ADMIN, SUPERVISOR) | Operations and usage metrics summary. | `server/index.js:3518` |
| GET | `/api/metrics/summary` | Auth (ADMIN, SUPERVISOR) | Operations and usage metrics summary. | `server/index.js:3523` |
| GET | `/api/oauth/google/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:2949` |
| GET | `/api/oauth/google/start` | Public | OAuth initialization/callback for integrations. | `server/index.js:2931` |
| GET | `/api/oauth/hubspot/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:3074` |
| GET | `/api/oauth/hubspot/readiness` | Auth (ADMIN, SUPERVISOR) | OAuth initialization/callback for integrations. | `server/index.js:3062` |
| GET | `/api/oauth/hubspot/start` | Auth (ADMIN, SUPERVISOR) | OAuth initialization/callback for integrations. | `server/index.js:3047` |
| GET | `/api/oauth/microsoft/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:3016` |
| GET | `/api/oauth/microsoft/start` | Public | OAuth initialization/callback for integrations. | `server/index.js:2999` |
| GET | `/api/public/desktop-release` | Public | Desktop release metadata for download UI. | `server/index.js:1848` |
| GET | `/api/queues` | Public | Application API route. | `server/index.js:2164` |
| POST | `/api/rag/ingest` | Auth | AI generation and retrieval-assisted endpoints. | `server/index.js:1689` |
| POST | `/api/rag/query` | Auth | AI generation and retrieval-assisted endpoints. | `server/index.js:1716` |
| GET | `/api/recordings` | Public | List, fetch, or serve call recordings. | `server/index.js:2772` |
| POST | `/api/recordings` | Public | List, fetch, or serve call recordings. | `server/index.js:2784` |
| PUT | `/api/recordings/:id` | Public | List, fetch, or serve call recordings. | `server/index.js:2801` |
| POST | `/api/recordings/:id/signed-url` | Public | List, fetch, or serve call recordings. | `server/index.js:2868` |
| GET | `/api/recordings/download` | Public | List, fetch, or serve call recordings. | `server/index.js:2886` |
| POST | `/api/recordings/upload` | Public | List, fetch, or serve call recordings. | `server/index.js:2821` |
| GET | `/api/reports/summary` | Public | Application API route. | `server/index.js:3485` |
| GET | `/api/rooms/:roomId` | Auth | Application API route. | `server/index.js:1158` |
| POST | `/api/rooms/join` | Auth | Application API route. | `server/index.js:1165` |
| POST | `/api/rooms/leave` | Auth | Application API route. | `server/index.js:1179` |
| GET | `/api/settings` | Public | Read/save tenant application settings. | `server/index.js:2169` |
| PUT | `/api/settings` | Public | Read/save tenant application settings. | `server/index.js:2181` |
| POST | `/api/supervisor/monitor` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3535` |
| POST | `/api/supervisor/monitor/status` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3594` |
| POST | `/api/supervisor/monitor/stop` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3571` |
| GET | `/api/supervisor/stats` | Auth (ADMIN, SUPERVISOR) | Application API route. | `server/index.js:1258` |
| GET | `/api/tenants` | Auth (ADMIN) | Application API route. | `server/index.js:2342` |
| POST | `/api/tenants` | Auth (ADMIN) | Application API route. | `server/index.js:2350` |
| PUT | `/api/tenants/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2365` |
| POST | `/api/termii/webhook` | Public | Application API route. | `server/index.js:3402` |
| POST | `/api/termii/whatsapp/send` | Auth (ADMIN, SUPERVISOR) | Application API route. | `server/index.js:3391` |
| GET | `/api/twilio/capabilities` | Auth (ADMIN, SUPERVISOR) | Twilio monitor/listen readiness diagnostics. | `server/index.js:2979` |
| GET | `/api/twilio/token` | Public | Twilio webhook/callflow endpoint. | `server/index.js:2438` |
| POST | `/api/twilio/transfer` | Auth (ADMIN, SUPERVISOR, AGENT) | Twilio webhook/callflow endpoint. | `server/index.js:2464` |
| POST | `/twilio/recording/status` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3724` |
| POST | `/twilio/transcription/status` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3802` |
| POST | `/twilio/voice` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3633` |
| POST | `/twilio/voice/handle` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3966` |
| POST | `/twilio/voice/incoming` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3847` |
| POST | `/twilio/voice/route-next` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3909` |

Total endpoints discovered: **107**

> Do not edit manually. Run `npm run worklog:endpoints`.
