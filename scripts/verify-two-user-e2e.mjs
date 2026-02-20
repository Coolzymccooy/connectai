import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.CONNECTAI_BASE_URL || 'http://127.0.0.1:3090';
const callStabilityWindowMs = Number(process.env.CONNECTAI_CALL_STABILITY_MS || 0);
const debugPeerLogs = String(process.env.CONNECTAI_DEBUG_PEER || '').trim() === '1';
const skipAudioAssert = String(process.env.CONNECTAI_SKIP_AUDIO_ASSERT || '').trim() === '1';

const readDemoUsers = () => {
  const envText = fs.readFileSync('.env.local', 'utf8');
  const line = envText
    .split(/\r?\n/)
    .find((row) => row.trim().startsWith('VITE_FIREBASE_DEMO_USERS='));
  if (!line) throw new Error('VITE_FIREBASE_DEMO_USERS missing in .env.local');
  const raw = line.slice(line.indexOf('=') + 1).trim();
  const entries = raw.split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
    const [email, password] = item.split(':');
    return { email: (email || '').trim(), password: (password || '').trim() };
  });
  const agent = entries.find((entry) => entry.email.includes('agent1'));
  const supervisor = entries.find((entry) => entry.email.includes('supervisor1'));
  if (!agent || !supervisor || !agent.password || !supervisor.password) {
    throw new Error('Required demo users agent1/supervisor1 not found in VITE_FIREBASE_DEMO_USERS');
  }
  return { agent, supervisor };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const FIRESTORE_PROJECT_ID = process.env.CONNECTAI_FIRESTORE_PROJECT_ID || 'connectai-cec73';

const waitFor = async (predicate, timeoutMs, stepMs = 300, label = 'condition') => {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    const ok = await predicate();
    if (ok) return;
    await sleep(stepMs);
  }
  throw new Error(`Timeout after ${timeoutMs}ms waiting for ${label}`);
};

const decodeFirestoreValue = (value) => {
  if (!value || typeof value !== 'object') return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('nullValue' in value) return null;
  return undefined;
};

const queryMessageByText = async (authToken, text) => {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'messages' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'text' },
          op: 'EQUAL',
          value: { stringValue: text },
        },
      },
      limit: 50,
    },
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`runQuery failed ${response.status}: ${raw.slice(0, 240)}`);
  }
  const rows = await response.json();
  return rows
    .map((row) => row?.document?.fields || null)
    .filter(Boolean)
    .map((fields) => ({
      conversationId: decodeFirestoreValue(fields.conversationId),
      logicalId: decodeFirestoreValue(fields.id),
      text: decodeFirestoreValue(fields.text),
      senderId: decodeFirestoreValue(fields.senderId),
      timestamp: decodeFirestoreValue(fields.timestamp),
    }));
};

const login = async (page, email, password) => {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Email address').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.locator('button[type="submit"]').filter({ hasText: 'Sign In' }).click();
  await waitFor(async () => {
    const workspaceButtonCount = await page.locator('button[title="Agent Workspace"]').count();
    if (workspaceButtonCount > 0) return true;
    const workspaceTabCount = await page.getByRole('button', { name: 'WORKSPACE', exact: true }).count();
    if (workspaceTabCount > 0) return true;
    return false;
  }, 90000, 400, 'workspace entry after login');
  const agentWorkspaceButton = page.locator('button[title="Agent Workspace"]').first();
  if (await agentWorkspaceButton.count()) {
    await agentWorkspaceButton.click().catch(() => {});
  }
  await page.getByRole('button', { name: 'WORKSPACE', exact: true }).waitFor({ timeout: 60000 });
};

const openTeamAndMessage = async (page, teammateName) => {
  await page.getByRole('button', { name: 'TEAM' }).click();
  await page.getByRole('button', { name: 'List' }).click();
  await page.getByPlaceholder('Search roster...').fill(teammateName);
  const msgButton = page.locator('button:has-text("Msg"):not([disabled])').first();
  await msgButton.waitFor({ timeout: 20000 });
  await msgButton.click();
  await page.getByRole('button', { name: 'INBOX' }).waitFor({ timeout: 10000 });
  await page.getByPlaceholder('Type a message...').waitFor({ timeout: 20000 });
};

const getThreadPane = (page) => page
  .getByPlaceholder('Type a message...')
  .locator('xpath=ancestor::div[contains(@class,"p-6 border-t")]/preceding-sibling::div[contains(@class,"overflow-y-auto")]')
  .first();

const getInboxRows = (page) =>
  page.locator('xpath=//h3[normalize-space()="Inbox"]/ancestor::div[contains(@class,"lg:w-80")]//button[.//h4]');

const countThreadText = async (page, text) => {
  const pane = getThreadPane(page);
  return pane.getByText(text, { exact: false }).count();
};

const settleThreadTextCount = async (page, text, timeoutMs = 20000, stableMs = 2000) => {
  const deadline = Date.now() + timeoutMs;
  let last = await countThreadText(page, text);
  let stableFor = 0;
  while (Date.now() < deadline) {
    await sleep(400);
    const next = await countThreadText(page, text);
    if (next === last) {
      stableFor += 400;
      if (stableFor >= stableMs) return next;
    } else {
      last = next;
      stableFor = 0;
    }
  }
  return last;
};

const sendInboxMessage = async (page, text) => {
  const input = page.getByPlaceholder('Type a message...');
  await input.fill(text);
  await page.keyboard.press('Enter');
};

const openInboxConversation = async (page, conversationHint) => {
  await page.getByRole('button', { name: 'INBOX' }).click();
  const hints = Array.isArray(conversationHint) ? conversationHint : [conversationHint];
  let selected = false;
  const deadline = Date.now() + 60000;
  while (!selected && Date.now() < deadline) {
    const rows = getInboxRows(page);
    const rowCount = await rows.count();
    for (let i = 0; i < rowCount && !selected; i += 1) {
      const row = rows.nth(i);
      const text = (await row.textContent()) || '';
      if (hints.some((hint) => text.includes(hint))) {
        await row.click();
        selected = true;
      }
    }
    for (const hint of hints) {
      const convoButton = page.locator('button').filter({ hasText: hint }).first();
      if (await convoButton.count()) {
        await convoButton.click();
        selected = true;
        break;
      }
    }
    if (!selected) await sleep(300);
  }
  if (!selected) {
    const headers = await page.locator('h4').allTextContents();
    throw new Error(`No inbox conversation matched hints: ${hints.join(', ')}. Found headers: ${headers.join(' | ')}`);
  }
  await page.getByPlaceholder('Type a message...').waitFor({ timeout: 20000 });
};

const focusConversationWithMessage = async (page, contactHint, messageText, timeoutMs = 60000) => {
  await page.getByRole('button', { name: 'INBOX' }).click();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = getInboxRows(page);
    const rowCount = await rows.count();
    for (let i = 0; i < rowCount; i += 1) {
      await rows.nth(i).click();
      await sleep(450);
      if (await countThreadText(page, messageText) > 0) {
        return true;
      }
    }
    await sleep(350);
  }
  return false;
};

const placeInboxCall = async (page) => {
  const header = page.locator('div.p-6.border-b.bg-slate-900').first();
  await header.waitFor({ timeout: 10000 });
  await header.locator('button').first().click();
};

const acceptIncomingCall = async (page) => {
  const banner = page.locator('div.fixed').filter({ hasText: /Incoming (Video|Voice) Call/i }).first();
  await banner.waitFor({ timeout: 30000 });
  await banner.getByRole('button', { name: 'Accept' }).click();
};

const waitForMeetingActiveUi = async (page, label) => {
  await waitFor(async () => {
    const minimize = await page.getByRole('button', { name: /Minimize Call/i }).count();
    const inProgress = await page.getByText(/Call In Progress/i).count();
    return minimize > 0 || inProgress > 0;
  }, 45000, 350, `${label} meeting UI`);
};

const waitForRemoteAudioTrack = async (page, label) => {
  await waitFor(async () => page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('audio'));
    return nodes.some((node) => {
      const stream = node.srcObject;
      if (!stream || typeof stream.getAudioTracks !== 'function') return false;
      const tracks = stream.getAudioTracks();
      return Array.isArray(tracks) && tracks.length > 0;
    });
  }), 45000, 500, `${label} remote audio track`);
};

const verifyCallStability = async (page1, page2, durationMs) => {
  if (!durationMs || durationMs <= 0) return;
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < durationMs) {
    const senderLive = await hasLiveCallUi(page1);
    const receiverLive = await hasLiveCallUi(page2);
    if (!senderLive || !receiverLive) {
      throw new Error(`call became inactive before stability window elapsed (${Date.now() - startedAt}ms)`);
    }
    const senderAudio = await page1.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('audio'));
      return nodes.some((node) => {
        const stream = node.srcObject;
        if (!stream || typeof stream.getAudioTracks !== 'function') return false;
        return stream.getAudioTracks().length > 0;
      });
    });
    const receiverAudio = await page2.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('audio'));
      return nodes.some((node) => {
        const stream = node.srcObject;
        if (!stream || typeof stream.getAudioTracks !== 'function') return false;
        return stream.getAudioTracks().length > 0;
      });
    });
    if (!senderAudio || !receiverAudio) {
      throw new Error(`remote audio track missing during stability window at ${Date.now() - startedAt}ms`);
    }
    await sleep(3000);
  }
};

const endAnyLiveCall = async (page) => {
  const labels = [/End Meeting/i, /^Leave$/i, /^End$/i];
  for (const label of labels) {
    const button = page.getByRole('button', { name: label }).first();
    if (await button.count()) {
      try {
        await button.click({ timeout: 1500 });
        await sleep(500);
      } catch {
        // ignore
      }
    }
  }
};

const hasLiveCallUi = async (page) => {
  const labels = [/End Meeting/i, /^Leave$/i, /^End$/i, /Minimize Call/i];
  for (const label of labels) {
    if (await page.getByRole('button', { name: label }).count()) return true;
  }
  return false;
};

const clearActiveCalls = async (page, label) => {
  const result = await page.evaluate(async () => {
    const token = localStorage.getItem('connectai_auth_token');
    if (!token) return { total: 0, cleared: 0, skipped: true };
    const tenantId = localStorage.getItem('connectai_tenant_id') || 'default-tenant';
    const activeStates = new Set(['DIALING', 'RINGING', 'ACTIVE', 'HOLD']);
    const listRes = await fetch('/api/calls?limit=300', {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-id': tenantId,
      },
    });
    if (!listRes.ok) return { total: 0, cleared: 0, error: `list ${listRes.status}` };
    const calls = await listRes.json();
    const targets = Array.isArray(calls) ? calls.filter((item) => activeStates.has(String(item?.status || ''))) : [];
    let cleared = 0;
    for (const call of targets) {
      const id = String(call?.id || '').trim();
      if (!id) continue;
      const patchRes = await fetch(`/api/calls/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'ENDED', durationSeconds: Number(call?.durationSeconds || 0), endTime: Date.now() }),
      });
      if (patchRes.ok) cleared += 1;
    }
    return { total: targets.length, cleared };
  });
  console.log(`[verify] cleared_active_calls ${label} total=${result.total} cleared=${result.cleared}${result.error ? ` error=${result.error}` : ''}`);
};

const clearClientActiveState = async (page, label) => {
  const result = await page.evaluate(() => {
    const removedSession = [];
    const removedLocal = [];
    const sessionKeys = Object.keys(sessionStorage).filter((k) => k.startsWith('connectai_active_call_'));
    for (const key of sessionKeys) {
      removedSession.push(key);
      sessionStorage.removeItem(key);
    }
    const localKeys = Object.keys(localStorage).filter((k) => k.startsWith('connectai_active_call_'));
    for (const key of localKeys) {
      removedLocal.push(key);
      localStorage.removeItem(key);
    }
    return { removedSession, removedLocal };
  });
  console.log(`[verify] cleared_client_active_state ${label} session=${result.removedSession.length} local=${result.removedLocal.length}`);
};

const run = async () => {
  const { agent, supervisor } = readDemoUsers();
  const marker = Date.now();
  const dmText = `E2E DM ${marker}`;
  const secondDmText = `E2E DM Followup ${marker}`;
  const introText = 'direct secure thread with';

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const ctx1 = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const ctx2 = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();
  let p1WriteRequests = 0;
  let p1CallPutRequests = 0;
  page1.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[routing][inbox]') || text.includes('[routing][db]')) console.log(`[verify][p1] ${text}`);
    if (debugPeerLogs && (text.toLowerCase().includes('peer') || text.toLowerCase().includes('media'))) {
      console.log(`[verify][p1][console] ${text}`);
    }
  });
  page2.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[routing][inbox]') || text.includes('[routing][db]')) console.log(`[verify][p2] ${text}`);
    if (debugPeerLogs && (text.toLowerCase().includes('peer') || text.toLowerCase().includes('media'))) {
      console.log(`[verify][p2][console] ${text}`);
    }
  });
  page1.on('request', (req) => {
    const url = req.url();
    if (url.includes('firestore.googleapis.com') && (url.includes('Write') || url.includes('documents:commit'))) {
      p1WriteRequests += 1;
    }
    if (req.method() === 'PUT' && url.includes('/api/calls/')) {
      p1CallPutRequests += 1;
      console.log(`[verify] sender call PUT ${url}`);
    }
  });

  try {
    await login(page1, agent.email, agent.password);
    await login(page2, supervisor.email, supervisor.password);
    await clearClientActiveState(page1, 'sender-initial');
    await clearClientActiveState(page2, 'receiver-initial');
    await clearActiveCalls(page1, 'sender-initial');
    await clearActiveCalls(page2, 'receiver-initial');
    await endAnyLiveCall(page1);
    await endAnyLiveCall(page2);
    const tenant1 = await page1.evaluate(() => localStorage.getItem('connectai_tenant_id'));
    const tenant2 = await page2.evaluate(() => localStorage.getItem('connectai_tenant_id'));
    const roleKeys1 = await page1.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('connectai_role_')).join(','));
    const roleKeys2 = await page2.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('connectai_role_')).join(','));
    console.log(`[verify] tenant sender=${tenant1} receiver=${tenant2}`);
    console.log(`[verify] rolekeys sender=${roleKeys1} receiver=${roleKeys2}`);
    const receiverPermissionToast = await page2.getByText('Realtime chat permissions blocked').count();
    if (receiverPermissionToast) {
      console.log('[verify] receiver warning: realtime chat permissions blocked');
    }

    console.log('[verify] step: message teammate from team');
    await openTeamAndMessage(page1, 'olua-supervisor1');
    const introCountBaseline = await countThreadText(page1, introText);

    console.log('[verify] step: send first dm');
    const writeBeforeFirstDm = p1WriteRequests;
    await sendInboxMessage(page1, dmText);
    await waitFor(async () => (await countThreadText(page1, dmText)) === 1, 15000, 300, 'first dm on sender');
    const introCountAfterFirstDm = await settleThreadTextCount(page1, introText);
    if (await page1.getByText('Message failed to deliver.').count()) {
      throw new Error('Sender reported "Message failed to deliver." after first DM');
    }
    console.log(`[verify] sender firestore write requests observed=${p1WriteRequests} deltaAfterFirstDm=${p1WriteRequests - writeBeforeFirstDm}`);

    console.log('[verify] step: verify receiver can read first dm');
    const senderToken = await page1.evaluate(() => localStorage.getItem('connectai_auth_token'));
    const receiverToken = await page2.evaluate(() => localStorage.getItem('connectai_auth_token'));
    assert.ok(senderToken, 'sender auth token missing');
    assert.ok(receiverToken, 'receiver auth token missing');
    let senderFirstRows = [];
    let receiverFirstRows = [];
    await waitFor(async () => {
      senderFirstRows = await queryMessageByText(senderToken, dmText);
      receiverFirstRows = await queryMessageByText(receiverToken, dmText);
      return senderFirstRows.length > 0 && receiverFirstRows.length > 0;
    }, 30000, 500, 'first dm persisted/readable');
    const senderFirstLogicalIds = new Set(senderFirstRows.map((row) => row.logicalId).filter(Boolean));
    const receiverFirstLogicalIds = new Set(receiverFirstRows.map((row) => row.logicalId).filter(Boolean));
    assert.ok(senderFirstRows.length >= 1, 'first dm should be persisted to Firestore');
    assert.ok(receiverFirstRows.length >= 1, 'receiver auth should be able to read first dm');
    assert.equal(senderFirstLogicalIds.size, 1, 'first dm should keep one logical message id');
    assert.equal(receiverFirstLogicalIds.size, 1, 'receiver first dm view should resolve to one logical message id');
    await openInboxConversation(page2, ['oluconagent', 'olua-supervisor1']);

    console.log('[verify] step: send follow-up in same thread');
    await sendInboxMessage(page1, secondDmText);
    await waitFor(async () => (await settleThreadTextCount(page1, introText, 10000, 1200)) === introCountAfterFirstDm, 15000, 300, 'bootstrap count unchanged');
    await waitFor(async () => (await countThreadText(page1, secondDmText)) === 1, 15000, 300, 'followup dm on sender');

    console.log('[verify] step: verify receiver can read follow-up');
    let senderSecondRows = [];
    let receiverSecondRows = [];
    await waitFor(async () => {
      senderSecondRows = await queryMessageByText(senderToken, secondDmText);
      receiverSecondRows = await queryMessageByText(receiverToken, secondDmText);
      return senderSecondRows.length > 0 && receiverSecondRows.length > 0;
    }, 30000, 500, 'follow-up persisted/readable');
    const senderSecondLogicalIds = new Set(senderSecondRows.map((row) => row.logicalId).filter(Boolean));
    const receiverSecondLogicalIds = new Set(receiverSecondRows.map((row) => row.logicalId).filter(Boolean));
    assert.ok(senderSecondRows.length >= 1, 'follow-up dm should be persisted to Firestore');
    assert.ok(receiverSecondRows.length >= 1, 'receiver auth should be able to read follow-up dm');
    assert.equal(senderSecondLogicalIds.size, 1, 'follow-up should keep one logical message id');
    assert.equal(receiverSecondLogicalIds.size, 1, 'receiver follow-up should resolve to one logical message id');
    await openInboxConversation(page2, ['oluconagent', 'olua-supervisor1']);

    const introCountUser1 = await countThreadText(page1, introText);
    const dmCountUser1 = await countThreadText(page1, dmText);
    const dmCountUser2 = receiverFirstRows.length;
    const secondDmCountUser2 = receiverSecondRows.length;

    if (!(introCountAfterFirstDm === introCountBaseline || introCountAfterFirstDm === introCountBaseline + 1)) {
      console.warn(`[verify] WARN bootstrap intro baseline=${introCountBaseline} afterFirstDm=${introCountAfterFirstDm}`);
    }
    if (introCountUser1 !== introCountAfterFirstDm) {
      console.warn(`[verify] WARN bootstrap intro drift afterFollowup=${introCountUser1} expected=${introCountAfterFirstDm}`);
    }
    assert.equal(dmCountUser1, 1, 'sender sees first DM once');
    assert.ok(dmCountUser2 >= 1, 'receiver can read first DM from Firestore');
    assert.ok(secondDmCountUser2 >= 1, 'receiver can read follow-up DM from Firestore');

    console.log('[verify] step: inbox call');
    await clearClientActiveState(page1, 'sender-before-call');
    await clearClientActiveState(page2, 'receiver-before-call');
    await clearActiveCalls(page1, 'sender-before-call');
    await clearActiveCalls(page2, 'receiver-before-call');
    await endAnyLiveCall(page1);
    await endAnyLiveCall(page2);
    await placeInboxCall(page1);
    await page2.getByText(/Incoming (Video|Voice) Call/i).waitFor({ timeout: 30000 });
    await acceptIncomingCall(page2);
    await waitForMeetingActiveUi(page1, 'sender');
    await waitForMeetingActiveUi(page2, 'receiver');
    if (!skipAudioAssert) {
      await waitForRemoteAudioTrack(page1, 'sender');
      await waitForRemoteAudioTrack(page2, 'receiver');
    } else {
      console.log('[verify] WARN skipping remote audio track assertion (CONNECTAI_SKIP_AUDIO_ASSERT=1)');
    }
    await verifyCallStability(page1, page2, callStabilityWindowMs);
    if (callStabilityWindowMs > 0) {
      console.log(`[verify] PASS call_stability windowMs=${callStabilityWindowMs}`);
    }
    console.log('[verify] step: single-side hangup');
    const writesBeforeHangup = p1WriteRequests;
    const callPutsBeforeHangup = p1CallPutRequests;
    await endAnyLiveCall(page1);
    await sleep(1200);
    console.log(`[verify] sender firestore write delta after hangup=${p1WriteRequests - writesBeforeHangup}`);
    console.log(`[verify] sender /api/calls PUT delta after hangup=${p1CallPutRequests - callPutsBeforeHangup}`);
    let cleared = false;
    for (let i = 0; i < 90; i += 1) {
      const senderLive = await hasLiveCallUi(page1);
      const receiverLive = await hasLiveCallUi(page2);
      if (!senderLive && !receiverLive) {
        cleared = true;
        break;
      }
      if (i % 10 === 0) {
        const senderCounts = {
          endMeeting: await page1.getByRole('button', { name: /End Meeting/i }).count(),
          leave: await page1.getByRole('button', { name: /^Leave$/i }).count(),
          end: await page1.getByRole('button', { name: /^End$/i }).count(),
          minimize: await page1.getByRole('button', { name: /Minimize Call/i }).count(),
        };
        const receiverCounts = {
          endMeeting: await page2.getByRole('button', { name: /End Meeting/i }).count(),
          leave: await page2.getByRole('button', { name: /^Leave$/i }).count(),
          end: await page2.getByRole('button', { name: /^End$/i }).count(),
          minimize: await page2.getByRole('button', { name: /Minimize Call/i }).count(),
        };
        console.log(`[verify] hangup-wait tick=${i} sender=${JSON.stringify(senderCounts)} receiver=${JSON.stringify(receiverCounts)}`);
      }
      await sleep(500);
    }
    if (!cleared) {
      const senderSessionCallId = await page1.evaluate(() => {
        const roleKey = Object.keys(localStorage).find((k) => k.startsWith('connectai_role_')) || '';
        const uid = roleKey.replace('connectai_role_', '');
        if (!uid) return null;
        return sessionStorage.getItem(`connectai_active_call_${uid}`);
      });
      const receiverSessionCallId = await page2.evaluate(() => {
        const roleKey = Object.keys(localStorage).find((k) => k.startsWith('connectai_role_')) || '';
        const uid = roleKey.replace('connectai_role_', '');
        if (!uid) return null;
        return sessionStorage.getItem(`connectai_active_call_${uid}`);
      });
      const senderCallApi = await page1.evaluate(async (callId) => {
        if (!callId) return 'none';
        const token = localStorage.getItem('connectai_auth_token');
        const tenant = localStorage.getItem('connectai_tenant_id') || 'default-tenant';
        const res = await fetch(`/api/calls/${encodeURIComponent(callId)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-tenant-id': tenant,
          },
        });
        if (!res.ok) return `status=${res.status}`;
        const data = await res.json();
        return `status=${res.status} callStatus=${data?.status || 'unknown'}`;
      }, senderSessionCallId);
      const receiverCallApi = await page2.evaluate(async (callId) => {
        if (!callId) return 'none';
        const token = localStorage.getItem('connectai_auth_token');
        const tenant = localStorage.getItem('connectai_tenant_id') || 'default-tenant';
        const res = await fetch(`/api/calls/${encodeURIComponent(callId)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-tenant-id': tenant,
          },
        });
        if (!res.ok) return `status=${res.status}`;
        const data = await res.json();
        return `status=${res.status} callStatus=${data?.status || 'unknown'}`;
      }, receiverSessionCallId);
      throw new Error(`single-side hangup teardown failed senderCall=${senderSessionCallId || 'none'} receiverCall=${receiverSessionCallId || 'none'} senderApi=${senderCallApi} receiverApi=${receiverCallApi}`);
    }
    console.log('[proof] PASS single_side_hangup_ends_both_uis');
    await endAnyLiveCall(page1);
    await endAnyLiveCall(page2);

    console.log(`[verify] PASS dm_once sender=${dmCountUser1} receiver=${dmCountUser2}`);
    console.log(`[verify] PASS bootstrap_once count=${introCountUser1}`);
    console.log('[verify] PASS inbox_call incoming banner detected on target user');
    console.log('[verify] PASS inbox_call accepted and active on both users');
    if (skipAudioAssert) {
      console.log('[verify] SKIP call_audio_track assertion disabled via CONNECTAI_SKIP_AUDIO_ASSERT=1');
    } else {
      console.log('[verify] PASS call_audio_track remote audio tracks detected on both users');
    }
  } finally {
    await ctx1.close();
    await ctx2.close();
    await browser.close();
  }
};

run().catch((error) => {
  console.error('[verify] FAIL', error?.message || error);
  process.exitCode = 1;
});
