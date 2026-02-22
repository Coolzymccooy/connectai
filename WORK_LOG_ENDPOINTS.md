# Endpoint Worklog

Generated: 2026-02-22T01:59:13.469Z

This file is auto-generated from `server/index.js` and updates when new Express routes are added.

| Method | Path | Access | Helper | Source |
| --- | --- | --- | --- | --- |
| GET | `/` | Public | Application API route. | `server/index.js:2996` |
| GET | `/api/admin/users` | Auth (ADMIN) | Application API route. | `server/index.js:3605` |
| POST | `/api/admin/users` | Auth (ADMIN) | Application API route. | `server/index.js:3614` |
| DELETE | `/api/admin/users/:id` | Auth (ADMIN) | Application API route. | `server/index.js:3647` |
| PUT | `/api/admin/users/:id` | Auth (ADMIN) | Application API route. | `server/index.js:3629` |
| GET | `/api/auth/policy` | Public | Application API route. | `server/index.js:2106` |
| POST | `/api/billing/stripe/checkout` | Auth (ADMIN) | Stripe billing checkout/config for top-up and plans. | `server/index.js:3512` |
| GET | `/api/billing/stripe/config` | Auth (ADMIN) | Stripe billing checkout/config for top-up and plans. | `server/index.js:3495` |
| POST | `/api/broadcasts/:id/archive` | Auth (ADMIN) | Admin broadcast creation and archive actions. | `server/index.js:3483` |
| POST | `/api/broadcasts/send` | Auth (ADMIN) | Admin broadcast creation and archive actions. | `server/index.js:3411` |
| GET | `/api/calendar/events` | Public | Application API route. | `server/index.js:4213` |
| POST | `/api/calendar/events` | Public | Application API route. | `server/index.js:4393` |
| DELETE | `/api/calendar/events/:id` | Public | Application API route. | `server/index.js:4410` |
| PUT | `/api/calendar/events/:id` | Public | Application API route. | `server/index.js:4402` |
| POST | `/api/calendar/sync` | Public | Application API route. | `server/index.js:4417` |
| POST | `/api/calendar/webhook` | Public | Application API route. | `server/index.js:4425` |
| GET | `/api/calls` | Auth | Fetch call logs or a single call. | `server/index.js:3881` |
| POST | `/api/calls` | Auth | Create/update call session state. | `server/index.js:3950` |
| GET | `/api/calls/:id` | Auth | Fetch call logs or a single call. | `server/index.js:3924` |
| PUT | `/api/calls/:id` | Auth | Create/update call session state. | `server/index.js:3976` |
| GET | `/api/campaigns` | Public | Application API route. | `server/index.js:3719` |
| POST | `/api/campaigns` | Public | Application API route. | `server/index.js:3728` |
| DELETE | `/api/campaigns/:id` | Public | Application API route. | `server/index.js:3765` |
| PUT | `/api/campaigns/:id` | Public | Application API route. | `server/index.js:3745` |
| POST | `/api/crm/:provider/connect` | Public | CRM provider integration and synchronization. | `server/index.js:4497` |
| POST | `/api/crm/:provider/sync` | Public | CRM provider integration and synchronization. | `server/index.js:4522` |
| GET | `/api/crm/contacts` | Public | CRM provider integration and synchronization. | `server/index.js:4430` |
| POST | `/api/crm/contacts` | Public | CRM provider integration and synchronization. | `server/index.js:4441` |
| GET | `/api/crm/deals` | Public | CRM provider integration and synchronization. | `server/index.js:4455` |
| GET | `/api/crm/hubspot/status` | Auth (ADMIN, SUPERVISOR) | HubSpot status/connect/sync operations. | `server/index.js:4481` |
| POST | `/api/crm/sync` | Public | CRM provider integration and synchronization. | `server/index.js:4469` |
| GET | `/api/crm/tasks` | Public | CRM provider integration and synchronization. | `server/index.js:4450` |
| POST | `/api/crm/tasks` | Public | CRM provider integration and synchronization. | `server/index.js:4460` |
| POST | `/api/crm/webhook` | Public | CRM provider integration and synchronization. | `server/index.js:4477` |
| GET | `/api/dispositions` | Public | Application API route. | `server/index.js:3780` |
| POST | `/api/dispositions` | Public | Application API route. | `server/index.js:3789` |
| DELETE | `/api/dispositions/:id` | Public | Application API route. | `server/index.js:3826` |
| PUT | `/api/dispositions/:id` | Public | Application API route. | `server/index.js:3806` |
| GET | `/api/export` | Auth (ADMIN) | Data export and reporting endpoints. | `server/index.js:4789` |
| POST | `/api/gemini/analysis` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:3256` |
| POST | `/api/gemini/campaign-draft` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:3161` |
| POST | `/api/gemini/draft` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:3145` |
| POST | `/api/gemini/help` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:3240` |
| POST | `/api/gemini/intel` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:3120` |
| POST | `/api/gemini/lead-brief` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:3340` |
| POST | `/api/gemini/lead-enrich` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:3204` |
| POST | `/api/gemini/live-token` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:5397` |
| POST | `/api/gemini/tool-actions` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:3300` |
| POST | `/api/gemini/tts` | Public | AI generation and retrieval-assisted endpoints. | `server/index.js:5364` |
| GET | `/api/health` | Public | Service heartbeat and env readiness check. | `server/index.js:2992` |
| GET | `/api/health/deps` | Public | Application API route. | `server/index.js:3061` |
| GET | `/api/health/peer` | Public | Application API route. | `server/index.js:3087` |
| GET | `/api/integrations/status` | Public | Aggregate integration status snapshot. | `server/index.js:4799` |
| GET | `/api/invites` | Auth (ADMIN) | Create and accept user invitation workflow. | `server/index.js:2127` |
| POST | `/api/invites` | Auth (ADMIN) | Create and accept user invitation workflow. | `server/index.js:2132` |
| POST | `/api/invites/accept` | Public | Create and accept user invitation workflow. | `server/index.js:2154` |
| GET | `/api/jobs` | Auth (ADMIN, SUPERVISOR) | Queue and inspect async background jobs. | `server/index.js:4017` |
| POST | `/api/jobs` | Auth (ADMIN, SUPERVISOR) | Queue and inspect async background jobs. | `server/index.js:4026` |
| POST | `/api/jobs/process` | Public | Queue and inspect async background jobs. | `server/index.js:3097` |
| POST | `/api/marketing/:provider/connect` | Public | Marketing provider connect/sync workflow. | `server/index.js:4660` |
| POST | `/api/marketing/:provider/sync` | Public | Marketing provider connect/sync workflow. | `server/index.js:4669` |
| GET | `/api/marketing/campaigns` | Public | Marketing provider connect/sync workflow. | `server/index.js:4624` |
| POST | `/api/marketing/campaigns` | Public | Marketing provider connect/sync workflow. | `server/index.js:4629` |
| DELETE | `/api/marketing/campaigns/:id` | Public | Marketing provider connect/sync workflow. | `server/index.js:4653` |
| PUT | `/api/marketing/campaigns/:id` | Public | Marketing provider connect/sync workflow. | `server/index.js:4641` |
| GET | `/api/metrics/calls` | Auth (ADMIN, SUPERVISOR) | Operations and usage metrics summary. | `server/index.js:4805` |
| GET | `/api/metrics/summary` | Auth (ADMIN, SUPERVISOR) | Operations and usage metrics summary. | `server/index.js:4810` |
| GET | `/api/oauth/google/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:4236` |
| GET | `/api/oauth/google/start` | Public | OAuth initialization/callback for integrations. | `server/index.js:4218` |
| GET | `/api/oauth/hubspot/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:4361` |
| GET | `/api/oauth/hubspot/readiness` | Auth (ADMIN, SUPERVISOR) | OAuth initialization/callback for integrations. | `server/index.js:4349` |
| GET | `/api/oauth/hubspot/start` | Auth (ADMIN, SUPERVISOR) | OAuth initialization/callback for integrations. | `server/index.js:4334` |
| GET | `/api/oauth/microsoft/callback` | Public | OAuth initialization/callback for integrations. | `server/index.js:4303` |
| GET | `/api/oauth/microsoft/start` | Public | OAuth initialization/callback for integrations. | `server/index.js:4286` |
| GET | `/api/public/desktop-release` | Public | Desktop release metadata for download UI. | `server/index.js:3030` |
| GET | `/api/queues` | Public | Application API route. | `server/index.js:3356` |
| POST | `/api/rag/ingest` | Auth | AI generation and retrieval-assisted endpoints. | `server/index.js:2871` |
| POST | `/api/rag/query` | Auth | AI generation and retrieval-assisted endpoints. | `server/index.js:2898` |
| GET | `/api/recordings` | Auth | List, fetch, or serve call recordings. | `server/index.js:4035` |
| POST | `/api/recordings` | Auth | List, fetch, or serve call recordings. | `server/index.js:4047` |
| PUT | `/api/recordings/:id` | Auth | List, fetch, or serve call recordings. | `server/index.js:4064` |
| POST | `/api/recordings/:id/signed-url` | Auth | List, fetch, or serve call recordings. | `server/index.js:4143` |
| GET | `/api/recordings/download` | Public | List, fetch, or serve call recordings. | `server/index.js:4173` |
| POST | `/api/recordings/upload` | Auth | List, fetch, or serve call recordings. | `server/index.js:4084` |
| GET | `/api/reports/summary` | Public | Application API route. | `server/index.js:4772` |
| GET | `/api/rooms/:roomId` | Auth | Application API route. | `server/index.js:2072` |
| POST | `/api/rooms/join` | Auth | Application API route. | `server/index.js:2079` |
| POST | `/api/rooms/leave` | Auth | Application API route. | `server/index.js:2093` |
| GET | `/api/settings` | Public | Read/save tenant application settings. | `server/index.js:3385` |
| PUT | `/api/settings` | Public | Read/save tenant application settings. | `server/index.js:3403` |
| GET | `/api/startup-guard` | Public | Application API route. | `server/index.js:3360` |
| POST | `/api/supervisor/monitor` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:4822` |
| POST | `/api/supervisor/monitor/status` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:4881` |
| POST | `/api/supervisor/monitor/stop` | Auth (ADMIN, SUPERVISOR) | Supervisor listen/monitor/whisper controls. | `server/index.js:4858` |
| GET | `/api/supervisor/stats` | Auth (ADMIN, SUPERVISOR) | Application API route. | `server/index.js:2172` |
| GET | `/api/tenants` | Auth (ADMIN) | Application API route. | `server/index.js:3564` |
| POST | `/api/tenants` | Auth (ADMIN) | Application API route. | `server/index.js:3572` |
| PUT | `/api/tenants/:id` | Auth (ADMIN) | Application API route. | `server/index.js:3587` |
| POST | `/api/termii/webhook` | Public | Application API route. | `server/index.js:4689` |
| POST | `/api/termii/whatsapp/send` | Auth (ADMIN, SUPERVISOR) | Application API route. | `server/index.js:4678` |
| GET | `/api/twilio/capabilities` | Auth (ADMIN, SUPERVISOR) | Twilio monitor/listen readiness diagnostics. | `server/index.js:4266` |
| GET | `/api/twilio/token` | Public | Twilio webhook/callflow endpoint. | `server/index.js:3660` |
| POST | `/api/twilio/transfer` | Auth (ADMIN, SUPERVISOR, AGENT) | Twilio webhook/callflow endpoint. | `server/index.js:3686` |
| POST | `/twilio/recording/status` | Public | Twilio webhook/callflow endpoint. | `server/index.js:5011` |
| POST | `/twilio/transcription/status` | Public | Twilio webhook/callflow endpoint. | `server/index.js:5085` |
| POST | `/twilio/voice` | Public | Twilio webhook/callflow endpoint. | `server/index.js:4920` |
| POST | `/twilio/voice/handle` | Public | Twilio webhook/callflow endpoint. | `server/index.js:5277` |
| POST | `/twilio/voice/incoming` | Public | Twilio webhook/callflow endpoint. | `server/index.js:5157` |
| POST | `/twilio/voice/route-next` | Public | Twilio webhook/callflow endpoint. | `server/index.js:5222` |

Total endpoints discovered: **109**

> Do not edit manually. Run `npm run worklog:endpoints`.
