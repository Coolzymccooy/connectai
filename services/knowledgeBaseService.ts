
import { KbArticle, AiSuggestion } from '../types';

// Initial Data for Bootstrapping the Vector DB
export const INITIAL_KB_DATA: KbArticle[] = [
  {
    id: 'kb_1',
    title: 'Refund Policy (2025)',
    category: 'policy',
    content: 'Full refunds are available within 30 days of purchase. After 30 days, pro-rated credit is applied. Manager approval required for refunds > $500.',
    tags: ['refund', 'money back', 'return', 'credit', 'cancel'],
    lastUpdated: Date.now()
  },
  {
    id: 'kb_2',
    title: 'Troubleshooting: Login Issues',
    category: 'technical',
    content: '1. Ask user to clear cache.\n2. Verify email spelling.\n3. Send password reset link via Admin Portal.\n4. If SSO, check Okta status.',
    tags: ['login', 'password', 'access', 'cant log in', 'reset'],
    lastUpdated: Date.now()
  },
  {
    id: 'kb_3',
    title: 'Annual Plan Objection Script',
    category: 'script',
    content: '"I understand the upfront cost is higher, but the Annual Plan saves you 20% compared to monthly. That is effectively 2 months free."',
    tags: ['price', 'expensive', 'discount', 'cost', 'annual'],
    lastUpdated: Date.now()
  },
  {
    id: 'kb_4',
    title: 'GDPR/NDPR Data Request',
    category: 'policy',
    content: 'If a customer asks to delete data: 1. Do not promise immediate deletion. 2. Tag call as "Compliance". 3. Direct them to privacy@company.com.',
    tags: ['privacy', 'delete', 'data', 'gdpr', 'ndpr', 'compliance'],
    lastUpdated: Date.now()
  },
  {
    id: 'kb_5',
    title: 'Outage Status: US-East',
    category: 'technical',
    content: 'Current partial outage in US-East-1. Latency expected. Engineering is investigating. ETA 2 hours.',
    tags: ['slow', 'down', 'broken', 'error', 'loading', 'outage'],
    lastUpdated: Date.now()
  }
];

export const ingestInitialData = async () => {
  try {
    console.log('[RAG] Bootstrapping Vector Store...');
    const documents = INITIAL_KB_DATA.map(doc => ({
      id: doc.id,
      content: `${doc.title}\n${doc.content}`,
      metadata: { title: doc.title, tags: doc.tags, category: doc.category }
    }));
    
    await fetch('/api/rag/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents })
    });
    console.log('[RAG] Ingestion Complete.');
  } catch (err) {
    console.error('[RAG] Ingestion Failed:', err);
  }
};

export const searchKnowledgeBase = async (query: string): Promise<AiSuggestion[]> => {
  try {
    const res = await fetch('/api/rag/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    
    if (!res.ok) throw new Error('RAG Query Failed');
    
    const data = await res.json();
    
    // Transform backend RAG response into UI Suggestion format
    // data = { answer: string, sources: [] }
    
    return [{
      id: `rag_${Date.now()}`,
      title: 'AI Suggested Answer',
      content: data.answer,
      triggerPhrase: query,
      type: 'script',
      confidence: 95
    }];
  } catch (err) {
    console.error(err);
    return [{
      id: 'err',
      title: 'Search Unavailable',
      content: 'Unable to query knowledge base.',
      type: 'info',
      confidence: 0
    }];
  }
};
