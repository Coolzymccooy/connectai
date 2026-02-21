# ConnectAI Rigorous Acceptance Criteria

Date: 2026-02-21
Owner: Product/QA/Engineering

## 1) Branching and Release Policy (Regression Prevention)

1. `master` is production-only.
2. `dev` is integration/staging.
3. Every change uses a short-lived feature branch from `dev`:
   - `feature/call-audio-fix`
   - `fix/peer-signaling-path`
   - `fix/access-control-save`
4. Merge flow:
   - feature -> `dev` (after tests pass)
   - `dev` soak test + two-user manual test
   - `dev` -> `master` only after release checklist passes
5. No direct commits to `master`.
6. Every bug fix must add at least one test/check that would fail before the fix.

## 2) Mandatory CI/CD Gates Before Merge

1. Build must pass: `npm run build`
2. Tests must pass: `npm test`
3. Two-user call smoke must pass:
   - voice 2-way audio
   - video 2-way media
   - single-side hangup ends both UIs
4. Startup guard must be clean (or approved warning with reason).
5. Release note entry must be added with:
   - root cause
   - files changed
   - evidence/proof line

## 3) Environment Baseline (Must Match Runtime)

For local:
1. `DEFAULT_TENANT_ID=default-tenant`
2. `VITE_DEFAULT_TENANT_ID=default-tenant`
3. `RUN_JOB_WORKER_INLINE=true`
4. `VITE_PEER_SERVER_HOST=localhost`
5. `VITE_PEER_SERVER_PORT=8787`
6. `VITE_PEER_SERVER_SECURE=false`
7. `VITE_PEER_SERVER_PATH=/peerjs`

For production (Render backend + Vercel frontend):
1. Render:
   - `DEFAULT_TENANT_ID=connectai-main`
   - `MONGO_URI=<valid atlas uri with db name>`
   - `RUN_JOB_WORKER_INLINE=true` (or dedicated worker service)
   - `PEER_SERVER_PATH=/peerjs`
2. Vercel:
   - `VITE_PEER_SERVER_HOST=<render-host>`
   - `VITE_PEER_SERVER_PORT=443`
   - `VITE_PEER_SERVER_SECURE=true`
   - `VITE_PEER_SERVER_PATH=/peerjs`

## 4) Functional Acceptance Criteria

### A. Auth, Roles, and Access Control
1. Admin login remains admin after refresh/re-login.
2. No unintended downgrade toast loops.
3. Access control save succeeds without repeated rate-limit errors.
4. Allowed domains + domain map resolve expected tenant.
5. Startup guard warning appears for mismatch and clears after correction.

### B. Messaging and Inbox
1. DM send appears exactly once for sender and receiver.
2. Bootstrap intro appears only once per conversation lifecycle.
3. Notification click opens exact conversation.
4. Sender and receiver can see latest message without forced manual scrolling.
5. Sidebar groups by sender/conversation without duplicate spam rows.

### C. Calling Core
1. Outbound internal call rings target.
2. Accept transitions both UIs from ringing to active.
3. Two-way audio is heard for 10+ minutes.
4. Two-way video is visible for 10+ minutes.
5. Single-side hangup ends call on both UIs.
6. Ending call releases mic/camera indicator in browser.
7. Control bar is movable/collapsible and does not block chat.

### D. Peer Signaling Reliability
1. No recurring `Peer signaling endpoint unreachable` in healthy setup.
2. Peer endpoint in UI matches configured endpoint.
3. Reconnect recovers from transient network blips.

### E. AI Wrap-Up / Transcript / CRM
1. Wrap-up/transcript generated for internal + inbound + outbound calls.
2. Wrap-up persists after call end until:
   - completed
   - synced to CRM
   - explicitly dismissed
3. Refresh rehydrates pending wrap-up context.
4. If worker disabled, startup guard warns clearly.

### F. Settings Durability
1. Save settings -> refresh -> settings persist.
2. Save settings -> redeploy -> settings persist.
3. `persistenceMode` shows `mongo` in production.
4. No silent fallback to json store without warning.

## 5) Performance and Stability Criteria

1. No uncontrolled toast floods (rate-limit or retry noise).
2. API polling does not exceed configured rate limits under normal two-user call activity.
3. No unhandled runtime crash in console during call start/end flow.

## 6) Manual Test Script (Per Release)

1. Login as User A (Admin) and User B (Supervisor/Agent).
2. Send DM both directions, verify no duplicates.
3. Start audio call A -> B, verify two-way audio.
4. End call from A only, verify both sides end.
5. Start video call A -> B, verify two-way audio/video.
6. Keep call active 10 minutes; verify no silent drop.
7. End from B only; verify both sides end and devices released.
8. Confirm recap/wrap-up appears and persists after refresh.
9. Confirm access control settings save and persist after reload.
10. Confirm startup guard clean.

## 7) Evidence Format for Sign-off

For each release candidate, record:
1. Git commit hash
2. Environment target (`local`, `staging`, `prod`)
3. Commands:
   - `npm run build` result
   - `npm test` result
4. Two-user proof lines:
   - `PASS voice_2way_audio`
   - `PASS video_2way_media`
   - `PASS single_side_hangup_ends_both_uis`
5. Known risks (if any) and explicit approval.

## 8) Login Categories for Company-Wide Use

To include Sales, Ops, and others without breaking RBAC:
1. Keep `role` for permissions (`ADMIN`, `SUPERVISOR`, `AGENT`).
2. Add separate `department` (or `teamCategory`) for organization:
   - `SALES`
   - `OPS`
   - `SUPPORT`
   - `MARKETING`
   - `FINANCE`
   - `OTHER`
3. Login/Team UI should capture both:
   - Role = access permission
   - Department = routing/grouping/reporting
4. Routing, inbox filters, and analytics use department dimension; authorization continues to use role.
