# Session Log - 2026-02-17

## Session Focus
1. Stabilize Firebase/auth/poll behavior so chat/calls can run without crash loops.
2. Recover team DM delivery.
3. Lock tenant/settings behavior to reduce config drift.

## Confirmed Progress
- Team DM delivery is now working across users (messages are received on both sides).
- App crash on load (`Cannot access 'addNotification' before initialization`) was fixed.
- Access Control now shows canonical tenant state (`default-tenant`) in Admin Settings.
- Firestore rules were re-deployed to the target project (`connectai-cec73`) during this session.

## Remaining Issues (Active)
1. DM messages are duplicated (single send appears twice).
2. Bootstrap intro text keeps re-inserting on new messages:
   - `"Hi oluconagent, direct secure thread with olua-supervisor1 is active."`
3. Calling teammate directly from Inbox does not complete.

## Working Theory
- Duplicate DM is likely from dual writes/listeners (canonical + alias thread path overlap).
- Intro text duplication is likely seeded by conversation bootstrap logic running on every send/open instead of first-creation only.
- Inbox-call failure is likely an identity/session routing mismatch between inbox-selected peer and call target resolver.

## Next Fix Pass
1. Enforce single logical DM write path (canonical thread), keep aliases for read compatibility only.
2. Guard bootstrap intro insertion with `conversation.meta.bootstrapSent === true` and sender scope.
3. Trace Inbox call payload from click -> `startInternalCall` -> `/api/calls/int/:id` lookup and fix identity key mapping.
4. Add test coverage:
   - single-send DM appears once on both clients,
   - intro bootstrap appears once per conversation lifetime,
   - inbox-initiated teammate call reaches ringing state.
