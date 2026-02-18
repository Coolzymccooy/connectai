import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import http from 'http';
import https from 'https';
import { readFileSync } from 'fs';
import { GoogleGenAI, Type } from '@google/genai';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import twilio from 'twilio';
import Stripe from 'stripe';
import { authenticate, authorize, UserRole } from './rbacMiddleware.js';
import { globalQueue } from './services/queueManager.js';
import { startDialer } from './services/dialerEngine.js';
import { AuditLog } from './models/AuditLog.js';
import { User, Call, Campaign, Disposition, Recording, Setting, Conversation, Message, Tenant, Job } from './models/index.js';
import { isStorageEnabled, uploadRecordingBuffer, downloadRecordingBuffer } from './services/storageService.js';
import { sendWhatsAppMessage } from './services/termiiService.js';
import { getFirestore } from './services/firebaseAdminService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, '../.env');
const localEnvPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: rootEnvPath });
dotenv.config({ path: localEnvPath });
const readEnvFileValue = (key) => {
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*(.*)$`, 'i');
  const readFromPath = (filePath) => {
    try {
      const content = readFileSync(filePath, 'utf8');
      const line = content.split(/\r?\n/).find((l) => pattern.test(l));
      if (!line) return '';
      const match = line.match(pattern);
      const raw = (match?.[1] || '').trim();
      if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
        return raw.slice(1, -1).trim();
      }
      return raw;
    } catch {
      return '';
    }
  };
  return readFromPath(rootEnvPath) || readFromPath(localEnvPath);
};
if (process.env.TWILIO_ACCOUNT_SID) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  console.log(`[env] TWILIO_ACCOUNT_SID length=${sid.length} preview=${sid.slice(0, 6)}...${sid.slice(-4)}`);
}

// --- DB CONNECTION ---
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI, {
    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20),
    minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 2),
  })
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ DB Error:', err));
}

const maxSockets = Number(process.env.HTTP_MAX_SOCKETS || 128);
http.globalAgent.maxSockets = maxSockets;
https.globalAgent.maxSockets = maxSockets;

const app = express();
app.set('trust proxy', 1);
const isDevEnv = process.env.NODE_ENV !== 'production';

// --- GLOBAL SECURITY & PERFORMANCE ---
app.use(helmet()); // Secure HTTP headers
app.use(compression()); // Compress responses for faster load
app.use(cors({
  origin: process.env.CLIENT_URL || '*', // Allow Vercel frontend in prod
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id']
}));

// --- RATE LIMITING (DDoS Protection) ---
const limiter = rateLimit({
  windowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.API_RATE_LIMIT_MAX || (isDevEnv ? 10000 : 300)),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path && req.path.startsWith('/auth/policy'),
});
app.use('/api/', limiter);

const twilioLimiter = rateLimit({
  windowMs: Number(process.env.TWILIO_RATE_LIMIT_WINDOW_MS || 60 * 1000),
  max: Number(process.env.TWILIO_RATE_LIMIT_MAX || (isDevEnv ? 800 : 250)),
  standardHeaders: true,
  legacyHeaders: false,
});
const aiLimiter = rateLimit({
  windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 60 * 1000),
  max: Number(process.env.AI_RATE_LIMIT_MAX || (isDevEnv ? 240 : 120)),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/twilio', twilioLimiter);
app.use('/api/gemini', aiLimiter);
app.use('/api/rag', aiLimiter);

app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '2mb' }));

const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || 'default-tenant';
const isMongoReady = () => mongoose.connection.readyState === 1;

const getTenantId = (req) => {
  const headerTenant = req.headers['x-tenant-id'];
  return req.user?.tenantId || (headerTenant ? headerTenant.toString() : DEFAULT_TENANT_ID);
};

const buildInvitePortalUrl = (invite) => {
  const base = process.env.CLIENT_URL || process.env.PUBLIC_URL || 'http://localhost:5173';
  const trimmedBase = base.replace(/\/+$/, '');
  const params = new URLSearchParams({
    email: invite.email,
    tenantId: invite.tenantId,
  });
  return `${trimmedBase}/login?${params.toString()}`;
};

const sendInviteEmail = async (invite) => {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !fromEmail) return false;
  if (typeof fetch !== 'function') return false;

  const inviteUrl = buildInvitePortalUrl(invite);
  const tenantLabel = invite.tenantId || DEFAULT_TENANT_ID;
  const roleLabel = invite.role || UserRole.AGENT;

  const payload = {
    personalizations: [{ to: [{ email: invite.email }] }],
    from: { email: fromEmail },
    subject: 'You are invited to ConnectAI',
    content: [
      {
        type: 'text/plain',
        value: `You have been invited to ConnectAI as ${roleLabel} for tenant ${tenantLabel}. Open ${inviteUrl} and sign up or sign in with this email.`,
      },
      {
        type: 'text/html',
        value: `<p>You have been invited to <strong>ConnectAI</strong> as <strong>${roleLabel}</strong> for tenant <strong>${tenantLabel}</strong>.</p><p><a href="${inviteUrl}">Open ConnectAI</a> and sign up or sign in with this email address.</p>`,
      },
    ],
  };

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (error) {
    console.warn('sendInviteEmail failed:', error?.message || error);
    return false;
  }
};

const log = (level, message, meta = {}) => {
  const entry = { level, message, time: new Date().toISOString(), ...meta };
  console.log(JSON.stringify(entry));
};

const toPublic = (doc) => {
  if (!doc) return doc;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const id = obj.externalId || obj.id || obj._id;
  const cleaned = { ...obj, id };
  delete cleaned._id;
  delete cleaned.__v;
  return cleaned;
};

const CALL_TRANSITIONS = {
  DIALING: ['RINGING', 'ACTIVE', 'ENDED'],
  RINGING: ['DIALING', 'ACTIVE', 'ENDED'],
  ACTIVE: ['DIALING', 'RINGING', 'HOLD', 'ENDED'],
  HOLD: ['DIALING', 'RINGING', 'ACTIVE', 'ENDED'],
  ENDED: [],
};

const isValidCallTransition = (fromStatus, toStatus) => {
  if (!fromStatus || fromStatus === toStatus) return true;
  const allowed = CALL_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
};

const writeAuditLog = async (req, action, target, metadata = {}) => {
  if (!isMongoReady()) return;
  try {
    await AuditLog.create({
      tenantId: req.tenantId,
      actorId: req.user?.uid || 'system',
      actorName: req.user?.name || req.user?.email || 'system',
      action,
      target,
      metadata,
    });
  } catch {
    // ignore audit failures
  }
};

const getIntegrationsStore = (tenantId) => {
  const found = stores.integrationsByTenant.find((i) => i.tenantId === tenantId);
  if (found) return found;
  const created = { tenantId, data: { calendar: {}, crm: {}, marketing: {} } };
  stores.integrationsByTenant.push(created);
  return created;
};

const saveIntegrationsStore = async () => {
  await saveStore('integrations', stores.integrationsByTenant);
};

const buildOauthCompletionHtml = (provider, ok = true, message = '') => {
  const safeProvider = String(provider || 'provider');
  const safeMessage = String(message || (ok ? `${safeProvider} connected.` : `${safeProvider} connection failed.`));
  const status = ok ? 'success' : 'error';
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${safeProvider} OAuth</title></head><body style="font-family:Arial,sans-serif;background:#0b1220;color:#e2e8f0;padding:24px"><h2 style="margin:0 0 8px 0">${safeProvider} ${ok ? 'Connected' : 'Connection Failed'}</h2><p style="margin:0 0 16px 0">${safeMessage}</p><script>try{window.opener&&window.opener.postMessage({type:'connectai-oauth',provider:'${safeProvider}',status:'${status}'},'*');}catch(e){};setTimeout(function(){window.close();},900);</script></body></html>`;
};

const getHubSpotIntegration = (tenantId) => {
  const store = getIntegrationsStore(tenantId);
  const crm = store.data.crm || (store.data.crm = {});
  const hubspot = crm.hubspot || {};
  crm.hubspot = hubspot;
  return { store, hubspot };
};

const appendHubSpotSyncHistory = (hubspot, entry) => {
  const history = Array.isArray(hubspot?.syncHistory) ? hubspot.syncHistory : [];
  const next = [
    {
      id: entry?.id || crypto.randomUUID(),
      startedAt: entry?.startedAt || Date.now(),
      finishedAt: entry?.finishedAt || Date.now(),
      status: entry?.status || 'success',
      contacts: Number(entry?.contacts || 0),
      deals: Number(entry?.deals || 0),
      error: entry?.error || '',
    },
    ...history,
  ].slice(0, 20);
  hubspot.syncHistory = next;
  return next;
};

const toHubSpotExpiry = (expiresInSeconds) => Date.now() + Math.max(30, Number(expiresInSeconds || 0) - 30) * 1000;

const saveHubSpotTokenForTenant = async (tenantId, token) => {
  const { store, hubspot } = getHubSpotIntegration(tenantId);
  hubspot.oauth = {
    accessToken: token?.access_token || '',
    refreshToken: token?.refresh_token || hubspot?.oauth?.refreshToken || '',
    tokenType: token?.token_type || 'bearer',
    expiresAt: toHubSpotExpiry(token?.expires_in),
    scope: token?.scope || '',
  };
  hubspot.status = 'connected';
  hubspot.connectedAt = Date.now();
  hubspot.updatedAt = Date.now();
  store.data.crm.hubspot = hubspot;
  await saveIntegrationsStore();
  return hubspot.oauth;
};

const refreshHubSpotAccessTokenIfNeeded = async (tenantId) => {
  const { store, hubspot } = getHubSpotIntegration(tenantId);
  const oauth = hubspot?.oauth || {};
  if (!oauth.refreshToken && !oauth.accessToken) {
    throw new Error('HubSpot OAuth not connected');
  }
  const stillValid = oauth.accessToken && oauth.expiresAt && Number(oauth.expiresAt) > Date.now();
  if (stillValid) return oauth.accessToken;
  if (!oauth.refreshToken) throw new Error('HubSpot refresh token missing');
  if (!HUBSPOT_OAUTH.clientId || !HUBSPOT_OAUTH.clientSecret) {
    throw new Error('HubSpot OAuth credentials not configured');
  }
  const tokenRes = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: HUBSPOT_OAUTH.clientId,
      client_secret: HUBSPOT_OAUTH.clientSecret,
      refresh_token: oauth.refreshToken,
    }),
  });
  const nextToken = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(nextToken?.message || `HubSpot token refresh failed (${tokenRes.status})`);
  const saved = await saveHubSpotTokenForTenant(tenantId, nextToken);
  store.data.crm.hubspot = { ...hubspot, oauth: saved, status: 'connected', updatedAt: Date.now() };
  await saveIntegrationsStore();
  return saved.accessToken;
};

const fetchHubSpotObjects = async (accessToken, objectType, properties = [], limit = 100) => {
  const base = `https://api.hubapi.com/crm/v3/objects/${encodeURIComponent(objectType)}`;
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (properties.length) params.set('properties', properties.join(','));
  const out = [];
  let after = '';
  let pages = 0;
  while (pages < 5) {
    const pageParams = new URLSearchParams(params);
    if (after) pageParams.set('after', after);
    const res = await fetch(`${base}?${pageParams.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload?.message || `HubSpot ${objectType} fetch failed (${res.status})`);
    const rows = Array.isArray(payload?.results) ? payload.results : [];
    out.push(...rows);
    after = payload?.paging?.next?.after || '';
    pages += 1;
    if (!after) break;
  }
  return out;
};

const metricsByTenant = new Map();
const getMetrics = (tenantId) => {
  if (!metricsByTenant.has(tenantId)) {
    metricsByTenant.set(tenantId, {
      inboundTotal: 0,
      outboundTotal: 0,
      routed: 0,
      failed: 0,
      retries: 0,
      lastRouteAt: null,
    });
  }
  return metricsByTenant.get(tenantId);
};

const jobStats = {
  lastRunAt: null,
  lastError: null,
  lastProcessed: 0,
  pendingCount: 0,
};

const normalizeSettingsShape = (input = {}) => {
  const fallbackBroadcastCenter = {
    messages: [],
  };
  const fallbackDesktopRelease = {
    latestVersion: '0.0.0-beta',
    windowsDownloadUrl: '/downloads/ConnectAI-Desktop-windows-x64-setup.exe',
    releaseNotesUrl: 'https://github.com/Coolzymccooy/connectai/blob/master/CHANGELOG.md',
    releasesPageUrl: 'https://github.com/Coolzymccooy/connectai/releases',
    publishedAt: new Date('2026-02-14T00:00:00.000Z').toISOString(),
    fileName: 'ConnectAI-Desktop-windows-x64.msi',
    fileSizeLabel: 'Coming soon',
    unsignedBeta: true,
  };
  const fallbackIvr = {
    phoneNumber: '',
    welcomeMessage: 'Welcome to ConnectAI. For sales, press 1. For support, press 2.',
    options: [
      { key: '1', action: 'QUEUE', target: 'Sales', label: 'Sales' },
      { key: '2', action: 'QUEUE', target: 'Support', label: 'Support' },
    ],
    departments: [
      { id: 'dept_sales', name: 'Sales', targetType: 'queue', target: 'Sales' },
      { id: 'dept_support', name: 'Support', targetType: 'queue', target: 'Support' },
      { id: 'dept_billing', name: 'Billing', targetType: 'queue', target: 'Billing' },
    ],
  };
  const fallbackAuth = {
    inviteOnly: false,
    allowedDomains: [],
    autoTenantByDomain: false,
    domainTenantMap: [],
  };
  const fallbackSubscription = {
    plan: 'Growth',
    seats: 20,
    balance: 420.5,
    currency: 'GBP',
    autoTopUp: true,
    usage: {
      aiTokens: 450000,
      aiTokenLimit: 1000000,
      voiceMinutes: 1250,
      voiceMinuteLimit: 5000,
    },
    nextBillingDate: 'Nov 01, 2025',
    paymentMethod: 'Mastercard •••• 9921',
  };
  const sourceCurrency = String(input?.subscription?.currency || fallbackSubscription.currency).toUpperCase();
  const normalizedCurrency = SUPPORTED_CURRENCIES.includes(sourceCurrency) ? sourceCurrency : fallbackSubscription.currency;
  return {
    ...input,
    broadcastCenter: {
      ...fallbackBroadcastCenter,
      ...(input?.broadcastCenter || {}),
      messages: Array.isArray(input?.broadcastCenter?.messages) ? input.broadcastCenter.messages : fallbackBroadcastCenter.messages,
    },
    desktopRelease: {
      ...fallbackDesktopRelease,
      ...(input?.desktopRelease || {}),
    },
    ivr: {
      ...fallbackIvr,
      ...(input?.ivr || {}),
      options: Array.isArray(input?.ivr?.options) ? input.ivr.options : fallbackIvr.options,
      departments: Array.isArray(input?.ivr?.departments) ? input.ivr.departments : fallbackIvr.departments,
    },
    auth: {
      ...fallbackAuth,
      ...(input?.auth || {}),
    },
    subscription: {
      ...fallbackSubscription,
      ...(input?.subscription || {}),
      currency: normalizedCurrency,
      usage: {
        ...fallbackSubscription.usage,
        ...(input?.subscription?.usage || {}),
      },
    },
  };
};

const resolveDesktopDownloadUrl = (rawUrl, releasesUrl) => {
  const fallback = releasesUrl || 'https://github.com/Coolzymccooy/connectai/releases';
  const candidate = String(rawUrl || '').trim();
  if (!candidate) return fallback;
  if (candidate.startsWith('/')) return candidate;
  try {
    const parsed = new URL(candidate);
    const isGitHub = parsed.hostname.toLowerCase().includes('github.com');
    const marker = '/releases/latest/download/';
    if (isGitHub && parsed.pathname.includes(marker)) {
      const repoRoot = parsed.pathname.split(marker)[0];
      return `${parsed.origin}${repoRoot}/releases/latest`;
    }
    return candidate;
  } catch {
    return fallback;
  }
};

const getSettingsForTenant = async (tenantId) => {
  if (isMongoReady()) {
    const doc = await Setting.findOne({ tenantId }).lean();
    return normalizeSettingsShape(doc?.data || {});
  }
  const stored = stores.settingsByTenant.find(s => s.tenantId === tenantId);
  return normalizeSettingsShape(stored?.data || {});
};

const saveSettingsForTenant = async (tenantId, incoming = {}) => {
  if (isMongoReady()) {
    const existing = await Setting.findOne({ tenantId });
    const data = normalizeSettingsShape({ ...(existing?.data || {}), ...incoming });
    await Setting.findOneAndUpdate(
      { tenantId },
      { tenantId, data, updatedAt: Date.now() },
      { upsert: true, new: true }
    );
    return data;
  }
  const idx = stores.settingsByTenant.findIndex(s => s.tenantId === tenantId);
  const merged = normalizeSettingsShape({ ...((stores.settingsByTenant[idx]?.data) || {}), ...incoming });
  if (idx >= 0) stores.settingsByTenant[idx] = { tenantId, data: merged };
  else stores.settingsByTenant.push({ tenantId, data: merged });
  await saveStore('settings', stores.settingsByTenant);
  return merged;
};

const resolveBroadcastRoles = (audience) => {
  if (audience === 'AGENT') return [UserRole.AGENT];
  if (audience === 'SUPERVISOR') return [UserRole.SUPERVISOR];
  if (audience === 'ADMIN') return [UserRole.ADMIN];
  return [UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN];
};

const sanitizeRecipient = (value) => String(value || '').trim().toLowerCase();

const collectBroadcastRecipients = (settings, audience) => {
  const allowedRoles = resolveBroadcastRoles(audience);
  const team = Array.isArray(settings?.team) ? settings.team : [];
  const seen = new Set();
  const out = [];
  for (const member of team) {
    if (!allowedRoles.includes(member?.role)) continue;
    const email = sanitizeRecipient(member?.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({
      email,
      name: member?.name || email,
      role: member?.role || UserRole.AGENT,
    });
  }
  return out;
};

const sendBroadcastEmail = async ({ to, title, body, audience, actorName, tenantId }) => {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    return { ok: false, status: 0, error: 'SENDGRID_NOT_CONFIGURED' };
  }
  const html = `<p>${body.replace(/\n/g, '<br/>')}</p><p><small>Audience: ${audience} • Tenant: ${tenantId} • Sent by: ${actorName}</small></p>`;
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromEmail },
        subject: `[ConnectAI Broadcast] ${title}`,
        content: [
          { type: 'text/plain', value: `${body}\n\nAudience: ${audience}\nTenant: ${tenantId}\nSent by: ${actorName}` },
          { type: 'text/html', value: html },
        ],
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, status: response.status, error: text || `SENDGRID_HTTP_${response.status}` };
    }
    return { ok: true, status: response.status };
  } catch (error) {
    return { ok: false, status: 0, error: error?.message || 'SENDGRID_REQUEST_FAILED' };
  }
};

const DEFAULT_AUTH_SETTINGS = {
  inviteOnly: false,
  allowedDomains: [],
  autoTenantByDomain: false,
  domainTenantMap: [],
};

const getAuthSettingsForTenant = async (tenantId) => {
  const settings = await getSettingsForTenant(tenantId);
  return { ...DEFAULT_AUTH_SETTINGS, ...(settings?.auth || {}) };
};

const extractEmailDomain = (email = '') => {
  const at = String(email).lastIndexOf('@');
  if (at === -1) return '';
  return String(email).slice(at + 1).toLowerCase();
};

const resolveTenantForEmail = async (email) => {
  const domain = extractEmailDomain(email);
  const rootAuth = await getAuthSettingsForTenant(DEFAULT_TENANT_ID);
  if (rootAuth.autoTenantByDomain && domain) {
    const hit = (rootAuth.domainTenantMap || []).find((m) => m.domain?.toLowerCase() === domain);
    if (hit?.tenantId) return hit.tenantId;
  }
  return DEFAULT_TENANT_ID;
};

const findInvite = (tenantId, email) => {
  const normalized = String(email || '').trim().toLowerCase();
  const nowTs = Date.now();
  const invite = stores.invites.find((i) => i.tenantId === tenantId && i.email?.toLowerCase() === normalized);
  if (!invite) return null;
  if (invite.expiresAt && invite.expiresAt < nowTs && invite.status !== 'accepted') {
    invite.status = 'expired';
  }
  return invite;
};

const callRouteState = new Map();
const TWILIO_HOLD_MUSIC_URL = process.env.TWILIO_HOLD_MUSIC_URL || 'http://com.twilio.music.classical.s3.amazonaws.com/BusyStrings.mp3';
const TWILIO_WAIT_SECONDS = Math.max(5, Math.min(Number(process.env.TWILIO_WAIT_SECONDS || 15), 60));
const TWILIO_MAX_WAIT_CYCLES = Math.max(0, Math.min(Number(process.env.TWILIO_MAX_WAIT_CYCLES || 2), 10));
const buildRouteTargets = (settings, fallbackIdentity = 'agent') => {
  const team = Array.isArray(settings?.team) ? settings.team : [];
  const available = team.filter(t => t.currentPresence === 'AVAILABLE' || t.status === 'active');
  const targets = (available.length ? available : team)
    .map(t => t.extension || t.id || t.email)
    .filter(Boolean);
  if (targets.length === 0) return [fallbackIdentity];
  return targets;
};

const toE164 = (value = '') => {
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\+?\d{7,15}/);
  if (!match) return '';
  return match[0].startsWith('+') ? match[0] : `+${match[0]}`;
};

const normalizeKey = (value = '') => String(value).trim().toLowerCase();

const getDepartmentRoutes = (settings) => {
  const direct = Array.isArray(settings?.ivr?.departments) ? settings.ivr.departments : [];
  const fromDirect = direct
    .map((d, idx) => ({
      id: d?.id || `dept_${idx + 1}`,
      name: String(d?.name || '').trim(),
      targetType: ['queue', 'client', 'phone'].includes(String(d?.targetType || '').toLowerCase())
        ? String(d.targetType).toLowerCase()
        : 'queue',
      target: String(d?.target || '').trim(),
    }))
    .filter((d) => d.name && d.target);
  if (fromDirect.length > 0) return fromDirect;

  const options = Array.isArray(settings?.ivr?.options) ? settings.ivr.options : [];
  const seeded = options
    .filter((o) => o && (o.action === 'QUEUE' || o.action === 'TRANSFER'))
    .map((o, idx) => ({
      id: `dept_seed_${idx + 1}`,
      name: String(o.label || o.target || `Department ${idx + 1}`),
      targetType: o.action === 'TRANSFER' ? 'client' : 'queue',
      target: String(o.target || o.label || ''),
    }))
    .filter((d) => d.name && d.target);
  return seeded;
};

const resolveTransferTargetFromDepartment = (settings, departmentName) => {
  const key = normalizeKey(departmentName);
  if (!key) return null;
  const routes = getDepartmentRoutes(settings);
  const route = routes.find((d) => normalizeKey(d.name) === key || normalizeKey(d.id) === key);
  if (!route) return null;
  if (route.targetType === 'phone') {
    const targetNumber = toE164(route.target);
    return targetNumber ? { targetNumber } : null;
  }
  return { targetIdentity: route.target };
};

const buildDialTwiml = (identity, actionUrl, recordingCallbackUrl) => `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial action="${actionUrl}" method="POST" timeout="20" record="record-from-answer" recordingStatusCallback="${recordingCallbackUrl}" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed">
    <Client>${identity}</Client>
  </Dial>
</Response>`;

const escapeXml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const buildTransferTwiml = ({ targetIdentity, targetNumber }) => {
  if (targetIdentity) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="20">
    <Client>${escapeXml(targetIdentity)}</Client>
  </Dial>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="20">${escapeXml(targetNumber || '')}</Dial>
</Response>`;
};

const buildWaitTwiml = (actionUrl, holdMusicUrl, waitSeconds = 15) => `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>All agents are currently busy. Please stay on the line while we connect you.</Say>
  <Play loop="1">${holdMusicUrl}</Play>
  <Pause length="${waitSeconds}"/>
  <Redirect method="POST">${actionUrl}</Redirect>
</Response>`;

const buildConferenceTwiml = (conferenceName, { muted = false, startOnEnter = true, endOnExit = true } = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference
      startConferenceOnEnter="${startOnEnter}"
      endConferenceOnExit="${endOnExit}"
      muted="${muted}"
      beep="false"
    >${conferenceName}</Conference>
  </Dial>
</Response>`;

const getBaseUrl = (req) => process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

const getConferenceName = (callSid) => `conf_${callSid}`;

const findConferenceSid = async (conferenceName) => {
  const client = getTwilioClient();
  if (!client) return null;
  const list = await client.conferences.list({ friendlyName: conferenceName, status: 'in-progress', limit: 1 });
  return list?.[0]?.sid || null;
};

const addConferenceParticipant = async (conferenceName, participant) => {
  const client = getTwilioClient();
  if (!client) throw new Error('Twilio client not configured');
  let conferenceSid = await findConferenceSid(conferenceName);
  if (!conferenceSid) {
    await new Promise(r => setTimeout(r, 500));
    conferenceSid = await findConferenceSid(conferenceName);
  }
  if (!conferenceSid) throw new Error('Conference not active');
  return client.conferences(conferenceSid).participants.create(participant);
};

const isTwilioCallSid = (value = '') => /^CA[0-9a-f]{32}$/i.test(String(value).trim());

const findCallByAnyId = async (tenantId, callId) => {
  const normalized = String(callId || '').trim();
  if (!normalized) return null;
  if (isMongoReady()) {
    const byExternal = await Call.findOne({ tenantId, $or: [{ externalId: normalized }, { twilioCallSid: normalized }] }).lean();
    if (byExternal) return byExternal;
    return null;
  }
  return (stores.calls || []).find(c => c.tenantId === tenantId && (c.id === normalized || c.externalId === normalized || c.twilioCallSid === normalized)) || null;
};

const resolveMonitorConference = async (tenantId, callId) => {
  const call = await findCallByAnyId(tenantId, callId);
  const identifiers = Array.from(new Set([
    String(callId || '').trim(),
    String(call?.id || '').trim(),
    String(call?.externalId || '').trim(),
    String(call?.twilioCallSid || '').trim(),
  ].filter(Boolean)));

  for (const id of identifiers) {
    const conferenceName = id.startsWith('conf_') ? id : getConferenceName(id);
    const sid = await findConferenceSid(conferenceName);
    if (sid) {
      return {
        conferenceSid: sid,
        conferenceName,
        coachSid: identifiers.find(isTwilioCallSid) || '',
        resolvedCallId: id,
      };
    }
  }

  // Last-resort fallback for active live floor: use most recent in-progress conference.
  const client = getTwilioClient();
  if (client) {
    const list = await client.conferences.list({ status: 'in-progress', limit: 20 });
    const candidate = (list || [])
      .filter(c => String(c.friendlyName || '').startsWith('conf_'))
      .sort((a, b) => new Date(b.dateUpdated || b.dateCreated || 0).getTime() - new Date(a.dateUpdated || a.dateCreated || 0).getTime())[0];
    if (candidate?.sid && candidate?.friendlyName) {
      return {
        conferenceSid: candidate.sid,
        conferenceName: candidate.friendlyName,
        coachSid: identifiers.find(isTwilioCallSid) || '',
        resolvedCallId: identifiers[0] || candidate.friendlyName.replace(/^conf_/, ''),
      };
    }
  }

  return null;
};

const enqueueJob = async (tenantId, type, payload = {}) => {
  const job = {
    tenantId,
    type,
    status: 'pending',
    payload,
    attempts: 0,
    nextRunAt: Date.now(),
  };
  if (isMongoReady()) {
    const created = await Job.create(job);
    return toPublic(created);
  }
  const stored = { id: crypto.randomUUID(), ...job };
  stores.jobs = upsertById(stores.jobs, stored);
  await saveStore('jobs', stores.jobs);
  return stored;
};

const updateJob = async (jobId, updates) => {
  if (isMongoReady()) {
    const updated = await Job.findByIdAndUpdate(jobId, updates, { new: true });
    return updated ? toPublic(updated) : null;
  }
  const existing = stores.jobs.find(j => j.id === jobId);
  if (!existing) return null;
  const stored = { ...existing, ...updates };
  stores.jobs = upsertById(stores.jobs, stored);
  await saveStore('jobs', stores.jobs);
  return stored;
};

const fetchPendingJobs = async (limit = 5) => {
  const now = Date.now();
  if (isMongoReady()) {
    const jobs = await Job.find({ status: 'pending', nextRunAt: { $lte: now } })
      .sort({ nextRunAt: 1 })
      .limit(limit)
      .lean();
    return jobs.map(toPublic);
  }
  return stores.jobs.filter(j => j.status === 'pending' && j.nextRunAt <= now).slice(0, limit);
};

const cleanupRetention = async () => {
  const now = Date.now();
  const callRetentionDays = Number(process.env.CALL_RETENTION_DAYS || 90);
  const recordingRetentionDays = Number(process.env.RECORDING_RETENTION_DAYS || 30);
  const callCutoff = now - callRetentionDays * 24 * 60 * 60 * 1000;
  const recordingCutoff = now - recordingRetentionDays * 24 * 60 * 60 * 1000;

  if (isMongoReady()) {
    await Call.deleteMany({ startTime: { $lte: callCutoff } }).catch(() => {});
    await Recording.deleteMany({ createdAt: { $lte: recordingCutoff } }).catch(() => {});
  } else {
    const callsBefore = stores.calls.length;
    stores.calls = stores.calls.filter(c => (c.startTime || 0) > callCutoff);
    if (callsBefore !== stores.calls.length) await saveStore('calls', stores.calls);
    const recBefore = stores.recordings.length;
    stores.recordings = stores.recordings.filter(r => (r.createdAt || 0) > recordingCutoff);
    if (recBefore !== stores.recordings.length) await saveStore('recordings', stores.recordings);
  }

  try {
    const db = await getFirestore();
    if (db) {
      const callsSnap = await db.collection('calls').where('expiresAt', '<=', now).limit(200).get();
      const batch = db.batch();
      callsSnap.forEach(doc => batch.delete(doc.ref));
      if (!callsSnap.empty) await batch.commit();

      const msgSnap = await db.collection('messages').where('timestamp', '<=', callCutoff).limit(200).get();
      const batch2 = db.batch();
      msgSnap.forEach(doc => batch2.delete(doc.ref));
      if (!msgSnap.empty) await batch2.commit();
    }
  } catch {
    // ignore firestore cleanup errors
  }
};

const getCallForJob = async (tenantId, callId) => {
  if (isMongoReady()) {
    const byExternal = await Call.findOne({ tenantId, $or: [{ externalId: callId }, { twilioCallSid: callId }] }).lean();
    if (byExternal) return byExternal;
    const byId = await Call.findById(callId).lean();
    return byId;
  }
  return stores.calls.find(c => c.tenantId === tenantId && (c.id === callId || c.twilioCallSid === callId));
};

const fetchLeadsForCampaign = async () => {
  const db = await getFirestore().catch(() => null);
  if (!db) return [];
  const snapshot = await db.collection('leads').limit(500).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const filterLeadsForAudience = (leads, audience = {}) => {
  return leads.filter((lead) => {
    const phone = String(lead.phone || '').trim();
    if (audience.region === 'UK' && phone && !phone.startsWith('+44')) return false;
    if (audience.region === 'NG' && phone && !phone.startsWith('+234')) return false;
    if (audience.lifecycleStage && lead.status) {
      const status = String(lead.status).toLowerCase();
      if (!status.includes(String(audience.lifecycleStage).toLowerCase())) return false;
    }
    if (audience.industry && lead.company) {
      const company = String(lead.company).toLowerCase();
      if (!company.includes(String(audience.industry).toLowerCase())) return false;
    }
    return true;
  });
};

const sendCampaignEmail = async ({ to, subject, text }) => {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error('SendGrid not configured');
  }
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [{ type: 'text/plain', value: text }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`SendGrid error ${res.status}: ${errText || 'send failed'}`);
  }
  return true;
};

const sendCampaignSms = async ({ to, message }) => {
  const apiKey = process.env.TERMII_API_KEY;
  const baseUrl = process.env.TERMII_BASE_URL;
  const endpoint = process.env.TERMII_SMS_ENDPOINT || process.env.TERMII_WHATSAPP_ENDPOINT;
  const senderId = process.env.TERMII_SENDER_ID;
  const channel = process.env.TERMII_SMS_CHANNEL || 'generic';
  if (!apiKey || !baseUrl || !endpoint || !senderId) {
    throw new Error('Termii SMS config missing');
  }
  const url = `${baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
  const payload = {
    api_key: apiKey,
    to,
    from: senderId,
    sms: message,
    type: 'plain',
    channel,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Termii request failed (${res.status})`);
  }
  return res.json();
};

const processJobs = async () => {
  const jobs = await fetchPendingJobs(5);
  jobStats.pendingCount = jobs.length;
  for (const job of jobs) {
    const jobId = job.id;
    await updateJob(jobId, { status: 'running', attempts: (job.attempts || 0) + 1 });
    try {
      if (job.type === 'transcription') {
        await updateJob(jobId, { status: 'completed', result: { ok: true, note: 'Transcript already provided.' } });
        continue;
      }
      if (job.type === 'summary') {
        const call = await getCallForJob(job.tenantId, job.payload?.callId);
        if (!call) throw new Error('Call not found');
        const text = (call.transcript || []).map((t) => `${t.speaker}: ${t.text}`).join('\n');
        const duration = Number(call.durationSeconds || 0);
        const customer = call.customerName || call.phoneNumber || 'Customer';
        const fallbackSummary = text.trim().length > 0
          ? 'Call completed. Transcript captured and ready for review.'
          : `Call with ${customer} ended after ${Math.max(0, duration)}s. Transcript unavailable; verify recording and disposition manually.`;
        let summary = fallbackSummary;
        if (GEMINI_API_KEY) {
          try {
            const ai = getClient();
            const prompt = `Provide a concise call summary and action items.\nTranscript:\n${text}`;
            const response = await ai.models.generateContent({ model: TEXT_MODEL, contents: prompt });
            summary = response.text || fallbackSummary;
          } catch (err) {
            console.warn('Summary generation fallback:', err?.message || err);
            summary = fallbackSummary;
          }
        }
        if (isMongoReady()) {
          await Call.findOneAndUpdate(
            { tenantId: job.tenantId, externalId: call.externalId || call.id },
            { analysis: { ...(call.analysis || {}), summary } }
          );
        } else {
          stores.calls = stores.calls.map(c => c.id === call.id ? { ...c, analysis: { ...(c.analysis || {}), summary } } : c);
          await saveStore('calls', stores.calls);
        }
        await updateJob(jobId, { status: 'completed', result: { summary } });
        continue;
      }
      if (job.type === 'report') {
        const tenantId = job.tenantId;
        const totalCalls = isMongoReady()
          ? await Call.countDocuments({ tenantId })
          : stores.calls.filter(c => c.tenantId === tenantId).length;
        const totalRecordings = isMongoReady()
          ? await Recording.countDocuments({ tenantId })
          : stores.recordings.filter(r => r.tenantId === tenantId).length;
        const totalCampaigns = isMongoReady()
          ? await Campaign.countDocuments({ tenantId })
          : stores.campaigns.filter(c => c.tenantId === tenantId).length;
        await updateJob(jobId, { status: 'completed', result: { totalCalls, totalRecordings, totalCampaigns } });
        continue;
      }
      if (job.type === 'campaign_send') {
        const campaign = stores.marketingCampaigns.find(c => c.id === job.payload?.campaignId && c.tenantId === job.tenantId);
        if (!campaign) throw new Error('Campaign not found');
        if (campaign.status !== 'running') {
          await updateJob(jobId, { status: 'completed', result: { ok: true, skipped: 'campaign not running' } });
          continue;
        }

        const leads = await fetchLeadsForCampaign();
        if (leads.length === 0) {
          await updateJob(jobId, { status: 'completed', result: { ok: true, skipped: 'no leads' } });
          continue;
        }

        const audienceLeads = filterLeadsForAudience(leads, campaign.audience || {});
        const channelEmail = campaign.type === 'email' || campaign.channels?.email;
        const channelSms = campaign.type === 'sms' || campaign.channels?.sms;
        if (!channelEmail && !channelSms) {
          await updateJob(jobId, { status: 'completed', result: { ok: true, skipped: 'no channels enabled' } });
          continue;
        }

        let sent = 0;
        let delivered = 0;
        let processed = 0;
        const subject = campaign.content?.emailSubject || `ConnectAI Campaign: ${campaign.name}`;
        const smsBody = campaign.content?.smsBody || `Hi {{name}}, this is ${campaign.aiPersona || 'ConnectAI'}. Reply to learn more about ${campaign.name}.`;
        for (const lead of audienceLeads) {
          const toEmail = lead.email || lead.customerEmail;
          const toPhone = lead.phone;
          const personalizedSms = smsBody.replace('{{name}}', lead.name || 'there');
          if (channelEmail && toEmail) {
            processed += 1;
            const text = campaign.content?.emailBody || `Hi ${lead.name || 'there'},\n\n${campaign.aiPersona} here from ConnectAI. We're reaching out about ${campaign.name}. Reply to this email if you'd like a quick walkthrough.\n\nThanks,\nConnectAI Team`;
            try {
              await sendCampaignEmail({ to: toEmail, subject, text });
              sent += 1;
              delivered += 1;
            } catch (err) {
              log('warn', 'campaign.email_failed', { campaignId: campaign.id, to: toEmail, error: err?.message || err });
            }
          }
          if (channelSms && toPhone) {
            processed += 1;
            try {
              await sendCampaignSms({ to: toPhone, message: personalizedSms });
              sent += 1;
              delivered += 1;
            } catch (err) {
              log('warn', 'campaign.sms_failed', { campaignId: campaign.id, to: toPhone, error: err?.message || err });
            }
          }
        }

        const nextCampaign = {
          ...campaign,
          processedCount: (campaign.processedCount || 0) + processed,
          successCount: (campaign.successCount || 0) + sent,
          metrics: {
            ...(campaign.metrics || { sent: 0, delivered: 0, opened: 0, clicked: 0, unsubscribed: 0 }),
            sent: (campaign.metrics?.sent || 0) + sent,
            delivered: (campaign.metrics?.delivered || 0) + delivered,
          },
          lastRunAt: Date.now(),
        };
        stores.marketingCampaigns = upsertById(stores.marketingCampaigns, nextCampaign);
        await saveStore('marketingCampaigns', stores.marketingCampaigns);
        await updateJob(jobId, { status: 'completed', result: { sent, delivered, processed } });
        continue;
      }
      await updateJob(jobId, { status: 'completed', result: { ok: true } });
    } catch (err) {
      const attempts = (job.attempts || 0) + 1;
      const retry = attempts < 3;
      await updateJob(jobId, {
        status: retry ? 'pending' : 'failed',
        error: err?.message || 'job failed',
        nextRunAt: Date.now() + (retry ? 60_000 : 0),
      });
      jobStats.lastError = err?.message || 'job failed';
    }
  }
  jobStats.lastRunAt = Date.now();
  jobStats.lastProcessed = jobs.length;
  if (jobStats.pendingCount > Number(process.env.JOB_BACKLOG_WARN_THRESHOLD || 20)) {
    log('warn', 'jobs.backlog', { count: jobStats.pendingCount });
  }
  await cleanupRetention();
};

if (process.env.RUN_JOB_WORKER_INLINE !== 'false') {
  setInterval(() => {
    processJobs().catch(() => {});
  }, Number(process.env.JOB_WORKER_INTERVAL_MS || 30_000));
}

app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
});

const requestMetrics = {
  total: 0,
  errors: 0,
  latencies: [],
  lastErrorAt: null,
};
const recordLatency = (ms) => {
  requestMetrics.latencies.push(ms);
  if (requestMetrics.latencies.length > 200) requestMetrics.latencies.shift();
};
const summarizeLatencies = () => {
  if (requestMetrics.latencies.length === 0) return { avg: 0, p95: 0, max: 0 };
  const sorted = [...requestMetrics.latencies].sort((a, b) => a - b);
  const avg = Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
  const max = sorted[sorted.length - 1];
  return { avg, p95, max };
};

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    requestMetrics.total += 1;
    recordLatency(duration);
    if (res.statusCode >= 400) {
      requestMetrics.errors += 1;
      requestMetrics.lastErrorAt = Date.now();
    }
    log('info', 'request.completed', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
    });
  });
  next();
});

app.use((req, res, next) => {
  req.tenantId = getTenantId(req);
  next();
});

// --- PROTECTED ROUTES ---

// --- ROOMS (Embedded WebRTC) ---
app.get('/api/rooms/:roomId', authenticate, (req, res) => {
  const tenantId = req.tenantId;
  const roomId = req.params.roomId;
  const room = stores.rooms.find(r => r.tenantId === tenantId && r.id === roomId);
  res.json(room || { id: roomId, tenantId, participants: [] });
});

app.post('/api/rooms/join', authenticate, async (req, res) => {
  const tenantId = req.tenantId;
  const { roomId, peerId, userId } = req.body || {};
  if (!roomId || !peerId) return res.status(400).json({ error: 'roomId and peerId required' });
  const existing = stores.rooms.find(r => r.tenantId === tenantId && r.id === roomId);
  const room = existing || { id: roomId, tenantId, participants: [] };
  const filtered = room.participants.filter(p => p.peerId !== peerId);
  room.participants = [...filtered, { peerId, userId, joinedAt: Date.now() }];
  if (!existing) stores.rooms.push(room);
  else stores.rooms = upsertById(stores.rooms, room);
  await saveStore('rooms', stores.rooms);
  res.json(room);
});

app.post('/api/rooms/leave', authenticate, async (req, res) => {
  const tenantId = req.tenantId;
  const { roomId, peerId } = req.body || {};
  if (!roomId || !peerId) return res.status(400).json({ error: 'roomId and peerId required' });
  const existing = stores.rooms.find(r => r.tenantId === tenantId && r.id === roomId);
  if (!existing) return res.json({ ok: true });
  existing.participants = existing.participants.filter(p => p.peerId !== peerId);
  stores.rooms = upsertById(stores.rooms, existing);
  await saveStore('rooms', stores.rooms);
  res.json({ ok: true });
});

// --- PUBLIC AUTH POLICY ---
app.get('/api/auth/policy', async (req, res) => {
  const email = String(req.query?.email || '').trim();
  const tenantFromQuery = req.query?.tenantId ? String(req.query.tenantId) : null;
  const tenantId = tenantFromQuery || await resolveTenantForEmail(email);
  const authSettings = await getAuthSettingsForTenant(tenantId);
  const invite = email ? findInvite(tenantId, email) : null;
  res.json({
    inviteOnly: authSettings.inviteOnly,
    allowedDomains: authSettings.allowedDomains || [],
    autoTenantByDomain: authSettings.autoTenantByDomain,
    tenantId,
    invite: invite ? {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
    } : null,
  });
});

// --- INVITES (ADMIN) ---
app.get('/api/invites', authenticate, authorize([UserRole.ADMIN]), async (req, res) => {
  const tenantId = req.query?.tenantId ? String(req.query.tenantId) : req.tenantId;
  res.json(stores.invites.filter((i) => i.tenantId === tenantId));
});

app.post('/api/invites', authenticate, authorize([UserRole.ADMIN]), async (req, res) => {
  const payload = req.body || {};
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email required' });
  const tenantId = payload.tenantId || req.tenantId || DEFAULT_TENANT_ID;
  const role = payload.role || UserRole.AGENT;
  const expiresInDays = Number(payload.expiresInDays || 7);
  const invite = {
    id: crypto.randomUUID(),
    email,
    role,
    tenantId,
    status: 'pending',
    createdAt: Date.now(),
    expiresAt: Date.now() + Math.max(1, expiresInDays) * 24 * 60 * 60 * 1000,
  };
  stores.invites = upsertById(stores.invites, invite);
  await saveStore('invites', stores.invites);
  const emailDispatched = await sendInviteEmail(invite);
  res.json({ ...invite, emailDispatched });
});

app.post('/api/invites/accept', async (req, res) => {
  const payload = req.body || {};
  const inviteId = String(payload.inviteId || '').trim();
  if (!inviteId) return res.status(400).json({ error: 'inviteId required' });
  const invite = stores.invites.find((i) => i.id === inviteId);
  if (!invite) return res.status(404).json({ error: 'invite not found' });
  if (invite.expiresAt && invite.expiresAt < Date.now()) {
    invite.status = 'expired';
  } else {
    invite.status = 'accepted';
    invite.acceptedAt = Date.now();
  }
  stores.invites = upsertById(stores.invites, invite);
  await saveStore('invites', stores.invites);
  res.json({ ok: true, invite });
});

// Supervisor Stats (Protected)
app.get('/api/supervisor/stats', authenticate, authorize([UserRole.ADMIN, UserRole.SUPERVISOR]), (req, res) => {
  // Mock Stats for the dashboard
  res.json({
    activeAgents: 12,
    queueSize: 45,
    avgWaitTime: 120, // seconds
    sentimentTrend: [65, 70, 72, 68, 75, 80],
    riskAlerts: 2
  });
});

// --- VECTOR STORE (In-Memory MVP) ---
// In production, swap this Map for Pinecone/Weaviate
const VECTOR_DB_BY_TENANT = new Map();

// --- SIMPLE JSON STORE (MVP persistence) ---
const dataDir = path.join(__dirname, 'data');

const ensureDataDir = async () => {
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch {
    // ignore
  }
};

const loadStore = async (name, fallback) => {
  await ensureDataDir();
  const filePath = path.join(dataDir, `${name}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const saveStore = async (name, data) => {
  await ensureDataDir();
  const filePath = path.join(dataDir, `${name}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
};

const normalizeTenantArray = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => item.tenantId ? item : { ...item, tenantId: DEFAULT_TENANT_ID });
};

const normalizeInviteArray = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => item.tenantId ? item : { ...item, tenantId: DEFAULT_TENANT_ID });
};

const normalizeSettingsStore = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((item) => item.tenantId ? item : { ...item, tenantId: DEFAULT_TENANT_ID });
  return [{ tenantId: DEFAULT_TENANT_ID, data: raw }];
};

const buildExportBundle = async (tenantId) => {
  const version = '1.0.4';
  const exportedAt = new Date().toISOString();
  if (isMongoReady()) {
    const [calls, campaigns, recordings, users, settings, conversations, messages] = await Promise.all([
      Call.find({ tenantId }).lean(),
      Campaign.find({ tenantId }).lean(),
      Recording.find({ tenantId }).lean(),
      User.find({ tenantId }).lean(),
      Setting.find({ tenantId }).lean(),
      Conversation.find({ tenantId }).lean(),
      Message.find({ tenantId }).lean(),
    ]);
    return {
      version,
      exportedAt,
      clusterData: {
        calls: calls.map(toPublic),
        campaigns: campaigns.map(toPublic),
        recordings: recordings.map(toPublic),
        users: users.map(toPublic),
        settings: settings.map(toPublic),
        conversations: conversations.map(toPublic),
        messages: messages.map(toPublic),
      },
    };
  }
  return {
    version,
    exportedAt,
    clusterData: {
      calls: stores.calls.filter(c => c.tenantId === tenantId),
      campaigns: stores.campaigns.filter(c => c.tenantId === tenantId),
      recordings: stores.recordings.filter(r => r.tenantId === tenantId),
      users: stores.users.filter(u => u.tenantId === tenantId),
      settings: stores.settingsByTenant.filter(s => s.tenantId === tenantId),
      conversations: stores.conversations ? stores.conversations.filter(c => c.tenantId === tenantId) : [],
      messages: stores.messages ? stores.messages.filter(m => m.tenantId === tenantId) : [],
    },
  };
};

const stores = {
  calls: normalizeTenantArray(await loadStore('calls', [])),
  tenants: await loadStore('tenants', []),
  campaigns: normalizeTenantArray(await loadStore('campaigns', [])),
  dispositions: normalizeTenantArray(await loadStore('dispositions', [])),
  recordings: normalizeTenantArray(await loadStore('recordings', [])),
  calendarEvents: normalizeTenantArray(await loadStore('calendarEvents', [])),
  crmContacts: normalizeTenantArray(await loadStore('crmContacts', [])),
  crmDeals: normalizeTenantArray(await loadStore('crmDeals', [])),
  crmTasks: normalizeTenantArray(await loadStore('crmTasks', [])),
  marketingCampaigns: normalizeTenantArray(await loadStore('marketingCampaigns', [])),
  integrationsByTenant: normalizeSettingsStore(await loadStore('integrations', null)),
  users: normalizeTenantArray(await loadStore('users', [])),
  jobs: normalizeTenantArray(await loadStore('jobs', [])),
  settingsByTenant: normalizeSettingsStore(await loadStore('settings', null)),
  invites: normalizeInviteArray(await loadStore('invites', [])),
  rooms: normalizeTenantArray(await loadStore('rooms', [])),
};

const hasTenantIn = (items = [], tenantId) => Array.isArray(items) && items.some((item) => item?.tenantId === tenantId);
if (
  hasTenantIn(stores.settingsByTenant, 'connectai-main') ||
  hasTenantIn(stores.calls, 'connectai-main') ||
  hasTenantIn(stores.users, 'connectai-main')
) {
  log('warn', 'tenant.split.detected', {
    message: 'Both connectai-main and default-tenant data detected in local stores. Run `npm run tenant:migrate-local`.',
  });
}

const QUEUES = [
  { id: 'q_sales', name: 'Sales', description: 'Inbound sales inquiries', slaTarget: 30 },
  { id: 'q_support', name: 'Support / Billing', description: 'General customer support', slaTarget: 60 },
  { id: 'q_tech', name: 'Technical Support', description: 'L2 Technical issues', slaTarget: 120 },
  { id: 'q_out_sales', name: 'Outbound Sales', description: 'Campaign dialing', slaTarget: 0 },
];

const defaultSettings = {
  ivr: {
    phoneNumber: '',
    welcomeMessage: 'Welcome to ConnectAI. For sales, press 1. For support, press 2.',
    options: [
      { key: '1', action: 'QUEUE', target: 'Sales', label: 'Sales' },
      { key: '2', action: 'QUEUE', target: 'Support', label: 'Support' },
    ],
    departments: [
      { id: 'dept_sales', name: 'Sales', targetType: 'queue', target: 'Sales' },
      { id: 'dept_support', name: 'Support', targetType: 'queue', target: 'Support' },
      { id: 'dept_billing', name: 'Billing', targetType: 'queue', target: 'Billing' },
    ],
  },
  auth: {
    inviteOnly: false,
    allowedDomains: [],
    autoTenantByDomain: false,
    domainTenantMap: [],
  },
};

const oauthStates = new Map();
const now = () => Date.now();
const createState = () => crypto.randomUUID();

const GOOGLE_OAUTH = {
  clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || '',
  scopes: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid',
  ],
};

const MS_OAUTH = {
  clientId: process.env.MS_OAUTH_CLIENT_ID || '',
  clientSecret: process.env.MS_OAUTH_CLIENT_SECRET || '',
  redirectUri: process.env.MS_OAUTH_REDIRECT_URI || '',
  scopes: [
    'offline_access',
    'https://graph.microsoft.com/Calendars.ReadWrite',
    'https://graph.microsoft.com/User.Read',
  ],
};

const HUBSPOT_OAUTH = {
  clientId: process.env.HUBSPOT_CLIENT_ID || '',
  clientSecret: process.env.HUBSPOT_CLIENT_SECRET || '',
  redirectUri: process.env.HUBSPOT_OAUTH_REDIRECT_URI || '',
  scopes: [
    'oauth',
    'crm.objects.contacts.read',
    'crm.objects.contacts.write',
    'crm.objects.deals.read',
    'crm.objects.deals.write',
  ],
};

const AccessToken = twilio.jwt.AccessToken;
const { VoiceGrant } = AccessToken;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const STRIPE_PRICE_IDS = {
  Starter: process.env.STRIPE_PRICE_STARTER || '',
  Growth: process.env.STRIPE_PRICE_GROWTH || '',
  Enterprise: process.env.STRIPE_PRICE_ENTERPRISE || '',
};
const SUPPORTED_CURRENCIES = ['USD', 'GBP', 'NGN'];
const CURRENCY_SYMBOLS = { USD: '$', GBP: '£', NGN: '₦' };
const getTwilioAuthToken = () => process.env.TWILIO_AUTH_TOKEN || readEnvFileValue('TWILIO_AUTH_TOKEN') || '';
const getTwilioAccountSid = () => process.env.TWILIO_ACCOUNT_SID || readEnvFileValue('TWILIO_ACCOUNT_SID') || '';
const getTwilioApiKey = () => process.env.TWILIO_API_KEY || readEnvFileValue('TWILIO_API_KEY') || '';
const getTwilioApiSecret = () => process.env.TWILIO_API_SECRET || readEnvFileValue('TWILIO_API_SECRET') || '';
const getTwilioTwimlAppSid = () => process.env.TWILIO_TWIML_APP_SID || readEnvFileValue('TWILIO_TWIML_APP_SID') || '';
let twilioClient = (getTwilioAccountSid() && getTwilioAuthToken())
  ? twilio(getTwilioAccountSid(), getTwilioAuthToken())
  : null;
const isTwilioMonitoringEnabled = () => String(process.env.TWILIO_MONITORING_ENABLED || '').toLowerCase() === 'true';

const getTwilioClient = () => {
  if (twilioClient) return twilioClient;
  const sid = getTwilioAccountSid();
  const token = getTwilioAuthToken();
  if (!sid || !token) return null;
  twilioClient = twilio(sid, token);
  return twilioClient;
};

const verifyTwilioSignature = (req, res, next) => {
  const authToken = getTwilioAuthToken();
  if (!authToken) return next();
  const signature = req.headers['x-twilio-signature'];
  if (!signature) return res.status(403).send('missing signature');
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const valid = twilio.validateRequest(
    authToken,
    signature,
    url,
    req.body || {}
  );
  if (!valid) return res.status(403).send('invalid signature');
  next();
};

const upsertById = (items, item) => {
  const idx = items.findIndex(i => i.id === item.id);
  if (idx >= 0) items[idx] = item;
  else items.push(item);
  return items;
};

const recordingsDir = path.join(dataDir, 'recordings-files');
const ensureRecordingsDir = async () => {
  await fs.mkdir(recordingsDir, { recursive: true });
};

const RECORDINGS_SIGNING_SECRET = process.env.RECORDINGS_SIGNING_SECRET || 'dev-secret';

const signToken = (payload) => {
  const h = crypto.createHmac('sha256', RECORDINGS_SIGNING_SECRET);
  h.update(payload);
  return h.digest('hex');
};

const extractRecordingIdFromUrl = (url = '') => {
  const tokenMatch = String(url).match(/[?&]token=([^&]+)/);
  if (!tokenMatch) return '';
  const token = tokenMatch[1];
  const parts = token.split('.');
  return parts.length >= 2 ? parts[1] : '';
};

const detectAudioMimeFromBuffer = (buffer) => {
  if (!buffer || buffer.length < 4) return 'application/octet-stream';
  const header = buffer.subarray(0, 4).toString('ascii');
  if (header === 'RIFF') return 'audio/wav';
  if (header.startsWith('ID3') || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  return 'application/octet-stream';
};

const canAccessRecordings = async (req) => {
  if (!req?.user) return false;
  if (req.user.role === UserRole.ADMIN) return true;
  if (req.user.role !== UserRole.SUPERVISOR) return false;
  const settings = await getSettingsForTenant(req.tenantId);
  const team = Array.isArray(settings?.team) ? settings.team : [];
  const email = String(req.user.email || '').toLowerCase();
  const match = team.find((member) => member.id === req.user.uid || (member.email && member.email.toLowerCase() === email));
  return Boolean(match?.canAccessRecordings);
};

const createSilenceWav = (durationSeconds = 1, sampleRate = 8000) => {
  const samples = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const pcmBuffer = Buffer.alloc(samples * 2, 0);
  return createWavBuffer(pcmBuffer, { sampleRate, channels: 1, bitDepth: 16 });
};

const downloadTwilioRecording = async (recordingUrl) => {
  if (!recordingUrl) throw new Error('missing recording url');
  const accountSid = getTwilioAccountSid();
  const authToken = getTwilioAuthToken();
  if (!accountSid || !authToken) {
    throw new Error('twilio auth not configured');
  }
  const targetUrl = recordingUrl.endsWith('.wav') ? recordingUrl : `${recordingUrl}.wav`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(targetUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!response.ok) {
    throw new Error(`twilio recording fetch failed (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const requestTwilioTranscription = async (recordingSid, callbackUrl) => {
  if (!recordingSid) return null;
  const client = getTwilioClient();
  if (!client) throw new Error('twilio client not configured');
  try {
    const transcription = await client.recordings(recordingSid).transcriptions.create({
      transcriptionCallback: callbackUrl,
    });
    return transcription;
  } catch (err) {
    console.error('Twilio transcription request failed', err);
    return null;
  }
};

const buildRecordingUrl = (req, tenantId, externalId, ttlSeconds = 3600) => {
  const expires = Date.now() + ttlSeconds * 1000;
  const payload = `${tenantId}:${externalId}:${expires}`;
  const sig = signToken(payload);
  const token = `${tenantId}.${externalId}.${expires}.${sig}`;
  return `${getBaseUrl(req)}/api/recordings/download?token=${token}`;
};

const ensureRecordingForCall = async (req, call) => {
  if (!call) return;
  const tenantId = call.tenantId || req.tenantId || DEFAULT_TENANT_ID;
  const callId = call.externalId || call.id;
  if (!callId) return;
  const callDuration = Number(call.durationSeconds);
  const derivedDuration = Number(call.endTime) > Number(call.startTime)
    ? Math.ceil((Number(call.endTime) - Number(call.startTime)) / 1000)
    : 0;
  const fallbackDurationSeconds = Math.max(1, Math.ceil(Number.isFinite(callDuration) && callDuration > 0 ? callDuration : derivedDuration));

  const existing = isMongoReady()
    ? await Recording.findOne({ tenantId, callId }).lean()
    : stores.recordings.find(r => r.tenantId === tenantId && r.callId === callId);

  if (existing && (existing.recordingUrl || existing.url)) return;

  const externalId = existing?.externalId || existing?.id || `rec_${callId}`;
  const useStorage = await isStorageEnabled();
  const objectPath = `recordings/${externalId}.wav`;
  let filePath = path.join(recordingsDir, `${externalId}.wav`);
  let size = 0;
  let storageProvider = 'local';
  let storagePath = filePath;
  const wavBuffer = createSilenceWav(fallbackDurationSeconds);
  if (useStorage) {
    const stored = await uploadRecordingBuffer(objectPath, wavBuffer, 'audio/wav');
    size = stored?.size || 0;
    storageProvider = stored?.storageProvider || 'gcs';
    storagePath = stored?.storagePath || objectPath;
  } else {
    await ensureRecordingsDir();
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, wavBuffer);
    }
    try {
      const stats = await fs.stat(filePath);
      size = stats.size || 0;
    } catch {
      size = 0;
    }
  }

  const recordingUrl = buildRecordingUrl(req, tenantId, externalId);
  const recording = {
    tenantId,
    externalId,
    callId,
    filename: `${externalId}.wav`,
    mimeType: 'audio/wav',
    size,
    storagePath,
    storageProvider,
    recordingUrl,
    createdAt: Date.now(),
  };

    if (isMongoReady()) {
      await Recording.findOneAndUpdate(
        { tenantId, externalId },
        recording,
        { upsert: true, new: true }
      );
      await Call.findOneAndUpdate(
        { tenantId, $or: [{ externalId: callId }, { twilioCallSid: callId }] },
        { recordingUrl, recordingId: externalId }
      );
    } else {
      const stored = { id: externalId, ...recording };
      stores.recordings = upsertById(stores.recordings, stored);
      await saveStore('recordings', stores.recordings);
      stores.calls = stores.calls.map(c => ((c.id === callId || c.twilioCallSid === callId) && c.tenantId === tenantId) ? { ...c, recordingUrl, recordingId: externalId } : c);
      await saveStore('calls', stores.calls);
    }
  };

const removeById = (items, id) => items.filter(i => i.id !== id);

const getEmbeddings = async (text) => {
  const ai = getClient();
  try {
    const result = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: [{ parts: [{ text }] }],
    });
    return result.embedding.values;
  } catch (err) {
    console.error('Embedding error:', err);
    return null;
  }
};

const cosineSimilarity = (vecA, vecB) => {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dotProduct / (magA * magB);
};

app.post('/api/rag/ingest', authenticate, async (req, res) => {
  if (!ensureGemini(res)) return;
  const { documents } = req.body; // Expects [{ id, content, metadata }]
  if (!Array.isArray(documents)) return res.status(400).json({ error: 'documents array required' });

  const tenantId = req.tenantId;
  const vectorDb = VECTOR_DB_BY_TENANT.get(tenantId) || [];
  const processed = [];
  for (const doc of documents) {
    const vector = await getEmbeddings(doc.content);
    if (vector) {
      // Upsert logic
      const existingIdx = vectorDb.findIndex(v => v.id === doc.id);
      const record = { id: doc.id, vector, content: doc.content, metadata: doc.metadata };
      if (existingIdx >= 0) {
        vectorDb[existingIdx] = record;
      } else {
        vectorDb.push(record);
      }
      processed.push(doc.id);
    }
  }
  VECTOR_DB_BY_TENANT.set(tenantId, vectorDb);
  console.log(`[RAG] Ingested ${processed.length} documents for ${tenantId}. Total DB size: ${vectorDb.length}`);
  res.json({ success: true, count: processed.length });
});

app.post('/api/rag/query', authenticate, async (req, res) => {
  if (!ensureGemini(res)) return;
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });

  // 1. Vector Search
  const tenantId = req.tenantId;
  const vectorDb = VECTOR_DB_BY_TENANT.get(tenantId) || [];
  const queryVector = await getEmbeddings(query);
  if (!queryVector) return res.status(500).json({ error: 'Failed to embed query' });

  const matches = vectorDb.map(doc => ({
    ...doc,
    score: cosineSimilarity(queryVector, doc.vector)
  }))
  .sort((a, b) => b.score - a.score)
  .slice(0, 3); // Top 3 chunks

  // 2. LLM Synthesis (RAG)
  const ai = getClient();
  const context = matches.map(m => `- ${m.content} (Source: ${m.metadata?.title || 'Unknown'})`).join('\n');
  const prompt = `Context:\n${context}\n\nUser Query: "${query}"\n\nAnswer the query strictly using the provided context. If the answer isn't in the context, say "I don't have that info". Keep it concise for a call center agent.`;

  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
    });
    
    res.json({
      answer: response.text,
      sources: matches.map(m => ({ 
        id: m.id, 
        title: m.metadata?.title, 
        score: m.score,
        content: m.content
      }))
    });
  } catch (err) {
    res.status(500).json({ error: 'RAG Synthesis Failed' });
  }
});


const PORT = Number(process.env.SERVER_PORT || 8787);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const TEXT_MODEL = 'gemini-2.5-flash';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

const ensureGemini = (res) => {
  if (!GEMINI_API_KEY) {
    res.status(400).json({ error: 'GEMINI_API_KEY missing. Set it in .env.local.' });
    return false;
  }
  return true;
};

const getClient = (opts = {}) => new GoogleGenAI({ apiKey: GEMINI_API_KEY, ...opts });

const safeJson = async (response, fallback) => {
  try {
    return JSON.parse(response.text || '');
  } catch {
    return fallback;
  }
};

const createWavBuffer = (pcmBuffer, { sampleRate = 24000, channels = 1, bitDepth = 16 } = {}) => {
  const headerSize = 44;
  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);
  const dataSize = pcmBuffer.length;
  const buffer = Buffer.alloc(headerSize + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(headerSize - 8 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(buffer, headerSize);

  return buffer;
};

app.get('/api/health', (req, res) => {
  res.json({ ok: true, geminiConfigured: Boolean(GEMINI_API_KEY) });
});

app.get('/', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'connectai-api',
    health: '/api/health',
  });
});

const getPublicDesktopReleaseFallback = () => {
  try {
    const releasePath = path.resolve(__dirname, '../public/desktop-release.json');
    const raw = readFileSync(releasePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {
      productName: 'ConnectAI Desktop',
      channel: 'beta',
      unsigned: true,
      latestVersion: '0.0.0-beta',
      publishedAt: new Date('2026-02-14T00:00:00.000Z').toISOString(),
      releasesUrl: 'https://github.com/Coolzymccooy/connectai/releases',
      notesUrl: 'https://github.com/Coolzymccooy/connectai/blob/master/CHANGELOG.md',
      downloads: {
        windows: {
          label: 'Windows x64',
          fileName: 'ConnectAI-Desktop-windows-x64.msi',
          url: 'https://github.com/Coolzymccooy/connectai/releases/latest',
          size: 'Coming soon',
        },
      },
    };
  }
};

app.get('/api/public/desktop-release', async (_req, res) => {
  try {
    const fallback = getPublicDesktopReleaseFallback();
    const settings = await getSettingsForTenant(DEFAULT_TENANT_ID).catch(() => null);
    const desktop = settings?.desktopRelease || {};
    const releasesUrl = desktop.releasesPageUrl || fallback.releasesUrl;
    const downloadUrl = resolveDesktopDownloadUrl(
      desktop.windowsDownloadUrl || fallback.downloads?.windows?.url || '',
      releasesUrl
    );
    res.json({
      ...fallback,
      latestVersion: desktop.latestVersion || fallback.latestVersion,
      publishedAt: desktop.publishedAt || fallback.publishedAt,
      unsigned: desktop.unsignedBeta ?? fallback.unsigned,
      releasesUrl,
      notesUrl: desktop.releaseNotesUrl || fallback.notesUrl,
      downloads: {
        windows: {
          label: 'Windows x64',
          fileName: desktop.fileName || fallback.downloads?.windows?.fileName || 'ConnectAI-Desktop-windows-x64.msi',
          url: downloadUrl,
          size: desktop.fileSizeLabel || fallback.downloads?.windows?.size || 'N/A',
        },
      },
    });
  } catch {
    res.status(500).json({ error: 'desktop release unavailable' });
  }
});

app.get('/api/health/deps', async (req, res) => {
  const mongo = isMongoReady();
  const firebase = Boolean(await getFirestore().catch(() => null));
  const storage = await isStorageEnabled().catch(() => false);
  const integrationStatus = getIntegrationsStore(DEFAULT_TENANT_ID)?.data || {};
  res.json({
    ok: true,
    mongo,
    firebase,
    storage,
    integrations: integrationStatus,
    jobWorker: {
      lastRunAt: jobStats.lastRunAt,
      lastError: jobStats.lastError,
      lastProcessed: jobStats.lastProcessed,
      pendingCount: jobStats.pendingCount,
    },
    requestMetrics: summarizeLatencies(),
    rateLimits: {
      api: { windowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000), max: Number(process.env.API_RATE_LIMIT_MAX || (isDevEnv ? 2000 : 300)) },
      twilio: { windowMs: Number(process.env.TWILIO_RATE_LIMIT_WINDOW_MS || 60 * 1000), max: Number(process.env.TWILIO_RATE_LIMIT_MAX || (isDevEnv ? 800 : 250)) },
      ai: { windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 60 * 1000), max: Number(process.env.AI_RATE_LIMIT_MAX || (isDevEnv ? 240 : 120)) },
    },
  });
});

app.post('/api/jobs/process', async (req, res) => {
  const token = String(req.headers['x-worker-token'] || '');
  if (!process.env.WORKER_TOKEN || token !== process.env.WORKER_TOKEN) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    await processJobs();
    res.json({ ok: true, processed: jobStats.lastProcessed });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'job process failed' });
  }
});

app.use('/api', (req, res, next) => {
  if (
    req.path === '/health' ||
    req.path === '/public/desktop-release' ||
    req.path === '/recordings/download' ||
    /^\/oauth\/[^/]+\/callback$/.test(req.path)
  ) return next();
  return authenticate(req, res, next);
});

app.post('/api/gemini/intel', async (req, res) => {
  if (!ensureGemini(res)) return;
  const { companyName } = req.body || {};
  if (!companyName) return res.status(400).json({ error: 'companyName is required' });
  const ai = getClient();
  const prompt = `Research the company "${companyName}". Provide a 3-sentence executive summary of their recent news, financial status, and competitive position for a sales agent about to call them.`;

  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    const text = response.text || 'No recent public telemetry detected.';
    const links = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk) => ({
      title: chunk.web?.title || 'Source',
      uri: chunk.web?.uri || '#',
    })) || [];
    res.json({ text, links });
  } catch (error) {
    console.error('Search Grounding Failed:', error);
    res.status(500).json({ error: 'Unable to reach search cluster.' });
  }
});

app.post('/api/gemini/draft', async (req, res) => {
  if (!ensureGemini(res)) return;
  const { history } = req.body || {};
  if (!Array.isArray(history)) return res.status(400).json({ error: 'history is required' });
  const ai = getClient();
  const text = history.map((m) => `${m.sender}: ${m.text}`).join('\n');
  const prompt = `Act as a professional customer support agent. Review this message history and draft a concise, helpful 1-sentence reply to the last customer message.\nHistory:\n${text}`;

  try {
    const response = await ai.models.generateContent({ model: TEXT_MODEL, contents: prompt });
    res.json({ text: response.text || "I'll look into that for you." });
  } catch (error) {
    res.status(500).json({ text: 'Error generating draft.' });
  }
});

app.post('/api/gemini/campaign-draft', async (req, res) => {
  if (!ensureGemini(res)) return;
  const { campaign } = req.body || {};
  if (!campaign?.name) return res.status(400).json({ error: 'campaign is required' });
  const ai = getClient();
  const audience = campaign.audience || {};
  const prompt = `You are a B2B email copywriter for the UK market. Draft a short outbound email for a campaign.
Campaign name: ${campaign.name}
Persona: ${campaign.aiPersona || 'Professional concierge'}
Audience: ${JSON.stringify(audience)}
Return JSON with keys: subject, body.
Constraints:
- 1 short subject line (max 7 words)
- Body under 90 words
- Professional, clear, and friendly
- No emojis
- End with a simple call-to-action question`;

  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING },
            body: { type: Type.STRING },
          },
        },
      },
    });
    const parsed = response.text ? JSON.parse(response.text) : {};
    res.json({
      subject: parsed.subject || `ConnectAI Campaign: ${campaign.name}`,
      body: parsed.body || `Hi there,\n\nWe are reaching out about ${campaign.name}.\n\nThanks,\nConnectAI Team`,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error generating campaign draft.' });
  }
});

app.post('/api/gemini/lead-enrich', async (req, res) => {
  if (!ensureGemini(res)) return;
  const { lead } = req.body || {};
  if (!lead?.name) return res.status(400).json({ error: 'lead is required' });
  const ai = getClient();
  const prompt = `You are a sales operations assistant. Enrich this lead with best-guess company and industry.
Lead: ${JSON.stringify(lead)}
Return JSON with keys: company, industry, notes.
If unknown, return empty string.`;
  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            company: { type: Type.STRING },
            industry: { type: Type.STRING },
            notes: { type: Type.STRING },
          },
        },
      },
    });
    const parsed = response.text ? JSON.parse(response.text) : {};
    res.json({
      company: parsed.company || '',
      industry: parsed.industry || '',
      notes: parsed.notes || '',
    });
  } catch (error) {
    res.status(500).json({ error: 'Error enriching lead.' });
  }
});

app.post('/api/gemini/help', async (req, res) => {
  if (!ensureGemini(res)) return;
  const { question } = req.body || {};
  if (!question) return res.status(400).json({ error: 'question is required' });
  const ai = getClient();
  const prompt = `You are the in-app help assistant for ConnectAI.
Answer concisely (3-6 sentences) and include the exact screen name or tab when relevant.
Question: ${question}`;
  try {
    const response = await ai.models.generateContent({ model: TEXT_MODEL, contents: prompt });
    res.json({ text: response.text || 'Help response unavailable.' });
  } catch {
    res.status(500).json({ error: 'Help response unavailable.' });
  }
});

app.post('/api/gemini/analysis', async (req, res) => {
  if (!ensureGemini(res)) return;
  const { transcript } = req.body || {};
  if (!Array.isArray(transcript)) return res.status(400).json({ error: 'transcript is required' });
  const ai = getClient();
  const text = transcript.map((t) => `${t.speaker}: ${t.text}`).join('\n');
  const prompt = `Act as a Senior QA Analyst. Provide a JSON analysis of this call.\nInclude:\n1. A concise 2-sentence summary.\n2. Sentiment score (0-100).\n3. Sentiment label (Positive, Neutral, Negative).\n4. Topics discussed (Array of strings).\n5. Disposition Suggestion (e.g. Resolved, Follow-up Needed).\n6. QA Score (0-100).\n\nTranscript:\n${text}`;

  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            sentimentScore: { type: Type.NUMBER },
            sentimentLabel: { type: Type.STRING },
            topics: { type: Type.ARRAY, items: { type: Type.STRING } },
            dispositionSuggestion: { type: Type.STRING },
            qaScore: { type: Type.NUMBER },
          },
          required: ['summary', 'sentimentScore', 'sentimentLabel', 'topics', 'dispositionSuggestion', 'qaScore'],
        },
      },
    });
    const parsed = await safeJson(response, null);
    if (!parsed) throw new Error('Invalid JSON from model');
    res.json(parsed);
  } catch (error) {
    console.error('Gemini Analysis Failed:', error);
    res.json({
      summary: 'Manual review required. Neural engine timeout.',
      sentimentScore: 50,
      sentimentLabel: 'Neutral',
      topics: ['Unknown'],
      qaScore: 0,
      dispositionSuggestion: 'Needs Review',
    });
  }
});

app.post('/api/gemini/tool-actions', async (req, res) => {
  if (!ensureGemini(res)) return;
  const { transcript } = req.body || {};
  if (!Array.isArray(transcript)) return res.status(400).json({ error: 'transcript is required' });
  const ai = getClient();
  const text = transcript.map((t) => `${t.speaker}: ${t.text}`).join('\n');
  const prompt = `Identify actionable intents for CRM interaction (e.g. Schedule Call, Update Email, Create Ticket). Format as JSON array.\nTranscript:\n${text}`;

  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              description: { type: Type.STRING },
              params: {
                type: Type.OBJECT,
                properties: {
                  details: { type: Type.STRING, description: 'Action parameter details' },
                },
              },
            },
            required: ['name', 'description', 'params'],
          },
        },
      },
    });
    const parsed = await safeJson(response, []);
    res.json(parsed);
  } catch (error) {
    res.json([]);
  }
});

app.post('/api/gemini/lead-brief', async (req, res) => {
  if (!ensureGemini(res)) return;
  const { lead } = req.body || {};
  if (!lead) return res.status(400).json({ error: 'lead is required' });
  const ai = getClient();
  const prompt = `Generate a 2-sentence strategic briefing for an agent about to call this lead:\nName: ${lead.name}\nCompany: ${lead.company}\nNotes: ${lead.notes || ''}`;

  try {
    const response = await ai.models.generateContent({ model: TEXT_MODEL, contents: prompt });
    res.json({ text: response.text || 'No briefing available.' });
  } catch (error) {
    res.status(500).json({ text: 'Error generating briefing.' });
  }
});

// --- QUEUES ---
app.get('/api/queues', (req, res) => {
  res.json(QUEUES);
});

// --- SETTINGS ---
app.get('/api/settings', (req, res) => {
  const tenantId = req.tenantId;
  if (isMongoReady()) {
    return Setting.findOne({ tenantId })
      .then((doc) => res.json({
        ...normalizeSettingsShape(doc?.data || {}),
        _meta: { tenantId, savedAt: Number(doc?.updatedAt || Date.now()) },
      }))
      .catch(() => res.json({
        ...normalizeSettingsShape({}),
        _meta: { tenantId, savedAt: Date.now() },
      }));
  }
  const stored = stores.settingsByTenant.find(s => s.tenantId === tenantId);
  const settings = normalizeSettingsShape(stored?.data || {});
  res.json({ ...settings, _meta: { tenantId, savedAt: Date.now() } });
});

app.put('/api/settings', async (req, res) => {
  const incoming = req.body || {};
  const tenantId = req.tenantId;
  const merged = await saveSettingsForTenant(tenantId, incoming);
  await writeAuditLog(req, 'SETTINGS_UPDATE', 'settings', { keys: Object.keys(incoming) });
  res.json({ ...merged, _meta: { tenantId, savedAt: Date.now() } });
});

app.post('/api/broadcasts/send', authorize([UserRole.ADMIN]), async (req, res) => {
  const tenantId = req.tenantId;
  const payload = req.body || {};
  const title = String(payload.title || '').trim();
  const body = String(payload.body || '').trim();
  const audience = String(payload.audience || 'ALL').toUpperCase();
  const inApp = Boolean(payload.inApp);
  const emailEnabled = Boolean(payload.email);
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' });
  if (!['ALL', 'AGENT', 'SUPERVISOR', 'ADMIN'].includes(audience)) return res.status(400).json({ error: 'invalid audience' });

  const settings = await getSettingsForTenant(tenantId);
  const recipients = emailEnabled ? collectBroadcastRecipients(settings, audience) : [];
  const deliveryLogs = [];
  let delivered = 0;
  let failed = 0;

  if (emailEnabled) {
    for (const recipient of recipients) {
      const sent = await sendBroadcastEmail({
        to: recipient.email,
        title,
        body,
        audience,
        actorName: req.user?.name || req.user?.email || 'Admin',
        tenantId,
      });
      if (sent.ok) delivered += 1;
      else failed += 1;
      deliveryLogs.push({
        email: recipient.email,
        status: sent.ok ? 'DELIVERED' : 'FAILED',
        reason: sent.ok ? '' : String(sent.error || ''),
        at: new Date().toISOString(),
      });
    }
  }

  const entry = {
    id: `bc_${Date.now()}`,
    title,
    body,
    audience,
    inApp,
    email: emailEnabled,
    status: 'SENT',
    createdAt: new Date().toISOString(),
    sentAt: new Date().toISOString(),
    createdByName: req.user?.name || req.user?.email || 'Admin',
    delivery: {
      attempted: recipients.length,
      delivered,
      failed,
      provider: emailEnabled ? 'sendgrid' : 'none',
      logs: deliveryLogs,
    },
  };
  const messages = [entry, ...((settings.broadcastCenter?.messages || []))].slice(0, 150);
  const merged = await saveSettingsForTenant(tenantId, {
    broadcastCenter: { messages },
  });
  await writeAuditLog(req, 'BROADCAST_SEND', entry.id, {
    audience,
    inApp,
    email: emailEnabled,
    attempted: recipients.length,
    delivered,
    failed,
  });
  return res.json({ broadcast: entry, settings: merged });
});

app.post('/api/broadcasts/:id/archive', authorize([UserRole.ADMIN]), async (req, res) => {
  const tenantId = req.tenantId;
  const id = String(req.params.id || '');
  const settings = await getSettingsForTenant(tenantId);
  const messages = (settings.broadcastCenter?.messages || []).map((item) =>
    item.id === id ? { ...item, status: 'ARCHIVED' } : item
  );
  const merged = await saveSettingsForTenant(tenantId, { broadcastCenter: { messages } });
  await writeAuditLog(req, 'BROADCAST_ARCHIVE', id, {});
  res.json({ ok: true, settings: merged });
});

app.get('/api/billing/stripe/config', authorize([UserRole.ADMIN]), async (req, res) => {
  const tenantId = req.tenantId;
  const settings = await getSettingsForTenant(tenantId);
  const currency = String(settings?.subscription?.currency || 'GBP').toUpperCase();
  res.json({
    configured: Boolean(stripe),
    publishableKeyConfigured: Boolean(process.env.STRIPE_PUBLISHABLE_KEY),
    currency,
    pricesConfigured: {
      Starter: Boolean(STRIPE_PRICE_IDS.Starter),
      Growth: Boolean(STRIPE_PRICE_IDS.Growth),
      Enterprise: Boolean(STRIPE_PRICE_IDS.Enterprise),
    },
    billingPortalConfigured: Boolean(process.env.STRIPE_BILLING_PORTAL_URL),
  });
});

app.post('/api/billing/stripe/checkout', authorize([UserRole.ADMIN]), async (req, res) => {
  if (!stripe) return res.status(400).json({ error: 'Stripe not configured (missing STRIPE_SECRET_KEY)' });
  const tenantId = req.tenantId;
  const settings = await getSettingsForTenant(tenantId);
  const { mode = 'subscription', amount, plan, successUrl, cancelUrl } = req.body || {};
  const currentCurrency = String(settings?.subscription?.currency || 'GBP').toUpperCase();
  const currency = SUPPORTED_CURRENCIES.includes(currentCurrency) ? currentCurrency : 'GBP';
  const appBaseUrl = process.env.CLIENT_URL || process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const resolvedSuccess = String(successUrl || `${appBaseUrl}/#/app?billing=success`);
  const resolvedCancel = String(cancelUrl || `${appBaseUrl}/#/app?billing=cancelled`);

  if (mode === 'subscription') {
    const selectedPlan = String(plan || settings?.subscription?.plan || 'Growth');
    const priceId = STRIPE_PRICE_IDS[selectedPlan] || '';
    if (!priceId) {
      return res.status(400).json({ error: `Missing Stripe price for plan ${selectedPlan}. Set STRIPE_PRICE_${selectedPlan.toUpperCase()} env.` });
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: resolvedSuccess,
      cancel_url: resolvedCancel,
      metadata: { tenantId, plan: selectedPlan, mode: 'subscription' },
    });
    return res.json({ url: session.url, id: session.id });
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Valid top-up amount is required' });
  }
  const unitAmount = Math.round(numericAmount * 100);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: unitAmount,
          product_data: { name: `ConnectAI Wallet Top-up (${CURRENCY_SYMBOLS[currency] || ''}${numericAmount})` },
        },
      },
    ],
    success_url: resolvedSuccess,
    cancel_url: resolvedCancel,
    metadata: { tenantId, mode: 'topup', amount: String(numericAmount), currency },
  });
  return res.json({ url: session.url, id: session.id });
});

// --- TENANTS & USERS (Admin) ---
app.get('/api/tenants', authorize([UserRole.ADMIN]), async (req, res) => {
  if (isMongoReady()) {
    const tenants = await Tenant.find({}).lean();
    return res.json(tenants.map(toPublic));
  }
  res.json(stores.tenants || []);
});

app.post('/api/tenants', authorize([UserRole.ADMIN]), async (req, res) => {
  const payload = req.body || {};
  const externalId = payload.id || crypto.randomUUID();
  const tenant = { ...payload, externalId };
  if (isMongoReady()) {
    const created = await Tenant.create(tenant);
    return res.json(toPublic(created));
  }
  const stored = { id: externalId, ...payload };
  stores.tenants = stores.tenants || [];
  stores.tenants = upsertById(stores.tenants, stored);
  await saveStore('tenants', stores.tenants);
  res.json(stored);
});

app.put('/api/tenants/:id', authorize([UserRole.ADMIN]), async (req, res) => {
  const externalId = req.params.id;
  const payload = req.body || {};
  if (isMongoReady()) {
    const updated = await Tenant.findOneAndUpdate(
      { externalId },
      { ...payload, externalId },
      { upsert: true, new: true }
    );
    return res.json(toPublic(updated));
  }
  stores.tenants = stores.tenants || [];
  const stored = { id: externalId, ...payload };
  stores.tenants = upsertById(stores.tenants, stored);
  await saveStore('tenants', stores.tenants);
  res.json(stored);
});

app.get('/api/admin/users', authorize([UserRole.ADMIN]), async (req, res) => {
  const tenantId = req.query?.tenantId || req.tenantId;
  if (isMongoReady()) {
    const users = await User.find({ tenantId }).lean();
    return res.json(users.map(toPublic));
  }
  res.json(stores.users.filter(u => u.tenantId === tenantId));
});

app.post('/api/admin/users', authorize([UserRole.ADMIN]), async (req, res) => {
  const payload = req.body || {};
  const tenantId = payload.tenantId || req.tenantId;
  const externalId = payload.id || crypto.randomUUID();
  const user = { ...payload, tenantId, externalId };
  if (isMongoReady()) {
    const created = await User.create(user);
    return res.json(toPublic(created));
  }
  const stored = { id: externalId, ...payload, tenantId };
  stores.users = upsertById(stores.users, stored);
  await saveStore('users', stores.users);
  res.json(stored);
});

app.put('/api/admin/users/:id', authorize([UserRole.ADMIN]), async (req, res) => {
  const tenantId = req.body?.tenantId || req.tenantId;
  const externalId = req.params.id;
  const payload = req.body || {};
  if (isMongoReady()) {
    const updated = await User.findOneAndUpdate(
      { tenantId, externalId },
      { ...payload, tenantId, externalId },
      { upsert: true, new: true }
    );
    return res.json(toPublic(updated));
  }
  const stored = { id: externalId, ...payload, tenantId };
  stores.users = upsertById(stores.users, stored);
  await saveStore('users', stores.users);
  res.json(stored);
});

app.delete('/api/admin/users/:id', authorize([UserRole.ADMIN]), async (req, res) => {
  const tenantId = req.query?.tenantId || req.tenantId;
  const externalId = req.params.id;
  if (isMongoReady()) {
    await User.findOneAndDelete({ tenantId, externalId });
    return res.json({ ok: true });
  }
  stores.users = stores.users.filter(u => !(u.tenantId === tenantId && u.id === externalId));
  await saveStore('users', stores.users);
  res.json({ ok: true });
});

// --- TWILIO TOKEN (Client SDK) ---
app.get('/api/twilio/token', (req, res) => {
  const identity = (req.query?.identity || 'agent').toString();
  const accountSid = getTwilioAccountSid();
  const apiKey = getTwilioApiKey();
  const apiSecret = getTwilioApiSecret();
  const appSid = getTwilioTwimlAppSid();

  if (!accountSid || !apiKey || !apiSecret || !appSid) {
    const missing = [
      !accountSid ? 'TWILIO_ACCOUNT_SID' : null,
      !apiKey ? 'TWILIO_API_KEY' : null,
      !apiSecret ? 'TWILIO_API_SECRET' : null,
      !appSid ? 'TWILIO_TWIML_APP_SID' : null,
    ].filter(Boolean);
    return res.status(500).json({ error: 'Twilio client credentials missing', missing });
  }

  const accessToken = new AccessToken(accountSid, apiKey, apiSecret, { identity });
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: appSid,
    incomingAllow: true,
  });
  accessToken.addGrant(voiceGrant);
  res.json({ token: accessToken.toJwt(), identity });
});

app.post('/api/twilio/transfer', authenticate, authorize([UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.AGENT]), async (req, res) => {
  const client = getTwilioClient();
  if (!client) return res.status(500).json({ error: 'Twilio not configured' });
  const { callSid, targetIdentity, targetNumber, targetDepartment } = req.body || {};
  const resolvedCallSid = String(callSid || '').trim();
  let resolvedTargetIdentity = String(targetIdentity || '').trim();
  let resolvedTargetNumber = String(targetNumber || '').trim();
  const resolvedDepartment = String(targetDepartment || '').trim();

  if (!resolvedCallSid) return res.status(400).json({ error: 'callSid is required' });
  if (!resolvedTargetIdentity && !resolvedTargetNumber && resolvedDepartment) {
    const settings = await getSettingsForTenant(req.tenantId || DEFAULT_TENANT_ID);
    const resolved = resolveTransferTargetFromDepartment(settings, resolvedDepartment);
    if (resolved?.targetIdentity) resolvedTargetIdentity = resolved.targetIdentity;
    if (resolved?.targetNumber) resolvedTargetNumber = resolved.targetNumber;
  }
  if (!resolvedTargetIdentity && !resolvedTargetNumber) {
    return res.status(400).json({ error: 'targetIdentity, targetNumber, or targetDepartment is required' });
  }

  try {
    const twiml = buildTransferTwiml({
      targetIdentity: resolvedTargetIdentity || undefined,
      targetNumber: resolvedTargetNumber || undefined,
    });
    await client.calls(resolvedCallSid).update({ twiml });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'transfer failed' });
  }
});

// --- CAMPAIGNS ---
app.get('/api/campaigns', async (req, res) => {
  const tenantId = req.tenantId;
  if (isMongoReady()) {
    const items = await Campaign.find({ tenantId }).lean();
    return res.json(items.map(toPublic));
  }
  res.json(stores.campaigns.filter(c => c.tenantId === tenantId));
});

app.post('/api/campaigns', async (req, res) => {
  const tenantId = req.tenantId;
  const payload = req.body || {};
  const externalId = payload.id || crypto.randomUUID();
  const campaign = { ...payload, tenantId, externalId, updatedAt: Date.now() };
  if (isMongoReady()) {
    const created = await Campaign.create(campaign);
    await writeAuditLog(req, 'CAMPAIGN_CREATE', externalId, { name: created.name });
    return res.json(toPublic(created));
  }
  const stored = { id: externalId, ...payload, tenantId, updatedAt: Date.now() };
  stores.campaigns = upsertById(stores.campaigns, stored);
  await saveStore('campaigns', stores.campaigns);
  await writeAuditLog(req, 'CAMPAIGN_CREATE', externalId, { name: stored.name });
  res.json(stored);
});

app.put('/api/campaigns/:id', async (req, res) => {
  const tenantId = req.tenantId;
  const externalId = req.params.id;
  const campaign = { ...req.body, tenantId, externalId, updatedAt: Date.now() };
  if (isMongoReady()) {
    const updated = await Campaign.findOneAndUpdate(
      { tenantId, externalId },
      campaign,
      { upsert: true, new: true }
    );
    await writeAuditLog(req, 'CAMPAIGN_UPDATE', externalId, { name: updated?.name });
    return res.json(toPublic(updated));
  }
  const stored = { ...req.body, id: externalId, tenantId, updatedAt: Date.now() };
  stores.campaigns = upsertById(stores.campaigns, stored);
  await saveStore('campaigns', stores.campaigns);
  await writeAuditLog(req, 'CAMPAIGN_UPDATE', externalId, { name: stored.name });
  res.json(stored);
});

app.delete('/api/campaigns/:id', async (req, res) => {
  const tenantId = req.tenantId;
  const externalId = req.params.id;
  if (isMongoReady()) {
    await Campaign.findOneAndDelete({ tenantId, externalId });
    await writeAuditLog(req, 'CAMPAIGN_DELETE', externalId);
    return res.json({ ok: true });
  }
  stores.campaigns = removeById(stores.campaigns, externalId);
  await saveStore('campaigns', stores.campaigns);
  await writeAuditLog(req, 'CAMPAIGN_DELETE', externalId);
  res.json({ ok: true });
});

// --- DISPOSITIONS ---
app.get('/api/dispositions', async (req, res) => {
  const tenantId = req.tenantId;
  if (isMongoReady()) {
    const items = await Disposition.find({ tenantId }).lean();
    return res.json(items.map(toPublic));
  }
  res.json(stores.dispositions.filter(d => d.tenantId === tenantId));
});

app.post('/api/dispositions', async (req, res) => {
  const tenantId = req.tenantId;
  const payload = req.body || {};
  const externalId = payload.id || crypto.randomUUID();
  const disposition = { ...payload, tenantId, externalId, updatedAt: Date.now() };
  if (isMongoReady()) {
    const created = await Disposition.create(disposition);
    await writeAuditLog(req, 'DISPOSITION_CREATE', externalId, { label: created.label });
    return res.json(toPublic(created));
  }
  const stored = { id: externalId, ...payload, tenantId, updatedAt: Date.now() };
  stores.dispositions = upsertById(stores.dispositions, stored);
  await saveStore('dispositions', stores.dispositions);
  await writeAuditLog(req, 'DISPOSITION_CREATE', externalId, { label: stored.label });
  res.json(stored);
});

app.put('/api/dispositions/:id', async (req, res) => {
  const tenantId = req.tenantId;
  const externalId = req.params.id;
  const disposition = { ...req.body, tenantId, externalId, updatedAt: Date.now() };
  if (isMongoReady()) {
    const updated = await Disposition.findOneAndUpdate(
      { tenantId, externalId },
      disposition,
      { upsert: true, new: true }
    );
    await writeAuditLog(req, 'DISPOSITION_UPDATE', externalId, { label: updated?.label });
    return res.json(toPublic(updated));
  }
  const stored = { ...req.body, id: externalId, tenantId, updatedAt: Date.now() };
  stores.dispositions = upsertById(stores.dispositions, stored);
  await saveStore('dispositions', stores.dispositions);
  await writeAuditLog(req, 'DISPOSITION_UPDATE', externalId, { label: stored.label });
  res.json(stored);
});

app.delete('/api/dispositions/:id', async (req, res) => {
  const tenantId = req.tenantId;
  const externalId = req.params.id;
  if (isMongoReady()) {
    await Disposition.findOneAndDelete({ tenantId, externalId });
    await writeAuditLog(req, 'DISPOSITION_DELETE', externalId);
    return res.json({ ok: true });
  }
  stores.dispositions = removeById(stores.dispositions, externalId);
  await saveStore('dispositions', stores.dispositions);
  await writeAuditLog(req, 'DISPOSITION_DELETE', externalId);
  res.json({ ok: true });
});

// --- CALLS ---
app.get('/api/calls', authenticate, async (req, res) => {
    const tenantId = req.tenantId;
    const { status, direction, agentId, startDate, endDate, limit = 100 } = req.query || {};
    const filter = { tenantId };
    const allowRecordings = await canAccessRecordings(req);
    const decorateCall = (call) => {
      const base = isMongoReady() ? toPublic(call) : { ...call };
      if (!allowRecordings) {
        delete base.recordingUrl;
        delete base.recordingId;
        return base;
      }
      const recordingId = base.recordingId || extractRecordingIdFromUrl(base.recordingUrl);
      if (recordingId) base.recordingId = recordingId;
      return base;
    };
    if (status) filter.status = status;
    if (direction) filter.direction = direction;
    if (agentId) filter.agentId = agentId;
    if (startDate || endDate) {
      filter.startTime = {};
    if (startDate) filter.startTime.$gte = Number(startDate);
    if (endDate) filter.startTime.$lte = Number(endDate);
  }
    if (isMongoReady()) {
      const items = await Call.find(filter)
        .sort({ startTime: -1 })
        .limit(Math.min(Number(limit) || 100, 500))
        .lean();
      return res.json(items.map(decorateCall));
    }
    const items = (stores.calls || [])
      .filter(c => c.tenantId === tenantId)
      .filter(c => (status ? c.status === status : true))
    .filter(c => (direction ? c.direction === direction : true))
      .filter(c => (agentId ? c.agentId === agentId : true))
      .filter(c => (startDate ? c.startTime >= Number(startDate) : true))
      .filter(c => (endDate ? c.startTime <= Number(endDate) : true))
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, Math.min(Number(limit) || 100, 500));
    res.json(items.map(decorateCall));
  });

app.get('/api/calls/:id', authenticate, async (req, res) => {
  const tenantId = req.tenantId;
  const externalId = req.params.id;
  const allowRecordings = await canAccessRecordings(req);
  const decorateCall = (call) => {
    if (!call) return call;
    const base = isMongoReady() ? toPublic(call) : { ...call };
    if (!allowRecordings) {
      delete base.recordingUrl;
      delete base.recordingId;
      return base;
    }
    const recordingId = base.recordingId || extractRecordingIdFromUrl(base.recordingUrl);
    if (recordingId) base.recordingId = recordingId;
    return base;
  };
  if (isMongoReady()) {
    const item = await Call.findOne({ tenantId, externalId }).lean();
    if (!item) return res.status(404).json({ error: 'not found' });
    return res.json(decorateCall(item));
  }
  const item = (stores.calls || []).find(c => c.tenantId === tenantId && c.id === externalId);
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(decorateCall(item));
});

app.post('/api/calls', authenticate, async (req, res) => {
  const tenantId = req.tenantId;
  const payload = req.body || {};
  const externalId = payload.id || crypto.randomUUID();
  const call = {
    ...payload,
    tenantId,
    externalId,
    startTime: payload.startTime || Date.now(),
    status: payload.status || 'DIALING',
  };
  if (isMongoReady()) {
    const created = await Call.create(call);
    await writeAuditLog(req, 'CALL_CREATE', externalId, { status: call.status });
    return res.json(toPublic(created));
  }
  stores.calls = stores.calls || [];
  const stored = { id: externalId, ...call };
  stores.calls = upsertById(stores.calls, stored);
  await saveStore('calls', stores.calls);
  res.json(stored);
});

app.put('/api/calls/:id', authenticate, async (req, res) => {
  const tenantId = req.tenantId;
  const externalId = req.params.id;
  const payload = req.body || {};
  if (isMongoReady()) {
    const existing = await Call.findOne({ tenantId, externalId });
    if (existing && payload.status && !isValidCallTransition(existing.status, payload.status)) {
      return res.status(400).json({ error: `Invalid status transition ${existing.status} -> ${payload.status}` });
    }
    const updated = await Call.findOneAndUpdate(
      { tenantId, externalId },
      { ...payload, tenantId, externalId },
      { upsert: true, new: true }
    );
    if (payload.status) {
      await writeAuditLog(req, 'CALL_STATUS_UPDATE', externalId, { from: existing?.status, to: payload.status });
    }
    if (payload.status === 'ENDED') {
      await enqueueJob(tenantId, 'transcription', { callId: externalId });
      await enqueueJob(tenantId, 'summary', { callId: externalId });
      await enqueueJob(tenantId, 'report', { callId: externalId });
      await ensureRecordingForCall(req, updated);
    }
    return res.json(toPublic(updated));
  }
  stores.calls = stores.calls || [];
  const existing = stores.calls.find(c => c.id === externalId && c.tenantId === tenantId);
  if (existing && payload.status && !isValidCallTransition(existing.status, payload.status)) {
    return res.status(400).json({ error: `Invalid status transition ${existing.status} -> ${payload.status}` });
  }
  const stored = { ...(existing || {}), ...payload, id: externalId, tenantId };
  stores.calls = upsertById(stores.calls, stored);
  await saveStore('calls', stores.calls);
  if (payload.status === 'ENDED') {
    await enqueueJob(tenantId, 'transcription', { callId: externalId });
    await enqueueJob(tenantId, 'summary', { callId: externalId });
    await enqueueJob(tenantId, 'report', { callId: externalId });
    await ensureRecordingForCall(req, stored);
  }
  res.json(stored);
});

// --- JOBS ---
app.get('/api/jobs', authorize([UserRole.ADMIN, UserRole.SUPERVISOR]), async (req, res) => {
  const tenantId = req.tenantId;
  if (isMongoReady()) {
    const jobs = await Job.find({ tenantId }).sort({ createdAt: -1 }).limit(200).lean();
    return res.json(jobs.map(toPublic));
  }
  res.json(stores.jobs.filter(j => j.tenantId === tenantId));
});

app.post('/api/jobs', authorize([UserRole.ADMIN, UserRole.SUPERVISOR]), async (req, res) => {
  const tenantId = req.tenantId;
  const { type, payload } = req.body || {};
  if (!type) return res.status(400).json({ error: 'type required' });
  const job = await enqueueJob(tenantId, type, payload || {});
  res.json(job);
});

// --- RECORDINGS ---
app.get('/api/recordings', async (req, res) => {
    const tenantId = req.tenantId;
    if (!(await canAccessRecordings(req))) {
      return res.status(403).json({ error: 'forbidden' });
    }
    if (isMongoReady()) {
      const items = await Recording.find({ tenantId }).lean();
      return res.json(items.map(toPublic));
    }
    res.json(stores.recordings.filter(r => r.tenantId === tenantId));
  });

app.post('/api/recordings', async (req, res) => {
  const tenantId = req.tenantId;
  const payload = req.body || {};
  const externalId = payload.id || crypto.randomUUID();
  const recording = { ...payload, tenantId, externalId, createdAt: Date.now() };
  if (isMongoReady()) {
    const created = await Recording.create(recording);
    await writeAuditLog(req, 'RECORDING_CREATE', externalId, { callId: created.callId });
    return res.json(toPublic(created));
  }
  const stored = { id: externalId, ...payload, tenantId, createdAt: Date.now() };
  stores.recordings = upsertById(stores.recordings, stored);
  await saveStore('recordings', stores.recordings);
  await writeAuditLog(req, 'RECORDING_CREATE', externalId, { callId: stored.callId });
  res.json(stored);
});

app.put('/api/recordings/:id', async (req, res) => {
  const tenantId = req.tenantId;
  const externalId = req.params.id;
  const recording = { ...req.body, tenantId, externalId, updatedAt: Date.now() };
  if (isMongoReady()) {
    const updated = await Recording.findOneAndUpdate(
      { tenantId, externalId },
      recording,
      { upsert: true, new: true }
    );
    await writeAuditLog(req, 'RECORDING_UPDATE', externalId);
    return res.json(toPublic(updated));
  }
  const stored = { ...req.body, id: externalId, tenantId, updatedAt: Date.now() };
  stores.recordings = upsertById(stores.recordings, stored);
  await saveStore('recordings', stores.recordings);
  await writeAuditLog(req, 'RECORDING_UPDATE', externalId);
  res.json(stored);
});

app.post('/api/recordings/upload', async (req, res) => {
    const tenantId = req.tenantId;
    const { base64, mimeType = 'audio/wav', filename, callId } = req.body || {};
    if (!base64) return res.status(400).json({ error: 'base64 required' });
    const externalId = crypto.randomUUID();
    const ext = (filename && filename.includes('.')) ? filename.split('.').pop() : 'wav';
    const buffer = Buffer.from(base64, 'base64');
    const retentionDays = Number(process.env.RECORDING_RETENTION_DAYS || 30);
    const expiresAt = Date.now() + retentionDays * 24 * 60 * 60 * 1000;
    const useStorage = await isStorageEnabled();
    let storageProvider = 'local';
    let storagePath = '';
    if (useStorage) {
      const objectPath = `recordings/${externalId}.${ext}`;
      const stored = await uploadRecordingBuffer(objectPath, buffer, mimeType);
      storageProvider = stored?.storageProvider || 'gcs';
      storagePath = stored?.storagePath || objectPath;
    } else {
      await ensureRecordingsDir();
      const filePath = path.join(recordingsDir, `${externalId}.${ext}`);
      await fs.writeFile(filePath, buffer);
      storagePath = filePath;
    }
    const recording = {
      tenantId,
      externalId,
      callId: callId || null,
      mimeType,
      filename: filename || `${externalId}.${ext}`,
      size: buffer.length,
      storagePath,
      storageProvider,
      createdAt: Date.now(),
      expiresAt,
    };
  if (isMongoReady()) {
    const created = await Recording.create(recording);
    await writeAuditLog(req, 'RECORDING_UPLOAD', externalId, { callId });
    return res.json(toPublic(created));
  }
  const stored = { id: externalId, ...recording };
  stores.recordings = upsertById(stores.recordings, stored);
  await saveStore('recordings', stores.recordings);
  await writeAuditLog(req, 'RECORDING_UPLOAD', externalId, { callId });
  res.json(stored);
});

app.post('/api/recordings/:id/signed-url', async (req, res) => {
    const tenantId = req.tenantId;
    if (!(await canAccessRecordings(req))) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const { ttlSeconds = 3600 } = req.body || {};
    const externalId = req.params.id;
  const rec = isMongoReady()
    ? await Recording.findOne({ tenantId, externalId }).lean()
    : stores.recordings.find(r => r.tenantId === tenantId && r.id === externalId);
  if (!rec) return res.status(404).json({ error: 'recording not found' });
  const expires = Date.now() + Number(ttlSeconds) * 1000;
  const payload = `${tenantId}:${externalId}:${expires}`;
  const sig = signToken(payload);
  const url = `/api/recordings/download?token=${tenantId}.${externalId}.${expires}.${sig}`;
  res.json({ url, expiresAt: expires });
});

app.get('/api/recordings/download', async (req, res) => {
    const token = req.query?.token || '';
    const format = String(req.query?.format || '').toLowerCase();
    const download = String(req.query?.download || '') === '1';
    const [tenantId, externalId, expires, sig] = String(token).split('.');
    if (!tenantId || !externalId || !expires || !sig) return res.status(400).send('invalid token');
    const expected = signToken(`${tenantId}:${externalId}:${expires}`);
    if (expected !== sig) return res.status(403).send('invalid signature');
    if (Date.now() > Number(expires)) return res.status(403).send('token expired');
  const rec = isMongoReady()
    ? await Recording.findOne({ tenantId, externalId }).lean()
    : stores.recordings.find(r => r.tenantId === tenantId && r.id === externalId);
    if (!rec) return res.status(404).send('not found');
    try {
      let data = null;
      if (rec.storageProvider === 'gcs') {
        data = await downloadRecordingBuffer(rec.storagePath);
      } else {
        data = await fs.readFile(rec.storagePath || rec.filePath);
      }
      if (!data) return res.status(404).send('file missing');
      const detectedMime = detectAudioMimeFromBuffer(data);
      const requestedMp3 = format === 'mp3';
      const resolvedMime = requestedMp3 && detectedMime === 'audio/mpeg' ? 'audio/mpeg' : (detectedMime !== 'application/octet-stream' ? detectedMime : (rec.mimeType || 'audio/wav'));
      const extension = resolvedMime === 'audio/mpeg' ? 'mp3' : 'wav';
      const filename = rec.filename || `${externalId}.${extension}`;
      res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename=\"${filename}\"`);
      res.setHeader('X-Recording-Detected-Mime', resolvedMime);
      if (requestedMp3 && resolvedMime !== 'audio/mpeg') {
        res.setHeader('X-Recording-Format-Warning', 'Requested mp3 but stored file is not mp3; returning original audio stream.');
      }
      res.setHeader('Content-Type', resolvedMime);
      res.setHeader('Content-Length', data.length);
      res.send(data);
    } catch {
      res.status(404).send('file missing');
    }
  });

// --- CALENDAR ---
app.get('/api/calendar/events', (req, res) => {
  const tenantId = req.tenantId;
  res.json(stores.calendarEvents.filter(e => e.tenantId === tenantId));
});

app.get('/api/oauth/google/start', (req, res) => {
  if (!GOOGLE_OAUTH.clientId || !GOOGLE_OAUTH.redirectUri) {
    return res.status(500).json({ error: 'Google OAuth not configured' });
  }
  const state = createState();
  oauthStates.set(state, { provider: 'google', tenantId: req.tenantId, createdAt: now() });
  const params = new URLSearchParams({
    client_id: GOOGLE_OAUTH.clientId,
    redirect_uri: GOOGLE_OAUTH.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_OAUTH.scopes.join(' '),
    state,
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

app.get('/api/oauth/google/callback', async (req, res) => {
  const { code, state } = req.query || {};
  const st = oauthStates.get(state);
  if (!st) return res.status(400).send('invalid state');
  oauthStates.delete(state);
  if (!code) return res.status(400).send('missing code');
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_OAUTH.clientId,
        client_secret: GOOGLE_OAUTH.clientSecret,
        code: String(code),
        redirect_uri: GOOGLE_OAUTH.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const token = await tokenRes.json();
    const tenantId = st?.tenantId || DEFAULT_TENANT_ID;
    const store = getIntegrationsStore(tenantId);
    store.data.calendar.google = { token, updatedAt: now() };
    await saveIntegrationsStore();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(buildOauthCompletionHtml('Google', true));
  } catch {
    res.status(500).send(buildOauthCompletionHtml('Google', false, 'Google OAuth failed'));
  }
});

app.get('/api/twilio/capabilities', authenticate, authorize([UserRole.ADMIN, UserRole.SUPERVISOR]), (req, res) => {
  const hasAccount = Boolean(getTwilioAccountSid() && getTwilioAuthToken());
  const hasClientVoice = Boolean(getTwilioApiKey() && getTwilioApiSecret() && getTwilioTwimlAppSid());
  const configured = hasAccount && hasClientVoice;
  const monitoringEnabled = String(process.env.TWILIO_MONITORING_ENABLED || '').toLowerCase() === 'true';
  const missing = [];
  if (!getTwilioAccountSid()) missing.push('TWILIO_ACCOUNT_SID');
  if (!getTwilioAuthToken()) missing.push('TWILIO_AUTH_TOKEN');
  if (!getTwilioApiKey()) missing.push('TWILIO_API_KEY');
  if (!getTwilioApiSecret()) missing.push('TWILIO_API_SECRET');
  if (!getTwilioTwimlAppSid()) missing.push('TWILIO_TWIML_APP_SID');
  if (!monitoringEnabled) missing.push('TWILIO_MONITORING_ENABLED=true');
  return res.json({
    configured,
    monitoringEnabled,
    canMonitor: hasAccount && monitoringEnabled,
    missing,
  });
});

app.get('/api/oauth/microsoft/start', (req, res) => {
  if (!MS_OAUTH.clientId || !MS_OAUTH.redirectUri) {
    return res.status(500).json({ error: 'Microsoft OAuth not configured' });
  }
  const state = createState();
  oauthStates.set(state, { provider: 'microsoft', tenantId: req.tenantId, createdAt: now() });
  const params = new URLSearchParams({
    client_id: MS_OAUTH.clientId,
    response_type: 'code',
    redirect_uri: MS_OAUTH.redirectUri,
    response_mode: 'query',
    scope: MS_OAUTH.scopes.join(' '),
    state,
  });
  res.json({ url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}` });
});

app.get('/api/oauth/microsoft/callback', async (req, res) => {
  const { code, state } = req.query || {};
  const st = oauthStates.get(state);
  if (!st) return res.status(400).send('invalid state');
  oauthStates.delete(state);
  if (!code) return res.status(400).send('missing code');
  try {
    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MS_OAUTH.clientId,
        client_secret: MS_OAUTH.clientSecret,
        code: String(code),
        redirect_uri: MS_OAUTH.redirectUri,
        grant_type: 'authorization_code',
        scope: MS_OAUTH.scopes.join(' '),
      }),
    });
    const token = await tokenRes.json();
    const tenantId = st?.tenantId || DEFAULT_TENANT_ID;
    const store = getIntegrationsStore(tenantId);
    store.data.calendar.microsoft = { token, updatedAt: now() };
    await saveIntegrationsStore();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(buildOauthCompletionHtml('Microsoft', true));
  } catch {
    res.status(500).send(buildOauthCompletionHtml('Microsoft', false, 'Microsoft OAuth failed'));
  }
});

app.get('/api/oauth/hubspot/start', authenticate, authorize([UserRole.ADMIN, UserRole.SUPERVISOR]), (req, res) => {
  if (!HUBSPOT_OAUTH.clientId || !HUBSPOT_OAUTH.redirectUri) {
    return res.status(500).json({ error: 'HubSpot OAuth not configured' });
  }
  const state = createState();
  oauthStates.set(state, { provider: 'hubspot', tenantId: req.tenantId, createdAt: now() });
  const params = new URLSearchParams({
    client_id: HUBSPOT_OAUTH.clientId,
    redirect_uri: HUBSPOT_OAUTH.redirectUri,
    scope: HUBSPOT_OAUTH.scopes.join(' '),
    state,
  });
  res.json({ url: `https://app.hubspot.com/oauth/authorize?${params.toString()}` });
});

app.get('/api/oauth/hubspot/readiness', authenticate, authorize([UserRole.ADMIN, UserRole.SUPERVISOR]), (req, res) => {
  const missing = [];
  if (!HUBSPOT_OAUTH.clientId) missing.push('HUBSPOT_CLIENT_ID');
  if (!HUBSPOT_OAUTH.clientSecret) missing.push('HUBSPOT_CLIENT_SECRET');
  if (!HUBSPOT_OAUTH.redirectUri) missing.push('HUBSPOT_OAUTH_REDIRECT_URI');
  res.json({
    configured: missing.length === 0,
    missing,
    redirectUri: HUBSPOT_OAUTH.redirectUri || '',
  });
});

app.get('/api/oauth/hubspot/callback', async (req, res) => {
  const { code, state } = req.query || {};
  const st = oauthStates.get(state);
  if (!st || st.provider !== 'hubspot') return res.status(400).send(buildOauthCompletionHtml('HubSpot', false, 'Invalid OAuth state'));
  oauthStates.delete(state);
  if (!code) return res.status(400).send(buildOauthCompletionHtml('HubSpot', false, 'Missing authorization code'));
  if (!HUBSPOT_OAUTH.clientId || !HUBSPOT_OAUTH.clientSecret || !HUBSPOT_OAUTH.redirectUri) {
    return res.status(500).send(buildOauthCompletionHtml('HubSpot', false, 'HubSpot OAuth env is incomplete'));
  }
  try {
    const tokenRes = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: HUBSPOT_OAUTH.clientId,
        client_secret: HUBSPOT_OAUTH.clientSecret,
        redirect_uri: HUBSPOT_OAUTH.redirectUri,
        code: String(code),
      }),
    });
    const token = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(token?.message || `HubSpot OAuth failed (${tokenRes.status})`);
    const tenantId = st?.tenantId || DEFAULT_TENANT_ID;
    await saveHubSpotTokenForTenant(tenantId, token);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(buildOauthCompletionHtml('HubSpot', true));
  } catch (err) {
    res.status(500).send(buildOauthCompletionHtml('HubSpot', false, err?.message || 'HubSpot OAuth failed'));
  }
});

app.post('/api/calendar/events', async (req, res) => {
  const tenantId = req.tenantId;
  const payload = req.body || {};
  const event = { id: payload.id || crypto.randomUUID(), tenantId, ...payload, updatedAt: Date.now() };
  stores.calendarEvents = upsertById(stores.calendarEvents, event);
  await saveStore('calendarEvents', stores.calendarEvents);
  res.json(event);
});

app.put('/api/calendar/events/:id', async (req, res) => {
  const tenantId = req.tenantId;
  const event = { ...req.body, id: req.params.id, tenantId, updatedAt: Date.now() };
  stores.calendarEvents = upsertById(stores.calendarEvents, event);
  await saveStore('calendarEvents', stores.calendarEvents);
  res.json(event);
});

app.delete('/api/calendar/events/:id', async (req, res) => {
  const tenantId = req.tenantId;
  stores.calendarEvents = stores.calendarEvents.filter(e => !(e.id === req.params.id && e.tenantId === tenantId));
  await saveStore('calendarEvents', stores.calendarEvents);
  res.json({ ok: true });
});

app.post('/api/calendar/sync', async (req, res) => {
  const { provider, accountId, status = 'connected' } = req.body || {};
  const store = getIntegrationsStore(req.tenantId);
  store.data.calendar[accountId || provider || 'default'] = { provider, status, updatedAt: Date.now() };
  await saveIntegrationsStore();
  res.json({ ok: true });
});

app.post('/api/calendar/webhook', (req, res) => {
  res.json({ ok: true });
});

// --- CRM ---
app.get('/api/crm/contacts', (req, res) => {
  const tenantId = req.tenantId;
  const { phone } = req.query || {};
  if (phone) {
    const hit = stores.crmContacts.find(c => c.tenantId === tenantId && c.phone === phone);
    res.json({ contact: hit || null });
    return;
  }
  res.json(stores.crmContacts.filter(c => c.tenantId === tenantId));
});

app.post('/api/crm/contacts', async (req, res) => {
  const tenantId = req.tenantId;
  const payload = req.body || {};
  const contact = { id: payload.id || crypto.randomUUID(), tenantId, ...payload, updatedAt: Date.now() };
  stores.crmContacts = upsertById(stores.crmContacts, contact);
  await saveStore('crmContacts', stores.crmContacts);
  res.json(contact);
});

app.get('/api/crm/tasks', (req, res) => {
  const tenantId = req.tenantId;
  res.json(stores.crmTasks.filter(t => t.tenantId === tenantId));
});

app.get('/api/crm/deals', (req, res) => {
  const tenantId = req.tenantId;
  res.json((stores.crmDeals || []).filter((d) => d.tenantId === tenantId));
});

app.post('/api/crm/tasks', async (req, res) => {
  const tenantId = req.tenantId;
  const payload = req.body || {};
  const task = { id: payload.id || crypto.randomUUID(), tenantId, ...payload, updatedAt: Date.now() };
  stores.crmTasks = upsertById(stores.crmTasks, task);
  await saveStore('crmTasks', stores.crmTasks);
  res.json(task);
});

app.post('/api/crm/sync', async (req, res) => {
  const { platform, status = 'queued' } = req.body || {};
  const store = getIntegrationsStore(req.tenantId);
  store.data.crm[platform || 'default'] = { platform, status, updatedAt: Date.now() };
  await saveIntegrationsStore();
  res.json({ ok: true });
});

app.post('/api/crm/webhook', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/crm/hubspot/status', authenticate, authorize([UserRole.ADMIN, UserRole.SUPERVISOR]), (req, res) => {
  const { hubspot } = getHubSpotIntegration(req.tenantId);
  const oauth = hubspot?.oauth || {};
  const expiresAt = Number(oauth.expiresAt || 0);
  const isConnected = Boolean(oauth.accessToken || oauth.refreshToken);
  res.json({
    connected: isConnected,
    status: hubspot?.status || (isConnected ? 'connected' : 'disconnected'),
    expiresAt: expiresAt || null,
    expired: expiresAt ? expiresAt <= Date.now() : false,
    lastSyncAt: hubspot?.lastSyncAt || null,
    counts: hubspot?.counts || { contacts: 0, deals: 0 },
    syncHistory: Array.isArray(hubspot?.syncHistory) ? hubspot.syncHistory : [],
  });
});

app.post('/api/crm/:provider/connect', async (req, res) => {
  const { provider } = req.params;
  const credentials = req.body || {};
  const store = getIntegrationsStore(req.tenantId);
  if (provider === 'hubspot') {
    const existing = store.data.crm?.hubspot || {};
    const connected = Boolean(existing?.oauth?.accessToken || existing?.oauth?.refreshToken);
    store.data.crm.hubspot = {
      ...existing,
      status: connected ? 'connected' : 'requires_oauth',
      connectedAt: existing.connectedAt || null,
      updatedAt: Date.now(),
    };
    await saveIntegrationsStore();
    return res.json({
      ok: connected,
      requiresOAuth: !connected,
      message: connected ? 'HubSpot already connected via OAuth' : 'Use /api/oauth/hubspot/start to connect',
    });
  }
  store.data.crm[provider] = { provider, credentials, status: 'connected', updatedAt: Date.now() };
  await saveIntegrationsStore();
  res.json({ ok: true });
});

app.post('/api/crm/:provider/sync', async (req, res) => {
  const { provider } = req.params;
  const store = getIntegrationsStore(req.tenantId);
  if (provider === 'hubspot') {
    const startedAt = Date.now();
    try {
      store.data.crm.hubspot = { ...(store.data.crm.hubspot || {}), status: 'syncing', updatedAt: Date.now() };
      await saveIntegrationsStore();
      const accessToken = await refreshHubSpotAccessTokenIfNeeded(req.tenantId);
      const [hubspotContacts, hubspotDeals] = await Promise.all([
        fetchHubSpotObjects(accessToken, 'contacts', ['firstname', 'lastname', 'email', 'phone', 'company', 'jobtitle', 'createdate', 'lastmodifieddate']),
        fetchHubSpotObjects(accessToken, 'deals', ['dealname', 'dealstage', 'pipeline', 'amount', 'closedate', 'createdate', 'hs_lastmodifieddate']),
      ]);

      const nowTs = Date.now();
      const contactRecords = hubspotContacts.map((c) => {
        const p = c?.properties || {};
        const first = String(p.firstname || '').trim();
        const last = String(p.lastname || '').trim();
        const displayName = `${first} ${last}`.trim() || p.email || p.phone || `Contact ${c.id}`;
        return {
          id: `hubspot_contact_${req.tenantId}_${c.id}`,
          tenantId: req.tenantId,
          platform: 'HubSpot',
          externalId: c.id,
          name: displayName,
          phone: p.phone || '',
          email: p.email || '',
          company: p.company || '',
          title: p.jobtitle || '',
          raw: c,
          updatedAt: nowTs,
        };
      });

      const dealRecords = hubspotDeals.map((d) => {
        const p = d?.properties || {};
        return {
          id: `hubspot_deal_${req.tenantId}_${d.id}`,
          tenantId: req.tenantId,
          platform: 'HubSpot',
          externalId: d.id,
          name: p.dealname || `Deal ${d.id}`,
          amount: p.amount || '',
          stage: p.dealstage || '',
          pipeline: p.pipeline || '',
          closeDate: p.closedate || '',
          raw: d,
          updatedAt: nowTs,
        };
      });

      const existingContacts = stores.crmContacts.filter((c) => !(c.tenantId === req.tenantId && c.platform === 'HubSpot'));
      stores.crmContacts = [...existingContacts, ...contactRecords];
      await saveStore('crmContacts', stores.crmContacts);

      const existingDeals = (stores.crmDeals || []).filter((d) => !(d.tenantId === req.tenantId && d.platform === 'HubSpot'));
      stores.crmDeals = [...existingDeals, ...dealRecords];
      await saveStore('crmDeals', stores.crmDeals);

      store.data.crm.hubspot = {
        ...(store.data.crm.hubspot || {}),
        status: 'connected',
        lastSyncAt: nowTs,
        counts: { contacts: contactRecords.length, deals: dealRecords.length },
        syncHistory: appendHubSpotSyncHistory((store.data.crm.hubspot || {}), {
          startedAt,
          finishedAt: nowTs,
          status: 'success',
          contacts: contactRecords.length,
          deals: dealRecords.length,
          error: '',
        }),
        updatedAt: nowTs,
      };
      await saveIntegrationsStore();
      return res.json({ ok: true, contacts: contactRecords.length, deals: dealRecords.length });
    } catch (err) {
      store.data.crm.hubspot = {
        ...(store.data.crm.hubspot || {}),
        status: 'error',
        error: err?.message || 'sync failed',
        syncHistory: appendHubSpotSyncHistory((store.data.crm.hubspot || {}), {
          startedAt,
          finishedAt: Date.now(),
          status: 'error',
          contacts: 0,
          deals: 0,
          error: err?.message || 'sync failed',
        }),
        updatedAt: Date.now(),
      };
      await saveIntegrationsStore();
      return res.status(500).json({ error: err?.message || 'HubSpot sync failed' });
    }
  }
  store.data.crm[provider] = { ...(store.data.crm[provider] || {}), status: 'syncing', updatedAt: Date.now() };
  await saveIntegrationsStore();
  res.json({ ok: true });
});

// --- MARKETING ---
app.get('/api/marketing/campaigns', (req, res) => {
  const tenantId = req.tenantId;
  res.json(stores.marketingCampaigns.filter(c => c.tenantId === tenantId));
});

app.post('/api/marketing/campaigns', async (req, res) => {
  const tenantId = req.tenantId;
  const payload = req.body || {};
  const campaign = { id: payload.id || crypto.randomUUID(), tenantId, ...payload, updatedAt: Date.now() };
  stores.marketingCampaigns = upsertById(stores.marketingCampaigns, campaign);
  await saveStore('marketingCampaigns', stores.marketingCampaigns);
  if (campaign.status === 'running') {
    await enqueueJob(tenantId, 'campaign_send', { campaignId: campaign.id });
  }
  res.json(campaign);
});

app.put('/api/marketing/campaigns/:id', async (req, res) => {
  const tenantId = req.tenantId;
  const existing = stores.marketingCampaigns.find(c => c.id === req.params.id && c.tenantId === tenantId);
  const campaign = { ...req.body, id: req.params.id, tenantId, updatedAt: Date.now() };
  stores.marketingCampaigns = upsertById(stores.marketingCampaigns, campaign);
  await saveStore('marketingCampaigns', stores.marketingCampaigns);
  if (campaign.status === 'running' && existing?.status !== 'running') {
    await enqueueJob(tenantId, 'campaign_send', { campaignId: campaign.id });
  }
  res.json(campaign);
});

app.delete('/api/marketing/campaigns/:id', async (req, res) => {
  const tenantId = req.tenantId;
  stores.marketingCampaigns = stores.marketingCampaigns.filter(c => !(c.id === req.params.id && c.tenantId === tenantId));
  await saveStore('marketingCampaigns', stores.marketingCampaigns);
  res.json({ ok: true });
});

app.post('/api/marketing/:provider/connect', async (req, res) => {
  const { provider } = req.params;
  const credentials = req.body || {};
  const store = getIntegrationsStore(req.tenantId);
  store.data.marketing[provider] = { provider, credentials, status: 'connected', updatedAt: Date.now() };
  await saveIntegrationsStore();
  res.json({ ok: true });
});

app.post('/api/marketing/:provider/sync', async (req, res) => {
  const { provider } = req.params;
  const store = getIntegrationsStore(req.tenantId);
  store.data.marketing[provider] = { ...(store.data.marketing[provider] || {}), status: 'syncing', updatedAt: Date.now() };
  await saveIntegrationsStore();
  res.json({ ok: true });
});

// --- TERMII (WhatsApp / Messaging) ---
app.post('/api/termii/whatsapp/send', authenticate, authorize([UserRole.ADMIN, UserRole.SUPERVISOR]), async (req, res) => {
  try {
    const { to, message, channel } = req.body || {};
    if (!to || !message) return res.status(400).json({ error: 'to and message required' });
    const result = await sendWhatsAppMessage({ to, message, channel });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Termii send failed' });
  }
});

app.post('/api/termii/webhook', async (req, res) => {
  try {
    const payload = req.body || {};
    const from = String(payload.from || payload.phone_number || payload.sender || payload.msisdn || '').trim();
    const to = String(payload.to || payload.recipient || '').trim();
    const text = String(payload.sms || payload.message || payload.text || '').trim();
    const channel = String(payload.channel || 'whatsapp').toLowerCase();
    if (!from || !text) {
      return res.status(400).json({ error: 'invalid payload' });
    }

    const db = await getFirestore();
    if (!db) {
      return res.status(500).json({ error: 'firebase admin not configured' });
    }

    const settingsSnap = await db.collection('settings').doc('global_config').get();
    const settings = settingsSnap.exists ? settingsSnap.data() : null;
    const team = Array.isArray(settings?.team) ? settings.team : [];
    const participantIds = team.map((t) => t.id).filter(Boolean);
    if (participantIds.length === 0) {
      participantIds.push('u_admin');
    }

    const conversationId = `termii_${from.replace(/\W/g, '')}`;
    const now = Date.now();
    const jurisdiction = String(settings?.compliance?.jurisdiction || 'NG').toUpperCase();
    const consentText = jurisdiction === 'EU' || jurisdiction === 'UK'
      ? 'By continuing this conversation, you consent to processing of your data in line with GDPR. Reply STOP to opt out.'
      : jurisdiction === 'US'
        ? 'By continuing this conversation, you consent to processing of your data in line with applicable US privacy regulations. Reply STOP to opt out.'
        : 'By continuing this conversation, you consent to processing of your data in line with Nigeria\'s Data Protection Act (NDPA). Reply STOP to opt out.';
    const convRef = db.collection('conversations').doc(conversationId);
    const existingSnap = await convRef.get();
    const existing = existingSnap.exists ? existingSnap.data() : null;
    const consentStatus = existing?.consentStatus || 'requested';
    const conversation = {
      id: conversationId,
      contactName: `${channel.toUpperCase()} • ${from}`,
      contactPhone: from,
      channel,
      lastMessage: text,
      lastMessageTime: now,
      unreadCount: 1,
      status: 'open',
      participantIds,
      consentStatus,
      consentChannel: 'whatsapp',
      consentRequestedAt: existing?.consentRequestedAt || now,
    };

    await convRef.set(conversation, { merge: true });
    await db.collection('messages').add({
      conversationId,
      id: `m_${now}`,
      channel,
      sender: 'customer',
      text,
      timestamp: now,
      to,
      from,
      source: 'termii',
    });

    if (!existing?.consentStatus) {
      await db.collection('messages').add({
        conversationId,
        id: `m_consent_${now}`,
        channel,
        sender: 'ai',
        text: consentText,
        timestamp: now + 1,
        source: 'consent',
      });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'webhook failed' });
  }
});

// --- REPORTS ---
app.get('/api/reports/summary', async (req, res) => {
  const tenantId = req.tenantId;
  if (isMongoReady()) {
    const [totalCalls, totalCampaigns, totalRecordings] = await Promise.all([
      Call.countDocuments({ tenantId }),
      Campaign.countDocuments({ tenantId }),
      Recording.countDocuments({ tenantId }),
    ]);
    return res.json({ totalCalls, totalCampaigns, totalRecordings, generatedAt: Date.now() });
  }
  const totalCalls = stores.calls.filter(c => c.tenantId === tenantId).length;
  const totalCampaigns = stores.campaigns.filter(c => c.tenantId === tenantId).length;
  const totalRecordings = stores.recordings.filter(r => r.tenantId === tenantId).length;
  res.json({ totalCalls, totalCampaigns, totalRecordings, generatedAt: Date.now() });
});

// --- EXPORTS ---
app.get('/api/export', authenticate, authorize([UserRole.ADMIN]), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const bundle = await buildExportBundle(tenantId);
    res.json(bundle);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'export failed' });
  }
});

app.get('/api/integrations/status', (req, res) => {
  const tenantId = req.tenantId;
  const store = getIntegrationsStore(tenantId);
  res.json(store.data);
});

app.get('/api/metrics/calls', authorize([UserRole.ADMIN, UserRole.SUPERVISOR]), (req, res) => {
  const tenantId = req.tenantId;
  res.json(getMetrics(tenantId));
});

app.get('/api/metrics/summary', authorize([UserRole.ADMIN, UserRole.SUPERVISOR]), (req, res) => {
  res.json({
    requests: {
      total: requestMetrics.total,
      errors: requestMetrics.errors,
      lastErrorAt: requestMetrics.lastErrorAt,
      latency: summarizeLatencies(),
    },
    jobs: jobStats,
  });
});

app.post('/api/supervisor/monitor', authenticate, authorize([UserRole.ADMIN, UserRole.SUPERVISOR]), async (req, res) => {
  const { callId, mode = 'listen', identity } = req.body || {};
  if (!callId) return res.status(400).json({ error: 'callId required' });
  if (!getTwilioClient()) return res.status(500).json({ error: 'Twilio not configured' });
  if (!isTwilioMonitoringEnabled()) return res.status(400).json({ error: 'Monitoring not enabled' });

  const resolved = await resolveMonitorConference(req.tenantId, callId);
  if (!resolved?.conferenceName) return res.status(404).json({ error: 'Conference not active' });
  const supervisorIdentity = identity || req.user?.uid || req.user?.email || 'supervisor';
  const effectiveMode = mode === 'whisper' && !resolved.coachSid ? 'listen' : mode;
  const participant = {
    from: `client:${supervisorIdentity}`,
    to: `client:${supervisorIdentity}`,
    muted: effectiveMode === 'listen',
  };
  if (effectiveMode === 'whisper') {
    participant.coach = resolved.coachSid;
    participant.muted = false;
  }
  if (effectiveMode === 'barge') {
    participant.muted = false;
  }
  try {
    const created = await addConferenceParticipant(resolved.conferenceName, participant);
    res.json({
      ok: true,
      participantSid: created.sid,
      conferenceName: resolved.conferenceName,
      callId: resolved.resolvedCallId || callId,
      downgraded: mode === 'whisper' && effectiveMode !== 'whisper',
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'monitor failed' });
  }
});

app.post('/api/supervisor/monitor/stop', authenticate, authorize([UserRole.ADMIN, UserRole.SUPERVISOR]), async (req, res) => {
  const { participantSid, callId } = req.body || {};
  const client = getTwilioClient();
  if (!client) return res.status(500).json({ error: 'Twilio not configured' });
  try {
    if (participantSid) {
      await client.participants(participantSid).update({ hold: true });
      return res.json({ ok: true });
    }
    if (callId) {
      const resolved = await resolveMonitorConference(req.tenantId, callId);
      const conferenceSid = resolved?.conferenceSid;
      if (!conferenceSid) return res.status(404).json({ error: 'Conference not active' });
      const parts = await client.conferences(conferenceSid).participants.list({ limit: 20 });
      await Promise.all(parts.map(p => client.conferences(conferenceSid).participants(p.sid).remove().catch(() => {})));
      return res.json({ ok: true });
    }
    res.status(400).json({ error: 'participantSid or callId required' });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'stop failed' });
  }
});

app.post('/api/supervisor/monitor/status', authenticate, authorize([UserRole.ADMIN, UserRole.SUPERVISOR]), async (req, res) => {
  const { participantSid, callId } = req.body || {};
  const client = getTwilioClient();
  if (!client) return res.status(500).json({ error: 'Twilio not configured' });
  try {
    if (participantSid) {
      const participant = await client.participants(participantSid).fetch();
      return res.json({ active: participant?.status === 'in-progress', status: participant?.status });
    }
    if (callId) {
      const resolved = await resolveMonitorConference(req.tenantId, callId);
      const conferenceSid = resolved?.conferenceSid;
      if (!conferenceSid) return res.json({ active: false });
      const parts = await client.conferences(conferenceSid).participants.list({ limit: 20 });
      return res.json({ active: parts.length > 0 });
    }
    res.status(400).json({ error: 'participantSid or callId required' });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'status failed' });
  }
});

const extractE164 = (value = '') => {
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\+?\d{7,15}/);
  if (!match) return '';
  return match[0].startsWith('+') ? match[0] : `+${match[0]}`;
};

const extractClientIdentity = (value = '') => {
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('client:')) {
    return trimmed.replace('client:', '');
  }
  return '';
};

app.post('/twilio/voice', verifyTwilioSignature, async (req, res) => {
    const tenantId = req.tenantId || DEFAULT_TENANT_ID;
    const toRaw = req.body?.To || req.body?.Called || '';
    const clientIdentity = extractClientIdentity(toRaw) || req.body?.identity || req.query?.identity;
    const dialTo = extractE164(toRaw);
    const callerId = process.env.TWILIO_CALLER_ID;
    const recordingCallbackUrl = `${getBaseUrl(req)}/twilio/recording/status`;
    const callSid = req.body?.CallSid || crypto.randomUUID();
    const conferenceName = getConferenceName(callSid);

    if (isTwilioMonitoringEnabled()) {
      const metrics = getMetrics(tenantId);
      metrics.outboundTotal += 1;
      metrics.routed += 1;
      res.type('text/xml').send(buildConferenceTwiml(conferenceName, { muted: false, startOnEnter: true, endOnExit: true }));

      if (clientIdentity) {
        const safeIdentity = String(clientIdentity || 'agent').trim() || 'agent';
        addConferenceParticipant(conferenceName, {
          from: `client:${safeIdentity}`,
          to: `client:${safeIdentity}`,
          muted: false,
          endConferenceOnExit: true,
        }).catch(err => console.error('monitoring add participant failed', err?.message || err));
        return;
      }

      if (dialTo) {
        if (!callerId) return;
        addConferenceParticipant(conferenceName, {
          from: callerId,
          to: dialTo,
          record: true,
          recordingStatusCallback: recordingCallbackUrl,
          recordingStatusCallbackEvent: ['completed'],
        }).catch(err => console.error('monitoring add participant failed', err?.message || err));
        return;
      }
      return;
    }

    if (clientIdentity) {
      const safeIdentity = String(clientIdentity || 'agent').trim() || 'agent';
      const metrics = getMetrics(tenantId);
      metrics.outboundTotal += 1;
      metrics.routed += 1;
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial record="record-from-answer" recordingStatusCallback="${recordingCallbackUrl}" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed">
    <Client>${safeIdentity}</Client>
  </Dial>
</Response>`;
      res.type('text/xml').send(twiml);
      return;
    }

    if (dialTo) {
      if (!callerId) {
        res.status(500).type('text/plain').send('TWILIO_CALLER_ID missing');
        return;
      }
      const metrics = getMetrics(tenantId);
      metrics.outboundTotal += 1;
      metrics.routed += 1;
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}" record="record-from-answer" recordingStatusCallback="${recordingCallbackUrl}" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed">
    <Number>${dialTo}</Number>
  </Dial>
</Response>`;
      res.type('text/xml').send(twiml);
      return;
    }

  const settings = await getSettingsForTenant(tenantId);
  const ivrSettings = settings.ivr || defaultSettings.ivr;
  const prompt = ivrSettings.welcomeMessage || defaultSettings.ivr.welcomeMessage;
  const options = Array.isArray(ivrSettings.options) ? ivrSettings.options : defaultSettings.ivr.options;
  const gather = options.map((o) => `Press ${o.key} for ${o.label}.`).join(' ');

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="/twilio/voice/handle" method="POST">
    <Say>${prompt} ${gather}</Say>
  </Gather>
  <Say>No input received. Goodbye.</Say>
</Response>`;

  res.type('text/xml').send(twiml);
});

app.post('/twilio/recording/status', verifyTwilioSignature, async (req, res) => {
  const callSid = req.body?.CallSid;
  const recordingUrl = req.body?.RecordingUrl;
  const recordingSid = req.body?.RecordingSid;
  if (!callSid || !recordingUrl) {
    return res.status(400).send('missing recording data');
  }

  try {
    const callRecord = isMongoReady()
      ? await Call.findOne({ $or: [{ externalId: callSid }, { twilioCallSid: callSid }] }).lean()
      : (stores.calls || []).find(c => c.id === callSid || c.twilioCallSid === callSid);
    const tenantId = callRecord?.tenantId || req.tenantId || DEFAULT_TENANT_ID;
    const resolvedCallId = callRecord?.externalId || callRecord?.id || callSid;
    const externalId = `rec_${callSid}`;
    await ensureRecordingsDir();
    const data = await downloadTwilioRecording(recordingUrl);
    const useStorage = await isStorageEnabled();
    let storageProvider = 'local';
    let storagePath = '';
    if (useStorage) {
      const objectPath = `recordings/${externalId}.wav`;
      const stored = await uploadRecordingBuffer(objectPath, data, 'audio/wav');
      storageProvider = stored?.storageProvider || 'gcs';
      storagePath = stored?.storagePath || objectPath;
    } else {
      await ensureRecordingsDir();
      const filePath = path.join(recordingsDir, `${externalId}.wav`);
      await fs.writeFile(filePath, data);
      storagePath = filePath;
    }

    const signedUrl = buildRecordingUrl(req, tenantId, externalId);
    const recording = {
      tenantId,
      externalId,
      callId: resolvedCallId,
      filename: `${externalId}.wav`,
      mimeType: 'audio/wav',
      size: data.length,
      storagePath,
      storageProvider,
      recordingUrl: signedUrl,
      createdAt: Date.now(),
      createdBy: 'twilio',
      recordingSid,
    };

    if (isMongoReady()) {
      await Recording.findOneAndUpdate(
        { tenantId, externalId },
        recording,
        { upsert: true, new: true }
      );
      await Call.findOneAndUpdate(
        { tenantId, $or: [{ externalId: callSid }, { twilioCallSid: callSid }] },
        { recordingUrl: signedUrl, recordingId: externalId }
      );
    } else {
      const stored = { id: externalId, ...recording };
      stores.recordings = upsertById(stores.recordings, stored);
      await saveStore('recordings', stores.recordings);
      stores.calls = stores.calls.map(c => ((c.id === callSid || c.twilioCallSid === callSid) && c.tenantId === tenantId) ? { ...c, recordingUrl: signedUrl, recordingId: externalId } : c);
      await saveStore('calls', stores.calls);
    }

    const callbackUrl = `${getBaseUrl(req)}/twilio/transcription/status`;
    if (recordingSid) {
      await requestTwilioTranscription(recordingSid, callbackUrl);
    }

    res.json({ ok: true, externalId });
  } catch (err) {
    console.error('Recording callback failed', err);
    res.status(500).send('recording fetch failed');
  }
});

app.post('/twilio/transcription/status', verifyTwilioSignature, async (req, res) => {
  const callSid = req.body?.CallSid;
  const transcriptionText = req.body?.TranscriptionText;
  if (!callSid || !transcriptionText) {
    return res.status(400).send('missing transcription data');
  }

  try {
    const segment = {
      id: `tr_${Date.now()}`,
      speaker: 'customer',
      text: String(transcriptionText),
      timestamp: Date.now(),
      isFinal: true,
    };
    if (isMongoReady()) {
      const call = await Call.findOneAndUpdate(
        { $or: [{ externalId: callSid }, { twilioCallSid: callSid }] },
        { $push: { transcript: segment }, transcriptionEnabled: true },
        { new: true }
      ).lean();
      if (call?.tenantId) {
        const resolvedCallId = call.externalId || call.id || callSid;
        await enqueueJob(call.tenantId, 'summary', { callId: resolvedCallId });
        await enqueueJob(call.tenantId, 'report', { callId: resolvedCallId });
      }
    } else {
      const idx = (stores.calls || []).findIndex(c => c.id === callSid || c.twilioCallSid === callSid);
      if (idx >= 0) {
        const existing = stores.calls[idx];
        const transcript = Array.isArray(existing.transcript) ? [...existing.transcript, segment] : [segment];
        stores.calls[idx] = { ...existing, transcript, transcriptionEnabled: true };
        await saveStore('calls', stores.calls);
        const resolvedCallId = existing.id || callSid;
        await enqueueJob(existing.tenantId || DEFAULT_TENANT_ID, 'summary', { callId: resolvedCallId });
        await enqueueJob(existing.tenantId || DEFAULT_TENANT_ID, 'report', { callId: resolvedCallId });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Transcription callback failed', err);
    res.status(500).send('transcription update failed');
  }
});

app.post('/twilio/voice/incoming', verifyTwilioSignature, async (req, res) => {
  const tenantId = req.tenantId || DEFAULT_TENANT_ID;
  const identityOverride = (req.query?.identity || req.body?.identity || '').toString().trim();
  const settings = await getSettingsForTenant(tenantId);
  const targets = identityOverride ? [identityOverride] : buildRouteTargets(settings, 'agent');
  const callSid = req.body?.CallSid || crypto.randomUUID();
  const conferenceName = getConferenceName(callSid);
  callRouteState.set(callSid, { targets, index: 0, tenantId, conferenceName, waitLoops: 0 });

  const metrics = getMetrics(tenantId);
  metrics.inboundTotal += 1;
  metrics.routed += 1;
  metrics.lastRouteAt = Date.now();

  if (isMongoReady()) {
    await Call.findOneAndUpdate(
      { tenantId, externalId: callSid },
      {
        tenantId,
        externalId: callSid,
        direction: 'inbound',
        customerName: req.body?.From || 'Inbound Caller',
        phoneNumber: req.body?.From || '',
        queue: settings?.ivr?.phoneNumber || 'Inbound',
        startTime: Date.now(),
        status: 'RINGING',
      },
      { upsert: true, new: true }
    );
  } else {
    const call = {
      id: callSid,
      tenantId,
      direction: 'inbound',
      customerName: req.body?.From || 'Inbound Caller',
      phoneNumber: req.body?.From || '',
      queue: settings?.ivr?.phoneNumber || 'Inbound',
      startTime: Date.now(),
      status: 'RINGING',
    };
    stores.calls = upsertById(stores.calls, call);
    await saveStore('calls', stores.calls);
  }

  const actionUrl = `${getBaseUrl(req)}/twilio/voice/route-next`;
  const recordingCallbackUrl = `${getBaseUrl(req)}/twilio/recording/status`;
  if (isTwilioMonitoringEnabled()) {
    res.type('text/xml').send(buildConferenceTwiml(conferenceName, { muted: false, startOnEnter: true, endOnExit: true }));
    const firstTarget = targets[0];
    if (firstTarget) {
      addConferenceParticipant(conferenceName, {
        from: `client:${firstTarget}`,
        to: `client:${firstTarget}`,
        muted: false,
        endConferenceOnExit: true,
      }).catch(err => console.error('monitoring add participant failed', err?.message || err));
    }
    return;
  }
  res.type('text/xml').send(buildDialTwiml(targets[0], actionUrl, recordingCallbackUrl));
});

app.post('/twilio/voice/route-next', verifyTwilioSignature, async (req, res) => {
  const callSid = req.body?.CallSid;
  const dialStatus = req.body?.DialCallStatus;
  const state = callRouteState.get(callSid);
  if (!state) {
    res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
    return;
  }
  if (isTwilioMonitoringEnabled()) {
    res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
    return;
  }
  const { targets, index, tenantId, waitLoops = 0 } = state;
  if (dialStatus === 'completed') {
    callRouteState.delete(callSid);
    if (isMongoReady()) {
      await Call.findOneAndUpdate(
        { tenantId, externalId: callSid },
        { status: 'ENDED', endTime: Date.now() }
      );
    } else {
      stores.calls = stores.calls.map(c => c.id === callSid ? { ...c, status: 'ENDED', endTime: Date.now() } : c);
      await saveStore('calls', stores.calls);
    }
    await enqueueJob(tenantId, 'transcription', { callId: callSid });
    await enqueueJob(tenantId, 'summary', { callId: callSid });
    await enqueueJob(tenantId, 'report', { callId: callSid });
    await ensureRecordingForCall(req, { tenantId, externalId: callSid, id: callSid });
    res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
    return;
  }
  const nextIndex = index + 1;
  if (nextIndex >= targets.length) {
    const actionUrl = `${getBaseUrl(req)}/twilio/voice/route-next`;
    if (waitLoops < TWILIO_MAX_WAIT_CYCLES) {
      const metrics = getMetrics(tenantId);
      metrics.retries += 1;
      callRouteState.set(callSid, { ...state, index: 0, waitLoops: waitLoops + 1 });
      res.type('text/xml').send(buildWaitTwiml(actionUrl, TWILIO_HOLD_MUSIC_URL, TWILIO_WAIT_SECONDS));
      return;
    }
    const metrics = getMetrics(tenantId);
    metrics.failed += 1;
    callRouteState.delete(callSid);
    await enqueueJob(tenantId, 'report', { callId: callSid });
    await ensureRecordingForCall(req, { tenantId, externalId: callSid, id: callSid });
    res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>No agents available. Please try again later.</Say><Hangup/></Response>`);
    return;
  }
  const metrics = getMetrics(tenantId);
  metrics.retries += 1;
  callRouteState.set(callSid, { ...state, index: nextIndex });
  const actionUrl = `${getBaseUrl(req)}/twilio/voice/route-next`;
  const recordingCallbackUrl = `${getBaseUrl(req)}/twilio/recording/status`;
  res.type('text/xml').send(buildDialTwiml(targets[nextIndex], actionUrl, recordingCallbackUrl));
});

app.post('/twilio/voice/handle', verifyTwilioSignature, async (req, res) => {
  const tenantId = req.tenantId || DEFAULT_TENANT_ID;
  const settings = await getSettingsForTenant(tenantId);
  const ivr = settings.ivr || defaultSettings.ivr;
  const options = Array.isArray(ivr.options) ? ivr.options : defaultSettings.ivr.options;
  const digit = req.body?.Digits;
  const match = options.find((o) => o.key === digit);

  if (!match) {
    res.type('text/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Invalid selection. Goodbye.</Say>
  <Hangup/>
</Response>`
    );
    return;
  }

  if (match.action === 'VOICEMAIL') {
    res.type('text/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Please leave a voicemail after the tone.</Say>
  <Record maxLength="60"/>
</Response>`
    );
    return;
  }

  const callSid = req.body?.CallSid || crypto.randomUUID();
  const targets = buildRouteTargets(settings, 'agent');
  const conferenceName = getConferenceName(callSid);
  callRouteState.set(callSid, { targets, index: 0, tenantId, conferenceName, waitLoops: 0 });

  if (isMongoReady()) {
    await Call.findOneAndUpdate(
      { tenantId, externalId: callSid },
      {
        tenantId,
        externalId: callSid,
        direction: 'inbound',
        customerName: req.body?.From || 'Inbound Caller',
        phoneNumber: req.body?.From || '',
        queue: match.label || match.target || 'Inbound',
        startTime: Date.now(),
        status: 'RINGING',
      },
      { upsert: true, new: true }
    );
  } else {
    const call = {
      id: callSid,
      tenantId,
      direction: 'inbound',
      customerName: req.body?.From || 'Inbound Caller',
      phoneNumber: req.body?.From || '',
      queue: match.label || match.target || 'Inbound',
      startTime: Date.now(),
      status: 'RINGING',
    };
    stores.calls = upsertById(stores.calls, call);
    await saveStore('calls', stores.calls);
  }

  const metrics = getMetrics(tenantId);
  metrics.routed += 1;
  metrics.lastRouteAt = Date.now();

  const actionUrl = `${getBaseUrl(req)}/twilio/voice/route-next`;
  const recordingCallbackUrl = `${getBaseUrl(req)}/twilio/recording/status`;
  if (isTwilioMonitoringEnabled()) {
    res.type('text/xml').send(buildConferenceTwiml(conferenceName, { muted: false, startOnEnter: true, endOnExit: true }));
    const firstTarget = targets[0];
    if (firstTarget) {
      addConferenceParticipant(conferenceName, {
        from: `client:${firstTarget}`,
        to: `client:${firstTarget}`,
        muted: false,
        endConferenceOnExit: true,
      }).catch(err => console.error('monitoring add participant failed', err?.message || err));
    }
    return;
  }
  res.type('text/xml').send(buildDialTwiml(targets[0], actionUrl, recordingCallbackUrl));
});

app.post('/api/gemini/tts', async (req, res) => {
  if (!ensureGemini(res)) return;
  const { text, voiceName = 'Kore' } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text is required' });
  const ai = getClient();

  try {
    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });
    const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!data) {
      return res.status(500).json({ error: 'No audio returned from model.' });
    }
    const pcmBuffer = Buffer.from(data, 'base64');
    const wavBuffer = createWavBuffer(pcmBuffer, { sampleRate: 24000, channels: 1, bitDepth: 16 });
    res.setHeader('Content-Type', 'audio/wav');
    res.send(wavBuffer);
  } catch (error) {
    console.error('TTS failed:', error);
    res.status(500).json({ error: 'TTS generation failed.' });
  }
});

app.post('/api/gemini/live-token', async (req, res) => {
  if (!ensureGemini(res)) return;
  const client = getClient({ httpOptions: { apiVersion: 'v1alpha' } });
  const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();

  try {
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        httpOptions: { apiVersion: 'v1alpha' },
        liveConnectConstraints: {
          model: LIVE_MODEL,
          config: {
            responseModalities: ['AUDIO'],
            sessionResumption: {},
          },
        },
      },
    });
    res.json({ token: token?.name });
  } catch (error) {
    console.error('Live token error:', error);
    res.status(500).json({ error: 'Unable to issue Live API token.' });
  }
});

app.use((err, req, res, next) => {
  log('error', 'request.error', {
    requestId: req.requestId,
    path: req.originalUrl,
    message: err?.message,
  });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
