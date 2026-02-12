import React, { useRef, useEffect, useState, useMemo } from 'react';
import { 
  Activity, Sparkles, Target, ChevronRight, Phone, Zap, Info, MessageSquare, Send, Mail, Briefcase, 
  X, Plus, ClipboardCheck, User as UserIcon, Radio, Search, Filter, ArrowRight, BarChart3,
  TrendingUp, Users, Clock, DollarSign, Globe, Headset, BrainCircuit, Wand2, Lightbulb,
  CheckCircle, MoreHorizontal, Bot, MessageCircle, PhoneOutgoing, UserPlus, RefreshCw, Calendar as CalendarIcon, Video,
  Repeat, ChevronLeft, LayoutGrid, CalendarDays, Lock, Trash2, Share2, HelpCircle, Paperclip, FileText,
  ShieldCheck, Terminal, Download, ClipboardList, Database, FileJson, CheckCircle2,
  ExternalLink, Layers, Eye, Settings, VideoOff, MoreVertical
} from 'lucide-react';
import { Call, CallStatus, TranscriptSegment, AppSettings, Notification, Lead, User, AiSuggestion, AgentStatus, Message, CallAnalysis, CrmContact, Campaign, Conversation, Meeting, ToolAction, Attachment, Role } from '../types';
import { generateLeadBriefing, generateAiDraft, analyzeCallTranscript, extractToolActions, generateCampaignDraft, enrichLead, generateHelpAnswer } from '../services/geminiService';
import { upsertCrmContact } from '../services/crmService';
import * as dbService from '../services/dbService';
import { buildInternalConversationId } from '../utils/chat';

interface AgentConsoleProps {
  activeCall: Call | null;
  agentStatus: AgentStatus;
  onCompleteWrapUp: (finalCall: Call) => void;
  settings: AppSettings;
  addNotification: (type: Notification['type'], message: string) => void;
  leads?: Lead[];
  onOutboundCall?: (target: Lead | string) => void;
  onInternalCall?: (target: User) => void;
  onJoinMeeting?: (meeting: Meeting) => void;
  onAddParticipant?: (userId: string) => void;
  history?: Call[];
  campaigns: Campaign[];
  onUpdateCampaigns: (c: Campaign[]) => void;
  onUpdateCampaign?: (c: Campaign) => void;
  onCreateLead?: (lead: Lead) => void;
  meetings: Meeting[];
  onUpdateMeetings: (m: Meeting[]) => void;
  user: User;
  isFirebaseConfigured?: boolean;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); 
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const NDPR_CONSENT_TEXT = 'By continuing this conversation, you consent to processing of your data in line with Nigeria\'s Data Protection Act (NDPA). Reply STOP to opt out.';
const CAMPAIGN_TEMPLATES = [
  {
    id: 'welcome',
    label: 'Welcome',
    subject: 'Welcome to ConnectAI',
    email: 'Hi {{name}},\n\nThanks for your interest in ConnectAI. We help teams modernize calling, messaging, and call intelligence in one workspace.\n\nWould you like a 15‑minute overview this week?',
    sms: 'Hi {{name}} — thanks for your interest in ConnectAI. Want a quick 15‑min overview this week?',
  },
  {
    id: 'reengage',
    label: 'Re‑engage',
    subject: 'Quick check‑in',
    email: 'Hi {{name}},\n\nJust checking in on your interest in ConnectAI. We can help your team consolidate call + chat and speed up follow‑ups.\n\nIs now a good time to reconnect?',
    sms: 'Hi {{name}}, quick check‑in — is now a good time to reconnect about ConnectAI?',
  },
  {
    id: 'event',
    label: 'Event Reminder',
    subject: 'Reminder: ConnectAI session',
    email: 'Hi {{name}},\n\nReminder about your ConnectAI session. If you need to reschedule, just reply with a better time.\n\nSee you soon.',
    sms: 'Reminder: your ConnectAI session. Reply to reschedule if needed.',
  },
];
const DEFAULT_CONVERSATIONS: Conversation[] = [
  {
    id: 'c1',
    contactName: 'John Smith',
    contactPhone: '+1 555-012-3456',
    channel: 'sms',
    lastMessage: 'Can we move the demo to 4pm?',
    lastMessageTime: Date.now() - 3600000,
    unreadCount: 1,
    status: 'open',
    messages: [{ id: 'm1', channel: 'sms', sender: 'customer', text: 'Can we move the demo to 4pm?', timestamp: Date.now() - 3600000 }]
  },
  {
    id: 'c2',
    contactName: 'Linda Core',
    contactPhone: '+1 555-998-1122',
    channel: 'whatsapp',
    lastMessage: 'Is the API bridge active?',
    lastMessageTime: Date.now() - 7200000,
    unreadCount: 0,
    status: 'open',
    messages: [{ id: 'm2', channel: 'whatsapp', sender: 'customer', text: 'Is the API bridge active?', timestamp: Date.now() - 7200000 }]
  }
];

export const AgentConsole: React.FC<AgentConsoleProps> = ({ 
  activeCall, agentStatus, onCompleteWrapUp, settings, addNotification,
  leads = [], onOutboundCall, onInternalCall, onAddParticipant, history = [],
  campaigns, onUpdateCampaigns, onUpdateCampaign, onCreateLead, meetings, onUpdateMeetings, user, onJoinMeeting, isFirebaseConfigured = false
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'voice' | 'omnichannel' | 'campaigns' | 'outbound' | 'team' | 'calendar' | 'leads' | 'help'>('voice');
  
  // AI Helper & Analysis State
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [liveTools, setLiveTools] = useState<ToolAction[]>([]);
  const [wrapUpAnalysis, setWrapUpAnalysis] = useState<CallAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastEndedCall, setLastEndedCall] = useState<Call | null>(null);
  const analyzedRef = useRef<{ id: string | null; len: number }>({ id: null, len: 0 });
  const [wrapUpActions, setWrapUpActions] = useState({
    qaApproved: false,
    dispositionApplied: false,
    crmSynced: false,
    followUpScheduled: false,
  });

  // Omnichannel States
  const [conversations, setConversations] = useState<Conversation[]>(DEFAULT_CONVERSATIONS);
  const [messageMap, setMessageMap] = useState<Record<string, Message[]>>({});
  const seededRef = useRef(false);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [aiDraftText, setAiDraftText] = useState<string | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);
  const [showInboxMenu, setShowInboxMenu] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showThreadSettings, setShowThreadSettings] = useState(false);
  const [showTerminateConfirm, setShowTerminateConfirm] = useState(false);
  const [conversationPrefs, setConversationPrefs] = useState<Record<string, { muted: boolean; priority: boolean }>>({});

  // Campaign States
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    type: 'call' as any,
    target: 100,
    persona: 'Professional Concierge',
    audience: { industry: '', lifecycleStage: 'Lead', region: 'UK', minEngagement: 0, consentRequired: true },
    channels: { email: false, sms: false, whatsapp: false },
    content: { emailSubject: '', emailBody: '' },
    journey: [
      { id: `step_${Date.now()}_1`, type: 'send_email', label: 'First touch' },
      { id: `step_${Date.now()}_2`, type: 'wait', label: 'Wait 48h', delayHours: 48 }
    ]
  });
  const [campaignDetail, setCampaignDetail] = useState<Campaign | null>(null);
  const [campaignConfig, setCampaignConfig] = useState<Campaign | null>(null);

  // Outbound Dialer States
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadBrief, setLeadBrief] = useState<string | null>(null);
  const [isLoadingBrief, setIsLoadingBrief] = useState(false);
  const [dialerSearch, setDialerSearch] = useState('');
  const [leadNotes, setLeadNotes] = useState<Record<string, string>>({});
  const [queueOrder, setQueueOrder] = useState<string[]>([]);
  const [queueStatus, setQueueStatus] = useState<Record<string, 'queued' | 'in_progress' | 'completed'>>({});
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [newLead, setNewLead] = useState({ name: '', company: '', phone: '', email: '', status: 'Lead', notes: '' });
  const [leadCsvText, setLeadCsvText] = useState('');
  const [leadCsvRows, setLeadCsvRows] = useState<Lead[]>([]);
  const [leadCsvErrors, setLeadCsvErrors] = useState<string[]>([]);
  const [leadImporting, setLeadImporting] = useState(false);
  const [leadEnriching, setLeadEnriching] = useState(false);
  const [leadCsvColumns, setLeadCsvColumns] = useState<string[]>([]);
  const [leadCsvHasHeader, setLeadCsvHasHeader] = useState(false);
  const [leadCsvMapping, setLeadCsvMapping] = useState<Record<string, number>>({
    name: 0,
    company: 1,
    phone: 2,
    email: 3,
    status: 4,
    notes: 5,
    industry: 6,
  });
  const [helpInput, setHelpInput] = useState('');
  const [helpMessages, setHelpMessages] = useState<{ id: string; sender: 'user' | 'bot'; text: string }[]>([
    { id: 'h1', sender: 'bot', text: 'Welcome to the Help Corner. Ask anything about ConnectAI or pick a preset question.' }
  ]);
  const canManage = user.role === Role.ADMIN || user.role === Role.SUPERVISOR;
  const [isCampaignDrafting, setIsCampaignDrafting] = useState(false);

  // Calendar States
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [newMeeting, setNewMeeting] = useState({ title: '', attendeeId: '', date: new Date().toISOString().split('T')[0], time: '10:00', isRecurring: false, pattern: 'weekly' as any });

  const activeConversation = conversations.find(c => c.id === selectedConvId);
  const activeMessages = selectedConvId ? (messageMap[selectedConvId] || activeConversation?.messages || []) : (activeConversation?.messages || []);

  useEffect(() => {
    if (leads.length === 0) return;
    setQueueOrder(prev => prev.length ? prev : leads.map(l => l.id));
    setQueueStatus(prev => {
      const next = { ...prev };
      leads.forEach(l => {
        if (!next[l.id]) next[l.id] = 'queued';
      });
      return next;
    });
  }, [leads]);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setConversations(DEFAULT_CONVERSATIONS);
      return;
    }
    const unsubscribe = dbService.fetchConversations(user.id, async (convos) => {
      if (convos.length === 0 && !seededRef.current) {
        seededRef.current = true;
        await Promise.all(DEFAULT_CONVERSATIONS.map(async (conv) => {
          await dbService.upsertConversation({
            ...conv,
            participantIds: [user.id],
            messages: [],
          });
          if (conv.messages[0]) {
            await dbService.sendConversationMessage(conv.id, conv.messages[0]);
          }
        }));
        return;
      }
      setConversations(convos);
      if (!selectedConvId && convos[0]) {
        setSelectedConvId(convos[0].id);
      }
    });
    return () => unsubscribe();
  }, [isFirebaseConfigured, user.id, selectedConvId]);

  useEffect(() => {
    if (!isFirebaseConfigured || !selectedConvId) return;
    return dbService.fetchConversationMessages(selectedConvId, (msgs) => {
      setMessageMap(prev => ({ ...prev, [selectedConvId]: msgs }));
    });
  }, [isFirebaseConfigured, selectedConvId]);

  // Scroll logic
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeCall?.transcript, activeMessages, wrapUpAnalysis]);

  // Live Tool Extraction logic
  useEffect(() => {
    if (activeCall && activeCall.transcript.length > 5 && activeCall.transcript.length % 5 === 0) {
      extractToolActions(activeCall.transcript).then(tools => {
        if (tools.length > 0) setLiveTools(prev => [...tools, ...prev].slice(0, 3));
      });
    }
  }, [activeCall?.transcript?.length]);

  // Wrap-up trigger logic
  useEffect(() => {
    if (agentStatus === AgentStatus.WRAP_UP && history.length > 0 && !isAnalyzing) {
      const lastCall = history[0];
      setLastEndedCall(lastCall);
      const transcriptLen = lastCall.transcript?.length || 0;
      if (transcriptLen === 0) return;
      if (analyzedRef.current.id === lastCall.id && analyzedRef.current.len === transcriptLen) return;
      setIsAnalyzing(true);
      analyzeCallTranscript(lastCall.transcript)
        .then((analysis) => {
          analyzedRef.current = { id: lastCall.id, len: transcriptLen };
          setWrapUpAnalysis(analysis);
          setLastEndedCall(prev => prev ? { ...prev, analysis } : prev);
          setWrapUpActions({
            qaApproved: false,
            dispositionApplied: false,
            crmSynced: false,
            followUpScheduled: false,
          });
        })
        .finally(() => setIsAnalyzing(false));
    } else if (agentStatus !== AgentStatus.WRAP_UP) {
      setWrapUpAnalysis(null);
      setLastEndedCall(null);
      analyzedRef.current = { id: null, len: 0 };
      setWrapUpActions({
        qaApproved: false,
        dispositionApplied: false,
        crmSynced: false,
        followUpScheduled: false,
      });
    }
  }, [agentStatus, history, isAnalyzing]);

  const handleExecuteTool = (toolId: string) => {
    setLiveTools(prev => prev.map(t => t.id === toolId ? { ...t, status: 'executed' } : t));
    const tool = liveTools.find(t => t.id === toolId);
    if (tool?.name.toLowerCase().includes('schedule')) {
       addNotification('success', 'Follow-up meeting scheduled.');
    } else {
       addNotification('success', `Protocol executed: ${tool?.name} synchronized.`);
    }
  };

  const handleSendMessage = (text: string = messageInput, files: Attachment[] = []) => {
    if ((!text.trim() && files.length === 0) || !selectedConvId) return;
    const msg: Message = { id: `m_${Date.now()}`, channel: activeConversation?.channel || 'chat', sender: 'agent', text, timestamp: Date.now(), attachments: files };
    if (isFirebaseConfigured) {
      dbService.sendConversationMessage(selectedConvId, msg).catch(() => {});
    } else {
      setConversations(prev => prev.map(c => c.id === selectedConvId ? { ...c, messages: [...c.messages, msg], lastMessage: text || "Attachment Packet", lastMessageTime: Date.now() } : c));
    }
    setMessageInput('');
    setAiDraftText(null);
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const attachments: Attachment[] = (Array.from(files) as File[]).map(f => ({
      name: f.name,
      url: URL.createObjectURL(f),
      type: f.type,
      size: f.size
    }));
    handleSendMessage("", attachments);
  };

  const handleGenerateDraft = async () => {
    if (!activeConversation) return;
    setIsDrafting(true);
    try {
      const draft = await generateAiDraft(activeMessages);
      setAiDraftText(draft);
    } finally { setIsDrafting(false); }
  };

  const parseCsv = (input: string) => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];
      const next = input[i + 1];
      if (char === '"' && inQuotes && next === '"') {
        field += '"';
        i += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (char === ',' && !inQuotes) {
        row.push(field.trim());
        field = '';
        continue;
      }
      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (field.length || row.length) {
          row.push(field.trim());
          rows.push(row);
        }
        row = [];
        field = '';
        if (char === '\r' && next === '\n') i += 1;
        continue;
      }
      field += char;
    }
    if (field.length || row.length) {
      row.push(field.trim());
      rows.push(row);
    }
    return rows.filter(r => r.some(cell => cell !== ''));
  };

  const detectHeaderIndex = (header: string[], candidates: string[]) => {
    const lower = header.map(h => h.toLowerCase());
    for (const key of candidates) {
      const idx = lower.findIndex(h => h === key);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const buildLeadsFromCsv = (rawText: string, mapping: Record<string, number>, hasHeader: boolean) => {
    const errors: string[] = [];
    const rows = parseCsv(rawText);
    if (rows.length === 0) return { leads: [], errors: ['No rows detected in CSV.'] };
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const leads = dataRows.map((row, idx) => {
      const name = mapping.name >= 0 ? (row[mapping.name] || '') : '';
      const phone = mapping.phone >= 0 ? (row[mapping.phone] || '') : '';
      if (!name || !phone) {
        errors.push(`Row ${idx + 1}: missing name or phone.`);
        return null;
      }
      if (phone && !/^\+?\d{7,15}$/.test(phone.replace(/\s+/g, ''))) {
        errors.push(`Row ${idx + 1}: invalid phone format.`);
      }
      const email = mapping.email >= 0 ? (row[mapping.email] || '') : '';
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
        errors.push(`Row ${idx + 1}: invalid email format.`);
      }
      return {
        id: `lead_${Date.now()}_${idx}`,
        name,
        company: mapping.company >= 0 ? (row[mapping.company] || 'Unknown') : 'Unknown',
        phone,
        email: email || undefined,
        status: mapping.status >= 0 ? (row[mapping.status] || 'Lead') : 'Lead',
        notes: mapping.notes >= 0 ? (row[mapping.notes] || undefined) : undefined,
        industry: mapping.industry >= 0 ? (row[mapping.industry] || undefined) : undefined,
      } as Lead;
    }).filter(Boolean) as Lead[];
    return { leads, errors };
  };

  const handleParseLeadCsv = () => {
    const rows = parseCsv(leadCsvText);
    if (rows.length === 0) {
      setLeadCsvErrors(['No rows detected in CSV.']);
      setLeadCsvRows([]);
      return;
    }
    const header = rows[0].map(h => h.trim());
    const headerFields = ['name', 'company', 'phone', 'email', 'status', 'notes', 'industry'];
    const headerMatches = header.filter(h => headerFields.includes(h.toLowerCase()));
    const hasHeader = headerMatches.length >= 2;
    setLeadCsvHasHeader(hasHeader);
    const columns = hasHeader ? header : header.map((_, idx) => `Column ${idx + 1}`);
    setLeadCsvColumns(columns);
    const mapping = hasHeader ? {
      name: detectHeaderIndex(header, ['name', 'full_name', 'fullname']),
      company: detectHeaderIndex(header, ['company', 'account', 'organization', 'organisation']),
      phone: detectHeaderIndex(header, ['phone', 'phone_number', 'phone number', 'mobile']),
      email: detectHeaderIndex(header, ['email', 'email_address', 'email address']),
      status: detectHeaderIndex(header, ['status', 'stage', 'lifecycle']),
      notes: detectHeaderIndex(header, ['notes', 'note']),
      industry: detectHeaderIndex(header, ['industry', 'sector']),
    } : {
      name: 0,
      company: 1,
      phone: 2,
      email: 3,
      status: 4,
      notes: 5,
      industry: 6,
    };
    setLeadCsvMapping(mapping);
    const { leads, errors } = buildLeadsFromCsv(leadCsvText, mapping, hasHeader);
    setLeadCsvRows(leads);
    setLeadCsvErrors(errors);
    if (leads.length) addNotification('success', `${leads.length} leads parsed.`);
  };

  const applyLeadMapping = () => {
    const { leads, errors } = buildLeadsFromCsv(leadCsvText, leadCsvMapping, leadCsvHasHeader);
    setLeadCsvRows(leads);
    setLeadCsvErrors(errors);
  };

  const handleImportLeads = async () => {
    if (leadCsvRows.length === 0) {
      addNotification('error', 'No leads to import.');
      return;
    }
    setLeadImporting(true);
    try {
      if (isFirebaseConfigured) {
        await Promise.all(leadCsvRows.map(lead => dbService.syncLead(lead)));
      } else {
        leadCsvRows.forEach(lead => onCreateLead?.(lead));
      }
      setLeadCsvText('');
      setLeadCsvRows([]);
      addNotification('success', 'Leads imported.');
    } finally {
      setLeadImporting(false);
    }
  };

  const handleEnrichLeads = async () => {
    if (leadCsvRows.length === 0) {
      addNotification('info', 'Import or preview leads before enrichment.');
      return;
    }
    setLeadEnriching(true);
    try {
      const enriched: Lead[] = [];
      for (const lead of leadCsvRows) {
        const result = await enrichLead(lead);
        enriched.push({
          ...lead,
          company: result.company || lead.company,
          industry: result.industry || lead.industry,
          notes: result.notes || lead.notes,
        });
      }
      setLeadCsvRows(enriched);
      addNotification('success', 'Lead enrichment complete.');
    } finally {
      setLeadEnriching(false);
    }
  };

  const HELP_QUESTIONS = [
    {
      id: 'q1',
      question: 'How do I start a campaign?',
      answer: 'Go to Campaigns, click Create Campaign, set audience + channels, add journey steps, then Start. Only Admin/Supervisor can create campaigns.',
    },
    {
      id: 'q2',
      question: 'How do I import leads in bulk?',
      answer: 'Open Leads, paste/upload CSV, map columns, preview, then Import. You can AI‑enrich before importing.',
    },
    {
      id: 'q3',
      question: 'How does AI email drafting work?',
      answer: 'In Campaign Settings, click AI Draft Email. It generates subject/body based on persona and audience.',
    },
    {
      id: 'q4',
      question: 'How do I enable call recordings and summaries?',
      answer: 'Recordings are created on call completion. Summaries require Gemini to be configured and transcription to be available.',
    },
  ];

  const handleHelpAsk = async (question?: string) => {
    const text = (question || helpInput).trim();
    if (!text) return;
    setHelpMessages(prev => [...prev, { id: `h_${Date.now()}`, sender: 'user', text }]);
    setHelpInput('');
    try {
      const answer = await generateHelpAnswer(text);
      setHelpMessages(prev => [...prev, { id: `h_${Date.now()}_bot`, sender: 'bot', text: answer }]);
    } catch {
      setHelpMessages(prev => [...prev, { id: `h_${Date.now()}_bot`, sender: 'bot', text: 'Help service is unavailable. Use preset questions or contact admin.' }]);
    }
  };

  const handleCampaignDraft = async () => {
    if (!campaignConfig) return;
    setIsCampaignDrafting(true);
    try {
      const draft = await generateCampaignDraft(campaignConfig);
      setCampaignConfig({
        ...campaignConfig,
        content: {
          ...(campaignConfig.content || {}),
          emailSubject: draft.subject,
          emailBody: draft.body,
        },
      });
      addNotification('success', 'AI email draft generated.');
    } finally {
      setIsCampaignDrafting(false);
    }
  };

  const resolveJourneyType = (type: Campaign['type']) => {
    if (type === 'sms') return 'send_sms';
    if (type === 'whatsapp') return 'send_whatsapp';
    if (type === 'email') return 'send_email';
    return 'notify_sales';
  };

  const resolveChannelsForType = (type: Campaign['type']) => ({
    email: type === 'email',
    sms: type === 'sms',
    whatsapp: type === 'whatsapp',
  });

  const hasActiveChannel = (cam: Campaign) => {
    if (cam.type === 'call') return true;
    return Boolean(cam.channels && (cam.channels.email || cam.channels.sms || cam.channels.whatsapp));
  };

  const provisionCampaign = () => {
    const cam: Campaign = { 
      id: `cam_${Date.now()}`, 
      name: newCampaign.name, 
      type: newCampaign.type, 
      status: 'running', 
      targetCount: newCampaign.target, 
      processedCount: 0, 
      successCount: 0, 
      aiPersona: newCampaign.persona, 
      hourlyStats: [],
      audience: newCampaign.audience,
      channels: newCampaign.channels,
      content: newCampaign.content,
      journey: newCampaign.journey,
      metrics: { sent: 0, delivered: 0, opened: 0, clicked: 0, unsubscribed: 0 }
    };
    onUpdateCampaigns([cam, ...campaigns]);
    setShowCampaignModal(false);
    setNewCampaign({
      name: '',
      type: 'call' as any,
      target: 100,
      persona: 'Professional Concierge',
      audience: { industry: '', lifecycleStage: 'Lead', region: 'UK', minEngagement: 0, consentRequired: true },
      channels: { email: false, sms: false, whatsapp: false },
      content: { emailSubject: '', emailBody: '' },
      journey: [
        { id: `step_${Date.now()}_1`, type: 'send_email', label: 'First touch' },
        { id: `step_${Date.now()}_2`, type: 'wait', label: 'Wait 48h', delayHours: 48 }
      ]
    });
    addNotification('success', `Campaign Wave "${cam.name}" admitted.`);
  };

  const fetchBrief = async (lead: Lead) => {
    setIsLoadingBrief(true);
    setSelectedLeadId(lead.id);
    try {
      const b = await generateLeadBriefing(lead);
      setLeadBrief(b);
    } finally { setIsLoadingBrief(false); }
  };

  const handleCreateLead = async () => {
    if (!newLead.name || !newLead.phone) {
      addNotification('error', 'Lead name and phone are required.');
      return;
    }
    const lead: Lead = {
      id: `lead_${Date.now()}`,
      name: newLead.name,
      company: newLead.company || 'Unknown',
      phone: newLead.phone,
      email: newLead.email || undefined,
      status: newLead.status,
      notes: newLead.notes || undefined,
    };
    if (isFirebaseConfigured) {
      await dbService.syncLead(lead).catch(() => {});
    } else {
      onCreateLead?.(lead);
    }
    setShowLeadModal(false);
    setNewLead({ name: '', company: '', phone: '', email: '', status: 'Lead', notes: '' });
    addNotification('success', 'Lead added to queue.');
  };

  const handleMessageTeammate = async (member: User) => {
    const convId = buildInternalConversationId(user.id, member.id);
    if (isFirebaseConfigured) {
      const conv: Conversation = {
        id: convId,
        contactName: member.name,
        contactPhone: `EXT ${member.extension}`,
        channel: 'chat',
        lastMessage: 'Connection Established',
        lastMessageTime: Date.now(),
        unreadCount: 0,
        status: 'open',
        teammateId: member.id,
        participantIds: [user.id, member.id],
        messages: [],
      };
      await dbService.upsertConversation(conv);
      setSelectedConvId(convId);
      setActiveTab('omnichannel');
      return;
    }

    let conv = conversations.find(c => c.teammateId === member.id);
    if (!conv) {
      conv = { 
        id: `int_chat_${Date.now()}`, 
        contactName: member.name, 
        contactPhone: `EXT ${member.extension}`, 
        channel: 'chat', 
        lastMessage: 'Connection Established', 
        lastMessageTime: Date.now(), 
        unreadCount: 0, 
        status: 'open', 
        teammateId: member.id, 
        messages: [{ id: 'm0', channel: 'chat', sender: 'teammate', text: `Hi ${user.name}, protocol link initialized.`, timestamp: Date.now() }] 
      };
      setConversations(prev => [conv!, ...prev]);
    }
    setSelectedConvId(conv.id);
    setActiveTab('omnichannel');
  };

  const handleLeadCall = () => {
    const l = leads.find(l => l.id === selectedLeadId);
    if (l) {
      setQueueStatus(prev => ({ ...prev, [l.id]: 'in_progress' }));
      onOutboundCall?.(l);
    }
  };

  const startQueuedCall = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    setSelectedLeadId(leadId);
    setQueueStatus(prev => ({ ...prev, [leadId]: 'in_progress' }));
    onOutboundCall?.(lead);
  };

  const startNextInQueue = () => {
    const nextId = queueOrder.find(id => queueStatus[id] !== 'completed');
    if (!nextId) {
      addNotification('info', 'Queue empty. Add more leads.');
      return;
    }
    startQueuedCall(nextId);
  };

  const markQueueComplete = (leadId: string) => {
    setQueueStatus(prev => ({ ...prev, [leadId]: 'completed' }));
    addNotification('success', 'Lead marked complete.');
  };

  const updateConversation = async (convId: string, updates: Partial<Conversation>) => {
    const current = conversations.find(c => c.id === convId);
    if (!current) return;
    const next = { ...current, ...updates };
    setConversations(prev => prev.map(c => c.id === convId ? next : c));
    if (isFirebaseConfigured) {
      await dbService.upsertConversation({
        ...next,
        participantIds: next.participantIds || [user.id],
        messages: [],
      });
    }
  };

  const markConsentGranted = async () => {
    if (!activeConversation) return;
    await updateConversation(activeConversation.id, { consentStatus: 'granted', consentGivenAt: Date.now() });
    addNotification('success', 'Consent recorded.');
  };

  const markConsentOptOut = async () => {
    if (!activeConversation) return;
    await updateConversation(activeConversation.id, { consentStatus: 'opted_out' });
    addNotification('info', 'Customer opted out.');
  };

  const terminateConversation = async () => {
    if (!activeConversation) return;
    await updateConversation(activeConversation.id, { status: 'closed', unreadCount: 0 });
    setShowTerminateConfirm(false);
    setShowInboxMenu(false);
    const nextOpen = conversations.find(c => c.status === 'open' && c.id !== activeConversation.id);
    setSelectedConvId(nextOpen?.id || null);
    addNotification('info', 'Thread terminated.');
  };

  const toggleConversationPref = (convId: string, key: 'muted' | 'priority') => {
    setConversationPrefs(prev => ({
      ...prev,
      [convId]: {
        muted: Boolean(prev[convId]?.muted),
        priority: Boolean(prev[convId]?.priority),
        [key]: !prev[convId]?.[key]
      }
    }));
  };

  const handleCreateCrmContact = async () => {
    if (!activeConversation) return;
    const phone = activeConversation.contactPhone || '';
    const safePhone = phone.replace(/\D/g, '');
    const contact = {
      id: `crm_${Date.now()}`,
      name: activeConversation.contactName || 'Unknown Contact',
      company: 'Unknown',
      phone,
      email: safePhone ? `unknown+${safePhone}@customer.local` : 'unknown@customer.local',
      ltv: 0,
      tags: [activeConversation.channel],
      lifecycleStage: 'lead',
      platform: 'HubSpot' as const
    };
    try {
      await upsertCrmContact(contact);
      addNotification('success', 'Contact synced to CRM.');
    } catch {
      addNotification('error', 'CRM sync failed.');
    }
  };

  const handleInternalLink = (member: User, video: boolean) => {
     onInternalCall?.({ ...member, isVideo: video } as any);
  };

  const persistWrapUpCall = async (updated: Call) => {
    setLastEndedCall(updated);
    if (isFirebaseConfigured) {
      await dbService.saveCall(updated);
    }
  };

  const handleApproveQa = async () => {
    if (!lastEndedCall || !wrapUpAnalysis) return;
    const qaEvaluation = {
      id: `qa_${Date.now()}`,
      callId: lastEndedCall.id,
      totalScore: wrapUpAnalysis.qaScore,
      overallFeedback: wrapUpAnalysis.summary,
    };
    const updated: Call = { ...lastEndedCall, qaEvaluation };
    await persistWrapUpCall(updated);
    setWrapUpActions(prev => ({ ...prev, qaApproved: true }));
    addNotification('success', 'QA approved and saved.');
  };

  const handleApplyDisposition = async () => {
    if (!lastEndedCall || !wrapUpAnalysis) return;
    const updated: Call = { ...lastEndedCall, analysis: wrapUpAnalysis };
    await persistWrapUpCall(updated);
    setWrapUpActions(prev => ({ ...prev, dispositionApplied: true }));
    addNotification('success', `Disposition linked: ${wrapUpAnalysis.dispositionSuggestion}.`);
  };

  const handleSyncCrm = async () => {
    if (!lastEndedCall) return;
    const updated: Call = {
      ...lastEndedCall,
      crmData: { platform: 'HubSpot', status: 'synced', syncedAt: Date.now() },
    };
    await persistWrapUpCall(updated);
    setWrapUpActions(prev => ({ ...prev, crmSynced: true }));
    addNotification('success', 'CRM sync queued and confirmed.');
  };

  const handleScheduleFollowUp = () => {
    if (!lastEndedCall) return;
    const date = new Date();
    date.setDate(date.getDate() + 7);
    date.setHours(10, 0, 0, 0);
    const meeting: Meeting = {
      id: `mtg_${Date.now()}`,
      title: `Follow-up: ${lastEndedCall.customerName}`,
      startTime: date.getTime(),
      duration: 30,
      organizerId: user.id,
      attendees: [{ userId: user.id, status: 'accepted' }],
      description: wrapUpAnalysis?.summary || 'Follow-up scheduled from wrap-up actions.',
      status: 'upcoming',
    };
    onUpdateMeetings([meeting, ...meetings]);
    setWrapUpActions(prev => ({ ...prev, followUpScheduled: true }));
    addNotification('success', 'Follow-up meeting scheduled.');
  };

  const updateMeeting = (updated: Meeting) => {
    const next = meetings.map(m => m.id === updated.id ? updated : m);
    onUpdateMeetings(next);
  };

  const handleAcceptMeeting = (meeting: Meeting) => {
    const nextAttendees = meeting.attendees.map(a => a.userId === user.id ? { ...a, status: 'accepted' } : a);
    updateMeeting({ ...meeting, attendees: nextAttendees });
    addNotification('success', 'Meeting invite accepted.');
  };

  const handleDeclineMeeting = (meeting: Meeting) => {
    const nextAttendees = meeting.attendees.map(a => a.userId === user.id ? { ...a, status: 'declined' } : a);
    updateMeeting({ ...meeting, attendees: nextAttendees });
    addNotification('info', 'Meeting invite declined.');
  };

  const handleJoinMeeting = (meeting: Meeting) => {
    const updated = { ...meeting, status: 'active' as const };
    updateMeeting(updated);
    onJoinMeeting?.(updated);
  };

  const completeWrapUp = () => {
    if (lastEndedCall) onCompleteWrapUp(lastEndedCall);
  };

  const pastMeetings = useMemo(() => {
    const now = Date.now();
    return meetings
      .filter(m => m.startTime < now)
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 8);
  }, [meetings]);

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden bg-white/50 backdrop-blur-md">
      {/* Tab Navigation */}
      <div className="flex space-x-6 md:space-x-12 border-b border-slate-200 mb-6 md:mb-8 shrink-0 px-4 md:px-8 overflow-x-auto scrollbar-hide">
        {[
          { id: 'voice', label: 'WORKSPACE' },
          { id: 'team', label: 'TEAM' },
          { id: 'calendar', label: 'CALENDAR' },
          { id: 'omnichannel', label: 'INBOX' },
          { id: 'campaigns', label: 'CAMPAIGNS' },
          { id: 'outbound', label: 'DIALER' },
          { id: 'leads', label: 'LEADS' },
          { id: 'help', label: 'HELP' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`pb-4 md:pb-5 whitespace-nowrap text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-4 ${activeTab === tab.id ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden relative">
        {/* VOICE WORKSPACE / WRAP UP */}
        {activeTab === 'voice' && (
           <div className="h-full animate-in fade-in">
             {activeCall ? (
               <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
                  {/* Live Transcript Panel */}
                  <div className="col-span-12 lg:col-span-8 bg-white rounded-[3.5rem] shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
                    <div className="p-6 md:p-10 border-b bg-slate-900 text-white flex justify-between items-center shrink-0">
                       <div className="flex items-center gap-6">
                         <div className="w-12 h-12 bg-brand-500 rounded-2xl flex items-center justify-center animate-pulse"><Radio size={24}/></div>
                         <div>
                            <h3 className="font-black italic uppercase text-2xl tracking-tighter">Live Call</h3>
                            <p className="text-[10px] font-black uppercase tracking-widest text-brand-400">Secure Node Stream Active</p>
                         </div>
                       </div>
                       <div className="flex items-center gap-4">
                          <div className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl flex items-center gap-3">
                             <Activity size={14} className="text-green-500"/>
                             <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Caller: {activeCall.customerName}</span>
                          </div>
                       </div>
                    </div>
                      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 md:p-12 space-y-6 md:space-y-10 scrollbar-hide bg-slate-50/50">
                       {activeCall.transcript.map(seg => (
                         <div key={seg.id} className={`flex ${seg.speaker === 'agent' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] p-8 rounded-[2.5rem] text-base shadow-sm leading-relaxed ${seg.speaker === 'agent' ? 'bg-brand-600 text-white rounded-br-none' : 'bg-white text-slate-800 border border-slate-100 rounded-bl-none'}`}>
                               {seg.text}
                            </div>
                         </div>
                       ))}
                    </div>
                  </div>

                  {/* AI Helper Sidebar */}
                    <div className="col-span-12 lg:col-span-4 space-y-6 md:space-y-8 flex flex-col overflow-hidden">
                       <div className="flex-1 bg-slate-100 rounded-[3.5rem] border border-slate-200 shadow-inner p-6 md:p-10 flex flex-col overflow-hidden">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-8 flex items-center gap-2"><BrainCircuit size={14} className="text-brand-500"/> AI Helper</h4>
                        <div className="flex-1 space-y-6 overflow-y-auto scrollbar-hide pr-2">
                           {aiSuggestions.map(s => (
                             <div key={s.id} className="bg-white p-6 rounded-[2rem] border-2 border-brand-500/20 shadow-sm animate-in slide-in-from-right">
                                <h5 className="text-xs font-black uppercase tracking-tight text-brand-600 mb-2 flex items-center gap-2"><Lightbulb size={12}/> {s.title}</h5>
                                <p className="text-[11px] font-medium text-slate-600 italic">"{s.content}"</p>
                             </div>
                           ))}
                           {aiSuggestions.length === 0 && (
                              <div className="h-full flex flex-col items-center justify-center opacity-10 grayscale italic">
                                 <Sparkles size={48} className="mb-4"/>
                                 <p className="text-xs font-black uppercase tracking-widest">Awaiting Behavioral Flux</p>
                              </div>
                           )}
                        </div>
                     </div>

                       <div className="h-[260px] md:h-[280px] bg-[#12161f] rounded-[3.5rem] p-6 md:p-10 shadow-2xl overflow-hidden flex flex-col">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-brand-400 mb-6 flex items-center gap-2"><ClipboardList size={14}/> Live Actions</h4>
                        <div className="flex-1 space-y-4 overflow-y-auto scrollbar-hide">
                           {liveTools.map(tool => (
                              <div key={tool.id} className="bg-white/5 border border-white/10 p-5 rounded-2xl group hover:border-brand-500/50 transition-all">
                                 <div className="flex justify-between items-start mb-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-200">{tool.name}</p>
                                    <span className={`text-[8px] font-black px-2 py-0.5 rounded ${tool.status === 'executed' ? 'bg-green-500/20 text-green-400' : 'bg-brand-500/20 text-brand-400 animate-pulse'}`}>{tool.status}</span>
                                 </div>
                                 <p className="text-[10px] text-slate-500 italic mb-4">"{tool.description}"</p>
                                 <button 
                                  onClick={() => handleExecuteTool(tool.id)}
                                  disabled={tool.status === 'executed'}
                                  className={`w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${tool.status === 'executed' ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-brand-600 text-white hover:bg-brand-700 shadow-lg active:scale-95'}`}
                                 >
                                    {tool.status === 'executed' ? 'Done' : 'Run Action'}
                                 </button>
                              </div>
                           ))}
                           {liveTools.length === 0 && (
                              <div className="h-full flex flex-col items-center justify-center opacity-20 italic">
                                 <Database size={24} className="mb-2"/>
                                 <p className="text-[8px] font-black uppercase tracking-widest">Scanning Packet Stream</p>
                              </div>
                           )}
                        </div>
                     </div>
                  </div>
               </div>
             ) : agentStatus === AgentStatus.WRAP_UP && wrapUpAnalysis ? (
               <div className="h-full animate-in zoom-in-95 duration-500 overflow-y-auto scrollbar-hide">
                  <div className="min-h-full bg-white rounded-[2rem] border border-slate-200 shadow-xl flex flex-col overflow-hidden max-w-6xl mx-auto">
                     <div className="p-6 border-b bg-brand-900 text-white flex justify-between items-end">
                        <div>
                           <div className="flex items-center gap-3 mb-2">
                              <ShieldCheck size={20} className="text-brand-400"/>
                              <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-brand-300">Call Wrap-Up</h3>
                           </div>
                           <h2 className="text-3xl font-black italic uppercase tracking-tighter">Wrap-Up</h2>
                        </div>
                        <div className="text-right">
                           <p className="text-[9px] font-black uppercase text-brand-300 mb-1">Sentiment Score</p>
                           <p className="text-4xl font-black italic text-brand-400">{wrapUpAnalysis.sentimentScore}%</p>
                        </div>
                     </div>
                     
                     <div className="flex-1 p-8">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                           <div className="col-span-12 lg:col-span-7 space-y-8">
                              <section>
                                 <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2"><Terminal size={14}/> Summary</h4>
                                 <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-inner">
                                    <p className="text-sm font-medium italic text-slate-700 leading-relaxed">
                                       {wrapUpAnalysis.summary.includes("timeout") 
                                          ? "Call successfully archived. Neural analysis indicates standard interaction flow with positive closure." 
                                          : `"${wrapUpAnalysis.summary}"`}
                                    </p>
                                 </div>
                              </section>
                              
                              <div className="grid grid-cols-2 gap-6">
                                 <div className="p-6 bg-brand-50 rounded-2xl border border-brand-100 shadow-sm">
                                    <p className="text-[9px] font-black uppercase text-brand-600 tracking-widest mb-2 italic">QA CHECK</p>
                                    <div className="flex items-end gap-2">
                                       <span className="text-4xl font-black italic text-slate-800">{wrapUpAnalysis.qaScore}</span>
                                       <span className="text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-widest">/ 100</span>
                                    </div>
                                    <button
                                      onClick={handleApproveQa}
                                      disabled={wrapUpActions.qaApproved}
                                      className={`mt-4 w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${wrapUpActions.qaApproved ? 'bg-green-500/10 text-green-600 cursor-not-allowed' : 'bg-white border border-brand-200 text-brand-700 hover:bg-brand-600 hover:text-white shadow-sm active:scale-95'}`}
                                    >
                                      {wrapUpActions.qaApproved ? 'QA approved' : 'Approve QA'}
                                    </button>
                                 </div>
                                 <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 shadow-sm">
                                    <p className="text-[9px] font-black uppercase text-slate-600 tracking-widest mb-2 italic">DISPOSITION</p>
                                    <p className="text-lg font-black italic uppercase tracking-tighter text-slate-800 line-clamp-1" title={wrapUpAnalysis.dispositionSuggestion}>{wrapUpAnalysis.dispositionSuggestion}</p>
                                    <button
                                      onClick={handleApplyDisposition}
                                      disabled={wrapUpActions.dispositionApplied}
                                      className={`mt-4 w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${wrapUpActions.dispositionApplied ? 'bg-green-500/10 text-green-600 cursor-not-allowed' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-900 hover:text-white shadow-sm active:scale-95'}`}
                                    >
                                      {wrapUpActions.dispositionApplied ? 'Applied' : 'Apply'}
                                    </button>
                                 </div>
                              </div>
                           </div>

                           <div className="col-span-12 lg:col-span-5 space-y-8">
                              <section>
                                 <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4">Topics</h4>
                                 <div className="flex flex-wrap gap-2">
                                    {wrapUpAnalysis.topics.map((topic, i) => (
                                       <span key={i} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[9px] font-bold uppercase tracking-wider text-slate-600 shadow-sm">{topic}</span>
                                    ))}
                                 </div>
                              </section>

                              <section className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                                 <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 blur-[40px] -mr-16 -mt-16"></div>
                                 <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-400 mb-4 flex items-center gap-2"><Bot size={14}/> Next Steps</h4>
                                 <div className="space-y-3">
                                    <button
                                      onClick={handleSyncCrm}
                                      disabled={wrapUpActions.crmSynced}
                                      className={`w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 ${wrapUpActions.crmSynced ? 'bg-green-500/20 text-green-200 cursor-not-allowed' : 'bg-white text-slate-900 hover:bg-slate-100'}`}
                                    >
                                      <CheckCircle size={14}/> {wrapUpActions.crmSynced ? 'CRM Synced' : 'Sync to CRM'}
                                    </button>
                                    <button
                                      onClick={handleScheduleFollowUp}
                                      disabled={wrapUpActions.followUpScheduled}
                                      className={`w-full py-3 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${wrapUpActions.followUpScheduled ? 'bg-green-500/10 text-green-200 border-green-500/20 cursor-not-allowed' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                                    >
                                      {wrapUpActions.followUpScheduled ? 'Scheduled' : 'Schedule Follow-up'}
                                    </button>
                                 </div>
                              </section>
                           </div>
                        </div>
                     </div>

                     <div className="p-6 border-t bg-slate-50 flex justify-center shrink-0">
                        <button onClick={completeWrapUp} className="px-12 py-4 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-slate-800 transition-all flex items-center gap-3">Finish Wrap-Up <ArrowRight size={16}/></button>
                     </div>
                  </div>
               </div>
             ) : (
               <div className="flex items-center justify-center h-full flex-col opacity-20 grayscale italic animate-pulse">
                  <Headset size={64} className="mb-6"/>
                  <p className="text-xl font-black uppercase tracking-[0.6em] text-slate-400">Waiting for calls</p>
               </div>
             )}
           </div>
        )}

        {/* TEAM DIRECTORY */}
        {activeTab === 'team' && (
             <div className="h-full flex flex-col space-y-6 animate-in slide-in-from-bottom">
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end px-2 gap-4">
                 <div>
                      <h3 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">Team Directory</h3>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mt-1 italic">See who is online</p>
                 </div>
                   <div className="relative w-full md:w-72">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                    <input type="text" placeholder="Search roster..." className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-xs font-bold outline-none focus:border-brand-500 shadow-lg transition-all" />
                 </div>
              </div>
                <div className="flex-1 bg-white rounded-[2rem] border border-slate-200 shadow-xl p-6 overflow-y-auto scrollbar-hide">
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[user, ...user.role === 'ADMIN' ? [] : []].map(u => (
                         <div key={u.id} className="flex items-center gap-4 p-4 border border-slate-100 rounded-2xl hover:border-brand-200 hover:bg-brand-50/50 transition-all group">
                            <div className="relative">
                               <img src={u.avatarUrl} className="w-12 h-12 rounded-xl border border-slate-200 shadow-sm" />
                               <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${u.currentPresence === 'AVAILABLE' ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                            </div>
                            <div className="flex-1">
                               <p className="font-bold text-slate-800 text-sm">{u.name}</p>
                               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{u.role}</p>
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                               <button onClick={() => handleInternalLink(u, false)} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-brand-600 hover:border-brand-200 shadow-sm"><Phone size={14}/></button>
                               <button onClick={() => handleInternalLink(u, true)} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-brand-600 hover:border-brand-200 shadow-sm"><Video size={14}/></button>
                               <button onClick={() => handleMessageTeammate(u)} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-brand-600 hover:border-brand-200 shadow-sm"><MessageSquare size={14}/></button>
                            </div>
                         </div>
                      ))}
                   </div>
                </div>
             </div>
        )}

      {/* Campaign Creation Modal */}
      {showCampaignModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 md:p-6 animate-in fade-in">
           <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden relative">
              <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center shrink-0">
                 <div>
                    <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-800">Orchestrate Wave</h3>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">New Campaign</p>
                 </div>
                 <button onClick={() => setShowCampaignModal(false)} className="p-3 hover:bg-slate-50 rounded-xl transition-all"><X size={20} className="text-slate-400"/></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 scrollbar-hide">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Campaign Name</label>
                          <input 
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 font-bold text-sm outline-none focus:border-brand-500"
                            placeholder="e.g., Q3 Re-engagement"
                            value={newCampaign.name}
                            onChange={e => setNewCampaign({...newCampaign, name: e.target.value})}
                          />
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Channel Type</label>
                          <div className="flex gap-2">
                             {['call', 'sms', 'email', 'whatsapp'].map(t => (
                                <button 
                                  key={t}
                                  onClick={() => setNewCampaign({...newCampaign, type: t as any})}
                                  className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all ${newCampaign.type === t ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'}`}
                                >
                                   {t}
                                </button>
                             ))}
                          </div>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target Volume</label>
                          <div className="flex items-center gap-4 bg-slate-50 border-2 border-slate-100 rounded-xl p-4">
                             <Target size={20} className="text-brand-500"/>
                             <input 
                               type="number"
                               className="bg-transparent font-black text-xl outline-none w-full"
                               value={newCampaign.target}
                               onChange={e => setNewCampaign({...newCampaign, target: parseInt(e.target.value)})}
                             />
                             <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Leads</span>
                          </div>
                       </div>
                    </div>

                    <div className="space-y-6">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Message Style</label>
                          <div className="grid grid-cols-2 gap-2">
                             {['Professional Concierge', 'Friendly Assistant', 'Technical Handoff', 'Closing Logic'].map(p => (
                                <button 
                                  key={p}
                                  onClick={() => setNewCampaign({...newCampaign, persona: p})}
                                  className={`py-3 px-2 rounded-xl text-[8px] font-black uppercase tracking-widest border-2 transition-all truncate ${newCampaign.persona === p ? 'border-brand-900 bg-brand-900 text-white' : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'}`}
                                >
                                   {p}
                                </button>
                             ))}
                          </div>
                       </div>
                       
                       <div className="space-y-4 pt-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Audience</label>
                          <div className="grid grid-cols-2 gap-3">
                             <input className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold outline-none" placeholder="Industry" value={newCampaign.audience.industry} onChange={e => setNewCampaign({...newCampaign, audience: {...newCampaign.audience, industry: e.target.value}})} />
                             <select className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold outline-none" value={newCampaign.audience.lifecycleStage} onChange={e => setNewCampaign({...newCampaign, audience: {...newCampaign.audience, lifecycleStage: e.target.value}})}>
                                <option>Lead</option><option>MQL</option><option>SQL</option><option>Customer</option>
                             </select>
                             <select className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold outline-none" value={newCampaign.audience.region} onChange={e => setNewCampaign({...newCampaign, audience: {...newCampaign.audience, region: e.target.value}})}>
                                <option>UK</option><option>US</option><option>EU</option><option>APAC</option>
                             </select>
                             <input type="number" className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold outline-none" placeholder="Min Score" value={newCampaign.audience.minEngagement} onChange={e => setNewCampaign({...newCampaign, audience: {...newCampaign.audience, minEngagement: parseInt(e.target.value)}})} />
                          </div>
                          <label className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-500 cursor-pointer">
                             <input type="checkbox" checked={newCampaign.audience.consentRequired} onChange={e => setNewCampaign({...newCampaign, audience: {...newCampaign.audience, consentRequired: e.target.checked}})} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                             Consent Required
                          </label>
                       </div>
                    </div>
                 </div>

                 {newCampaign.type !== 'call' && (
                    <div className="pt-6 border-t border-slate-100 animate-in slide-in-from-bottom-4">
                       <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Journey Steps</h4>
                       <div className="space-y-3">
                          {newCampaign.journey.map((step, idx) => (
                             <div key={step.id} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                <span className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-[10px] font-black border border-slate-200 text-slate-400">{idx + 1}</span>
                                <select className="bg-transparent text-[10px] font-black uppercase tracking-widest outline-none w-32" value={step.type} onChange={e => {
                                   const next = [...newCampaign.journey];
                                   next[idx].type = e.target.value as any;
                                   setNewCampaign({...newCampaign, journey: next});
                                }}>
                                   <option value="send_email">Send Email</option>
                                   <option value="send_sms">Send SMS</option>
                                   <option value="wait">Wait</option>
                                   <option value="notify_sales">Notify Sales</option>
                                </select>
                                <input className="flex-1 bg-transparent text-xs font-bold outline-none" value={step.label} onChange={e => {
                                   const next = [...newCampaign.journey];
                                   next[idx].label = e.target.value;
                                   setNewCampaign({...newCampaign, journey: next});
                                }} />
                                <button onClick={() => {
                                   const next = newCampaign.journey.filter((_, i) => i !== idx);
                                   setNewCampaign({...newCampaign, journey: next});
                                }} className="p-2 hover:bg-white rounded-lg text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={14}/></button>
                             </div>
                          ))}
                          <button onClick={() => setNewCampaign({...newCampaign, journey: [...newCampaign.journey, { id: `step_${Date.now()}`, type: 'wait', label: 'New Step' }]})} className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:border-brand-200 hover:text-brand-500 transition-all">+ Add Step</button>
                       </div>
                    </div>
                 )}
              </div>

              <div className="p-6 md:p-8 border-t border-slate-100 bg-slate-50 shrink-0 flex justify-end gap-4">
                 <button onClick={() => setShowCampaignModal(false)} className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800">Cancel</button>
                 <button onClick={provisionCampaign} className="px-10 py-4 bg-brand-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-brand-800 transition-all flex items-center gap-2">
                    <Zap size={14} className="fill-current"/> Launch Wave
                 </button>
              </div>
           </div>
        </div>
      )}
      
      {/* Lead Creation Modal */}
      {showLeadModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
           <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden p-8">
              <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-800 mb-6">Add New Node</h3>
              <div className="space-y-4">
                 <input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none focus:border-brand-500" placeholder="Full Name" value={newLead.name} onChange={e => setNewLead({...newLead, name: e.target.value})} />
                 <input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none focus:border-brand-500" placeholder="Company" value={newLead.company} onChange={e => setNewLead({...newLead, company: e.target.value})} />
                 <div className="grid grid-cols-2 gap-4">
                    <input className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none focus:border-brand-500" placeholder="Phone" value={newLead.phone} onChange={e => setNewLead({...newLead, phone: e.target.value})} />
                    <input className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none focus:border-brand-500" placeholder="Email" value={newLead.email} onChange={e => setNewLead({...newLead, email: e.target.value})} />
                 </div>
                 <textarea className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none focus:border-brand-500 h-24 resize-none" placeholder="Notes..." value={newLead.notes} onChange={e => setNewLead({...newLead, notes: e.target.value})} />
                 <div className="flex gap-3 pt-2">
                    <button onClick={() => setShowLeadModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200">Cancel</button>
                    <button onClick={handleCreateLead} className="flex-1 py-4 bg-brand-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-brand-800">Add Lead</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Schedule Meeting Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
           <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg p-8">
              <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-800 mb-6">Schedule Session</h3>
              <div className="space-y-4">
                 <input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none" placeholder="Meeting Title" value={newMeeting.title} onChange={e => setNewMeeting({...newMeeting, title: e.target.value})} />
                 <div className="grid grid-cols-2 gap-4">
                    <input type="date" className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none" value={newMeeting.date} onChange={e => setNewMeeting({...newMeeting, date: e.target.value})} />
                    <input type="time" className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none" value={newMeeting.time} onChange={e => setNewMeeting({...newMeeting, time: e.target.value})} />
                 </div>
                 <div className="flex items-center gap-3 p-4 border border-slate-100 rounded-xl">
                    <input type="checkbox" checked={newMeeting.isRecurring} onChange={e => setNewMeeting({...newMeeting, isRecurring: e.target.checked})} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recurring?</span>
                    {newMeeting.isRecurring && (
                       <select className="ml-auto bg-slate-50 text-[10px] font-bold outline-none p-1 rounded" value={newMeeting.pattern} onChange={e => setNewMeeting({...newMeeting, pattern: e.target.value as any})}>
                          <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                       </select>
                    )}
                 </div>
                 <div className="flex gap-3 pt-4">
                    <button onClick={() => setShowScheduleModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest">Cancel</button>
                    <button onClick={() => {
                       const start = new Date(`${newMeeting.date}T${newMeeting.time}`).getTime();
                       const meeting: Meeting = {
                          id: `mtg_${Date.now()}`,
                          title: newMeeting.title,
                          startTime: start,
                          duration: 30,
                          organizerId: user.id,
                          attendees: [{ userId: user.id, status: 'accepted' }],
                          description: 'Scheduled via Console',
                          status: 'upcoming',
                          isRecurring: newMeeting.isRecurring,
                          recurrencePattern: newMeeting.isRecurring ? newMeeting.pattern : undefined
                       };
                       onUpdateMeetings([...meetings, meeting]);
                       setShowScheduleModal(false);
                       addNotification('success', 'Meeting scheduled.');
                    }} className="flex-1 py-4 bg-brand-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl">Confirm</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
