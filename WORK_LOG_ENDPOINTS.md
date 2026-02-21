# Endpoint Worklog

Generated: 2026-02-21T13:43:44.722Z

This file is auto-generated from `server/index.js` and updates when new Express routes are added.

| Method | Path | Access | Helper | Source |
| --- | --- | --- | --- | --- |
| GET | `/` | Public | Application API route. | `server/index.js:2098` |
| GET | `/api/admin/users` | Auth (ADMIN) | Application API route. | `server/index.js:2707` |
| POST | `/api/admin/users` | Auth (ADMIN) | Application API route. | `server/index.js:2716` |
| DELETE | `/api/admin/users/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2749` |
| PUT | `/api/admin/users/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2731` |
| GET | `/api/auth/policy` | Public | Application API route. | `server/index.js:1442` |
| POST | `/api/billing/stripe/checkout` | Auth (ADMIN) | Stripe billing checkout/config for top-up and plans. | `server/index.js:2614` |
| GET | `/api/billing/stripe/config` | Auth (ADMIN) | Stripe billing checkout/config for top-up and plans. | `server/index.js:2597` |
| POST | `/api/broadcasts/:id/archive` | Auth (ADMIN) | Admin broadcast creation and archive actions. | `server/index.js:2585` |
| POST | `/api/broadcasts/send` | Auth (ADMIN) | Admin broadcast creation and archive actions. | `server/index.js:2513` |
| GET | `/api/calendar/events` | Public | Application API route. | `server/index.js:3249` |
| POST | `/api/calendar/events` | Public | Application API route. | `server/index.js:3429` |
| DELETE | `/api/calendar/events/:id` | Public | Application API route. | `server/index.js:3446` |
| PUT | `/api/calendar/events/:id` | Public | Application API route. | `server/index.js:3438` |
| POST | `/api/calendar/sync` | Public | Application API route. | `server/index.js:3453` |
| POST | `/api/calendar/webhook` | Public | Application API route. | `server/index.js:3461` |
| GET | `/api/calls` | Auth | Fetch call logs or a single call. | `server/index.js:2943` |
| POST | `/api/calls` | Auth | Create/update call session state. | `server/index.js:3012` |
| GET | `/api/calls/:id` | Auth | Fetch call logs or a single call. | `server/index.js:2986` |
| PUT | `/api/calls/:id` | Auth | Create/update call session state. | `server/index.js:3038` |
| GET | `/api/campaigns` | Public | Application API route. | `server/index.js:2821` |
| POST | `/api/campaigns` | Public | Application API route. | `server/index.js:2830` |
| DELETE | `/api/campaigns/:id` | Public | Application API route. | `server/index.js:2867` |
| PUT | `/api/campaigns/:id` | Public | Application API route. | `server/index.js:2847` |
| POST | `/api/crm/:provider/connect` | Public | CRM provider integration and synchronization. | `server/index.js:3533` |
| POST | `/api/crm/:provider/sync` | Public | CRM provider integration and synchronization. | `server/index.js:3558` |
| GET | `/api/crm/contacts` | Public | CRM provider integration and synchronization. | `server/index.js:3466` |
| POST | `/api/crm/contacts` | Public | CRM provider integration and synchronization. | `server/index.js:3477` |
| GET | `/api/crm/deals` | Public | CRM provider integration and synchronization. | `server/index.js:3491` |
| GET | `/api/crm/hubspot/status` | Auth (ADMIN, SUPERVISOR) | HubSpot status/connect/sync operations. | `server/index.js:3517` |
| POST | `/api/crm/sync` | Public | CRM provider integration and synchronization. | `server/index.js:3505` |
| GET | `/api/crm/tasks` | Public | CRM provider integration and synchronization. | `server/index.js:3486` |
| POST | `/api/crm/tasks` | Public | CRM provider integration and synchronization. | `server/index.js:3496` |
| POST | `/api/crm/webhook` | Public | CRM provider integration and synchronization. | `server/index.js:3513` |
| GET | `/api/dispositions` | Public | Application API route. | `server/index.js:2882` |
| POST | `/api/dispositions` | Public | Application API route. | `server/index.js:2891` |
| DELETE | `/api/dispositions/:id` | Public | Application API route. | `server/index.js:2928` |
| PUT | `/api/dispositions/:id` | Public | Application API route. | `server/index.js:2908` |
| GET | `/api/export` | Auth (ADMIN) | Data export and reporting endpoints. | `server/index.js:3825` |
| POST | `/api/gemini/analysis` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2358` |
| POST | `/api/gemini/campaign-draft` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2263` |
| POST | `/api/gemini/draft` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2247` |
| POST | `/api/gemini/help` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2342` |
| POST | `/api/gemini/intel` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2222` |
| POST | `/api/gemini/lead-brief` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2442` |
| POST | `/api/gemini/lead-enrich` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2306` |
| POST | `/api/gemini/live-token` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:4425` |
| POST | `/api/gemini/tool-actions` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:2402` |
| POST | `/api/gemini/tts` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:4392` |
| GET | `/api/health` | Public | Service heartbeat and env readiness check. | `server/index.js:2094` |
| GET | `/api/health/deps` | Public | Application API route. | `server/index.js:2163` |
| GET | `/api/health/peer` | Public | Application API route. | `server/index.js:2189` |
| GET | `/api/integrations/status` | Public | Aggregate integration status snapshot. | `server/index.js:3835` |
| GET | `/api/invites` | Auth (ADMIN) | Create and accept user invitation workflow. | `server/index.js:1463` |
| POST | `/api/invites` | Auth (ADMIN) | Create and accept user invitation workflow. | `server/index.js:1468` |
| POST | `/api/invites/accept` | Public | Create and accept user invitation workflow. | `server/index.js:1490` |
| GET | `/api/jobs` | Auth (ADMIN, SUPERVISOR) | Queue and inspect async background jobs. | `server/index.js:3077` |
| POST | `/api/jobs` | Auth (ADMIN, SUPERVISOR) | Queue and inspect async background jobs. | `server/index.js:3086` |
| POST | `/api/jobs/process` | Public | Queue and inspect async background jobs. | `server/index.js:2199` |
| POST | `/api/marketing/:provider/connect` | Public | Marketing provider connect/sync workflow. | `server/index.js:3696` |
| POST | `/api/marketing/:provider/sync` | Public | Marketing provider connect/sync workflow. | `server/index.js:3705` |
| GET | `/api/marketing/campaigns` | Public | Marketing provider connect/sync workflow. | `server/index.js:3660` |
| POST | `/api/marketing/campaigns` | Public | Marketing provider connect/sync workflow. | `server/index.js:3665` |
| DELETE | `/api/marketing/campaigns/:id` | Public | Marketing provider connect/sync workflow. | `server/index.js:3689` |
| PUT | `/api/marketing/campaigns/:id` | Public | Marketing provider connect/sync workflow. | `server/index.js:3677` |
| GET | `/api/metrics/calls` | Auth (ADMIN, SUPERVISOR) | Operations and usage metrics summary. | `server/index.js:3841` |
| GET | `/api/metrics/summary` | Auth (ADMIN, SUPERVISOR) | Operations and usage metrics summary. | `server/index.js:3846` |
| GET | `/api/oauth/google/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:3272` |
| GET | `/api/oauth/google/start` | Public | OAuth initialization/callback for integrations. | `server/index.js:3254` |
| GET | `/api/oauth/hubspot/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:3397` |
| GET | `/api/oauth/hubspot/readiness` | Auth (ADMIN, SUPERVISOR) | OAuth initialization/callback for integrations. | `server/index.js:3385` |
| GET | `/api/oauth/hubspot/start` | Auth (ADMIN, SUPERVISOR) | OAuth initialization/callback for integrations. | `server/index.js:3370` |
| GET | `/api/oauth/microsoft/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:3339` |
| GET | `/api/oauth/microsoft/start` | Public | OAuth initialization/callback for integrations. | `server/index.js:3322` |
| GET | `/api/public/desktop-release` | Public | Desktop release metadata for download UI. | `server/index.js:2132` |
| GET | `/api/queues` | Public | Application API route. | `server/index.js:2458` |
| POST | `/api/rag/ingest` | Auth | AI generation and retrieval-assisted endpoints. | `server/index.js:1973` |
| POST | `/api/rag/query` | Auth | AI generation and retrieval-assisted endpoints. | `server/index.js:2000` |
| GET | `/api/recordings` | Public | List, fetch, or serve call recordings. | `server/index.js:3095` |
| POST | `/api/recordings` | Public | List, fetch, or serve call recordings. | `server/index.js:3107` |
| PUT | `/api/recordings/:id` | Public | List, fetch, or serve call recordings. | `server/index.js:3124` |
| POST | `/api/recordings/:id/signed-url` | Public | List, fetch, or serve call recordings. | `server/index.js:3191` |
| GET | `/api/recordings/download` | Public | List, fetch, or serve call recordings. | `server/index.js:3209` |
| POST | `/api/recordings/upload` | Public | List, fetch, or serve call recordings. | `server/index.js:3144` |
| GET | `/api/reports/summary` | Public | Application API route. | `server/index.js:3808` |
| GET | `/api/rooms/:roomId` | Auth | Application API route. | `server/index.js:1408` |
| POST | `/api/rooms/join` | Auth | Application API route. | `server/index.js:1415` |
| POST | `/api/rooms/leave` | Auth | Application API route. | `server/index.js:1429` |
| GET | `/api/settings` | Public | Read/save tenant application settings. | `server/index.js:2487` |
| PUT | `/api/settings` | Public | Read/save tenant application settings. | `server/index.js:2505` |
| GET | `/api/startup-guard` | Public | Application API route. | `server/index.js:2462` |
| POST | `/api/supervisor/monitor` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3858` |
| POST | `/api/supervisor/monitor/status` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3917` |
| POST | `/api/supervisor/monitor/stop` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:3894` |
| GET | `/api/supervisor/stats` | Auth (ADMIN, SUPERVISOR) | Application API route. | `server/index.js:1508` |
| GET | `/api/tenants` | Auth (ADMIN) | Application API route. | `server/index.js:2666` |
| POST | `/api/tenants` | Auth (ADMIN) | Application API route. | `server/index.js:2674` |
| PUT | `/api/tenants/:id` | Auth (ADMIN) | Application API route. | `server/index.js:2689` |
| POST | `/api/termii/webhook` | Public | Application API route. | `server/index.js:3725` |
| POST | `/api/termii/whatsapp/send` | Auth (ADMIN, SUPERVISOR) | Application API route. | `server/index.js:3714` |
| GET | `/api/twilio/capabilities` | Auth (ADMIN, SUPERVISOR) | Twilio monitor/listen readiness diagnostics. | `server/index.js:3302` |
| GET | `/api/twilio/token` | Public | Twilio webhook/callflow endpoint. | `server/index.js:2762` |
| POST | `/api/twilio/transfer` | Auth (ADMIN, SUPERVISOR, AGENT) | Twilio webhook/callflow endpoint. | `server/index.js:2788` |
| POST | `/twilio/recording/status` | Public | Twilio webhook/callflow endpoint. | `server/index.js:4047` |
| POST | `/twilio/transcription/status` | Public | Twilio webhook/callflow endpoint. | `server/index.js:4125` |
| POST | `/twilio/voice` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3956` |
| POST | `/twilio/voice/handle` | Public | Twilio webhook/callflow endpoint. | `server/index.js:4305` |
| POST | `/twilio/voice/incoming` | Public | Twilio webhook/callflow endpoint. | `server/index.js:4185` |
| POST | `/twilio/voice/route-next` | Public | Twilio webhook/callflow endpoint. | `server/index.js:4250` |

Total endpoints discovered: **109**

> Do not edit manually. Run `npm run worklog:endpoints`.
