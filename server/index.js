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

app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '2mb' }));

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
let VECTOR_DB = []; 

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

const stores = {
  campaigns: await loadStore('campaigns', []),
  dispositions: await loadStore('dispositions', []),
  recordings: await loadStore('recordings', []),
  calendarEvents: await loadStore('calendarEvents', []),
  crmContacts: await loadStore('crmContacts', []),
  crmTasks: await loadStore('crmTasks', []),
  marketingCampaigns: await loadStore('marketingCampaigns', []),
  integrations: await loadStore('integrations', { calendar: {}, crm: {}, marketing: {} }),
  settings: await loadStore('settings', null),
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

app.post('/api/rag/ingest', async (req, res) => {
  if (!ensureGemini(res)) return;
  const { documents } = req.body; // Expects [{ id, content, metadata }]
  if (!Array.isArray(documents)) return res.status(400).json({ error: 'documents array required' });

  const processed = [];
  for (const doc of documents) {
    const vector = await getEmbeddings(doc.content);
    if (vector) {
      // Upsert logic
      const existingIdx = VECTOR_DB.findIndex(v => v.id === doc.id);
      const record = { id: doc.id, vector, content: doc.content, metadata: doc.metadata };
      if (existingIdx >= 0) {
        VECTOR_DB[existingIdx] = record;
      } else {
        VECTOR_DB.push(record);
      }
      processed.push(doc.id);
    }
  }
  console.log(`[RAG] Ingested ${processed.length} documents. Total DB size: ${VECTOR_DB.length}`);
  res.json({ success: true, count: processed.length });
});

app.post('/api/rag/query', async (req, res) => {
  if (!ensureGemini(res)) return;
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });

  // 1. Vector Search
  const queryVector = await getEmbeddings(query);
  if (!queryVector) return res.status(500).json({ error: 'Failed to embed query' });

  const matches = VECTOR_DB.map(doc => ({
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
  const settings = stores.settings || defaultSettings;
  res.json(settings);
});

app.put('/api/settings', async (req, res) => {
  const incoming = req.body || {};
  stores.settings = { ...(stores.settings || defaultSettings), ...incoming };
  await saveStore('settings', stores.settings);
  res.json(stores.settings);
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
app.get('/api/campaigns', (req, res) => {
  res.json(stores.campaigns);
});

app.post('/api/campaigns', async (req, res) => {
  const payload = req.body || {};
  const campaign = { id: payload.id || crypto.randomUUID(), ...payload, updatedAt: Date.now() };
  stores.campaigns = upsertById(stores.campaigns, campaign);
  await saveStore('campaigns', stores.campaigns);
  res.json(campaign);
});

app.put('/api/campaigns/:id', async (req, res) => {
  const campaign = { ...req.body, id: req.params.id, updatedAt: Date.now() };
  stores.campaigns = upsertById(stores.campaigns, campaign);
  await saveStore('campaigns', stores.campaigns);
  res.json(campaign);
});

app.delete('/api/campaigns/:id', async (req, res) => {
  stores.campaigns = removeById(stores.campaigns, req.params.id);
  await saveStore('campaigns', stores.campaigns);
  res.json({ ok: true });
});

// --- DISPOSITIONS ---
app.get('/api/dispositions', (req, res) => {
  res.json(stores.dispositions);
});

app.post('/api/dispositions', async (req, res) => {
  const payload = req.body || {};
  const disposition = { id: payload.id || crypto.randomUUID(), ...payload, updatedAt: Date.now() };
  stores.dispositions = upsertById(stores.dispositions, disposition);
  await saveStore('dispositions', stores.dispositions);
  res.json(disposition);
});

app.put('/api/dispositions/:id', async (req, res) => {
  const disposition = { ...req.body, id: req.params.id, updatedAt: Date.now() };
  stores.dispositions = upsertById(stores.dispositions, disposition);
  await saveStore('dispositions', stores.dispositions);
  res.json(disposition);
});

app.delete('/api/dispositions/:id', async (req, res) => {
  stores.dispositions = removeById(stores.dispositions, req.params.id);
  await saveStore('dispositions', stores.dispositions);
  res.json({ ok: true });
});

// --- RECORDINGS ---
app.get('/api/recordings', (req, res) => {
  res.json(stores.recordings);
});

app.post('/api/recordings', async (req, res) => {
  const payload = req.body || {};
  const recording = { id: payload.id || crypto.randomUUID(), ...payload, createdAt: Date.now() };
  stores.recordings = upsertById(stores.recordings, recording);
  await saveStore('recordings', stores.recordings);
  res.json(recording);
});

app.put('/api/recordings/:id', async (req, res) => {
  const recording = { ...req.body, id: req.params.id, updatedAt: Date.now() };
  stores.recordings = upsertById(stores.recordings, recording);
  await saveStore('recordings', stores.recordings);
  res.json(recording);
});

app.post('/api/recordings/upload', async (req, res) => {
  const { base64, mimeType = 'audio/wav', filename, callId } = req.body || {};
  if (!base64) return res.status(400).json({ error: 'base64 required' });
  await ensureRecordingsDir();
  const id = crypto.randomUUID();
  const ext = (filename && filename.includes('.')) ? filename.split('.').pop() : 'wav';
  const filePath = path.join(recordingsDir, `${id}.${ext}`);
  const buffer = Buffer.from(base64, 'base64');
  await fs.writeFile(filePath, buffer);
  const recording = {
    id,
    callId: callId || null,
    mimeType,
    filename: filename || `${id}.${ext}`,
    bytes: buffer.length,
    filePath,
    createdAt: Date.now(),
  };
  stores.recordings = upsertById(stores.recordings, recording);
  await saveStore('recordings', stores.recordings);
  res.json(recording);
});

app.post('/api/recordings/:id/signed-url', (req, res) => {
  const { ttlSeconds = 3600 } = req.body || {};
  const rec = stores.recordings.find(r => r.id === req.params.id);
  if (!rec) return res.status(404).json({ error: 'recording not found' });
  const expires = Date.now() + Number(ttlSeconds) * 1000;
  const payload = `${rec.id}:${expires}`;
  const sig = signToken(payload);
  const url = `/api/recordings/download?token=${rec.id}.${expires}.${sig}`;
  res.json({ url, expiresAt: expires });
});

app.get('/api/recordings/download', async (req, res) => {
  const token = req.query?.token || '';
  const [id, expires, sig] = String(token).split('.');
  if (!id || !expires || !sig) return res.status(400).send('invalid token');
  const expected = signToken(`${id}:${expires}`);
  if (expected !== sig) return res.status(403).send('invalid signature');
  if (Date.now() > Number(expires)) return res.status(403).send('token expired');
  const rec = stores.recordings.find(r => r.id === id);
  if (!rec) return res.status(404).send('not found');
  try {
    const data = await fs.readFile(rec.filePath);
    res.setHeader('Content-Type', rec.mimeType || 'audio/wav');
    res.send(data);
  } catch {
    res.status(404).send('file missing');
  }
});

// --- CALENDAR ---
app.get('/api/calendar/events', (req, res) => {
  res.json(stores.calendarEvents);
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
    stores.integrations.calendar.google = { token, updatedAt: now() };
    await saveStore('integrations', stores.integrations);
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
    stores.integrations.calendar.microsoft = { token, updatedAt: now() };
    await saveStore('integrations', stores.integrations);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Microsoft OAuth failed' });
  }
});

app.post('/api/calendar/events', async (req, res) => {
  const payload = req.body || {};
  const event = { id: payload.id || crypto.randomUUID(), ...payload, updatedAt: Date.now() };
  stores.calendarEvents = upsertById(stores.calendarEvents, event);
  await saveStore('calendarEvents', stores.calendarEvents);
  res.json(event);
});

app.put('/api/calendar/events/:id', async (req, res) => {
  const event = { ...req.body, id: req.params.id, updatedAt: Date.now() };
  stores.calendarEvents = upsertById(stores.calendarEvents, event);
  await saveStore('calendarEvents', stores.calendarEvents);
  res.json(event);
});

app.delete('/api/calendar/events/:id', async (req, res) => {
  stores.calendarEvents = removeById(stores.calendarEvents, req.params.id);
  await saveStore('calendarEvents', stores.calendarEvents);
  res.json({ ok: true });
});

app.post('/api/calendar/sync', async (req, res) => {
  const { provider, accountId, status = 'connected' } = req.body || {};
  stores.integrations.calendar[accountId || provider || 'default'] = { provider, status, updatedAt: Date.now() };
  await saveStore('integrations', stores.integrations);
  res.json({ ok: true });
});

app.post('/api/calendar/webhook', (req, res) => {
  res.json({ ok: true });
});

// --- CRM ---
app.get('/api/crm/contacts', (req, res) => {
  const { phone } = req.query || {};
  if (phone) {
    const hit = stores.crmContacts.find(c => c.phone === phone);
    res.json({ contact: hit || null });
    return;
  }
  res.json(stores.crmContacts);
});

app.post('/api/crm/contacts', async (req, res) => {
  const payload = req.body || {};
  const contact = { id: payload.id || crypto.randomUUID(), ...payload, updatedAt: Date.now() };
  stores.crmContacts = upsertById(stores.crmContacts, contact);
  await saveStore('crmContacts', stores.crmContacts);
  res.json(contact);
});

app.get('/api/crm/tasks', (req, res) => {
  res.json(stores.crmTasks);
});

app.post('/api/crm/tasks', async (req, res) => {
  const payload = req.body || {};
  const task = { id: payload.id || crypto.randomUUID(), ...payload, updatedAt: Date.now() };
  stores.crmTasks = upsertById(stores.crmTasks, task);
  await saveStore('crmTasks', stores.crmTasks);
  res.json(task);
});

app.post('/api/crm/sync', async (req, res) => {
  const { platform, status = 'queued' } = req.body || {};
  stores.integrations.crm[platform || 'default'] = { platform, status, updatedAt: Date.now() };
  await saveStore('integrations', stores.integrations);
  res.json({ ok: true });
});

app.post('/api/crm/webhook', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/crm/:provider/connect', async (req, res) => {
  const { provider } = req.params;
  const credentials = req.body || {};
  stores.integrations.crm[provider] = { provider, credentials, status: 'connected', updatedAt: Date.now() };
  await saveStore('integrations', stores.integrations);
  res.json({ ok: true });
});

app.post('/api/crm/:provider/sync', async (req, res) => {
  const { provider } = req.params;
  stores.integrations.crm[provider] = { ...(stores.integrations.crm[provider] || {}), status: 'syncing', updatedAt: Date.now() };
  await saveStore('integrations', stores.integrations);
  res.json({ ok: true });
});

// --- MARKETING ---
app.get('/api/marketing/campaigns', (req, res) => {
  res.json(stores.marketingCampaigns);
});

app.post('/api/marketing/campaigns', async (req, res) => {
  const payload = req.body || {};
  const campaign = { id: payload.id || crypto.randomUUID(), ...payload, updatedAt: Date.now() };
  stores.marketingCampaigns = upsertById(stores.marketingCampaigns, campaign);
  await saveStore('marketingCampaigns', stores.marketingCampaigns);
  res.json(campaign);
});

app.put('/api/marketing/campaigns/:id', async (req, res) => {
  const campaign = { ...req.body, id: req.params.id, updatedAt: Date.now() };
  stores.marketingCampaigns = upsertById(stores.marketingCampaigns, campaign);
  await saveStore('marketingCampaigns', stores.marketingCampaigns);
  res.json(campaign);
});

app.delete('/api/marketing/campaigns/:id', async (req, res) => {
  stores.marketingCampaigns = removeById(stores.marketingCampaigns, req.params.id);
  await saveStore('marketingCampaigns', stores.marketingCampaigns);
  res.json({ ok: true });
});

app.post('/api/marketing/:provider/connect', async (req, res) => {
  const { provider } = req.params;
  const credentials = req.body || {};
  stores.integrations.marketing[provider] = { provider, credentials, status: 'connected', updatedAt: Date.now() };
  await saveStore('integrations', stores.integrations);
  res.json({ ok: true });
});

app.post('/api/marketing/:provider/sync', async (req, res) => {
  const { provider } = req.params;
  stores.integrations.marketing[provider] = { ...(stores.integrations.marketing[provider] || {}), status: 'syncing', updatedAt: Date.now() };
  await saveStore('integrations', stores.integrations);
  res.json({ ok: true });
});

// --- REPORTS ---
app.get('/api/reports/summary', (req, res) => {
  const totalCalls = stores.recordings.length;
  const totalCampaigns = stores.campaigns.length;
  res.json({
    totalCalls,
    totalCampaigns,
    totalRecordings: stores.recordings.length,
    generatedAt: Date.now(),
  });
});

app.get('/api/integrations/status', (req, res) => {
  res.json(stores.integrations);
});

const extractE164 = (value = '') => {
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\+?\d{7,15}/);
  if (!match) return '';
  return match[0].startsWith('+') ? match[0] : `+${match[0]}`;
};

app.post('/twilio/voice', (req, res) => {
  const toRaw = req.body?.To || req.body?.Called || '';
  const dialTo = extractE164(toRaw);
  const callerId = process.env.TWILIO_CALLER_ID;

  if (dialTo) {
    if (!callerId) {
      res.status(500).type('text/plain').send('TWILIO_CALLER_ID missing');
      return;
    }
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}">
    <Number>${dialTo}</Number>
  </Dial>
</Response>`;
    res.type('text/xml').send(twiml);
    return;
  }

  const settings = stores.settings || defaultSettings;
  const ivr = settings.ivr || defaultSettings.ivr;
  const prompt = ivr.welcomeMessage || defaultSettings.ivr.welcomeMessage;
  const options = Array.isArray(ivr.options) ? ivr.options : defaultSettings.ivr.options;
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

app.post('/twilio/voice/handle', (req, res) => {
  const settings = stores.settings || defaultSettings;
  const ivr = settings.ivr || defaultSettings.ivr;
  const options = Array.isArray(ivr.options) ? ivr.options : defaultSettings.ivr.options;
  const digit = req.body?.Digits;
  const match = options.find((o) => o.key === digit);

  if (!match) {
    res.type('text/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Invalid selection. Goodbye.</Say>
</Response>`
    );
    return;
  }

  res.type('text/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>You selected ${match.label}. We will connect you shortly.</Say>
</Response>`
  );
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

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
