import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { GoogleGenAI, Type } from '@google/genai';
import { authenticate, authorize, UserRole } from './rbacMiddleware.js';
import { globalQueue } from './services/queueManager.js';
import { startDialer } from './services/dialerEngine.js';

dotenv.config({ path: '.env.local' });

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
