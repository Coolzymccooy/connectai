import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { GoogleGenAI, Type } from '@google/genai';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import twilio from 'twilio';
import { authenticate, authorize, UserRole } from './rbacMiddleware.js';
import { globalQueue } from './services/queueManager.js';
import { startDialer } from './services/dialerEngine.js';
import { AuditLog } from './models/AuditLog.js';
import { User, Call, Campaign, Disposition, Recording, Setting, Conversation, Message, Tenant, Job } from './models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

// --- DB CONNECTION ---
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ DB Error:', err));
}

const app = express();
app.set('trust proxy', 1);

// --- GLOBAL SECURITY & PERFORMANCE ---
app.use(helmet()); // Secure HTTP headers
app.use(compression()); // Compress responses for faster load
app.use(cors({
  origin: process.env.CLIENT_URL || '*', // Allow Vercel frontend in prod
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// --- RATE LIMITING (DDoS Protection) ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

const twilioLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
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
  DIALING: ['RINGING', 'ENDED'],
  RINGING: ['ACTIVE', 'ENDED'],
  ACTIVE: ['HOLD', 'ENDED'],
  HOLD: ['ACTIVE', 'ENDED'],
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

const getSettingsForTenant = async (tenantId) => {
  if (isMongoReady()) {
    const doc = await Setting.findOne({ tenantId }).lean();
    return doc?.data || defaultSettings;
  }
  const stored = stores.settingsByTenant.find(s => s.tenantId === tenantId);
  return stored?.data || defaultSettings;
};

const callRouteState = new Map();
const buildRouteTargets = (settings, fallbackIdentity = 'agent') => {
  const team = Array.isArray(settings?.team) ? settings.team : [];
  const available = team.filter(t => t.currentPresence === 'AVAILABLE' || t.status === 'active');
  const targets = (available.length ? available : team)
    .map(t => t.extension || t.id || t.email)
    .filter(Boolean);
  if (targets.length === 0) return [fallbackIdentity];
  return targets;
};

const buildDialTwiml = (identity, actionUrl) => `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial action="${actionUrl}" method="POST" timeout="20">
    <Client>${identity}</Client>
  </Dial>
</Response>`;

const getBaseUrl = (req) => process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

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

const getCallForJob = async (tenantId, callId) => {
  if (isMongoReady()) {
    const byExternal = await Call.findOne({ tenantId, externalId: callId }).lean();
    if (byExternal) return byExternal;
    const byId = await Call.findById(callId).lean();
    return byId;
  }
  return stores.calls.find(c => c.tenantId === tenantId && c.id === callId);
};

const processJobs = async () => {
  const jobs = await fetchPendingJobs(5);
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
        if (!GEMINI_API_KEY) throw new Error('Gemini not configured');
        const ai = getClient();
        const text = (call.transcript || []).map((t) => `${t.speaker}: ${t.text}`).join('\n');
        const prompt = `Provide a concise call summary and action items.\nTranscript:\n${text}`;
        const response = await ai.models.generateContent({ model: TEXT_MODEL, contents: prompt });
        const summary = response.text || 'Summary unavailable.';
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
      await updateJob(jobId, { status: 'completed', result: { ok: true } });
    } catch (err) {
      const attempts = (job.attempts || 0) + 1;
      const retry = attempts < 3;
      await updateJob(jobId, {
        status: retry ? 'pending' : 'failed',
        error: err?.message || 'job failed',
        nextRunAt: Date.now() + (retry ? 60_000 : 0),
      });
    }
  }
};

setInterval(() => {
  processJobs().catch(() => {});
}, 30_000);

app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
});

app.use((req, res, next) => {
  res.on('finish', () => {
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

const normalizeSettingsStore = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((item) => item.tenantId ? item : { ...item, tenantId: DEFAULT_TENANT_ID });
  return [{ tenantId: DEFAULT_TENANT_ID, data: raw }];
};

const stores = {
  calls: normalizeTenantArray(await loadStore('calls', [])),
  tenants: await loadStore('tenants', []),
  campaigns: normalizeTenantArray(await loadStore('campaigns', [])),
  dispositions: normalizeTenantArray(await loadStore('dispositions', [])),
  recordings: normalizeTenantArray(await loadStore('recordings', [])),
  calendarEvents: normalizeTenantArray(await loadStore('calendarEvents', [])),
  crmContacts: normalizeTenantArray(await loadStore('crmContacts', [])),
  crmTasks: normalizeTenantArray(await loadStore('crmTasks', [])),
  marketingCampaigns: normalizeTenantArray(await loadStore('marketingCampaigns', [])),
  integrationsByTenant: normalizeSettingsStore(await loadStore('integrations', null)),
  users: normalizeTenantArray(await loadStore('users', [])),
  jobs: normalizeTenantArray(await loadStore('jobs', [])),
  settingsByTenant: normalizeSettingsStore(await loadStore('settings', null)),
};

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

const AccessToken = twilio.jwt.AccessToken;
const { VoiceGrant } = AccessToken;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';

const verifyTwilioSignature = (req, res, next) => {
  if (!TWILIO_AUTH_TOKEN) return next();
  const signature = req.headers['x-twilio-signature'];
  if (!signature) return res.status(403).send('missing signature');
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const valid = twilio.validateRequest(
    TWILIO_AUTH_TOKEN,
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

app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/recordings/download') return next();
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
      .then((doc) => res.json(doc?.data || defaultSettings))
      .catch(() => res.json(defaultSettings));
  }
  const stored = stores.settingsByTenant.find(s => s.tenantId === tenantId);
  const settings = stored?.data || defaultSettings;
  res.json(settings);
});

app.put('/api/settings', async (req, res) => {
  const incoming = req.body || {};
  const tenantId = req.tenantId;
  if (isMongoReady()) {
    const existing = await Setting.findOne({ tenantId });
    const data = { ...(existing?.data || defaultSettings), ...incoming };
    await Setting.findOneAndUpdate(
      { tenantId },
      { tenantId, data, updatedAt: Date.now() },
      { upsert: true, new: true }
    );
    await writeAuditLog(req, 'SETTINGS_UPDATE', 'settings', { keys: Object.keys(incoming) });
    res.json(data);
    return;
  }
  const idx = stores.settingsByTenant.findIndex(s => s.tenantId === tenantId);
  const merged = { ...((stores.settingsByTenant[idx]?.data) || defaultSettings), ...incoming };
  if (idx >= 0) stores.settingsByTenant[idx] = { tenantId, data: merged };
  else stores.settingsByTenant.push({ tenantId, data: merged });
  await saveStore('settings', stores.settingsByTenant);
  await writeAuditLog(req, 'SETTINGS_UPDATE', 'settings', { keys: Object.keys(incoming) });
  res.json(merged);
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
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;
  const appSid = process.env.TWILIO_TWIML_APP_SID;

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
  const { status, limit = 100 } = req.query || {};
  const filter = { tenantId };
  if (status) filter.status = status;
  if (isMongoReady()) {
    const items = await Call.find(filter)
      .sort({ startTime: -1 })
      .limit(Math.min(Number(limit) || 100, 500))
      .lean();
    return res.json(items.map(toPublic));
  }
  const items = stores.calls ? stores.calls.filter(c => c.tenantId === tenantId) : [];
  res.json(items);
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
  await ensureRecordingsDir();
  const externalId = crypto.randomUUID();
  const ext = (filename && filename.includes('.')) ? filename.split('.').pop() : 'wav';
  const filePath = path.join(recordingsDir, `${externalId}.${ext}`);
  const buffer = Buffer.from(base64, 'base64');
  await fs.writeFile(filePath, buffer);
  const retentionDays = Number(process.env.RECORDING_RETENTION_DAYS || 30);
  const expiresAt = Date.now() + retentionDays * 24 * 60 * 60 * 1000;
  const recording = {
    tenantId,
    externalId,
    callId: callId || null,
    mimeType,
    filename: filename || `${externalId}.${ext}`,
    size: buffer.length,
    storagePath: filePath,
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
    const data = await fs.readFile(rec.storagePath || rec.filePath);
    res.setHeader('Content-Type', rec.mimeType || 'audio/wav');
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
  oauthStates.set(state, { provider: 'google', createdAt: now() });
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
    const store = getIntegrationsStore(req.tenantId);
    store.data.calendar.google = { token, updatedAt: now() };
    await saveIntegrationsStore();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Google OAuth failed' });
  }
});

app.get('/api/oauth/microsoft/start', (req, res) => {
  if (!MS_OAUTH.clientId || !MS_OAUTH.redirectUri) {
    return res.status(500).json({ error: 'Microsoft OAuth not configured' });
  }
  const state = createState();
  oauthStates.set(state, { provider: 'microsoft', createdAt: now() });
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
    const store = getIntegrationsStore(req.tenantId);
    store.data.calendar.microsoft = { token, updatedAt: now() };
    await saveIntegrationsStore();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Microsoft OAuth failed' });
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

app.post('/api/crm/:provider/connect', async (req, res) => {
  const { provider } = req.params;
  const credentials = req.body || {};
  const store = getIntegrationsStore(req.tenantId);
  store.data.crm[provider] = { provider, credentials, status: 'connected', updatedAt: Date.now() };
  await saveIntegrationsStore();
  res.json({ ok: true });
});

app.post('/api/crm/:provider/sync', async (req, res) => {
  const { provider } = req.params;
  const store = getIntegrationsStore(req.tenantId);
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
  res.json(campaign);
});

app.put('/api/marketing/campaigns/:id', async (req, res) => {
  const tenantId = req.tenantId;
  const campaign = { ...req.body, id: req.params.id, tenantId, updatedAt: Date.now() };
  stores.marketingCampaigns = upsertById(stores.marketingCampaigns, campaign);
  await saveStore('marketingCampaigns', stores.marketingCampaigns);
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

app.get('/api/integrations/status', (req, res) => {
  const tenantId = req.tenantId;
  const store = getIntegrationsStore(tenantId);
  res.json(store.data);
});

app.get('/api/metrics/calls', authorize([UserRole.ADMIN, UserRole.SUPERVISOR]), (req, res) => {
  const tenantId = req.tenantId;
  res.json(getMetrics(tenantId));
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

  if (clientIdentity) {
    const safeIdentity = String(clientIdentity || 'agent').trim() || 'agent';
    const metrics = getMetrics(tenantId);
    metrics.outboundTotal += 1;
    metrics.routed += 1;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
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
  <Dial callerId="${callerId}">
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

app.post('/twilio/voice/incoming', verifyTwilioSignature, async (req, res) => {
  const tenantId = req.tenantId || DEFAULT_TENANT_ID;
  const identityOverride = (req.query?.identity || req.body?.identity || '').toString().trim();
  const settings = await getSettingsForTenant(tenantId);
  const targets = identityOverride ? [identityOverride] : buildRouteTargets(settings, 'agent');
  const callSid = req.body?.CallSid || crypto.randomUUID();
  callRouteState.set(callSid, { targets, index: 0, tenantId });

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
  res.type('text/xml').send(buildDialTwiml(targets[0], actionUrl));
});

app.post('/twilio/voice/route-next', verifyTwilioSignature, async (req, res) => {
  const callSid = req.body?.CallSid;
  const dialStatus = req.body?.DialCallStatus;
  const state = callRouteState.get(callSid);
  if (!state) {
    res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
    return;
  }
  const { targets, index, tenantId } = state;
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
    res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
    return;
  }
  const nextIndex = index + 1;
  if (nextIndex >= targets.length) {
    const metrics = getMetrics(tenantId);
    metrics.failed += 1;
    callRouteState.delete(callSid);
    await enqueueJob(tenantId, 'report', { callId: callSid });
    res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>No agents available. Please try again later.</Say><Hangup/></Response>`);
    return;
  }
  const metrics = getMetrics(tenantId);
  metrics.retries += 1;
  callRouteState.set(callSid, { targets, index: nextIndex, tenantId });
  const actionUrl = `${getBaseUrl(req)}/twilio/voice/route-next`;
  res.type('text/xml').send(buildDialTwiml(targets[nextIndex], actionUrl));
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
  callRouteState.set(callSid, { targets, index: 0, tenantId });

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
  res.type('text/xml').send(buildDialTwiml(targets[0], actionUrl));
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
