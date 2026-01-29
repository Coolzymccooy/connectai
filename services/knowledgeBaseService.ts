
import { KbArticle, AiSuggestion } from '../types';

const MOCK_KB: KbArticle[] = [
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

export const searchKnowledgeBase = async (query: string): Promise<AiSuggestion[]> => {
  // Simulate network latency for realism
  await new Promise(resolve => setTimeout(resolve, 400));

  const lowerQuery = query.toLowerCase();
  
  // Simple keyword matching simulation (in real life, this would be vector embedding search)
  const results = MOCK_KB.map(article => {
    let score = 0;
    
    // Exact tag match
    article.tags.forEach(tag => {
      if (lowerQuery.includes(tag)) score += 30;
    });

    // Content match
    if (article.content.toLowerCase().includes(lowerQuery)) score += 10;
    
    return { article, score };
  })
  .filter(item => item.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 3); // Top 3

  return results.map(r => ({
    id: r.article.id,
    title: r.article.title,
    content: r.article.content,
    triggerPhrase: 'Relevant Topic',
    type: r.article.category === 'script' ? 'script' : 'info',
    confidence: Math.min(99, r.score * 2) // Fake confidence %
  }));
};