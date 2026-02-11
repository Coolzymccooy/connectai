
import { TranscriptSegment, ToolAction, Lead, Message, CallAnalysis } from "../types";

const apiPost = async (path: string, body: Record<string, any>) => {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response;
};

/**
 * Fetches real-time strategic intelligence about a company using Google Search grounding.
 */
export const getStrategicIntelligence = async (companyName: string): Promise<{ text: string, links: { title: string, uri: string }[] }> => {
  if (!companyName) return { text: "Intelligence hub standby.", links: [] };
  try {
    const response = await apiPost('/gemini/intel', { companyName });
    if (!response.ok) throw new Error('intel failed');
    return await response.json();
  } catch {
    return { text: "Unable to reach search cluster.", links: [] };
  }
};

/**
 * Detects churn or compliance risks within a live call transcript snippet.
 */
export const detectRiskInTranscript = async (transcript: TranscriptSegment[]): Promise<string | null> => {
  if (transcript.length < 3) return null;
  const text = transcript.slice(-5).map(t => `${t.speaker}: ${t.text}`).join("\n");
  const prompt = `Act as a Crisis Intervention AI. Analyze this conversation snippet and flag if there is a major risk (Churn threat, Legal threat, Compliance violation, or extreme anger).
If no major risk, return "none". If risk exists, return a 5-word summary.
Snippet:
${text}`;

  try {
    const response = await apiPost('/gemini/draft', { history: [{ sender: 'system', text: prompt }] });
    if (!response.ok) return null;
    const data = await response.json();
    const result = (data.text || '').toLowerCase().trim();
    return result === 'none' ? null : result;
  } catch {
    return null;
  }
};

/**
 * Generates an AI suggested reply for an omnichannel conversation.
 */
export const generateAiDraft = async (history: Message[]): Promise<string> => {
  if (history.length === 0) return "AI drafting unavailable.";
  try {
    const response = await apiPost('/gemini/draft', { history });
    if (!response.ok) return "AI drafting unavailable.";
    const data = await response.json();
    return data.text || "I'll look into that for you.";
  } catch {
    return "Error generating draft.";
  }
};

/**
 * Performs a comprehensive post-call analysis on a full transcript.
 */
export const analyzeCallTranscript = async (transcript: TranscriptSegment[]): Promise<CallAnalysis> => {
  try {
    const response = await apiPost('/gemini/analysis', { transcript });
    if (!response.ok) throw new Error('analysis failed');
    return await response.json();
  } catch {
    return {
      summary: "Manual review required. Neural engine timeout.",
      sentimentScore: 50,
      sentimentLabel: "Neutral",
      topics: ["Unknown"],
      qaScore: 0,
      dispositionSuggestion: "Needs Review"
    };
  }
};

/**
 * Extracts actionable intents for CRM automation (e.g., scheduling follow-ups).
 */
export const extractToolActions = async (transcript: TranscriptSegment[]): Promise<ToolAction[]> => {
  try {
    const response = await apiPost('/gemini/tool-actions', { transcript });
    if (!response.ok) return [];
    const parsed = await response.json();
    return parsed.map((a: any) => ({
      ...a,
      id: `tool_${Math.random().toString(36).substr(2, 9)}`,
      status: 'suggested'
    }));
  } catch {
    return [];
  }
};

/**
 * Generates a concise strategic briefing for a sales lead.
 */
export const generateLeadBriefing = async (lead: Lead): Promise<string> => {
  try {
    const response = await apiPost('/gemini/lead-brief', { lead });
    if (!response.ok) return "Briefing unavailable.";
    const data = await response.json();
    return data.text || "No briefing available.";
  } catch {
    return "Error generating briefing.";
  }
};

export const synthesizeSpeech = async (text: string, voiceName = 'Kore'): Promise<Blob | null> => {
  try {
    const response = await apiPost('/gemini/tts', { text, voiceName });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return new Blob([buffer], { type: 'audio/wav' });
  } catch {
    return null;
  }
};

export const generateCampaignDraft = async (campaign: { name: string; aiPersona?: string; audience?: any }): Promise<{ subject: string; body: string }> => {
  try {
    const response = await apiPost('/gemini/campaign-draft', { campaign });
    if (!response.ok) throw new Error('campaign draft failed');
    const data = await response.json();
    return {
      subject: data.subject || `ConnectAI Campaign: ${campaign.name}`,
      body: data.body || `Hi there,\n\nWe are reaching out about ${campaign.name}.\n\nThanks,\nConnectAI Team`,
    };
  } catch {
    return {
      subject: `ConnectAI Campaign: ${campaign.name}`,
      body: `Hi there,\n\nWe are reaching out about ${campaign.name}.\n\nThanks,\nConnectAI Team`,
    };
  }
};

export const enrichLead = async (lead: Lead): Promise<{ company?: string; industry?: string; notes?: string }> => {
  try {
    const response = await apiPost('/gemini/lead-enrich', { lead });
    if (!response.ok) throw new Error('lead enrich failed');
    return await response.json();
  } catch {
    return {};
  }
};

export const generateHelpAnswer = async (question: string): Promise<string> => {
  try {
    const response = await apiPost('/gemini/help', { question });
    if (!response.ok) throw new Error('help failed');
    const data = await response.json();
    return data.text || 'Help response unavailable.';
  } catch {
    return 'Help response unavailable.';
  }
};
