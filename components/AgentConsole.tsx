import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Activity, Sparkles, Target, ChevronRight, Phone, Zap, Info, MessageSquare, Send, Mail, Briefcase, 
  X, Plus, ClipboardCheck, User as UserIcon, Radio, Search, Filter, ArrowRight, BarChart3,
  TrendingUp, Users, Clock, DollarSign, Globe, Headset, BrainCircuit, Wand2, Lightbulb,
  CheckCircle, MoreHorizontal, Bot, MessageCircle, PhoneOutgoing, UserPlus, RefreshCw, Calendar as CalendarIcon, Video,
  Repeat, ChevronLeft, LayoutGrid, CalendarDays, Lock, Trash2, Share2, HelpCircle, Paperclip, FileText, PhoneOff, ArrowDown,
  ShieldCheck, Terminal, Download, ClipboardList, Database, FileJson, CheckCircle2,
  ExternalLink, Layers, Eye, Settings, VideoOff, MoreVertical
} from 'lucide-react';
import { Call, CallStatus, TranscriptSegment, AppSettings, Notification, Lead, User, AiSuggestion, AgentStatus, Message, CallAnalysis, CrmContact, Campaign, Conversation, Meeting, ToolAction, Attachment, Role } from '../types';
import { generateLeadBriefing, generateAiDraft, analyzeCallTranscript, extractToolActions, generateCampaignDraft, enrichLead, generateHelpAnswer } from '../services/geminiService';
import { upsertCrmContact, fetchCrmContacts, fetchCrmDeals, createCrmTask } from '../services/crmService';
import { updateCall as updateCallLog } from '../services/callLogService';
import * as dbService from '../services/dbService';
import { buildInternalConversationId } from '../utils/chat';
import { buildIdentityKey, normalizeEmail, normalizeName } from '../utils/identity';

interface AgentConsoleProps {
  activeCall: Call | null;
  agentStatus: AgentStatus;
  onCompleteWrapUp: (finalCall: Call) => void;
  onEndActiveCall?: () => void;
  settings: AppSettings;
  addNotification: (type: Notification['type'], message: string, action?: Notification['action']) => void;
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
  chatHealth?: { chatHealthy: boolean; callsHealthy?: boolean; offline?: boolean; lastError?: string };
  focusInboxRequest?: { conversationId: string; at: number } | null;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); 
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const getConsentFramework = (jurisdiction: AppSettings['compliance']['jurisdiction']) => {
  if (jurisdiction === 'EU' || jurisdiction === 'UK') return 'GDPR';
  if (jurisdiction === 'US') return 'US Privacy';
  return 'NDPA';
};
const getConsentText = (jurisdiction: AppSettings['compliance']['jurisdiction']) => {
  if (jurisdiction === 'EU' || jurisdiction === 'UK') {
    return 'By continuing this conversation, you consent to processing of your data in line with GDPR. Reply STOP to opt out.';
  }
  if (jurisdiction === 'US') {
    return 'By continuing this conversation, you consent to processing of your data in line with applicable US privacy regulations. Reply STOP to opt out.';
  }
  return 'By continuing this conversation, you consent to processing of your data in line with Nigeria\'s Data Protection Act (NDPA). Reply STOP to opt out.';
};
const CAMPAIGN_TEMPLATES = [
  {
    id: 'welcome',
    label: 'Welcome',
    subject: 'Welcome to ConnectAI',
    email: 'Hi {{name}},\n\nThanks for your interest in ConnectAI. We help teams modernize calling, messaging, and call intelligence in one workspace.\n\nWould you like a 15-minute overview this week?',
    sms: 'Hi {{name}} — thanks for your interest in ConnectAI. Want a quick 15-min overview this week?',
  },
  {
    id: 'reengage',
    label: 'Re-engage',
    subject: 'Quick check-in',
    email: 'Hi {{name}},\n\nJust checking in on your interest in ConnectAI. We can help your team consolidate call + chat and speed up follow-ups.\n\nIs now a good time to reconnect?',
    sms: 'Hi {{name}}, quick check-in — is now a good time to reconnect about ConnectAI?',
  },
  {
    id: 'event',
    label: 'Event Reminder',
    subject: 'Reminder: ConnectAI session',
    email: 'Hi {{name}},\n\nReminder about your ConnectAI session. If you need to reschedule, just reply with a better time.\n\nSee you soon.',
    sms: 'Reminder: your ConnectAI session. Reply to reschedule if needed.',
  },
];
const SHOW_DEMO_INBOX = (import.meta.env as any).VITE_ENABLE_DEMO_INBOX === 'true';
const DEFAULT_CONVERSATIONS: Conversation[] = SHOW_DEMO_INBOX
  ? [
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
    ]
  : [];

const ROUTING_DEBUG = (import.meta.env as any).VITE_DEBUG_ROUTING === 'true';
const debugRouting = (...args: any[]) => {
  if (ROUTING_DEBUG) console.info('[routing][inbox]', ...args);
};

export const AgentConsole: React.FC<AgentConsoleProps> = ({ 
  activeCall, agentStatus, onCompleteWrapUp, onEndActiveCall, settings, addNotification,
  leads = [], onOutboundCall, onInternalCall, onAddParticipant, history = [],
  campaigns, onUpdateCampaigns, onUpdateCampaign, onCreateLead, meetings, onUpdateMeetings, user, onJoinMeeting, isFirebaseConfigured = false, chatHealth
  , focusInboxRequest
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inboxScrollRef = useRef<HTMLDivElement>(null);
  const inboxNearBottomRef = useRef(true);
  const inboxRenderedMessageCountRef = useRef(0);
  const pendingInboxFocusRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'voice' | 'omnichannel' | 'campaigns' | 'outbound' | 'team' | 'calendar' | 'leads' | 'crm' | 'help'>('voice');
  
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
  const aiCallIntelligenceEnabled = settings.aiCallIntelligence?.enabled !== false;
  const autoCrmWrapUpEnabled = aiCallIntelligenceEnabled && settings.aiCallIntelligence?.autoSyncCrm !== false;
  const autoCrmSyncInFlightRef = useRef<Record<string, boolean>>({});
  const buildWrapUpActionsForCall = useCallback((call?: Call | null) => ({
    qaApproved: false,
    dispositionApplied: false,
    crmSynced: Boolean(call?.crmData?.status === 'synced'),
    followUpScheduled: false,
  }), []);

  // Omnichannel States
  const [conversations, setConversations] = useState<Conversation[]>(DEFAULT_CONVERSATIONS);
  const [messageMap, setMessageMap] = useState<Record<string, Message[]>>({});
  const seededRef = useRef(false);
  const convoLastSeenRef = useRef<Record<string, number>>({});
  const convoRepairRef = useRef<Record<string, boolean>>({});
  const senderNotificationAtRef = useRef<Record<string, number>>({});
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const selectedConvIdRef = useRef<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [aiDraftText, setAiDraftText] = useState<string | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);
  const [showInboxMenu, setShowInboxMenu] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showThreadSettings, setShowThreadSettings] = useState(false);
  const [showTerminateConfirm, setShowTerminateConfirm] = useState(false);
  const [conversationPrefs, setConversationPrefs] = useState<Record<string, { muted: boolean; priority: boolean }>>({});
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

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
  const consentFramework = getConsentFramework(settings.compliance.jurisdiction);
  const consentText = getConsentText(settings.compliance.jurisdiction);
  const teamDirectory = useMemo(() => {
    const seen = new Set<string>();
    return (settings.team || []).filter((member) => {
      const email = (member.email || '').trim().toLowerCase();
      const fallback = `${member.role}:${(member.name || '').trim().toLowerCase()}:${(member.extension || '').trim().toLowerCase()}`;
      const key = email || fallback || member.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [settings.team]);
  const [isCampaignDrafting, setIsCampaignDrafting] = useState(false);
  const [crmContacts, setCrmContacts] = useState<CrmContact[]>([]);
  const [crmDeals, setCrmDeals] = useState<any[]>([]);
  const [crmSearch, setCrmSearch] = useState('');
  const [crmLoading, setCrmLoading] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const [teamViewMode, setTeamViewMode] = useState<'cards' | 'list'>('cards');
  const filteredTeamDirectory = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    if (!q) return teamDirectory;
    return teamDirectory.filter((member) => {
      return (
        member.name.toLowerCase().includes(q) ||
        (member.email || '').toLowerCase().includes(q) ||
        (member.extension || '').toLowerCase().includes(q) ||
        member.role.toLowerCase().includes(q)
      );
    });
  }, [teamDirectory, teamSearch]);

  useEffect(() => {
    if (teamDirectory.length >= 50) setTeamViewMode('list');
  }, [teamDirectory.length]);

  const chatHealthNotifiedRef = useRef(false);

  useEffect(() => {
    if (!activeCall) return;
    if (activeCall.status === CallStatus.ENDED) return;
    setActiveTab('voice');
  }, [activeCall?.id, activeCall?.status]);

  useEffect(() => {
    if (!chatHealth) return;
    if (!chatHealth.chatHealthy) {
      if (!chatHealthNotifiedRef.current) {
        addNotification('error', chatHealth.lastError || 'Chat channel degraded. Messages may not deliver.');
        chatHealthNotifiedRef.current = true;
      }
    } else {
      chatHealthNotifiedRef.current = false;
    }
  }, [chatHealth?.chatHealthy, chatHealth?.lastError]);

  // Calendar States
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [newMeeting, setNewMeeting] = useState({ title: '', attendeeId: '', date: new Date().toISOString().split('T')[0], time: '10:00', isRecurring: false, pattern: 'weekly' as any });

  const activeConversation = conversations.find(c => c.id === selectedConvId);
  const activeMessages = selectedConvId ? (messageMap[selectedConvId] || activeConversation?.messages || []) : (activeConversation?.messages || []);
  const isOwnMessage = (message: Message) =>
    Boolean((message.senderId && message.senderId === user.id) || (!message.senderId && message.sender === 'agent'));

  useEffect(() => {
    selectedConvIdRef.current = selectedConvId;
  }, [selectedConvId]);

  useEffect(() => {
    const conversationId = String(focusInboxRequest?.conversationId || '').trim();
    if (!conversationId) return;
    pendingInboxFocusRef.current = conversationId;
    setActiveTab('omnichannel');
    if (conversations.some((conversation) => conversation.id === conversationId)) {
      setSelectedConvId(conversationId);
      pendingInboxFocusRef.current = null;
    }
  }, [focusInboxRequest?.at, focusInboxRequest?.conversationId, conversations]);

  useEffect(() => {
    const pendingConversationId = pendingInboxFocusRef.current;
    if (!pendingConversationId) return;
    if (!conversations.some((conversation) => conversation.id === pendingConversationId)) return;
    setSelectedConvId(pendingConversationId);
    pendingInboxFocusRef.current = null;
  }, [conversations]);
  const normalizePhone = (value?: string) => (value || '').replace(/\D/g, '');
  const buildMemberIdentityKey = (member?: Partial<User> | null) => buildIdentityKey({
    id: member?.id,
    email: member?.email,
    name: member?.name,
  });
  const buildCanonicalThreadId = (left?: Partial<User> | null, right?: Partial<User> | null) =>
    buildInternalConversationId(buildMemberIdentityKey(left), buildMemberIdentityKey(right));
  const collectIdsByEmail = (email?: string) => {
    const normalized = normalizeEmail(email);
    if (!normalized) return [] as string[];
    return (settings.team || [])
      .filter((member) => normalizeEmail(member.email) === normalized)
      .map((member) => member.id)
      .filter(Boolean);
  };
  const collectIdsByName = (name?: string) => {
    const normalized = normalizeName(name);
    if (!normalized) return [] as string[];
    return (settings.team || [])
      .filter((member) => normalizeName(member.name) === normalized)
      .map((member) => member.id)
      .filter(Boolean);
  };
  const collectEmailsByName = (name?: string) => {
    const normalized = normalizeName(name);
    if (!normalized) return [] as string[];
    return Array.from(new Set(
      (settings.team || [])
        .filter((member) => normalizeName(member.name) === normalized)
        .map((member) => normalizeEmail(member.email))
        .filter(Boolean)
    ));
  };
  const collectIdentityKeysByName = (name?: string) => {
    const normalized = normalizeName(name);
    if (!normalized) return [] as string[];
    return Array.from(new Set(
      (settings.team || [])
        .filter((member) => normalizeName(member.name) === normalized)
        .map((member) => buildMemberIdentityKey(member))
        .filter((key) => key && key !== 'unknown')
    ));
  };
  const resolveTeammate = (member?: Partial<User> | null) => {
    if (!member) return null;
    const normalizedMemberEmail = normalizeEmail(member.email);
    const normalizedMemberName = normalizeName(member.name);
    const team = settings.team || [];
    return (
      team.find((candidate) => candidate.id === member.id && normalizeEmail(candidate.email)) ||
      (normalizedMemberEmail ? team.find((candidate) => normalizeEmail(candidate.email) === normalizedMemberEmail) : undefined) ||
      (normalizedMemberName ? team.find((candidate) => normalizeName(candidate.name) === normalizedMemberName && normalizeEmail(candidate.email)) : undefined) ||
      team.find((candidate) => candidate.id === member.id) ||
      (normalizedMemberName ? team.find((candidate) => normalizeName(candidate.name) === normalizedMemberName) : undefined) ||
      (member as User)
    );
  };
  const resolveMemberByIdentityKey = (identityKey?: string | null): User | undefined => {
    const raw = String(identityKey || '').trim();
    if (!raw) return undefined;
    if (raw.startsWith('email:')) {
      const email = normalizeEmail(raw.slice(6));
      return (settings.team || []).find((member) => normalizeEmail(member.email) === email);
    }
    if (raw.startsWith('id:')) {
      const id = raw.slice(3).trim();
      return (settings.team || []).find((member) => member.id === id);
    }
    if (raw.startsWith('name:')) {
      const key = normalizeName(raw.slice(5));
      return (settings.team || []).find((member) => normalizeName(member.name) === key);
    }
    return undefined;
  };
  const getConversationIdentityKeySet = (conversation?: Conversation | null) => {
    const identityKeys = Array.isArray(conversation?.participantIdentityKeys) ? conversation!.participantIdentityKeys! : [];
    const emails = Array.isArray(conversation?.participantEmails) ? conversation!.participantEmails! : [];
    const ids = Array.isArray(conversation?.participantIds) ? conversation!.participantIds! : [];
    const nameKey = normalizeName(conversation?.contactName);
    const set = new Set<string>();
    identityKeys.forEach((key) => {
      const value = String(key || '').trim();
      if (value) set.add(value);
    });
    emails.map((email) => normalizeEmail(email)).filter(Boolean).forEach((email) => set.add(`email:${email}`));
    ids.filter(Boolean).forEach((id) => set.add(`id:${id}`));
    if (conversation?.teammateId) set.add(`id:${conversation.teammateId}`);
    if (nameKey) set.add(`name:${nameKey}`);
    return set;
  };
  const getPeerIdentityCandidates = (conversation?: Conversation | null) => {
    const myIdentityKey = buildMemberIdentityKey(user);
    const myEmail = normalizeEmail(user.email);
    const myNameKey = normalizeName(user.name);
    const myIdToken = `id:${user.id}`;
    const peerKeys = Array.from(getConversationIdentityKeySet(conversation)).filter((key) => (
      key !== myIdentityKey &&
      key !== myIdToken &&
      key !== `email:${myEmail}` &&
      key !== `name:${myNameKey}`
    ));
    return peerKeys;
  };
  const findAliasThreadIdsForPeer = (peerIdentityCandidates: string[]) => {
    if (!peerIdentityCandidates.length) return [] as string[];
    const myIdentityKey = buildMemberIdentityKey(user);
    const myEmail = normalizeEmail(user.email);
    return conversations
      .filter((conversation) => {
        if (conversation.channel !== 'chat') return false;
        const identitySet = getConversationIdentityKeySet(conversation);
        const hasMe = identitySet.has(myIdentityKey) || identitySet.has(`id:${user.id}`) || (myEmail ? identitySet.has(`email:${myEmail}`) : false);
        if (!hasMe) return false;
        return peerIdentityCandidates.some((key) => identitySet.has(key));
      })
      .map((conversation) => conversation.id)
      .filter(Boolean);
  };
  const getConversationPeerKey = (conversation?: Conversation | null) => {
    if (!conversation) return '';
    if (conversation.channel !== 'chat') return `${conversation.channel}:${conversation.id}`;
    const myIdentityKey = buildMemberIdentityKey(user);
    const myEmail = normalizeEmail(user.email);
    const myName = normalizeName(user.name);
    const candidateIdentityKeys = (conversation.participantIdentityKeys || [])
      .map((key) => String(key || '').trim())
      .filter(Boolean)
      .filter((key) => (
        key !== myIdentityKey &&
        key !== `id:${user.id}` &&
        (!myEmail || key !== `email:${myEmail}`) &&
        key !== `name:${myName}`
      ));
    if (candidateIdentityKeys.length) {
      return `peer:${candidateIdentityKeys.sort()[0]}`;
    }
    if (conversation.teammateId && conversation.teammateId !== user.id) return `peer:id:${conversation.teammateId}`;
    const peerEmail = (conversation.participantEmails || []).map(normalizeEmail).find((email) => email && email !== myEmail);
    if (peerEmail) return `peer:email:${peerEmail}`;
    const peerName = normalizeName(conversation.contactName);
    if (peerName && peerName !== myName) return `peer:name:${peerName}`;
    return `conv:${conversation.id}`;
  };
  const normalizeConversationForUser = (conversation: Conversation): Conversation => {
    const participantIds = Array.from(new Set(conversation.participantIds || []));
    const participantEmails = Array.from(new Set((conversation.participantEmails || []).map(normalizeEmail).filter(Boolean)));
    const participantIdentityKeys = Array.from(
      new Set((conversation.participantIdentityKeys || []).map((key) => String(key || '').trim()).filter(Boolean))
    );
    const myIdentityKey = buildMemberIdentityKey(user);
    const myEmail = normalizeEmail(user.email);
    const otherEmail = participantEmails.find((email) => email !== myEmail);
    const memberByEmail = otherEmail
      ? (settings.team || []).find((member) => normalizeEmail(member.email) === otherEmail)
      : undefined;
    const otherId = participantIds.find((id) => id !== user.id);
    const memberById = otherId ? (settings.team || []).find((member) => member.id === otherId) : undefined;
    const peerIdentity = participantIdentityKeys.find((key) => key !== myIdentityKey && key !== `id:${user.id}` && key !== `email:${myEmail}`);
    const memberByIdentity = peerIdentity ? resolveMemberByIdentityKey(peerIdentity) : undefined;
    const peer = memberByIdentity || memberByEmail || memberById;
    if (!peer) {
      const fallbackName = normalizeName(conversation.contactName) === normalizeName(user.name) && conversation.lastSenderName && conversation.lastSenderId !== user.id
        ? conversation.lastSenderName
        : conversation.contactName;
      return { ...conversation, contactName: fallbackName, participantIds, participantEmails, participantIdentityKeys };
    }
    return {
      ...conversation,
      contactName: peer.name || conversation.contactName,
      contactPhone: peer.extension ? `EXT ${peer.extension}` : conversation.contactPhone,
      teammateId: peer.id,
      participantIds,
      participantEmails,
      participantIdentityKeys,
    };
  };
  const inboxConversations = useMemo(() => {
    const grouped = new Map<string, Conversation>();
    conversations.forEach((conversation) => {
      const key = getConversationPeerKey(conversation);
      const existing = grouped.get(key);
      if (!existing || (conversation.lastMessageTime || 0) > (existing.lastMessageTime || 0)) {
        grouped.set(key, conversation);
      }
    });
    return Array.from(grouped.values())
      .sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
  }, [conversations, user.id, user.email, user.name]);
  const selectedConversationPeerKey = getConversationPeerKey(activeConversation);
  const unreadInboxCount = inboxConversations.filter((conversation) => conversation.unreadCount > 0).length;
  const selectInboxConversation = (conversation: Conversation) => {
    setSelectedConvId(conversation.id);
    convoLastSeenRef.current[conversation.id] = Math.max(
      convoLastSeenRef.current[conversation.id] || 0,
      conversation.lastMessageTime || 0
    );
  };

  const refreshCrmData = async () => {
    setCrmLoading(true);
    try {
      const [contacts, deals] = await Promise.all([fetchCrmContacts(), fetchCrmDeals()]);
      setCrmContacts(contacts || []);
      setCrmDeals(deals || []);
    } finally {
      setCrmLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'crm') return;
    refreshCrmData().catch(() => {});
  }, [activeTab]);

  useEffect(() => {
    if (!activeCall) return;
    refreshCrmData().catch(() => {});
  }, [activeCall?.id]);

  const matchedCrmContact = useMemo(() => {
    if (!activeCall) return null;
    const candidate = normalizePhone(activeCall.phoneNumber || activeCall.customerExtension || '');
    if (!candidate) return null;
    return crmContacts.find((c) => normalizePhone(c.phone).endsWith(candidate) || candidate.endsWith(normalizePhone(c.phone))) || null;
  }, [activeCall?.id, activeCall?.phoneNumber, activeCall?.customerExtension, crmContacts]);

  const relatedDealsForMatched = useMemo(() => {
    if (!matchedCrmContact) return [];
    const email = (matchedCrmContact.email || '').toLowerCase();
    const company = (matchedCrmContact.company || '').toLowerCase();
    return crmDeals.filter((deal) => {
      const raw = deal?.raw || {};
      const props = raw?.properties || {};
      const haystack = JSON.stringify(props).toLowerCase();
      return (email && haystack.includes(email)) || (company && haystack.includes(company));
    }).slice(0, 5);
  }, [matchedCrmContact, crmDeals]);

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
    const normalizedUserEmail = (user.email || '').trim().toLowerCase();
    const unsubscribe = dbService.fetchConversations(user.id, normalizedUserEmail || undefined, user.name, async (convos) => {
      if (convos.length === 0 && !seededRef.current && DEFAULT_CONVERSATIONS.length > 0) {
        seededRef.current = true;
        await Promise.all(DEFAULT_CONVERSATIONS.map(async (conv) => {
          await dbService.upsertConversation({
            ...conv,
            participantIds: [user.id],
            participantEmails: normalizedUserEmail ? [normalizedUserEmail] : [],
            participantIdentityKeys: [buildMemberIdentityKey(user)].filter((key) => key && key !== 'unknown'),
            participantNameKeys: [normalizeName(user.name)].filter(Boolean),
            messages: [],
          });
          if (conv.messages[0]) {
            await dbService.sendConversationMessage(conv.id, conv.messages[0]);
          }
        }));
        return;
      }
      const sanitizedConversations = SHOW_DEMO_INBOX
        ? convos
        : convos.filter((conversation) => !['c1', 'c2'].includes(conversation.id));
      setConversations(sanitizedConversations.map(normalizeConversationForUser));
      const currentSelected = selectedConvIdRef.current;
      if (currentSelected && sanitizedConversations.some((c) => c.id === currentSelected)) {
        return;
      }
      if (sanitizedConversations[0]) setSelectedConvId(sanitizedConversations[0].id);
    }, (error) => {
      const msg = String(error?.message || '').toLowerCase();
      if (msg.includes('permission')) {
        addNotification('error', 'Realtime chat permissions blocked. Falling back to local inbox.');
        setConversations(DEFAULT_CONVERSATIONS);
      }
    });
    return () => unsubscribe();
  }, [isFirebaseConfigured, user.id, user.email, user.name]);

  useEffect(() => {
    if (!isFirebaseConfigured || !selectedConvId) return;
    const selectedConversation = conversations.find((conversation) => conversation.id === selectedConvId);
    const teammate = resolveTeammate(
      (selectedConversation?.teammateId
        ? (settings.team || []).find((member) => member.id === selectedConversation.teammateId)
        : undefined) ||
      (selectedConversation?.contactName ? { name: selectedConversation.contactName, email: selectedConversation.participantEmails?.find((email) => normalizeEmail(email) !== normalizeEmail(user.email)) } : undefined)
    );
    const canonicalThreadId = selectedConversation?.channel === 'chat'
      ? buildCanonicalThreadId(user, teammate || { id: selectedConversation?.teammateId, name: selectedConversation?.contactName, email: selectedConversation?.participantEmails?.find((email) => normalizeEmail(email) !== normalizeEmail(user.email)) })
      : selectedConvId;
    const peerIdentityCandidates = getPeerIdentityCandidates(selectedConversation || undefined);
    const threadIds = Array.from(new Set([selectedConvId, canonicalThreadId].filter(Boolean)));
    const buckets = new Map<string, Message[]>();
    const emit = () => {
      const dedupe = new Map<string, Message>();
      buckets.forEach((messages) => {
        messages.forEach((message) => {
          const key = `${String(message.id || '').trim()}::${String(message.senderId || '').trim()}::${Number(message.timestamp || 0)}`;
          if (!dedupe.has(key)) dedupe.set(key, message);
        });
      });
      const merged = Array.from(dedupe.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).slice(-500);
      setMessageMap(prev => ({ ...prev, [selectedConvId]: merged }));
    };
    debugRouting('listenConversationMessages', {
      selectedConvId,
      canonicalThreadId,
      peerIdentityCandidates,
      threadIds,
    });
    const unsubscribers = threadIds.map((threadId) =>
      dbService.fetchConversationMessages(threadId, (msgs) => {
        buckets.set(threadId, msgs);
        emit();
      })
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe && unsubscribe());
  }, [isFirebaseConfigured, selectedConvId, conversations, settings.team, user.id, user.email, user.name]);

  useEffect(() => {
    if (!conversations.length) {
      if (selectedConvId) setSelectedConvId(null);
      return;
    }
    if (!selectedConvId || !conversations.some((c) => c.id === selectedConvId)) {
      setSelectedConvId(conversations[0].id);
    }
  }, [conversations, selectedConvId]);

  // Voice + wrap-up transcript scroll logic
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeCall?.transcript, wrapUpAnalysis]);

  useEffect(() => {
    const el = inboxScrollRef.current;
    if (!el) return;
    const updateScrollState = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const nearBottom = distanceFromBottom <= 72;
      inboxNearBottomRef.current = nearBottom;
      setShowJumpToLatest(!nearBottom && activeMessages.length > 0);
    };
    updateScrollState();
    el.addEventListener('scroll', updateScrollState);
    return () => el.removeEventListener('scroll', updateScrollState);
  }, [selectedConvId, activeMessages.length]);

  useEffect(() => {
    inboxRenderedMessageCountRef.current = activeMessages.length;
    const el = inboxScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      inboxNearBottomRef.current = true;
      setShowJumpToLatest(false);
    });
  }, [selectedConvId]);

  useEffect(() => {
    const el = inboxScrollRef.current;
    if (!el) return;
    const previousCount = inboxRenderedMessageCountRef.current;
    const currentCount = activeMessages.length;
    inboxRenderedMessageCountRef.current = currentCount;
    if (currentCount <= previousCount) return;
    const latest = activeMessages[currentCount - 1];
    requestAnimationFrame(() => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const nearBottomNow = distanceFromBottom <= 72;
      const shouldAutoScroll = isOwnMessage(latest) || inboxNearBottomRef.current || nearBottomNow;
      if (shouldAutoScroll) {
        el.scrollTop = el.scrollHeight;
        inboxNearBottomRef.current = true;
        setShowJumpToLatest(false);
      } else {
        setShowJumpToLatest(true);
      }
    });
  }, [activeMessages, selectedConvId]);

  const jumpToLatestMessage = () => {
    const el = inboxScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    inboxNearBottomRef.current = true;
    setShowJumpToLatest(false);
  };

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
      const lastCall = history.find((c) => c.status === CallStatus.ENDED) || history[0];
      if (!lastCall) return;
      setLastEndedCall(lastCall);
      const transcriptLen = lastCall.transcript?.length || 0;
      if (!aiCallIntelligenceEnabled) {
        const disabledAnalysis: CallAnalysis = {
          summary: 'AI call intelligence is disabled by admin policy. Recap, transcript enrichment, and automatic CRM wrap-up are paused.',
          sentimentScore: 50,
          sentimentLabel: 'Neutral',
          topics: ['Policy Disabled'],
          qaScore: 70,
          dispositionSuggestion: 'Manual Review',
        };
        setWrapUpAnalysis(disabledAnalysis);
        setLastEndedCall(prev => prev ? { ...prev, analysis: disabledAnalysis } : prev);
        setWrapUpActions(buildWrapUpActionsForCall(lastCall));
        analyzedRef.current = { id: lastCall.id, len: transcriptLen };
        return;
      }
      if (lastCall.analysis?.summary) {
        setWrapUpAnalysis({
          summary: lastCall.analysis.summary,
          sentimentScore: lastCall.analysis.sentimentScore ?? 50,
          sentimentLabel: lastCall.analysis.sentimentLabel ?? 'Neutral',
          topics: lastCall.analysis.topics?.length ? lastCall.analysis.topics : ['Call Review'],
          qaScore: lastCall.analysis.qaScore ?? 75,
          dispositionSuggestion: lastCall.analysis.dispositionSuggestion || 'Follow-up Needed',
        });
        setWrapUpActions(buildWrapUpActionsForCall(lastCall));
        analyzedRef.current = { id: lastCall.id, len: transcriptLen };
        return;
      }
      if (transcriptLen === 0) {
        const fallback: CallAnalysis = {
          summary: `Call with ${lastCall.customerName || lastCall.phoneNumber || 'customer'} ended after ${Math.max(0, Math.floor(lastCall.durationSeconds || 0))}s. Transcript unavailable; review recording and disposition.`,
          sentimentScore: 50,
          sentimentLabel: 'Neutral',
          topics: ['Wrap-Up'],
          qaScore: 72,
          dispositionSuggestion: 'Follow-up Needed',
        };
        setWrapUpAnalysis(fallback);
        setLastEndedCall(prev => prev ? { ...prev, analysis: fallback } : prev);
        setWrapUpActions(buildWrapUpActionsForCall(lastCall));
        analyzedRef.current = { id: lastCall.id, len: transcriptLen };
        return;
      }
      if (analyzedRef.current.id === lastCall.id && analyzedRef.current.len === transcriptLen) return;
      setIsAnalyzing(true);
      analyzeCallTranscript(lastCall.transcript)
        .then((analysis) => {
          analyzedRef.current = { id: lastCall.id, len: transcriptLen };
          setWrapUpAnalysis(analysis);
          setLastEndedCall(prev => prev ? { ...prev, analysis } : prev);
          setWrapUpActions(buildWrapUpActionsForCall(lastCall));
        })
        .finally(() => setIsAnalyzing(false));
    } else if (agentStatus !== AgentStatus.WRAP_UP) {
      setWrapUpAnalysis(null);
      setLastEndedCall(null);
      analyzedRef.current = { id: null, len: 0 };
      setWrapUpActions(buildWrapUpActionsForCall());
    }
  }, [agentStatus, history, isAnalyzing, aiCallIntelligenceEnabled, buildWrapUpActionsForCall]);

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
    const timestamp = Date.now();
    const msg: Message = {
      id: `m_${timestamp}_${Math.random().toString(36).slice(2, 9)}`,
      channel: activeConversation?.channel || 'chat',
      sender: 'agent',
      senderId: user.id,
      text,
      timestamp,
      attachments: files,
    };
    const teammate = resolveTeammate(
      (activeConversation?.teammateId
        ? (settings.team || []).find((member) => member.id === activeConversation.teammateId)
        : undefined) ||
      (activeConversation?.contactName ? { name: activeConversation.contactName } as Partial<User> : undefined)
    );
    const teammateName = teammate?.name || activeConversation?.contactName || 'Teammate';
    const fallbackTeammate: Partial<User> = {
      id: teammate?.id || activeConversation?.teammateId,
      email: teammate?.email || (activeConversation?.participantEmails || []).find((email) => normalizeEmail(email) !== normalizeEmail(user.email)),
      name: teammateName,
      extension: teammate?.extension,
    };
    const participantNameKeys = Array.from(new Set([
      ...(activeConversation?.participantNameKeys || []),
      normalizeName(user.name),
      normalizeName(teammateName),
      normalizeName(activeConversation?.contactName),
    ].filter(Boolean)));
    const participantIds = Array.from(new Set([
      ...(activeConversation?.participantIds || []),
      user.id,
      ...(teammate?.id ? [teammate.id] : []),
      ...collectIdsByEmail(user.email),
      ...collectIdsByEmail(teammate?.email),
      ...collectIdsByName(user.name),
      ...collectIdsByName(teammateName),
    ].filter(Boolean)));
    const participantEmails = Array.from(new Set([
      ...(activeConversation?.participantEmails || []),
      normalizeEmail(user.email),
      normalizeEmail(teammate?.email || fallbackTeammate.email),
      ...collectEmailsByName(teammateName),
      ...collectEmailsByName(user.name),
    ].filter(Boolean)));
    const participantIdentityKeys = Array.from(new Set([
      ...(activeConversation?.participantIdentityKeys || []),
      buildMemberIdentityKey(user),
      buildMemberIdentityKey(teammate || fallbackTeammate),
      ...participantIds.map((id) => `id:${id}`),
      ...participantEmails.map((email) => `email:${email}`),
      ...participantNameKeys.map((name) => `name:${name}`),
      ...collectIdentityKeysByName(teammateName),
      ...collectIdentityKeysByName(user.name),
    ].filter((key) => key && key !== 'unknown')));
    const canonicalThreadId = buildCanonicalThreadId(user, teammate || fallbackTeammate);
    const peerIdentityCandidates = getPeerIdentityCandidates(activeConversation || undefined);
    const writeThreadId = canonicalThreadId || selectedConvId;
    const routeThreadIds = Array.from(new Set([
      writeThreadId,
      selectedConvId,
    ].filter(Boolean)));
    debugRouting('handleSendMessage', {
      selectedConvId,
      canonicalThreadId,
      writeThreadId,
      peerIdentityCandidates,
      routeThreadIds,
      participantIdentityKeys,
      senderIdentity: buildMemberIdentityKey(user),
      targetIdentity: buildMemberIdentityKey(teammate || fallbackTeammate),
    });
    const optimisticMessageId = msg.id;
    setMessageMap(prev => ({
      ...prev,
      [selectedConvId]: [...(prev[selectedConvId] || activeConversation?.messages || []), msg].slice(-250),
    }));
    setConversations(prev => prev.map(c => c.id === selectedConvId
      ? {
          ...c,
          messages: [...(c.messages || []), msg].slice(-250),
          lastMessage: text || "Attachment Packet",
          lastMessageTime: msg.timestamp,
          lastSenderId: user.id,
          lastSenderName: user.name,
          participantIds,
          participantEmails,
          participantIdentityKeys,
          participantNameKeys,
          aliases: Array.from(new Set([...(c.aliases || []), ...routeThreadIds])),
        }
      : c));
    const metadataPayload = {
      participantIds,
      participantEmails,
      participantIdentityKeys,
      participantNameKeys,
      teammateId: teammate?.id || activeConversation?.teammateId,
      contactName: teammateName,
      contactPhone: teammate?.extension ? `EXT ${teammate.extension}` : activeConversation?.contactPhone,
      lastSenderName: user.name,
      messages: [...(activeConversation?.messages || []), msg].slice(-250),
      aliases: routeThreadIds,
      bootstrapSent: activeConversation?.bootstrapSent,
      bootstrapSentAt: activeConversation?.bootstrapSentAt,
    };
    const sendAll = async () => {
      if (!isFirebaseConfigured) return { ok: true };
      const sendThreadIds = Array.from(new Set([writeThreadId, selectedConvId].filter(Boolean)));
      const results = await Promise.all(sendThreadIds.map((threadId) =>
        dbService.sendConversationMessage(threadId, msg, metadataPayload)
      ));
      const failure = results.find((result: any) => !result?.ok);
      if (failure) throw new Error((failure as any)?.error || 'Message failed to send');
      if (activeConversation?.channel === 'chat') {
        await Promise.all(routeThreadIds.map((threadId) =>
          dbService.upsertConversation({
            participantIds,
            participantEmails,
            participantIdentityKeys,
            participantNameKeys,
            teammateId: teammate?.id || activeConversation?.teammateId,
            contactName: teammateName,
            contactPhone: teammate?.extension ? `EXT ${teammate.extension}` : activeConversation?.contactPhone,
            messages: [],
            id: threadId,
            channel: activeConversation.channel,
            lastMessage: text || "Attachment Packet",
            lastMessageTime: msg.timestamp,
            lastSenderId: user.id,
            lastSenderName: user.name,
            unreadCount: activeConversation.unreadCount || 0,
            status: activeConversation.status || 'open',
            aliases: routeThreadIds,
            bootstrapSent: activeConversation.bootstrapSent,
            bootstrapSentAt: activeConversation.bootstrapSentAt,
          })
        ));
      }
    };
    sendAll().catch((error: any) => {
      addNotification('error', error?.message || 'Message failed to deliver.');
      debugRouting('handleSendMessage.fail', { error: String(error?.message || error), writeThreadId, routeThreadIds });
      setMessageMap(prev => {
        const next = { ...prev };
        next[selectedConvId] = (prev[selectedConvId] || activeConversation?.messages || []).filter((m) => m.id !== optimisticMessageId);
        return next;
      });
      setConversations(prev => prev.map((c) => {
        if (c.id !== selectedConvId) return c;
        const filtered = (c.messages || []).filter((m) => m.id !== optimisticMessageId);
        return { ...c, messages: filtered };
      }));
    });
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
      answer: 'Open Leads, paste/upload CSV, map columns, preview, then Import. You can AI-enrich before importing.',
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
    const resolvedMember = resolveTeammate(member) || member;
    const teammateName = resolvedMember.name || member.name;
    const teammateIdentityKey = buildMemberIdentityKey(resolvedMember);
    const convId = buildCanonicalThreadId(user, resolvedMember);
    const resolvedTeammateEmail = normalizeEmail(resolvedMember.email || member.email);
    const existingConversation = conversations.find((conversation) => {
      if (conversation.channel !== 'chat') return false;
      if (conversation.id === convId) return true;
      if (resolvedMember.id && conversation.teammateId === resolvedMember.id) return true;
      if (resolvedTeammateEmail) {
        const participantEmails = (conversation.participantEmails || []).map(normalizeEmail);
        if (participantEmails.includes(resolvedTeammateEmail)) return true;
      }
      return false;
    });
    const participantNameKeys = Array.from(new Set([
      normalizeName(user.name),
      normalizeName(teammateName),
    ].filter(Boolean)));
    const participantIds = Array.from(new Set([
      user.id,
      resolvedMember.id || member.id,
      ...collectIdsByEmail(user.email),
      ...collectIdsByEmail(resolvedMember.email || member.email),
      ...collectIdsByName(user.name),
      ...collectIdsByName(teammateName),
    ].filter(Boolean)));
    const participantEmails = Array.from(new Set([
      normalizeEmail(user.email),
      normalizeEmail(resolvedMember.email || member.email),
      ...collectEmailsByName(user.name),
      ...collectEmailsByName(teammateName),
    ].filter(Boolean)));
    const participantIdentityKeys = Array.from(new Set([
      buildMemberIdentityKey(user),
      teammateIdentityKey,
      ...participantIds.map((id) => `id:${id}`),
      ...participantEmails.map((email) => `email:${email}`),
      ...participantNameKeys.map((name) => `name:${name}`),
      ...collectIdentityKeysByName(user.name),
      ...collectIdentityKeysByName(teammateName),
    ].filter((key) => key && key !== 'unknown')));
    const introText = `Hi ${user.name}, direct secure thread with ${teammateName} is active.`;
    const bootstrapSeenInAnyConversation = conversations.some((conversation) => {
      if (conversation.channel !== 'chat') return false;
      const textMatch = String(conversation.lastMessage || '').trim() === introText;
      const flagMatch = Boolean(conversation.bootstrapSent || conversation.bootstrapSentAt);
      const embeddedMatch = (conversation.messages || []).some((message) => String(message.text || '').trim() === introText);
      const participantMatch = resolvedTeammateEmail
        ? (conversation.participantEmails || []).map(normalizeEmail).includes(resolvedTeammateEmail)
        : false;
      const contactMatch = normalizeName(conversation.contactName) === normalizeName(teammateName);
      return textMatch || flagMatch || embeddedMatch || participantMatch || contactMatch;
    });
    const bootstrapSeenInMessageMaps = Object.values(messageMap).some((messages) =>
      (messages || []).some((message) => String(message.text || '').trim() === introText)
    );
    const existingMessages = [
      ...(existingConversation?.messages || []),
      ...(messageMap[existingConversation?.id || convId] || []),
      ...(messageMap[convId] || []),
    ];
    const hasIntroMessage = existingMessages.some((message) => String(message.text || '').trim() === introText);
    const bootstrapAlreadySent = Boolean(
      existingConversation?.bootstrapSent ||
      existingConversation?.bootstrapSentAt ||
      bootstrapSeenInAnyConversation ||
      bootstrapSeenInMessageMaps ||
      hasIntroMessage ||
      String(existingConversation?.lastMessage || '').toLowerCase().includes('direct secure thread with')
    );
    const shouldSendBootstrap = !existingConversation && !bootstrapAlreadySent;
    const now = Date.now();
    const bootMessage: Message | null = shouldSendBootstrap
      ? {
          id: `m_boot_${now}`,
          channel: 'chat',
          sender: 'teammate',
          senderId: resolvedMember.id || member.id,
          text: introText,
          timestamp: now,
        }
      : null;
    const routeThreadIds = [convId];
    const seededConversation: Conversation = {
      id: convId,
      contactName: teammateName,
      contactPhone: `EXT ${resolvedMember.extension || member.extension}`,
      channel: 'chat',
      lastMessage: shouldSendBootstrap
        ? 'Connection Established'
        : (existingConversation?.lastMessage || 'Thread Ready'),
      lastMessageTime: shouldSendBootstrap
        ? now
        : (existingConversation?.lastMessageTime || now),
      lastSenderId: shouldSendBootstrap
        ? (resolvedMember.id || member.id)
        : existingConversation?.lastSenderId,
      lastSenderName: shouldSendBootstrap
        ? teammateName
        : existingConversation?.lastSenderName,
      unreadCount: existingConversation?.unreadCount || 0,
      status: existingConversation?.status || 'open',
      teammateId: resolvedMember.id || member.id,
      participantIds,
      participantEmails,
      participantIdentityKeys,
      participantNameKeys,
      messages: bootMessage ? [bootMessage] : (existingConversation?.messages || []),
      aliases: routeThreadIds,
      bootstrapSent: Boolean(existingConversation?.bootstrapSent || shouldSendBootstrap),
      bootstrapSentAt: existingConversation?.bootstrapSentAt || (shouldSendBootstrap ? now : undefined),
    };
    debugRouting('handleMessageTeammate', {
      convId,
      teammateIdentityKey,
      participantIdentityKeys,
      routeThreadIds,
      shouldSendBootstrap,
    });
    setConversations(prev => {
      const existing = prev.find((c) => c.id === convId) || existingConversation;
      const focused = existing
        ? {
            ...existing,
            teammateId: resolvedMember.id || member.id,
            participantIds,
            participantEmails,
            participantIdentityKeys,
            participantNameKeys,
            contactName: teammateName,
            contactPhone: `EXT ${resolvedMember.extension || member.extension}`,
            aliases: routeThreadIds,
            bootstrapSent: Boolean(existing.bootstrapSent || shouldSendBootstrap),
            bootstrapSentAt: existing.bootstrapSentAt || (shouldSendBootstrap ? now : undefined),
            ...(shouldSendBootstrap
              ? {
                  lastMessage: 'Connection Established',
                  lastMessageTime: now,
                  lastSenderId: resolvedMember.id || member.id,
                  lastSenderName: teammateName,
                }
              : {}),
          }
        : seededConversation;
      const rest = prev.filter(c => c.id !== convId);
      return [focused, ...rest];
    });
    if (bootMessage) {
      setMessageMap((prev) => {
        const existingThread = prev[convId] || prev[existingConversation?.id || ''] || [];
        const exists = existingThread.some((message) => String(message.text || '').trim() === introText);
        if (exists) return { ...prev, [convId]: existingThread };
        return { ...prev, [convId]: [...existingThread, bootMessage].slice(-250) };
      });
    } else if (existingConversation?.id && existingConversation.id !== convId) {
      setMessageMap((prev) => ({ ...prev, [convId]: prev[convId] || prev[existingConversation.id] || [] }));
    }
    setActiveTab('omnichannel');
    setSelectedConvId(convId);

    if (isFirebaseConfigured) {
      await Promise.all(
        routeThreadIds.map((threadId) =>
          dbService.upsertConversation({ ...seededConversation, id: threadId, messages: [] })
        )
      );
      if (bootMessage) {
        await dbService.sendConversationMessage(convId, bootMessage, {
          ...seededConversation,
          id: convId,
          messages: [],
          aliases: routeThreadIds,
          bootstrapSent: true,
          bootstrapSentAt: now,
        });
      }
      return;
    }
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
        participantEmails: next.participantEmails || [normalizeEmail(user.email)].filter(Boolean),
        participantIdentityKeys: next.participantIdentityKeys || [buildMemberIdentityKey(user)].filter((key) => key && key !== 'unknown'),
        participantNameKeys: next.participantNameKeys || [normalizeName(user.name)].filter(Boolean),
        aliases: Array.from(new Set([...(next.aliases || []), convId])),
        messages: [],
      });
    }
  };

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    if (conversations.length === 0) return;
    const seen = convoLastSeenRef.current;
    const isInitial = Object.keys(seen).length === 0;
    const nextSeen: Record<string, number> = {};
    const now = Date.now();
    const selectedConversation = conversations.find((conversation) => conversation.id === selectedConvId);
    const selectedPeerKey = activeTab === 'omnichannel' ? getConversationPeerKey(selectedConversation) : '';
    conversations.forEach((conversation) => {
      const lastTime = conversation.lastMessageTime || 0;
      nextSeen[conversation.id] = lastTime;
      if (isInitial) return;
      const previous = seen[conversation.id] || 0;
      const incoming = lastTime > previous && conversation.lastSenderId && conversation.lastSenderId !== user.id;
      if (!incoming) return;
      const peerKey = getConversationPeerKey(conversation);
      if (selectedPeerKey && selectedPeerKey === peerKey) return;
      if ((now - (senderNotificationAtRef.current[peerKey] || 0)) < 12000) return;
      addNotification('info', `New message from ${conversation.contactName}.`, {
        type: 'open-conversation',
        conversationId: conversation.id,
        label: 'Open thread',
      });
      senderNotificationAtRef.current[peerKey] = now;
    });
    convoLastSeenRef.current = nextSeen;
  }, [conversations, isFirebaseConfigured, user.id, activeTab, selectedConvId, addNotification]);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const meEmail = normalizeEmail(user.email);
    const myIdentityKey = buildMemberIdentityKey(user);
    conversations.forEach((conversation) => {
      if (conversation.channel !== 'chat') return;
      if (convoRepairRef.current[conversation.id]) return;
      const teammate = (settings.team || []).find((member) =>
        member.id === conversation.teammateId ||
        normalizeEmail(member.email) === (conversation.participantEmails || []).map(normalizeEmail).find((e) => e && e !== meEmail)
      );
      const peerFallback: Partial<User> = {
        id: teammate?.id || conversation.teammateId,
        email: teammate?.email || (conversation.participantEmails || []).find((email) => normalizeEmail(email) !== meEmail),
        name: teammate?.name || conversation.contactName,
      };
      const canonicalThreadId = buildCanonicalThreadId(user, teammate || peerFallback);
      const participantIds = Array.from(new Set([
        ...(conversation.participantIds || []),
        user.id,
        ...(conversation.teammateId ? [conversation.teammateId] : []),
        ...(teammate?.id ? [teammate.id] : []),
        ...collectIdsByEmail(user.email),
        ...collectIdsByEmail(teammate?.email),
      ].filter(Boolean)));
      const participantEmails = Array.from(new Set([
        ...(conversation.participantEmails || []),
        normalizeEmail(user.email),
        normalizeEmail(teammate?.email),
      ].filter(Boolean)));
      const participantNameKeys = Array.from(new Set([
        ...(conversation.participantNameKeys || []),
        normalizeName(user.name),
        normalizeName(teammate?.name || conversation.contactName),
      ].filter(Boolean)));
      const participantIdentityKeys = Array.from(new Set([
        ...(conversation.participantIdentityKeys || []),
        myIdentityKey,
        buildMemberIdentityKey(teammate || peerFallback),
        ...participantIds.map((id) => `id:${id}`),
        ...participantEmails.map((email) => `email:${email}`),
        ...participantNameKeys.map((name) => `name:${name}`),
        ...collectIdentityKeysByName(user.name),
        ...collectIdentityKeysByName(teammate?.name || conversation.contactName),
      ].filter((key) => key && key !== 'unknown')));
      const hasEmailIdentityCoverage = participantIdentityKeys.some((key) => key.startsWith('email:'));
      const broken =
        !conversation.participantIds?.includes(user.id) ||
        participantIds.length !== (conversation.participantIds || []).length ||
        participantEmails.length !== (conversation.participantEmails || []).filter(Boolean).length ||
        participantNameKeys.length !== (conversation.participantNameKeys || []).filter(Boolean).length ||
        participantIdentityKeys.length !== (conversation.participantIdentityKeys || []).filter(Boolean).length ||
        !hasEmailIdentityCoverage;
      const needsCanonicalMirror = Boolean(canonicalThreadId && canonicalThreadId !== conversation.id);
      if (!broken && !needsCanonicalMirror) return;
      debugRouting('repairConversation', {
        sourceConversationId: conversation.id,
        canonicalThreadId,
        broken,
        needsCanonicalMirror,
        participantIdentityKeys,
      });
      convoRepairRef.current[conversation.id] = true;
      const repairedConversation: Conversation = {
        ...conversation,
        participantIds,
        participantEmails,
        participantIdentityKeys,
        participantNameKeys,
        teammateId: teammate?.id || conversation.teammateId,
        messages: conversation.messages || [],
      };
      dbService.upsertConversation(repairedConversation).catch(() => {
        delete convoRepairRef.current[conversation.id];
      });
      if (needsCanonicalMirror) {
        dbService.upsertConversation({
          ...repairedConversation,
          id: canonicalThreadId,
        }).catch(() => {});
      }
    });
  }, [conversations, isFirebaseConfigured, user.id, user.email, user.name, settings.team]);

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
      refreshCrmData().catch(() => {});
      addNotification('success', 'Contact synced to CRM.');
    } catch {
      addNotification('error', 'CRM sync failed.');
    }
  };

  const handleInternalLink = (member: User, video: boolean) => {
     setActiveTab('voice');
     onInternalCall?.({ ...member, isVideo: video } as any);
  };

  const handleActiveConversationCall = () => {
    if (!activeConversation) return;
    const teammateEmail = (activeConversation.participantEmails || [])
      .map(normalizeEmail)
      .find((email) => email && email !== normalizeEmail(user.email));
    const teammateFromIdentity =
      (activeConversation.participantIdentityKeys || [])
        .map((identityKey) => resolveMemberByIdentityKey(identityKey))
        .find((member) => member && member.id !== user.id) || null;
    const resolvedTeammate = resolveTeammate({
      id: activeConversation.teammateId,
      name: activeConversation.contactName,
      email: teammateEmail,
    }) || teammateFromIdentity;
    if (activeConversation.channel === 'chat' && onInternalCall) {
      const target = resolvedTeammate as User | null;
      const targetEmail = normalizeEmail(target?.email || teammateEmail || '');
      const mappedByEmail = targetEmail
        ? settings.team.find((member) => normalizeEmail(member.email) === targetEmail)
        : null;
      const effectiveTarget = (mappedByEmail || target) as User | null;
      const targetId = String(effectiveTarget?.id || '').trim();
      const missingIdentity = !targetId || targetId.startsWith('peer_');
      if (!effectiveTarget || targetId === user.id || (missingIdentity && !targetEmail)) {
        addNotification('error', 'This thread is not mapped to a real teammate yet. Open from Team roster or run Team Sync.');
        return;
      }
      handleInternalLink({
        ...(effectiveTarget as User),
        email: effectiveTarget?.email || targetEmail,
      }, false);
      return;
    }
    onOutboundCall?.(activeConversation.contactPhone);
  };

  const persistWrapUpCall = async (updated: Call) => {
    setLastEndedCall(updated);
    if (isFirebaseConfigured) {
      await dbService.saveCall(updated);
      return;
    }
    await updateCallLog(updated.id, updated).catch(() => {});
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

  const handleSyncCrm = async (options?: { silent?: boolean; auto?: boolean }) => {
    if (!lastEndedCall) return false;
    if (!aiCallIntelligenceEnabled) {
      if (!options?.silent) addNotification('info', 'AI wrap-up to CRM is disabled in Admin settings.');
      return false;
    }
    if (wrapUpActions.crmSynced || lastEndedCall.crmData?.status === 'synced') {
      return true;
    }
    const platform = settings.integrations.primaryCrm || 'HubSpot';
    const syncedAt = Date.now();
    const updated: Call = {
      ...lastEndedCall,
      crmData: { platform, status: 'synced', syncedAt },
    };
    await persistWrapUpCall(updated);
    await createCrmTask({
      id: `task_wrapup_${lastEndedCall.id}`,
      subject: `AI Wrap-up (${String(lastEndedCall.direction || 'call').toUpperCase()}): ${lastEndedCall.customerName}`,
      status: 'open',
      dueDate: syncedAt + 24 * 60 * 60 * 1000,
      summary: wrapUpAnalysis?.summary || '',
      callId: lastEndedCall.id,
      platform,
      source: options?.auto ? 'ai-wrapup-auto' : 'ai-wrapup-manual',
    });
    refreshCrmData().catch(() => {});
    setWrapUpActions(prev => ({ ...prev, crmSynced: true }));
    if (!options?.silent) {
      addNotification('success', options?.auto ? 'AI wrap-up auto-synced to CRM.' : 'CRM sync queued and confirmed.');
    }
    return true;
  };

  useEffect(() => {
    if (!autoCrmWrapUpEnabled) return;
    if (agentStatus !== AgentStatus.WRAP_UP) return;
    if (!lastEndedCall || !wrapUpAnalysis) return;
    if (wrapUpActions.crmSynced || lastEndedCall.crmData?.status === 'synced') return;
    const callId = String(lastEndedCall.id || '');
    if (!callId) return;
    if (autoCrmSyncInFlightRef.current[callId]) return;
    autoCrmSyncInFlightRef.current[callId] = true;
    handleSyncCrm({ silent: true, auto: true })
      .catch(() => {})
      .finally(() => {
        autoCrmSyncInFlightRef.current[callId] = false;
      });
  }, [autoCrmWrapUpEnabled, agentStatus, lastEndedCall?.id, lastEndedCall?.crmData?.status, wrapUpAnalysis, wrapUpActions.crmSynced]);

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

  const getMeetingLink = (meeting: Meeting) => {
    const room = meeting.roomId || `room_${meeting.id}`;
    if (typeof window === 'undefined') return `/#/app?room=${encodeURIComponent(room)}`;
    return `${window.location.origin}/#/app?room=${encodeURIComponent(room)}`;
  };

  const copyMeetingLink = async (meeting: Meeting) => {
    const link = getMeetingLink(meeting);
    try {
      await navigator.clipboard.writeText(link);
      addNotification('success', 'Meeting link copied. Share it with participants.');
    } catch {
      addNotification('error', 'Unable to copy meeting link. Copy manually from meeting details.');
    }
  };

  const completeWrapUp = async () => {
    if (!lastEndedCall) return;
    const committedCall: Call = wrapUpAnalysis
      ? { ...lastEndedCall, analysis: { ...(lastEndedCall.analysis || {}), ...wrapUpAnalysis } }
      : lastEndedCall;
    await persistWrapUpCall(committedCall);
    onCompleteWrapUp(committedCall);
  };

  const pastMeetings = useMemo(() => {
    const now = Date.now();
    return meetings
      .filter(m => m.startTime < now)
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 8);
  }, [meetings]);

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden bg-[radial-gradient(120%_120%_at_50%_0%,rgba(15,23,42,0.08)_0%,rgba(2,6,23,0.04)_52%,rgba(2,6,23,0.02)_100%)] backdrop-blur-md rounded-[1.5rem] border border-white/20 shadow-[0_20px_40px_rgba(2,6,23,0.08)]">
      {/* Tab Navigation */}
      <div className="flex space-x-4 md:space-x-6 border-b border-slate-200/80 mb-6 md:mb-8 shrink-0 px-2 md:px-3 overflow-x-auto scrollbar-hide">
        {[
          { id: 'voice', label: 'WORKSPACE' },
          { id: 'team', label: 'TEAM' },
          { id: 'calendar', label: 'CALENDAR' },
          { id: 'omnichannel', label: 'INBOX' },
          { id: 'campaigns', label: 'CAMPAIGNS' },
          { id: 'outbound', label: 'DIALER' },
          { id: 'leads', label: 'LEADS' },
          { id: 'crm', label: 'CRM' },
          { id: 'help', label: 'HELP' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`pb-3 md:pb-4 px-3 whitespace-nowrap text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 rounded-t-lg ${activeTab === tab.id ? 'border-cyan-500 text-cyan-700 bg-cyan-50/70' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/70'}`}>
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
                          <button
                            onClick={() => onEndActiveCall?.()}
                            className="px-4 py-2.5 bg-red-600/90 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500 transition-all flex items-center gap-2"
                          >
                            <PhoneOff size={12} /> End
                          </button>
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
                       <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-5">
                         <div className="flex items-center justify-between">
                           <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">CRM Context</h4>
                           <span className="text-[9px] px-2 py-1 rounded-md bg-slate-100 text-slate-600 font-black uppercase">HubSpot</span>
                         </div>
                         {matchedCrmContact ? (
                           <div className="mt-3 space-y-2">
                             <p className="text-sm font-black text-slate-800 uppercase">{matchedCrmContact.name}</p>
                             <p className="text-[10px] text-slate-500 font-bold">{matchedCrmContact.phone} • {matchedCrmContact.email || 'no-email'}</p>
                             <p className="text-[10px] text-slate-500 font-bold">Company: {matchedCrmContact.company || 'Unknown'}</p>
                             <p className="text-[10px] text-slate-500 font-bold">Related deals: {relatedDealsForMatched.length}</p>
                             <button onClick={() => window.open('https://app.hubspot.com/contacts', '_blank', 'noopener,noreferrer')} className="mt-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-2">
                               <ExternalLink size={12} /> Open in CRM
                             </button>
                           </div>
                         ) : (
                           <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">No contact match for this call yet.</p>
                         )}
                       </div>
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
                                      disabled={!aiCallIntelligenceEnabled || wrapUpActions.crmSynced}
                                      className={`w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 ${!aiCallIntelligenceEnabled || wrapUpActions.crmSynced ? 'bg-green-500/20 text-green-200 cursor-not-allowed' : 'bg-white text-slate-900 hover:bg-slate-100'}`}
                                    >
                                      <CheckCircle size={14}/> {!aiCallIntelligenceEnabled ? 'AI Disabled' : (wrapUpActions.crmSynced ? 'CRM Synced' : 'Sync to CRM')}
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
                   <div className="flex items-center gap-2 w-full md:w-auto">
                    <button
                      onClick={() => setTeamViewMode('cards')}
                      className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${teamViewMode === 'cards' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                    >
                      Cards
                    </button>
                    <button
                      onClick={() => setTeamViewMode('list')}
                      className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${teamViewMode === 'list' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                    >
                      List
                    </button>
                   </div>
                   <div className="relative w-full md:w-72">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                    <input value={teamSearch} onChange={(e) => setTeamSearch(e.target.value)} type="text" placeholder="Search roster..." className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-xs font-bold outline-none focus:border-brand-500 shadow-lg transition-all" />
                 </div>
              </div>
                <div className="flex-1 bg-white/95 backdrop-blur-md rounded-[1.6rem] border border-slate-200 shadow-xl p-2.5 md:p-3 overflow-y-auto scrollbar-hide">
                   {teamViewMode === 'cards' ? (
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-2.5 md:gap-3">
                    {filteredTeamDirectory.map(member => (
                         <div key={member.id} className="bg-white border border-slate-100 p-2.5 rounded-[1rem] group hover:border-brand-500/30 hover:shadow-lg transition-all relative overflow-hidden">
                          <div className="flex items-center gap-2 mb-2 relative z-10">
                             <div className="relative">
                                <img src={member.avatarUrl} className="w-9 h-9 rounded-lg border border-white shadow" />
                                <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-50 ${
                                  member.currentPresence === AgentStatus.AVAILABLE ? 'bg-green-500' :
                                  member.currentPresence === AgentStatus.BUSY ? 'bg-red-500' : 'bg-slate-400'
                                } shadow-sm`}></div>
                             </div>
                             <div className="min-w-0 flex-1">
                                <h4 className="text-[13px] font-black uppercase italic tracking-tight text-slate-800 leading-tight whitespace-normal break-words">{member.name}</h4>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{member.role}</p>
                             </div>
                             <span className="ml-auto text-[7px] font-black uppercase tracking-widest text-slate-400 px-1.5 py-1 rounded-full bg-slate-50 border border-slate-100">
                               {member.currentPresence === AgentStatus.AVAILABLE ? 'Online' : member.currentPresence === AgentStatus.BUSY ? 'On Call' : 'Offline'}
                             </span>
                          </div>
                          <div className="grid grid-cols-1 gap-1.5 relative z-10">
                             <div className="grid grid-cols-2 gap-1.5">
                                <button 
                                  onClick={() => handleInternalLink(member, false)}
                                  disabled={member.id === user.id}
                                  className="flex items-center justify-center gap-1 py-1.5 bg-white border border-slate-200 rounded-lg text-[8px] font-black uppercase tracking-widest text-slate-600 hover:bg-brand-50 hover:border-brand-500/20 hover:text-brand-600 transition-all disabled:opacity-30"
                                >
                                     <Phone size={12}/> Call
                                </button>
                                <button 
                                  onClick={() => handleInternalLink(member, true)}
                                  disabled={member.id === user.id}
                                  className="flex items-center justify-center gap-1 py-1.5 bg-brand-600 text-white rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-brand-700 transition-all disabled:opacity-30 shadow"
                                >
                                     <Video size={12}/> Video Call
                                </button>
                             </div>
                             <button 
                               onClick={() => handleMessageTeammate(member)}
                               disabled={member.id === user.id}
                               className="flex items-center justify-center gap-1 py-1.5 bg-white border border-slate-200 rounded-lg text-[8px] font-black uppercase tracking-widest text-slate-600 hover:bg-brand-50 hover:border-brand-500/20 hover:text-brand-600 transition-all disabled:opacity-30"
                             >
                                  <MessageCircle size={12}/> Message
                             </button>
                          </div>
                          <div className="mt-2 pt-2 border-t border-slate-200/50 flex justify-between items-center text-[7px] font-black uppercase tracking-widest text-slate-400 relative z-10 italic">
                             <span>Extension: {member.extension}</span>
                               <span className="opacity-40">Team member</span>
                          </div>
                       </div>
                    ))}
                 </div>
                   ) : (
                     <div className="overflow-hidden rounded-2xl border border-slate-200">
                       <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_1.6fr] bg-slate-50 px-4 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                         <span>Member</span>
                         <span>Status</span>
                         <span>Ext</span>
                         <span className="text-right">Actions</span>
                       </div>
                       <div className="divide-y divide-slate-100">
                         {filteredTeamDirectory.map((member) => (
                           <div key={member.id} className="grid grid-cols-[1.5fr_0.8fr_0.8fr_1.6fr] items-center px-4 py-3 bg-white">
                             <div className="flex items-center gap-3 min-w-0">
                               <img src={member.avatarUrl} className="w-9 h-9 rounded-lg border border-slate-100" />
                               <div className="min-w-0">
                                 <p className="text-sm font-black uppercase italic text-slate-800 whitespace-normal break-words leading-tight">{member.name}</p>
                                 <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{member.role}</p>
                               </div>
                             </div>
                             <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                               {member.currentPresence === AgentStatus.AVAILABLE ? 'Online' : member.currentPresence === AgentStatus.BUSY ? 'On Call' : 'Offline'}
                             </span>
                             <span className="text-[10px] font-black text-slate-600">{member.extension || '-'}</span>
                             <div className="flex items-center justify-end gap-2">
                               <button onClick={() => handleInternalLink(member, false)} disabled={member.id === user.id} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-30">Call</button>
                               <button onClick={() => handleInternalLink(member, true)} disabled={member.id === user.id} className="px-2.5 py-1.5 rounded-lg bg-brand-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-brand-700 disabled:opacity-30">Video</button>
                               <button onClick={() => handleMessageTeammate(member)} disabled={member.id === user.id} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-30">Msg</button>
                             </div>
                           </div>
                         ))}
                       </div>
                     </div>
                   )}
                   {filteredTeamDirectory.length === 0 && (
                     <div className="h-48 flex items-center justify-center text-xs font-black uppercase tracking-widest text-slate-400">No team members found.</div>
                   )}
              </div>
           </div>
        )}

        {/* CAMPAIGNS HUB */}
        {activeTab === 'campaigns' && (
           <div className="h-full flex flex-col space-y-4 animate-in slide-in-from-right">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end px-4 gap-4">
                 <div>
                    <h3 className="text-2xl font-black text-slate-800 uppercase italic tracking-tighter">Campaigns</h3>
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.35em] mt-2 italic">Autonomous Wave Orchestration</p>
                 </div>
                 <button
                   onClick={() => {
                     if (!canManage) {
                       addNotification('error', 'Only Admin/Supervisor can create campaigns.');
                       return;
                     }
                     setShowCampaignModal(true);
                   }}
                   className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 shadow-xl transition-all active:scale-95 ${canManage ? 'bg-brand-900 text-white hover:bg-slate-800' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                   disabled={!canManage}
                 >
                   <Plus size={12}/> Create Campaign
                 </button>
              </div>
              <div className="flex-1 bg-white rounded-[1.8rem] border border-slate-200 shadow-xl p-4 overflow-y-auto scrollbar-hide">
                 <div className="space-y-4">
                    {campaigns.map(cam => (
                       <div key={cam.id} className="bg-slate-50 border border-slate-100 p-4 rounded-[1.6rem] group hover:border-brand-500/30 transition-all shadow-sm">
                          <div className="flex justify-between items-start mb-4">
                             <div className="flex items-center gap-6">
                                <div className={`w-10 h-10 rounded-[1rem] flex items-center justify-center shadow ${
                                   cam.type === 'call' ? 'bg-orange-500 text-white' : 'bg-brand-600 text-white'
                                }`}>
                                   {cam.type === 'call' ? <PhoneOutgoing size={18}/> : <Mail size={18}/>}
                                </div>
                                <div>
                                   <div className="flex items-center gap-4 mb-2">
                                      <h4 className="text-lg font-black uppercase italic tracking-tighter text-slate-800">{cam.name}</h4>
                                      <span className="px-3 py-1 bg-green-100 text-green-700 text-[8px] font-black uppercase rounded-md tracking-widest border border-green-200">{cam.status}</span>
                                   </div>
                                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                      <Sparkles size={12} className="text-brand-500"/> AI Persona: {cam.aiPersona}
                                   </p>
                                </div>
                             </div>
                             <div className="flex gap-3">
                                <button
                                  onClick={() => {
                                    const nextStatus = cam.status === 'running' ? 'paused' : 'running';
                                    if (nextStatus === 'running') {
                                      if (!hasActiveChannel(cam)) {
                                        addNotification('error', 'Select at least one channel before starting.');
                                        return;
                                      }
                                      if (cam.audience?.consentRequired === false) {
                                        addNotification('error', 'Consent is required before starting this campaign.');
                                        return;
                                      }
                                      if (!cam.journey || cam.journey.length === 0) {
                                        addNotification('error', 'Add at least one journey step before starting.');
                                        return;
                                      }
                                    }
                                    const next = { ...cam, status: nextStatus };
                                    onUpdateCampaign?.(next);
                                    addNotification('success', `Campaign ${next.status === 'running' ? 'resumed' : 'paused'}.`);
                                  }}
                                  className={`px-3.5 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${cam.status === 'running' ? 'bg-amber-500/10 text-amber-600 border border-amber-200' : 'bg-brand-600 text-white shadow hover:bg-brand-700'}`}
                                >
                                  {cam.status === 'running' ? 'Pause' : 'Start'}
                                </button>
                                <button
                                  onClick={() => setCampaignDetail(cam)}
                                  className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-all text-slate-400"
                                >
                                  <BarChart3 size={14}/>
                                </button>
                                <button
                                  onClick={() => setCampaignConfig({
                                    ...cam,
                                    audience: cam.audience || { industry: '', lifecycleStage: 'Lead', region: 'UK', minEngagement: 0, consentRequired: true },
                                    channels: cam.channels || { email: false, sms: false, whatsapp: false },
                                    journey: cam.journey || [{ id: `step_${Date.now()}`, type: 'send_email', label: 'First touch' }],
                                    content: cam.content || { emailSubject: '', emailBody: '' },
                                  })}
                                  className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-all text-slate-400"
                                >
                                  <Settings size={14}/>
                                </button>
                             </div>
                          </div>
                          <div className="grid grid-cols-4 gap-3">
                             <div className="p-3 bg-white rounded-[1rem] border border-slate-200/50 shadow-sm text-center">
                                <p className="text-[8px] font-black uppercase text-slate-400 mb-1 tracking-widest italic">TARGET</p>
                                <p className="text-lg font-black italic text-slate-800">{cam.targetCount}</p>
                             </div>
                             <div className="p-3 bg-white rounded-[1rem] border border-slate-200/50 shadow-sm text-center">
                                <p className="text-[8px] font-black uppercase text-slate-400 mb-1 tracking-widest italic">PROCESSED</p>
                                <p className="text-lg font-black italic text-slate-800">{cam.processedCount}</p>
                             </div>
                             <div className="p-3 bg-white rounded-[1rem] border border-slate-200/50 shadow-sm text-center">
                                <p className="text-[8px] font-black uppercase text-slate-400 mb-1 tracking-widest italic">SUCCESS</p>
                                <p className="text-lg font-black italic text-green-600">{cam.successCount}</p>
                             </div>
                             <div className="p-3 bg-white rounded-[1rem] border border-slate-200/50 shadow-sm flex flex-col justify-center items-center">
                                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-2 shadow-inner">
                                   <div className="h-full bg-brand-500 transition-all duration-1000" style={{ width: `${(cam.processedCount / cam.targetCount) * 100}%` }}></div>
                                </div>
                                <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">{Math.round((cam.processedCount / cam.targetCount) * 100)}% COMPLETE</p>
                             </div>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
           </div>
        )}

        {/* POWER DIALER (Outbound) */}
        {activeTab === 'outbound' && (
           <div className="h-full flex flex-col lg:flex-row gap-6 lg:gap-8 animate-in slide-in-from-left">
              <div className="w-full lg:w-[450px] flex flex-col space-y-6">
                 <div className="bg-white rounded-[3rem] border border-slate-200 shadow-xl flex flex-col overflow-hidden h-full">
                    <div className="p-10 border-b bg-slate-900 text-white flex justify-between items-center shrink-0">
                       <div>
                          <h3 className="text-2xl font-black uppercase italic tracking-tighter">Call Queue</h3>
                          <p className="text-[10px] font-black uppercase text-brand-400 tracking-[0.4em] mt-1">Ready for Dialing</p>
                       </div>
                       <div className="p-4 bg-white/10 rounded-2xl"><Users size={24}/></div>
                    </div>
                    <div className="px-6 py-4 border-b bg-white flex items-center gap-3">
                       <button onClick={startNextInQueue} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow hover:bg-brand-700 transition-all">Next Call</button>
                       <button
                         onClick={() => {
                           if (!canManage) {
                             addNotification('error', 'Only Admin/Supervisor can add leads.');
                             return;
                           }
                           setShowLeadModal(true);
                         }}
                         className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest shadow transition-all ${canManage ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                         disabled={!canManage}
                       >
                         Add Lead
                       </button>
                       <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{queueOrder.length} queued</span>
                    </div>
                    <div className="p-6 border-b bg-slate-50">
                       <div className="relative">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                          <input 
                            value={dialerSearch}
                            onChange={e => setDialerSearch(e.target.value)}
                            type="text" placeholder="Search target node..." className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-xs font-bold outline-none focus:border-brand-500 shadow-inner" 
                          />
                       </div>
                    </div>
                    <div className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-3">
                       {leads.filter(l => l.name.toLowerCase().includes(dialerSearch.toLowerCase())).map(lead => (
                          <button 
                            key={lead.id} 
                            onClick={() => fetchBrief(lead)}
                            className={`w-full p-6 rounded-2xl text-left transition-all border-2 flex items-center gap-4 group ${selectedLeadId === lead.id ? 'bg-brand-50 border-brand-500 shadow-lg' : 'border-transparent hover:bg-slate-50'}`}
                          >
                             <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black italic shadow-sm transition-transform group-hover:scale-105 ${selectedLeadId === lead.id ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{lead.name.charAt(0)}</div>
                             <div className="flex-1 min-w-0">
                                <h4 className="font-black text-slate-800 uppercase text-xs truncate group-hover:text-brand-600">{lead.name}</h4>
                                <p className="text-[10px] font-bold text-slate-400 truncate mt-0.5">{lead.company}</p>
                             </div>
                             <span className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border ${
                               queueStatus[lead.id] === 'completed' ? 'bg-green-100 text-green-700 border-green-200' :
                               queueStatus[lead.id] === 'in_progress' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                               'bg-slate-100 text-slate-500 border-slate-200'
                             }`}>
                               {queueStatus[lead.id] || 'queued'}
                             </span>
                             <ChevronRight size={16} className={`text-slate-300 transition-transform ${selectedLeadId === lead.id ? 'translate-x-1 text-brand-500' : ''}`}/>
                          </button>
                       ))}
                    </div>
                 </div>
              </div>

              <div className="flex-1 bg-white rounded-[4rem] border border-slate-200 shadow-2xl flex flex-col overflow-hidden relative min-h-[420px]">
                 {selectedLeadId ? (
                    <>
                       <div className="p-12 border-b bg-slate-50 flex justify-between items-start shrink-0">
                          <div className="flex items-center gap-10">
                             <div className="w-28 h-28 rounded-[3rem] bg-brand-900 flex items-center justify-center text-white text-5xl font-black italic shadow-2xl relative overflow-hidden">
                                <div className="absolute inset-0 bg-brand-500 opacity-20 blur-xl animate-pulse"></div>
                                <span className="relative z-10">{leads.find(l => l.id === selectedLeadId)?.name.charAt(0)}</span>
                             </div>
                             <div>
                                <h2 className="text-5xl font-black italic uppercase tracking-tighter text-slate-800 mb-2">{leads.find(l => l.id === selectedLeadId)?.name}</h2>
                                <p className="text-xl font-bold text-slate-400 flex items-center gap-3">
                                   <Briefcase size={20}/> {leads.find(l => l.id === selectedLeadId)?.company}
                                </p>
                             </div>
                          </div>
                          <div className="flex gap-4">
                             <button onClick={handleLeadCall} className="px-10 py-5 bg-green-600 text-white rounded-[1.6rem] text-xs font-black uppercase tracking-[0.3em] shadow-2xl hover:bg-green-700 transition-all flex items-center gap-4 active:scale-95 group">
                                <PhoneOutgoing size={20} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform"/> Start Call
                             </button>
                             <button onClick={() => selectedLeadId && markQueueComplete(selectedLeadId)} className="px-6 py-5 bg-slate-900 text-white rounded-[1.6rem] text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all">Mark Done</button>
                          </div>
                       </div>

                       <div className="flex-1 overflow-y-auto p-12 scrollbar-hide">
                          <div className="grid grid-cols-12 gap-12">
                             <div className="col-span-8 space-y-12">
                                <section className="relative">
                                   <div className="flex items-center gap-4 mb-8">
                                      <div className="p-3 bg-brand-50 rounded-xl text-brand-600"><Sparkles size={24}/></div>
                                      <h4 className="text-[11px] font-black uppercase tracking-[0.5em] text-slate-400">AI Briefing</h4>
                                   </div>
                                   <div className="bg-slate-50 p-12 rounded-[3.5rem] border-2 border-slate-100 shadow-inner relative min-h-[250px] flex items-center justify-center">
                                      {isLoadingBrief ? (
                                         <div className="flex flex-col items-center gap-6 opacity-30 italic">
                                            <RefreshCw size={48} className="animate-spin text-brand-500"/>
                                            <p className="text-sm font-black uppercase tracking-widest">Synthesizing Public Telemetry...</p>
                                         </div>
                                      ) : (
                                         <p className="text-2xl font-medium italic text-slate-700 leading-relaxed text-center">"{leadBrief || "Strategic matrix standby. Select a node to initiate profiling."}"</p>
                                      )}
                                   </div>
                                </section>

                                <div className="grid grid-cols-2 gap-8">
                                   <div className="p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm group hover:border-brand-500/20 transition-all">
                                      <p className="text-[9px] font-black uppercase text-slate-400 mb-4 tracking-widest flex items-center gap-2 italic"><Phone size={12}/> ADMISSION ENDPOINT</p>
                                      <p className="text-2xl font-black text-slate-800 tracking-tight">{leads.find(l => l.id === selectedLeadId)?.phone}</p>
                                   </div>
                                   <div className="p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm group hover:border-brand-500/20 transition-all">
                                      <p className="text-[9px] font-black uppercase text-slate-400 mb-4 tracking-widest flex items-center gap-2 italic"><Target size={12}/> CORE STATUS</p>
                                      <span className="px-4 py-1.5 bg-blue-100 text-blue-700 text-[10px] font-black uppercase rounded-lg tracking-widest border border-blue-200">
                                         {leads.find(l => l.id === selectedLeadId)?.status}
                                      </span>
                                   </div>
                                </div>
                             </div>

                             <div className="col-span-4 space-y-12">
                                <section className="bg-slate-900 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden h-full">
                                   <div className="absolute top-0 right-0 w-48 h-48 bg-brand-500/10 blur-[60px] -mr-24 -mt-24"></div>
                                   <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-brand-400 mb-10 flex items-center gap-3"><Terminal size={18}/> Notes</h4>
                                   <div className="space-y-6">
                                      <textarea 
                                        value={leadNotes[selectedLeadId] || leads.find(l => l.id === selectedLeadId)?.notes || ""} 
                                        onChange={e => setLeadNotes({...leadNotes, [selectedLeadId]: e.target.value})}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm italic text-slate-300 leading-relaxed outline-none focus:border-brand-500 h-40 resize-none"
                                        placeholder="Enter packet admissions metadata..."
                                      />
                                      <button className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand-400 hover:text-white transition-all"><CheckCircle size={14}/> Save Metadata</button>
                                   </div>
                                </section>
                             </div>
                          </div>
                       </div>
                    </>
                 ) : (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-10 italic grayscale">
                       <Radio size={120} className="mb-8 animate-pulse"/>
                       <p className="text-4xl font-black uppercase tracking-[0.8em]">Dialer Standby</p>
                    </div>
                 )}
              </div>
           </div>
        )}

        {/* OMNICHANNEL / UNIFIED INBOX */}
        {activeTab === 'omnichannel' && (
           <div className="h-full flex flex-col lg:flex-row gap-6 animate-in slide-in-from-right">
               <div className="w-full lg:w-80 bg-white rounded-[2.2rem] border border-slate-200 shadow-xl flex flex-col overflow-hidden">
                  <div className="p-5 border-b bg-slate-50 flex items-center justify-between">
                     <div className="flex items-center gap-2">
                       <h3 className="text-lg font-black uppercase italic tracking-tighter text-slate-800">Inbox</h3>
                       <span
                         className={`w-3 h-3 rounded-full ${chatHealth?.chatHealthy ? 'bg-emerald-500' : chatHealth?.offline ? 'bg-amber-500' : 'bg-rose-500'}`}
                         title={chatHealth?.chatHealthy ? 'Chat healthy' : (chatHealth?.lastError || 'Chat channel degraded')}
                       />
                     </div>
                     <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white text-[10px] font-black">{unreadInboxCount}</div>
                  </div>
                 <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-3">
                    {inboxConversations.map(conv => {
                      const isClosed = conv.status === 'closed';
                      const isSelected = selectedConversationPeerKey && getConversationPeerKey(conv) === selectedConversationPeerKey;
                      return (
                       <button key={conv.id} onClick={() => selectInboxConversation(conv)} className={`w-full p-4 rounded-[1.6rem] text-left transition-all border-2 group ${isSelected ? 'bg-brand-50 border-brand-500 shadow-lg' : 'border-transparent hover:bg-slate-50'} ${isClosed ? 'opacity-60' : ''}`}>
                          <div className="flex justify-between items-start mb-2">
                             <h4 className="font-black text-slate-800 uppercase text-xs italic group-hover:text-brand-600">{conv.contactName}</h4>
                             <span className="text-[9px] font-black text-slate-400">{new Date(conv.lastMessageTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] text-slate-500 line-clamp-1 italic leading-relaxed">"{conv.lastMessage}"</p>
                            {isClosed && <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Closed</span>}
                          </div>
                       </button>
                      );
                    })}
                 </div>
              </div>
              
              <div className="flex-1 bg-white rounded-[2.8rem] border border-slate-200 shadow-2xl flex flex-col overflow-hidden relative min-h-[420px]">
                 {activeConversation ? (
                    <>
                      <div className="p-6 border-b bg-slate-900 text-white flex justify-between items-center relative">
                         <div className="flex items-center gap-6">
                            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center"><MessageCircle size={22}/></div>
                            <div>
                               <h4 className="font-black italic uppercase text-xl tracking-tighter">{activeConversation.contactName}</h4>
                               <p className="text-[10px] font-black text-brand-400 uppercase tracking-[0.3em]">{activeConversation.channel} HUB PORT</p>
                               <div className="mt-1 inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-white/10 bg-white/5">
                                 <ShieldCheck size={10} className="text-emerald-300" />
                                 <span className="text-[8px] font-black uppercase tracking-widest text-emerald-300">{consentFramework}</span>
                               </div>
                            </div>
                         </div>
                         <div className="flex gap-4 items-center">
                            <button onClick={handleActiveConversationCall} className="p-4 bg-white/10 rounded-2xl hover:bg-white/20 transition-all text-white shadow-lg"><Phone size={18}/></button>
                            <div className="relative">
                               <button onClick={() => setShowInboxMenu(!showInboxMenu)} className="p-4 bg-white/10 rounded-2xl hover:bg-white/20 transition-all"><MoreVertical size={20}/></button>
                               {showInboxMenu && (
                                  <div className="absolute right-0 top-full mt-4 w-64 bg-[#12161f] border border-white/10 rounded-3xl shadow-3xl z-50 p-4 animate-in zoom-in-95 overflow-hidden">
                                     <button onClick={() => { setShowContactModal(true); setShowInboxMenu(false); }} className="w-full text-left p-4 hover:bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-300 flex items-center gap-3 transition-all"><Eye size={16}/> View contact</button>
                                     <button onClick={() => { setShowThreadSettings(true); setShowInboxMenu(false); }} className="w-full text-left p-4 hover:bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-300 flex items-center gap-3 transition-all"><Settings size={16}/> Settings</button>
                                     <button onClick={() => { setShowTerminateConfirm(true); setShowInboxMenu(false); }} className="w-full text-left p-4 hover:bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-3 transition-all"><Trash2 size={16}/> Terminate Thread</button>
                                  </div>
                               )}
                            </div>
                         </div>
                      </div>
                      {activeConversation.channel === 'whatsapp' && activeConversation.consentStatus !== 'granted' && (
                        <div className="px-6 py-4 bg-amber-50 border-b border-amber-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">{consentFramework} Consent Required</p>
                            <p className="text-xs text-amber-700 mt-1">{consentText}</p>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleSendMessage(consentText)} className="px-3 py-2 rounded-lg bg-amber-600 text-white text-[9px] font-black uppercase tracking-widest">Send Consent</button>
                            <button onClick={markConsentGranted} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest">Mark Consent</button>
                            <button onClick={markConsentOptOut} className="px-3 py-2 rounded-lg bg-white border border-amber-200 text-amber-700 text-[9px] font-black uppercase tracking-widest">Opt Out</button>
                          </div>
                        </div>
                      )}
                      
                      <div ref={inboxScrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide bg-slate-50/50">
                        {activeMessages.map(m => (
                          <div key={m.id} className={`flex ${isOwnMessage(m) ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[70%] p-5 rounded-[1.8rem] text-sm leading-relaxed shadow-sm ${isOwnMessage(m) ? 'bg-brand-600 text-white rounded-br-none' : 'bg-white border border-slate-100 text-slate-800 rounded-bl-none'}`}>
                              {m.text && <p className="font-medium italic">"{m.text}"</p>}
                              {m.attachments?.map((att, i) => (
                                <div key={i} className="mt-4 p-4 bg-black/10 rounded-2xl flex items-center gap-4 border border-white/5 group/file cursor-pointer hover:bg-black/20 transition-all">
                                  <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center text-brand-400 group-hover/file:text-white"><FileText size={20}/></div>
                                  <div className="flex-1 min-w-0">
                                     <p className="text-xs font-black truncate uppercase tracking-widest">{att.name}</p>
                                     <p className="text-[9px] opacity-60 font-bold">{(att.size / 1024).toFixed(1)} KB attachment</p>
                                  </div>
                                  <Download size={14} className="opacity-40 group-hover/file:opacity-100 transition-opacity"/>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      {showJumpToLatest && (
                        <button
                          onClick={jumpToLatestMessage}
                          className="absolute bottom-28 right-7 z-20 px-3 py-2 rounded-full bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-slate-800 inline-flex items-center gap-2"
                        >
                          <ArrowDown size={12} />
                          Latest Message
                        </button>
                      )}

                      <div className="p-6 border-t bg-white space-y-4">
                         {aiDraftText && (
                            <div className="p-6 bg-brand-50 border-2 border-brand-200 rounded-[2rem] relative animate-in slide-in-from-bottom duration-300">
                               <button onClick={() => setAiDraftText(null)} className="absolute top-6 right-6 text-brand-400 hover:text-brand-600"><X size={18}/></button>
                               <div className="flex items-center gap-3 mb-3">
                                  <Sparkles size={16} className="text-brand-600"/>
                                  <p className="text-[10px] font-black uppercase tracking-widest text-brand-600">Suggested Reply</p>
                               </div>
                               <p className="text-sm font-medium italic text-slate-700 leading-relaxed">"{aiDraftText}"</p>
                               <div className="mt-6 flex gap-4">
                                  <button onClick={() => handleSendMessage(aiDraftText)} className="px-6 py-2.5 bg-brand-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-brand-700 shadow-lg">Send</button>
                                  <button onClick={() => setMessageInput(aiDraftText)} className="px-6 py-2.5 bg-white border border-brand-200 text-brand-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-brand-50">Edit Logic</button>
                               </div>
                            </div>
                         )}
                         <input type="file" ref={fileInputRef} onChange={handleFileAttach} className="hidden" multiple />
                         <div className="flex gap-3">
                            <button onClick={() => fileInputRef.current?.click()} className="p-4 bg-slate-100 text-slate-400 rounded-2xl hover:bg-slate-200 transition-all border border-slate-200 shadow-inner group"><Paperclip size={20} className="group-hover:rotate-12 transition-transform"/></button>
                            <button onClick={handleGenerateDraft} disabled={isDrafting} className="p-4 bg-brand-50 text-brand-600 rounded-2xl hover:bg-brand-100 transition-all shadow-sm flex items-center justify-center relative overflow-hidden">
                               {isDrafting ? <RefreshCw size={20} className="animate-spin"/> : <Sparkles size={20}/>}
                            </button>
                            <input type="text" value={messageInput} onChange={e => setMessageInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} placeholder="Type a message..." className="flex-1 bg-slate-100 p-4 rounded-[2rem] border border-slate-200 italic outline-none focus:border-brand-500 font-medium shadow-inner" />
                            <button onClick={() => handleSendMessage()} className="p-4 bg-slate-900 text-white rounded-[1.8rem] shadow-2xl hover:bg-slate-800 transition-all group active:scale-95"><Send size={20} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform"/></button>
                         </div>
                      </div>
                    </>
                 ) : (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-10 italic grayscale">
                       <MessageSquare size={96} className="mb-6"/>
                       <p className="text-2xl font-black uppercase tracking-[0.5em]">Select a conversation</p>
                    </div>
                 )}
              </div>
           </div>
        )}

        {/* LEADS HUB */}
        {activeTab === 'leads' && (
          <div className="h-full flex flex-col gap-6 animate-in slide-in-from-right">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end px-4 gap-4">
              <div>
                <h3 className="text-2xl font-black text-slate-800 uppercase italic tracking-tighter">Leads</h3>
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.35em] mt-2 italic">Bulk Import + AI-ready</p>
              </div>
              <button
                onClick={() => {
                  if (!canManage) {
                    addNotification('error', 'Only Admin/Supervisor can add leads.');
                    return;
                  }
                  setShowLeadModal(true);
                }}
                className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 shadow-xl transition-all active:scale-95 ${canManage ? 'bg-brand-900 text-white hover:bg-slate-800' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                disabled={!canManage}
              >
                <Plus size={12}/> Add Lead
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden">
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl p-6 flex flex-col gap-4">
                <h4 className="text-sm font-black uppercase tracking-widest text-slate-600">CSV Import</h4>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={!canManage}
                  onChange={(e) => {
                    if (!canManage) return;
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      setLeadCsvText(String(reader.result || ''));
                    };
                    reader.readAsText(file);
                  }}
                  className="text-xs font-bold text-slate-500 disabled:opacity-50"
                />
                <textarea
                  value={leadCsvText}
                  onChange={(e) => setLeadCsvText(e.target.value)}
                  placeholder="Paste CSV here. Headers: name, company, phone, email, status, notes"
                  className="min-h-[180px] bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-bold text-slate-600 outline-none focus:border-brand-500"
                />
                {leadCsvColumns.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Column Mapping</p>
                    {['name', 'company', 'phone', 'email', 'status', 'notes', 'industry'].map((field) => (
                      <div key={field} className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <span>{field}</span>
                        <select
                          className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-black uppercase"
                          value={leadCsvMapping[field] ?? -1}
                          onChange={(e) => setLeadCsvMapping({ ...leadCsvMapping, [field]: Number(e.target.value) })}
                        >
                          <option value={-1}>Ignore</option>
                          {leadCsvColumns.map((col, idx) => (
                            <option key={`${field}_${col}_${idx}`} value={idx}>{col}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                    <button onClick={applyLeadMapping} className="w-full py-2 border border-dashed border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-brand-500 hover:text-brand-600">
                      Apply Mapping
                    </button>
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={handleParseLeadCsv} className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">
                    Preview
                  </button>
                  <button onClick={handleImportLeads} disabled={leadImporting || !canManage} className="flex-1 py-3 bg-brand-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-60">
                    {leadImporting ? 'Importing...' : 'Import'}
                  </button>
                  <button onClick={handleEnrichLeads} disabled={leadEnriching || leadCsvRows.length === 0} className="flex-1 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 disabled:opacity-60">
                    {leadEnriching ? 'Enriching...' : 'AI Enrich'}
                  </button>
                </div>
                {leadCsvErrors.length > 0 && (
                  <div className="text-[10px] font-bold text-red-500 space-y-1">
                    {leadCsvErrors.slice(0, 4).map(err => (
                      <div key={err}>{err}</div>
                    ))}
                  </div>
                )}
              </div>
              <div className="lg:col-span-2 bg-white rounded-[2rem] border border-slate-200 shadow-xl p-6 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-black uppercase tracking-widest text-slate-600">Lead Preview</h4>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{leadCsvRows.length} parsed</span>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-hide space-y-3">
                  {(leadCsvRows.length ? leadCsvRows : leads.slice(0, 20)).map(lead => (
                    <div key={lead.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/80 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-black uppercase text-slate-800">{lead.name}</div>
                        <div className="text-[10px] font-bold text-slate-400">{lead.company} • {lead.phone}</div>
                        {lead.industry && <div className="text-[10px] font-bold text-slate-400">{lead.industry}</div>}
                        {lead.email && <div className="text-[10px] font-bold text-slate-400">{lead.email}</div>}
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-slate-200 text-slate-500">{lead.status}</span>
                    </div>
                  ))}
                  {leadCsvRows.length === 0 && leads.length === 0 && (
                    <div className="text-sm font-bold text-slate-400">No leads yet. Import or add a lead to begin.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CRM WINDOW */}
        {activeTab === 'crm' && (
          <div className="h-full flex flex-col gap-6 animate-in slide-in-from-right">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end px-4 gap-4">
              <div>
                <h3 className="text-2xl font-black text-slate-800 uppercase italic tracking-tighter">CRM Window</h3>
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.35em] mt-2 italic">Call-centered contact and deal context</p>
              </div>
              <button onClick={() => refreshCrmData().catch(() => {})} className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-2">
                <RefreshCw size={14} /> Refresh CRM
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-6 flex-1 overflow-hidden">
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl p-6 flex flex-col overflow-hidden">
                <div className="relative mb-4">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                  <input
                    value={crmSearch}
                    onChange={(e) => setCrmSearch(e.target.value)}
                    placeholder="Search contacts by name, phone, email..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-xs font-bold outline-none focus:border-brand-500"
                  />
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                  {crmLoading ? 'Loading...' : `${crmContacts.length} contacts`}
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-hide space-y-3">
                  {crmContacts
                    .filter((contact) => {
                      const q = crmSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        (contact.name || '').toLowerCase().includes(q) ||
                        (contact.phone || '').toLowerCase().includes(q) ||
                        (contact.email || '').toLowerCase().includes(q)
                      );
                    })
                    .slice(0, 80)
                    .map((contact) => (
                      <div key={contact.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black uppercase text-slate-800">{contact.name}</p>
                          <span className="text-[8px] px-2 py-1 rounded-md bg-brand-50 text-brand-700 font-black uppercase tracking-widest">{contact.platform || 'HubSpot'}</span>
                        </div>
                        <p className="mt-1 text-[10px] font-bold text-slate-500">{contact.phone || 'No phone'} • {contact.email || 'No email'}</p>
                        <p className="mt-1 text-[10px] font-bold text-slate-500">Owner: {contact.ownerId || 'Unassigned'} • Stage: {contact.lifecycleStage || 'lead'}</p>
                        <div className="mt-2">
                          <button onClick={() => window.open('https://app.hubspot.com/contacts', '_blank', 'noopener,noreferrer')} className="text-[9px] font-black uppercase tracking-widest text-brand-600 inline-flex items-center gap-1">
                            Open in CRM <ExternalLink size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  {crmContacts.length === 0 && !crmLoading && (
                    <div className="text-sm font-bold text-slate-400">No CRM contacts yet. Sync HubSpot in Admin Settings.</div>
                  )}
                </div>
              </div>
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl p-6 flex flex-col overflow-hidden">
                <h4 className="text-sm font-black uppercase tracking-widest text-slate-600 mb-4">Deal / Opportunity Context</h4>
                {matchedCrmContact ? (
                  <div className="space-y-4 overflow-y-auto scrollbar-hide">
                    <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Matched Contact</p>
                      <p className="mt-1 text-lg font-black italic text-slate-800">{matchedCrmContact.name}</p>
                      <p className="text-[10px] font-bold text-slate-500">{matchedCrmContact.phone} • {matchedCrmContact.email || 'No email'}</p>
                    </div>
                    <div className="space-y-3">
                      {relatedDealsForMatched.map((deal) => {
                        const props = deal?.raw?.properties || {};
                        return (
                          <div key={deal.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                            <p className="text-xs font-black uppercase text-slate-800">{deal.name || props.dealname || 'Deal'}</p>
                            <p className="mt-1 text-[10px] font-bold text-slate-500">Stage: {deal.stage || props.dealstage || 'N/A'}</p>
                            <p className="text-[10px] font-bold text-slate-500">Value: {deal.amount || props.amount || 'N/A'}</p>
                            <p className="text-[10px] font-bold text-slate-500">Next Step: {props.hs_next_step || 'Not set'}</p>
                          </div>
                        );
                      })}
                      {relatedDealsForMatched.length === 0 && (
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">No related deals found for this contact.</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm font-bold text-slate-400">No active-call contact match. Start a call or refresh CRM.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* HELP CORNER */}
        {activeTab === 'help' && (
          <div className="h-full flex flex-col gap-6 animate-in slide-in-from-right">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end px-4 gap-4">
              <div>
                <h3 className="text-2xl font-black text-slate-800 uppercase italic tracking-tighter">Help Corner</h3>
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.35em] mt-2 italic">End-to-end guidance</p>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6 flex-1 overflow-hidden">
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl p-6 flex flex-col gap-4">
                <h4 className="text-sm font-black uppercase tracking-widest text-slate-600">Preset Questions</h4>
                <div className="grid gap-3">
                  {HELP_QUESTIONS.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => {
                        setHelpMessages(prev => [...prev, { id: `h_${Date.now()}`, sender: 'user', text: q.question }, { id: `h_${Date.now()}_bot`, sender: 'bot', text: q.answer }]);
                      }}
                      className="w-full text-left p-4 rounded-2xl border border-slate-100 bg-slate-50 text-xs font-bold text-slate-600 hover:border-brand-500 hover:text-brand-700"
                    >
                      {q.question}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl p-6 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-black uppercase tracking-widest text-slate-600">Ask ConnectAI</h4>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">AI Guide</span>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-hide space-y-3">
                  {helpMessages.map((msg) => (
                    <div key={msg.id} className={`p-3 rounded-2xl text-xs font-bold ${msg.sender === 'user' ? 'bg-brand-600 text-white ml-auto w-[80%]' : 'bg-slate-100 text-slate-700 w-[80%]'}`}>
                      {msg.text}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-3">
                  <input
                    value={helpInput}
                    onChange={(e) => setHelpInput(e.target.value)}
                    placeholder="Ask anything about the app..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold"
                  />
                  <button
                    onClick={() => handleHelpAsk()}
                    className="px-4 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
                  >
                    Ask
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CALENDAR VIEW */}
        {activeTab === 'calendar' && (
           <div className="h-full flex flex-col space-y-6 md:space-y-8 animate-in fade-in">
            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end px-2 md:px-4 gap-4">
              <div>
                <h3 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">Calendar</h3>
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.35em] mt-2 italic">Your meetings</p>
              </div>
              <button onClick={() => setShowScheduleModal(true)} className="px-6 py-3 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-3 shadow-xl hover:bg-slate-800 transition-all active:scale-95"><Plus size={16}/> Schedule Meeting</button>
            </div>

            <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-xl flex flex-col overflow-hidden relative">
              <div className="hidden lg:block overflow-x-auto">
                <div className="min-w-[900px] grid grid-cols-[100px_1fr_1fr_1fr_1fr_1fr] border-b bg-slate-50 shadow-sm relative z-10">
                  <div className="p-4"></div>
                  {DAYS.map(day => (
                    <div key={day} className="p-4 text-center border-l border-slate-200/50">
                      <span className="text-[9px] font-black uppercase tracking-[0.35em] text-slate-400 mb-1 block">{day}</span>
                      <span className="text-lg font-black italic text-slate-800 tracking-tighter">1{DAYS.indexOf(day) + 2}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="hidden lg:block flex-1 overflow-y-auto scrollbar-hide relative bg-white">
                {HOURS.map(hour => (
                  <div key={hour} className="min-w-[900px] grid grid-cols-[100px_1fr_1fr_1fr_1fr_1fr] h-20 border-b border-slate-100 group">
                    <div className="p-3 text-[9px] font-black text-slate-300 text-right pr-6 uppercase tracking-widest">{hour}:00</div>
                    {DAYS.map(day => {
                      const event = meetings
                        .map(m => {
                          const d = new Date(m.startTime);
                          return { ...m, day: DAYS[d.getDay() - 1], hour: d.getHours() };
                        })
                        .find(e => e.day === day && e.hour === hour);

                      return (
                        <div key={day} className="border-l border-slate-100 relative hover:bg-slate-50/50 transition-all">
                          {event && (
                            <div className={`absolute inset-2 rounded-[1.5rem] p-3 text-left shadow-lg hover:scale-[1.02] transition-all animate-in zoom-in-95 group/event ${event.attendees.some(a => a.userId === user.id) ? 'bg-brand-900 text-white' : 'bg-white border-2 border-slate-100 text-slate-600'}`}>
                              <div className="flex justify-between items-start mb-2">
                                <p className="text-[8px] font-black uppercase tracking-widest opacity-60 italic">{hour}:00 meeting</p>
                                {event.isRecurring && <Repeat size={10} className="opacity-40" />}
                              </div>
                              <p className="font-black italic uppercase tracking-tighter text-xs leading-tight line-clamp-2">{event.title}</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {event.attendees.find(a => a.userId === user.id)?.status === 'pending' && (
                                  <>
                                    <button
                                      onClick={() => handleAcceptMeeting(event)}
                                      className="px-2.5 py-1 rounded-lg bg-white/10 text-[8px] font-black uppercase tracking-widest"
                                    >
                                      Accept
                                    </button>
                                    <button
                                      onClick={() => handleDeclineMeeting(event)}
                                      className="px-2.5 py-1 rounded-lg bg-white/10 text-[8px] font-black uppercase tracking-widest"
                                    >
                                      Decline
                                    </button>
                                  </>
                                )}
                                {(event.organizerId === user.id || event.attendees.find(a => a.userId === user.id)?.status === 'accepted') && (
                                  <button
                                    onClick={() => handleJoinMeeting(event)}
                                    className="px-2.5 py-1 rounded-lg bg-brand-600 text-[8px] font-black uppercase tracking-widest text-white"
                                  >
                                    Join
                                  </button>
                                )}
                                <button
                                  onClick={() => copyMeetingLink(event)}
                                  className="px-2.5 py-1 rounded-lg bg-white/10 text-[8px] font-black uppercase tracking-widest"
                                  title={getMeetingLink(event)}
                                >
                                  Copy Link
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="lg:hidden flex-1 overflow-y-auto p-6 space-y-4">
                {meetings.length === 0 ? (
                  <div className="text-slate-400 text-sm font-bold">No meetings yet.</div>
                ) : (
                  meetings
                    .slice()
                    .sort((a, b) => a.startTime - b.startTime)
                    .map(meeting => (
                      <div key={meeting.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/60">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            {new Date(meeting.startTime).toLocaleDateString()}
                          </span>
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                            {meeting.status}
                          </span>
                        </div>
                        <div className="mt-2 text-sm font-black text-slate-800 uppercase italic line-clamp-2">{meeting.title}</div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          {Math.round(meeting.duration)} min • {meeting.attendees.length} attendees
                        </div>
                        <div className="mt-2">
                          <button onClick={() => copyMeetingLink(meeting)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100">
                            Copy Link
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl px-6 py-5">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h4 className="text-lg font-black uppercase tracking-widest text-slate-700">Meeting History</h4>
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mt-2">Last 8 sessions</p>
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{pastMeetings.length} entries</span>
              </div>
              {pastMeetings.length === 0 ? (
                <div className="text-slate-400 text-sm font-bold">No past meetings yet.</div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {pastMeetings.map(meeting => (
                    <div key={meeting.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/60 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          {new Date(meeting.startTime).toLocaleDateString()}
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                          {meeting.status}
                        </span>
                      </div>
                      <div className="text-sm font-black text-slate-800 uppercase italic line-clamp-1">{meeting.title}</div>
                      <div className="text-[10px] text-slate-500">
                        {Math.round(meeting.duration)} min ? {meeting.attendees.length} attendees
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {/* CAMPAIGN MODAL */}
      {showCampaignModal && (
        <div className="fixed inset-0 z-[110] bg-slate-900/70 backdrop-blur-md flex items-start md:items-center justify-center p-4 md:p-6 animate-in fade-in overflow-y-auto">
           <div className="bg-white rounded-[2rem] shadow-3xl w-full max-w-xl p-6 md:p-8 border border-white/20 relative overflow-hidden my-6 max-h-[92vh] flex flex-col">
              <h3 className="text-3xl font-black italic tracking-tighter uppercase text-slate-800 mb-6 text-center">Create Campaign</h3>
              <div className="space-y-6 overflow-y-auto pr-1">
                 <div className="space-y-3">
                       <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Campaign Name</label>
                       <input className="w-full bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 font-bold text-sm focus:border-brand-500 outline-none transition-all" placeholder="e.g. Q4 Growth Core" value={newCampaign.name} onChange={e => setNewCampaign({...newCampaign, name: e.target.value})}/>
                 </div>
                 <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                       <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Type</label>
                       <select
                         className="w-full bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 font-black uppercase text-xs focus:border-brand-500 outline-none"
                         value={newCampaign.type}
                         onChange={e => {
                           const nextType = e.target.value as any;
                           const journeyType = resolveJourneyType(nextType);
                           const nextJourney = (newCampaign.journey?.length ? newCampaign.journey : [
                             { id: `step_${Date.now()}_1`, type: journeyType, label: 'First touch' },
                             { id: `step_${Date.now()}_2`, type: 'wait', label: 'Wait 48h', delayHours: 48 }
                           ]).map((step, idx) => idx === 0 ? {
                             ...step,
                             type: journeyType,
                             label: nextType === 'call' ? 'Call outreach' : 'First touch'
                           } : step);
                           setNewCampaign({
                             ...newCampaign,
                             type: nextType,
                             channels: nextType === 'call' ? { email: false, sms: false, whatsapp: false } : resolveChannelsForType(nextType),
                             journey: nextJourney
                           });
                         }}
                       >
                          <option value="call">Calls</option>
                          <option value="email">Email</option>
                          <option value="sms">SMS</option>
                          <option value="whatsapp">WhatsApp</option>
                       </select>
                    </div>
                    <div className="space-y-3">
                       <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Target Count</label>
                       <input type="number" className="w-full bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 font-black text-center text-sm focus:border-brand-500 outline-none" value={newCampaign.target} onChange={e => setNewCampaign({...newCampaign, target: parseInt(e.target.value)})}/>
                    </div>
                 </div>
                 <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Message Style</label>
                    <div className="grid grid-cols-2 gap-4">
                       {['Professional Concierge', 'Friendly Assistant', 'Technical Handoff', 'Closing Logic'].map(p => (
                          <button key={p} onClick={() => setNewCampaign({...newCampaign, persona: p})} className={`p-4 rounded-2xl border-2 transition-all text-[10px] font-black uppercase tracking-widest ${newCampaign.persona === p ? 'bg-brand-900 border-brand-900 text-white shadow-xl' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'}`}>{p}</button>
                       ))}
                    </div>
                 </div>
                 <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Audience</label>
                    <div className="grid grid-cols-2 gap-4">
                       <input
                         className="w-full bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 font-bold text-xs focus:border-brand-500 outline-none"
                         placeholder="Industry"
                         value={newCampaign.audience.industry}
                         onChange={e => setNewCampaign({ ...newCampaign, audience: { ...newCampaign.audience, industry: e.target.value } })}
                       />
                       <select
                         className="w-full bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 font-black uppercase text-[10px] focus:border-brand-500 outline-none"
                         value={newCampaign.audience.lifecycleStage}
                         onChange={e => setNewCampaign({ ...newCampaign, audience: { ...newCampaign.audience, lifecycleStage: e.target.value } })}
                       >
                         <option value="Lead">Lead</option>
                         <option value="MQL">MQL</option>
                         <option value="SQL">SQL</option>
                         <option value="Customer">Customer</option>
                       </select>
                       <select
                         className="w-full bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 font-black uppercase text-[10px] focus:border-brand-500 outline-none"
                         value={newCampaign.audience.region}
                         onChange={e => setNewCampaign({ ...newCampaign, audience: { ...newCampaign.audience, region: e.target.value } })}
                       >
                         <option value="UK">UK</option>
                         <option value="NG">Nigeria</option>
                         <option value="EU">EU</option>
                         <option value="Global">Global</option>
                       </select>
                       <input
                         type="number"
                         className="w-full bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 font-black text-center text-xs focus:border-brand-500 outline-none"
                         placeholder="Min engagement"
                         value={newCampaign.audience.minEngagement}
                         onChange={e => setNewCampaign({ ...newCampaign, audience: { ...newCampaign.audience, minEngagement: Number(e.target.value || 0) } })}
                       />
                    </div>
                    <label className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 px-2">
                      Consent Required
                      <input
                        type="checkbox"
                        checked={Boolean(newCampaign.audience.consentRequired)}
                        onChange={e => setNewCampaign({ ...newCampaign, audience: { ...newCampaign.audience, consentRequired: e.target.checked } })}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </label>
                 </div>
                 <div className="space-y-4">
                   <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Channels</label>
                   <div className="grid grid-cols-3 gap-3">
                     {(['email', 'sms', 'whatsapp'] as const).map((channel) => (
                       <label key={channel} className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3">
                         {channel}
                         <input
                           type="checkbox"
                           checked={Boolean(newCampaign.channels[channel])}
                           onChange={e => setNewCampaign({ ...newCampaign, channels: { ...newCampaign.channels, [channel]: e.target.checked } })}
                           className="h-4 w-4 rounded border-slate-300"
                         />
                       </label>
                     ))}
                   </div>
                 </div>
                 <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Journey</label>
                    <div className="space-y-3">
                      {newCampaign.journey.map(step => (
                        <div key={step.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3">
                          <div className="flex items-center gap-3">
                            <select
                              className="flex-1 bg-white p-3 rounded-xl border border-slate-200 text-[10px] font-black uppercase"
                              value={step.type}
                              onChange={e => setNewCampaign({
                                ...newCampaign,
                                journey: newCampaign.journey.map(s => s.id === step.id ? { ...s, type: e.target.value as any } : s)
                              })}
                            >
                              <option value="send_email">Send Email</option>
                              <option value="send_sms">Send SMS</option>
                              <option value="send_whatsapp">Send WhatsApp</option>
                              <option value="wait">Wait</option>
                              <option value="notify_sales">Notify Sales</option>
                              <option value="update_field">Update Field</option>
                            </select>
                            <button
                              onClick={() => setNewCampaign({ ...newCampaign, journey: newCampaign.journey.filter(s => s.id !== step.id) })}
                              className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200"
                            >
                              <Trash2 size={14}/>
                            </button>
                          </div>
                          <input
                            className="w-full bg-white p-3 rounded-xl border border-slate-200 text-xs font-bold"
                            value={step.label}
                            onChange={e => setNewCampaign({
                              ...newCampaign,
                              journey: newCampaign.journey.map(s => s.id === step.id ? { ...s, label: e.target.value } : s)
                            })}
                            placeholder="Step label"
                          />
                          {step.type === 'wait' && (
                            <input
                              type="number"
                              className="w-full bg-white p-3 rounded-xl border border-slate-200 text-xs font-black text-center"
                              value={step.delayHours || 0}
                              onChange={e => setNewCampaign({
                                ...newCampaign,
                                journey: newCampaign.journey.map(s => s.id === step.id ? { ...s, delayHours: Number(e.target.value || 0) } : s)
                              })}
                              placeholder="Delay hours"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setNewCampaign({
                        ...newCampaign,
                        journey: [...newCampaign.journey, { id: `step_${Date.now()}`, type: 'send_email', label: 'New step' }]
                      })}
                      className="w-full py-3 border-2 border-dashed border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-brand-500 hover:text-brand-600"
                    >
                      Add Step
                    </button>
                 </div>
                  <button onClick={provisionCampaign} className="w-full py-3.5 bg-brand-600 text-white rounded-2xl font-black uppercase tracking-[0.25em] shadow-xl hover:bg-brand-700 transition-all active:scale-95 text-[11px]">Create Campaign</button>
                  <button onClick={() => setShowCampaignModal(false)} className="w-full text-slate-400 font-bold uppercase tracking-widest text-[10px] hover:text-slate-600 transition-all pb-1">Cancel</button>
              </div>
           </div>
        </div>
      )}

      {campaignDetail && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl p-10 border border-white/20 relative overflow-hidden">
            <button onClick={() => setCampaignDetail(null)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"><X size={18}/></button>
            <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-800 mb-6">Campaign Insights</h3>
            <div className="space-y-4">
              <div className="flex justify-between text-sm font-bold text-slate-600"><span>Target</span><span>{campaignDetail.targetCount}</span></div>
              <div className="flex justify-between text-sm font-bold text-slate-600"><span>Processed</span><span>{campaignDetail.processedCount}</span></div>
              <div className="flex justify-between text-sm font-bold text-slate-600"><span>Success</span><span>{campaignDetail.successCount}</span></div>
              <div className="flex justify-between text-sm font-bold text-slate-600"><span>Status</span><span>{campaignDetail.status}</span></div>
            </div>
          </div>
        </div>
      )}

      {campaignConfig && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-start md:items-center justify-center p-4 md:p-6 animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl p-6 md:p-8 border border-white/20 relative overflow-hidden my-4 max-h-[92vh] flex flex-col">
            <button onClick={() => setCampaignConfig(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 z-10"><X size={18}/></button>
            <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-800 mb-4 md:mb-6 shrink-0">Campaign Settings</h3>
            <div className="space-y-4 overflow-y-auto pr-1 md:pr-2">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Name</label>
                <input
                  value={campaignConfig.name}
                  onChange={(e) => setCampaignConfig({ ...campaignConfig, name: e.target.value })}
                  className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target Count</label>
                <input
                  type="number"
                  value={campaignConfig.targetCount}
                  onChange={(e) => setCampaignConfig({ ...campaignConfig, targetCount: Number(e.target.value || 0) })}
                  className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</label>
                <select
                  value={campaignConfig.status}
                  onChange={(e) => setCampaignConfig({ ...campaignConfig, status: e.target.value as any })}
                  className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-sm uppercase"
                >
                  <option value="draft">Draft</option>
                  <option value="running">Running</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Audience</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-xs"
                    placeholder="Industry"
                    value={campaignConfig.audience?.industry || ''}
                    onChange={(e) => setCampaignConfig({ ...campaignConfig, audience: { ...(campaignConfig.audience || {}), industry: e.target.value } })}
                  />
                  <select
                    className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-black text-[10px] uppercase"
                    value={campaignConfig.audience?.lifecycleStage || 'Lead'}
                    onChange={(e) => setCampaignConfig({ ...campaignConfig, audience: { ...(campaignConfig.audience || {}), lifecycleStage: e.target.value } })}
                  >
                    <option value="Lead">Lead</option>
                    <option value="MQL">MQL</option>
                    <option value="SQL">SQL</option>
                    <option value="Customer">Customer</option>
                  </select>
                  <select
                    className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-black text-[10px] uppercase"
                    value={campaignConfig.audience?.region || 'UK'}
                    onChange={(e) => setCampaignConfig({ ...campaignConfig, audience: { ...(campaignConfig.audience || {}), region: e.target.value } })}
                  >
                    <option value="UK">UK</option>
                    <option value="NG">Nigeria</option>
                    <option value="EU">EU</option>
                    <option value="Global">Global</option>
                  </select>
                  <input
                    type="number"
                    className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-black text-center text-xs"
                    value={campaignConfig.audience?.minEngagement || 0}
                    onChange={(e) => setCampaignConfig({ ...campaignConfig, audience: { ...(campaignConfig.audience || {}), minEngagement: Number(e.target.value || 0) } })}
                  />
                </div>
                <label className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Consent Required
                  <input
                    type="checkbox"
                    checked={Boolean(campaignConfig.audience?.consentRequired)}
                    onChange={(e) => setCampaignConfig({ ...campaignConfig, audience: { ...(campaignConfig.audience || {}), consentRequired: e.target.checked } })}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </label>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Channels</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['email', 'sms', 'whatsapp'] as const).map((channel) => (
                    <label key={channel} className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                      {channel}
                      <input
                        type="checkbox"
                        checked={Boolean(campaignConfig.channels?.[channel])}
                        onChange={(e) => setCampaignConfig({
                          ...campaignConfig,
                          channels: { ...(campaignConfig.channels || { email: false, sms: false, whatsapp: false }), [channel]: e.target.checked }
                        })}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </label>
                  ))}
                </div>
              </div>
              {(campaignConfig.channels?.email || campaignConfig.type === 'email') && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email Content</label>
                  <div className="flex flex-wrap gap-2">
                    {CAMPAIGN_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() => setCampaignConfig({
                          ...campaignConfig,
                          content: {
                            ...(campaignConfig.content || {}),
                            emailSubject: tpl.subject,
                            emailBody: tpl.email,
                            smsBody: tpl.sms,
                          },
                        })}
                        className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-brand-500 hover:text-brand-600"
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                  <input
                    className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-xs"
                    placeholder="Email subject"
                    value={campaignConfig.content?.emailSubject || ''}
                    onChange={(e) => setCampaignConfig({
                      ...campaignConfig,
                      content: { ...(campaignConfig.content || {}), emailSubject: e.target.value }
                    })}
                  />
                  <textarea
                    className="w-full min-h-[120px] bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-xs"
                    placeholder="Email body"
                    value={campaignConfig.content?.emailBody || ''}
                    onChange={(e) => setCampaignConfig({
                      ...campaignConfig,
                      content: { ...(campaignConfig.content || {}), emailBody: e.target.value }
                    })}
                  />
                  <button
                    onClick={handleCampaignDraft}
                    disabled={isCampaignDrafting}
                    className="w-full py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-60"
                  >
                    {isCampaignDrafting ? 'Drafting...' : 'AI Draft Email'}
                  </button>
                </div>
              )}
              {campaignConfig.channels?.sms && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">SMS Content</label>
                  <textarea
                    className="w-full min-h-[90px] bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-xs"
                    placeholder="SMS body"
                    value={campaignConfig.content?.smsBody || ''}
                    onChange={(e) => setCampaignConfig({
                      ...campaignConfig,
                      content: { ...(campaignConfig.content || {}), smsBody: e.target.value }
                    })}
                  />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Journey</label>
                <div className="space-y-2">
                  {(campaignConfig.journey || []).map(step => (
                    <div key={step.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          className="flex-1 bg-white p-2 rounded-lg border border-slate-200 text-[10px] font-black uppercase"
                          value={step.type}
                          onChange={(e) => setCampaignConfig({
                            ...campaignConfig,
                            journey: (campaignConfig.journey || []).map(s => s.id === step.id ? { ...s, type: e.target.value as any } : s)
                          })}
                        >
                          <option value="send_email">Send Email</option>
                          <option value="send_sms">Send SMS</option>
                          <option value="send_whatsapp">Send WhatsApp</option>
                          <option value="wait">Wait</option>
                          <option value="notify_sales">Notify Sales</option>
                          <option value="update_field">Update Field</option>
                        </select>
                        <button
                          onClick={() => setCampaignConfig({
                            ...campaignConfig,
                            journey: (campaignConfig.journey || []).filter(s => s.id !== step.id)
                          })}
                          className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200"
                        >
                          <Trash2 size={12}/>
                        </button>
                      </div>
                      <input
                        className="w-full bg-white p-2 rounded-lg border border-slate-200 text-xs font-bold"
                        value={step.label}
                        onChange={(e) => setCampaignConfig({
                          ...campaignConfig,
                          journey: (campaignConfig.journey || []).map(s => s.id === step.id ? { ...s, label: e.target.value } : s)
                        })}
                        placeholder="Step label"
                      />
                      {step.type === 'wait' && (
                        <input
                          type="number"
                          className="w-full bg-white p-2 rounded-lg border border-slate-200 text-xs font-black text-center"
                          value={step.delayHours || 0}
                          onChange={(e) => setCampaignConfig({
                            ...campaignConfig,
                            journey: (campaignConfig.journey || []).map(s => s.id === step.id ? { ...s, delayHours: Number(e.target.value || 0) } : s)
                          })}
                          placeholder="Delay hours"
                        />
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setCampaignConfig({
                    ...campaignConfig,
                    journey: [...(campaignConfig.journey || []), { id: `step_${Date.now()}`, type: 'send_email', label: 'New step' }]
                  })}
                  className="w-full py-2 border border-dashed border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-brand-500 hover:text-brand-600"
                >
                  Add Step
                </button>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200 shrink-0 flex gap-2">
              <button
                onClick={() => setCampaignConfig(null)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onUpdateCampaign?.(campaignConfig);
                  addNotification('success', 'Campaign updated.');
                  setCampaignConfig(null);
                }}
                className="flex-1 py-3 bg-brand-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showContactModal && activeConversation && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-8 border border-white/20 relative overflow-hidden">
            <button onClick={() => setShowContactModal(false)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"><X size={18}/></button>
            <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-800 mb-6">Contact Profile</h3>
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Name</span>
                <span className="font-bold text-slate-700">{activeConversation.contactName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Phone</span>
                <span className="font-bold text-slate-700">{activeConversation.contactPhone}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Channel</span>
                <span className="font-bold text-slate-700 uppercase">{activeConversation.channel}</span>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-3 gap-3">
              <button onClick={() => onOutboundCall?.(activeConversation.contactPhone)} className="px-4 py-3 rounded-xl bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest">Call</button>
              <button onClick={() => window.open(`mailto:${activeConversation.contactPhone}@customer.local`, '_blank')} className="px-4 py-3 rounded-xl bg-slate-100 text-slate-700 text-[9px] font-black uppercase tracking-widest">Email</button>
              <button onClick={handleCreateCrmContact} className="px-4 py-3 rounded-xl bg-brand-600 text-white text-[9px] font-black uppercase tracking-widest">Sync CRM</button>
            </div>
          </div>
        </div>
      )}

      {showThreadSettings && activeConversation && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-8 border border-white/20 relative overflow-hidden">
            <button onClick={() => setShowThreadSettings(false)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"><X size={18}/></button>
            <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-800 mb-6">Thread Settings</h3>
            <div className="space-y-5">
              <label className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                Mute Notifications
                <input
                  type="checkbox"
                  checked={Boolean(conversationPrefs[activeConversation.id]?.muted)}
                  onChange={() => toggleConversationPref(activeConversation.id, 'muted')}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </label>
              <label className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                Mark Priority
                <input
                  type="checkbox"
                  checked={Boolean(conversationPrefs[activeConversation.id]?.priority)}
                  onChange={() => toggleConversationPref(activeConversation.id, 'priority')}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </label>
              <button
                onClick={() => updateConversation(activeConversation.id, { status: activeConversation.status === 'open' ? 'closed' : 'open' })}
                className="w-full py-3 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
              >
                {activeConversation.status === 'open' ? 'Close Thread' : 'Reopen Thread'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTerminateConfirm && activeConversation && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md p-8 border border-white/20 relative overflow-hidden text-center">
            <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-800 mb-4">Terminate Thread</h3>
            <p className="text-sm text-slate-500 mb-6">This will close the conversation and hide it from active inbox.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setShowTerminateConfirm(false)} className="px-4 py-3 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest">Cancel</button>
              <button onClick={terminateConversation} className="px-4 py-3 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase tracking-widest">Terminate</button>
            </div>
          </div>
        </div>
      )}

      {showLeadModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-8 border border-white/20 relative overflow-hidden">
            <button onClick={() => setShowLeadModal(false)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"><X size={18}/></button>
            <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-800 mb-6">Add Lead</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input
                  className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-sm"
                  placeholder="Name"
                  value={newLead.name}
                  onChange={e => setNewLead({ ...newLead, name: e.target.value })}
                />
                <input
                  className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-sm"
                  placeholder="Company"
                  value={newLead.company}
                  onChange={e => setNewLead({ ...newLead, company: e.target.value })}
                />
                <input
                  className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-sm"
                  placeholder="Phone"
                  value={newLead.phone}
                  onChange={e => setNewLead({ ...newLead, phone: e.target.value })}
                />
                <input
                  className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-sm"
                  placeholder="Email"
                  value={newLead.email}
                  onChange={e => setNewLead({ ...newLead, email: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <select
                  className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-black uppercase text-xs"
                  value={newLead.status}
                  onChange={e => setNewLead({ ...newLead, status: e.target.value })}
                >
                  <option value="Lead">Lead</option>
                  <option value="MQL">MQL</option>
                  <option value="SQL">SQL</option>
                  <option value="Customer">Customer</option>
                </select>
                <input
                  className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-sm"
                  placeholder="Notes"
                  value={newLead.notes}
                  onChange={e => setNewLead({ ...newLead, notes: e.target.value })}
                />
              </div>
              <button onClick={handleCreateLead} disabled={!canManage} className="w-full py-3 bg-brand-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-60">
                Save Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCHEDULE SYNC MODAL */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-white rounded-[4rem] shadow-4xl w-full max-w-lg p-16 border border-white/20 relative overflow-hidden">
              <h3 className="text-4xl font-black italic tracking-tighter uppercase text-slate-800 mb-10 text-center">Schedule Meeting</h3>
              <div className="space-y-8">
                 <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Meeting Title</label>
                    <input className="w-full bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 font-bold focus:border-brand-500 outline-none transition-all" placeholder="e.g. Behavioral Flux Review" value={newMeeting.title} onChange={e => setNewMeeting({...newMeeting, title: e.target.value})}/>
                 </div>
                 <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Attendee</label>
                    <select className="w-full bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 font-black uppercase text-xs focus:border-brand-500 outline-none" value={newMeeting.attendeeId} onChange={e => setNewMeeting({...newMeeting, attendeeId: e.target.value})}>
                       <option value="">Select Cluster Node</option>
                       {settings.team.filter(t => t.id !== user.id).map(t => (
                          <option key={t.id} value={t.id}>{t.name} (EXT {t.extension})</option>
                       ))}
                    </select>
                 </div>
                 <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                       <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Date</label>
                       <input type="date" className="w-full bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 font-black text-center text-xs focus:border-brand-500 outline-none" value={newMeeting.date} onChange={e => setNewMeeting({...newMeeting, date: e.target.value})}/>
                    </div>
                    <div className="space-y-3">
                       <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Time</label>
                       <input type="time" className="w-full bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 font-black text-center text-xs focus:border-brand-500 outline-none" value={newMeeting.time} onChange={e => setNewMeeting({...newMeeting, time: e.target.value})}/>
                    </div>
                 </div>
                 <button 
                 onClick={() => {
                    const startTime = new Date(`${newMeeting.date}T${newMeeting.time}`).getTime();
                    const roomId = `room_${Date.now()}`;
                    const meeting: Meeting = { 
                      id: `m_${Date.now()}`, 
                      roomId,
                      title: newMeeting.title || 'Meeting', 
                      startTime, 
                      duration: 30, 
                      organizerId: user.id, 
                      attendees: [
                        { userId: user.id, status: 'accepted' },
                        { userId: newMeeting.attendeeId, status: 'pending' }
                      ].filter(a => a.userId),
                      description: 'Invite sent.',
                      status: 'upcoming', 
                      isRecording: false,
                      isRecurring: newMeeting.isRecurring, 
                      recurrencePattern: newMeeting.isRecurring ? newMeeting.pattern : undefined 
                    };
                    onUpdateMeetings([meeting, ...meetings]);
                    setShowScheduleModal(false);
                    addNotification('success', 'Meeting invite sent.');
                  }}
                  className="w-full py-7 bg-brand-600 text-white rounded-[2.5rem] font-black uppercase tracking-[0.3em] shadow-3xl hover:bg-brand-700 transition-all active:scale-95 text-xs"
                 >
                    Schedule
                 </button>
                 <button onClick={() => setShowScheduleModal(false)} className="w-full text-slate-400 font-bold uppercase tracking-widest text-[10px] hover:text-slate-600 transition-all text-center">Cancel</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

