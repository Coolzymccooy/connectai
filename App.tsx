
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LayoutDashboard, Phone, Settings, LogOut, Sparkles, Mic, PlayCircle, Bot, Shield, MessageSquare, Bell, X, CheckCircle, Info, AlertTriangle, Trash2, Mail, PhoneIncoming, FileText, UserCheck, Loader2 } from 'lucide-react';
import { Role, User, Call, CallStatus, AgentStatus, AppSettings, Notification, Lead, Campaign, Meeting, CallDirection } from './types';
import { AgentConsole } from './components/AgentConsole';
import { SupervisorDashboard } from './components/SupervisorDashboard';
import { AdminSettings } from './components/AdminSettings';
import { Softphone } from './components/Softphone';
import { CallLogView } from './components/CallLogView';
import { LoginScreen } from './components/LoginScreen';
import { ToastContainer } from './components/ToastContainer';
import { HeaderProfileMenu } from './components/HeaderProfileMenu';
import { VideoBridge } from './components/VideoBridge';
import { LandingPage } from './components/LandingPage';
import { BrandLogo } from './components/BrandLogo';
import { LiveCallService } from './services/liveCallService';
import { auth, db, onAuthStateChanged, signOut, collection, query, where, onSnapshot } from './services/firebase';
import * as dbService from './services/dbService';
import { synthesizeSpeech } from './services/geminiService';
import { fetchCalendarEvents, createCalendarEvent, updateCalendarEvent } from './services/calendarService';
import { fetchCampaigns, createCampaign, updateCampaign } from './services/campaignService';
import { fetchCallById, fetchCallLogs, updateCall as updateCallLog } from './services/callLogService';
import { fetchSettingsApi, saveSettingsApi } from './services/settingsService';
import { fetchInvites } from './services/authPolicyService';
import { sanitizeCallForStorage } from './utils/gdpr';

const DEFAULT_SETTINGS: AppSettings = {
  broadcastCenter: {
    messages: [],
  },
  desktopRelease: {
    latestVersion: '0.0.0-beta',
    windowsDownloadUrl: 'https://github.com/Coolzymccooy/connectai/releases/latest/download/ConnectAI-Desktop-windows-x64.msi',
    releaseNotesUrl: 'https://github.com/Coolzymccooy/connectai/blob/master/CHANGELOG.md',
    releasesPageUrl: 'https://github.com/Coolzymccooy/connectai/releases',
    publishedAt: new Date('2026-02-14T00:00:00.000Z').toISOString(),
    fileName: 'ConnectAI-Desktop-windows-x64.msi',
    fileSizeLabel: 'Coming soon',
    unsignedBeta: true,
  },
  integrations: { hubSpot: { enabled: true, syncContacts: true, syncDeals: true, syncTasks: false, logs: [] }, primaryCrm: 'HubSpot', webhooks: [], schemaMappings: [], pipedrive: false, salesforce: false },
  compliance: { jurisdiction: 'UK', pciMode: false, playConsentMessage: true, anonymizePii: false, retentionDays: '90', exportEnabled: true },
  subscription: {
    plan: 'Growth', seats: 20, balance: 420.50, autoTopUp: true, nextBillingDate: 'Nov 01, 2025',
    currency: 'GBP',
    usage: { aiTokens: 450000, aiTokenLimit: 1000000, voiceMinutes: 1250, voiceMinuteLimit: 5000 },
    paymentMethod: 'Mastercard •••• 9921'
  },
  ivr: {
    phoneNumber: '+1 (555) 012-3456',
    welcomeMessage: 'Welcome to ConnectAI. For sales, press 1. For support, press 2.',
    options: [
      { key: '1', action: 'QUEUE', target: 'Sales', label: 'Sales' },
      { key: '2', action: 'QUEUE', target: 'Support', label: 'Support' }
    ],
    departments: [
      { id: 'dept_sales', name: 'Sales', targetType: 'queue', target: 'Sales' },
      { id: 'dept_support', name: 'Support', targetType: 'queue', target: 'Support' },
      { id: 'dept_billing', name: 'Billing', targetType: 'queue', target: 'Billing' }
    ],
  },
  voice: { allowedNumbers: [] },
  bot: { enabled: true, name: 'ConnectBot', persona: 'You are a helpful customer service assistant for ConnectAI.', deflectionGoal: 35 },
  auth: { inviteOnly: false, allowedDomains: [], autoTenantByDomain: false, domainTenantMap: [] },
  team: [
    { id: 'u_agent', name: 'Sarah Agent', role: Role.AGENT, avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah', status: 'active', extension: '101', currentPresence: AgentStatus.AVAILABLE, email: 'sarah@connectai.io', allowedNumbers: [], restrictOutboundNumbers: false, canAccessRecordings: false },
    { id: 'u_supervisor', name: 'Mike Supervisor', role: Role.SUPERVISOR, avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Mike', status: 'active', extension: '201', currentPresence: AgentStatus.AVAILABLE, email: 'mike@connectai.io', allowedNumbers: [], restrictOutboundNumbers: false, canAccessRecordings: false },
    { id: 'u_admin', name: 'Sys Admin', role: Role.ADMIN, avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin', status: 'active', extension: '999', currentPresence: AgentStatus.AVAILABLE, email: 'admin@connectai.io', allowedNumbers: [], restrictOutboundNumbers: false, canAccessRecordings: true }
  ],
  workflows: []
};

const PERSONAS = [
  { id: 'angry_billing', name: 'Angry Customer', prompt: 'You are an angry customer named John. Frustrated about a $50 overcharge.' },
  { id: 'curious_lead', name: 'Curious Lead', prompt: 'You are Lisa, a polite business owner looking for an AI call center.' },
  { id: 'self_service', name: 'AI Voice Bot', prompt: 'ConnectAI Voice Bot mode.' }
];

const normalizeEmail = (email?: string) => (email || '').trim().toLowerCase();
const normalizeName = (name?: string) => (name || '').trim().toLowerCase();
const rolePriority: Record<Role, number> = {
  [Role.AGENT]: 1,
  [Role.SUPERVISOR]: 2,
  [Role.ADMIN]: 3,
};
const getHighestRole = (roles: Role[]) => roles.sort((a, b) => rolePriority[b] - rolePriority[a])[0] || Role.AGENT;

const teamFingerprint = (member: User) => {
  const email = normalizeEmail(member.email);
  if (email) return `email:${email}`;
  const extension = (member.extension || '').trim().toLowerCase();
  const name = normalizeName(member.name);
  return `sig:${member.role}:${name}:${extension}`;
};

const upsertTeamMember = (team: User[], member: User): User[] => {
  const normalizedMember: User = {
    ...member,
    currentPresence: member.currentPresence || AgentStatus.AVAILABLE,
  };
  const memberEmail = normalizeEmail(member.email);
  const fingerprint = teamFingerprint(member);
  const idx = team.findIndex((u) => {
    if (u.id === member.id) return true;
    const userEmail = normalizeEmail(u.email);
    if (memberEmail && userEmail === memberEmail) return true;
    return teamFingerprint(u) === fingerprint;
  });
  if (idx >= 0) {
    const next = [...team];
    const mergedMember: User = { ...next[idx], ...normalizedMember };
    if (normalizedMember.canAccessRecordings === undefined) mergedMember.canAccessRecordings = next[idx].canAccessRecordings;
    if (normalizedMember.restrictOutboundNumbers === undefined) mergedMember.restrictOutboundNumbers = next[idx].restrictOutboundNumbers;
    if (normalizedMember.allowedNumbers === undefined) mergedMember.allowedNumbers = next[idx].allowedNumbers;
    next[idx] = mergedMember;
    return next;
  }
  return [...team, normalizedMember];
};

const dedupeTeamMembers = (team: User[]): User[] => {
  return team.reduce((acc, member) => upsertTeamMember(acc, member), [] as User[]);
};

const mergeTeamWithDirectory = (team: User[], members: User[]): User[] => {
  const merged = members.reduce((acc, member) => upsertTeamMember(acc, member), dedupeTeamMembers(team));
  return dedupeTeamMembers(merged);
};

const buildMergedSettings = (saved: Partial<AppSettings> | null | undefined): AppSettings => {
  const source = saved || {};
  const sourceTeam = Array.isArray((source as any).team) ? (source as any).team : [];
  const merged = {
    ...DEFAULT_SETTINGS,
    ...source,
    broadcastCenter: {
      ...DEFAULT_SETTINGS.broadcastCenter,
      ...((source as any).broadcastCenter || {}),
      messages: Array.isArray((source as any).broadcastCenter?.messages) ? (source as any).broadcastCenter.messages : DEFAULT_SETTINGS.broadcastCenter.messages,
    },
    desktopRelease: {
      ...DEFAULT_SETTINGS.desktopRelease,
      ...((source as any).desktopRelease || {}),
    },
    subscription: {
      ...DEFAULT_SETTINGS.subscription,
      ...((source as any).subscription || {}),
      usage: {
        ...DEFAULT_SETTINGS.subscription.usage,
        ...((source as any).subscription?.usage || {}),
      },
    },
    ivr: {
      ...DEFAULT_SETTINGS.ivr,
      ...((source as any).ivr || {}),
      options: Array.isArray((source as any).ivr?.options) ? (source as any).ivr.options : DEFAULT_SETTINGS.ivr.options,
      departments: Array.isArray((source as any).ivr?.departments) ? (source as any).ivr.departments : (DEFAULT_SETTINGS.ivr as any).departments,
    },
    voice: { ...DEFAULT_SETTINGS.voice, ...((source as any).voice || {}) },
    auth: { ...DEFAULT_SETTINGS.auth, ...((source as any).auth || {}) },
  };
  return {
    ...merged,
    team: dedupeTeamMembers(mergeTeamWithDirectory(DEFAULT_SETTINGS.team, sourceTeam)),
  };
};

const buildInvitePlaceholder = (invite: any): User => {
  const email = normalizeEmail(invite?.email);
  const localPart = (email.split('@')[0] || 'team-member').replace(/[^a-z0-9]/gi, '-');
  const role = (invite?.role as Role) || Role.AGENT;
  const defaultByRole = DEFAULT_SETTINGS.team.find((t) => t.role === role);
  return {
    id: `invite_${localPart}`,
    name: localPart.replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
    role,
    avatarUrl: defaultByRole?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(localPart)}`,
    extension: defaultByRole?.extension,
    email,
    status: 'active',
    currentPresence: AgentStatus.OFFLINE,
    ...(role === Role.ADMIN ? { canAccessRecordings: true } : {}),
  };
};

const App: React.FC = () => {
  const [buildMeta, setBuildMeta] = useState<{ gitSha?: string; buildTime?: string } | null>(null);
  const [dismissedBroadcastIds, setDismissedBroadcastIds] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [lobbyPending, setLobbyPending] = useState<{ roomId: string; callId: string; hostId?: string } | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(AgentStatus.OFFLINE);
  const [view, setView] = useState<'agent' | 'supervisor' | 'admin' | 'logs'>('agent');
  const [liveService, setLiveService] = useState<LiveCallService | null>(null);
  const [showSoftphone, setShowSoftphone] = useState(false);
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState(PERSONAS[0].id);
  const [audioLevel, setAudioLevel] = useState(0);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [callHistory, setCallHistory] = useState<Call[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([
    {
      id: 'cam_1',
      name: 'Q4 Enterprise Outreach',
      type: 'call',
      status: 'running',
      targetCount: 1500,
      processedCount: 842,
      successCount: 156,
      aiPersona: 'Professional Concierge',
      hourlyStats: [],
      audience: { industry: 'SaaS', lifecycleStage: 'MQL', region: 'UK', minEngagement: 40, consentRequired: true },
      channels: { email: true, sms: false, whatsapp: false },
      journey: [
        { id: 'step_1', type: 'send_email', label: 'Welcome email' },
        { id: 'step_2', type: 'wait', label: 'Wait 48h', delayHours: 48 },
        { id: 'step_3', type: 'notify_sales', label: 'Notify sales' }
      ],
      metrics: { sent: 1200, delivered: 1150, opened: 540, clicked: 210, unsubscribed: 12 }
    },
    {
      id: 'cam_2',
      name: 'Retention SMS Bot',
      type: 'sms',
      status: 'running',
      targetCount: 5000,
      processedCount: 3240,
      successCount: 1120,
      aiPersona: 'Friendly Assistant',
      hourlyStats: [],
      audience: { industry: 'Retail', lifecycleStage: 'Customer', region: 'UK', minEngagement: 20, consentRequired: true },
      channels: { email: false, sms: true, whatsapp: true },
      journey: [
        { id: 'step_1', type: 'send_sms', label: 'Renewal reminder' },
        { id: 'step_2', type: 'wait', label: 'Wait 24h', delayHours: 24 }
      ],
      metrics: { sent: 3100, delivered: 3000, opened: 0, clicked: 0, unsubscribed: 44 }
    }
  ]);
  const [isFirebaseConfigured, setIsFirebaseConfigured] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  // Track verification state separate from User | null
  const [isUnverified, setIsUnverified] = useState(false);
  const [authBootstrapping, setAuthBootstrapping] = useState(true);
  const [hasHydratedSettings, setHasHydratedSettings] = useState(false);
  const [incomingCallBanner, setIncomingCallBanner] = useState<Call | null>(null);
  const [lastTeamSyncAt, setLastTeamSyncAt] = useState(0);
  
  const mountedRef = useRef(true);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const internalPollCooldownRef = useRef(0);
  const activeCallPollCooldownRef = useRef(0);
  const callFeedPollCooldownRef = useRef(0);
  const settingsSaveCooldownRef = useRef(0);
  const seenBroadcastNoticeRef = useRef<Record<string, boolean>>({});
  const activeCallSessionKeyRef = useRef<string>('');
  const unansweredCallTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const incomingToneTimerRef = useRef<NodeJS.Timeout | null>(null);
  const incomingToneAudioCtxRef = useRef<AudioContext | null>(null);

  const normalizeCallForSession = useCallback((call: Call): Call => {
    if (!currentUser) return call;
    const normalized: Call = { ...call };
    const myEmail = normalizeEmail(currentUser.email);
    const agentEmail = normalizeEmail(normalized.agentEmail);
    const targetEmail = normalizeEmail(normalized.targetAgentEmail || normalized.customerEmail);
    if (!normalized.agentId && myEmail && agentEmail && myEmail === agentEmail) {
      normalized.agentId = currentUser.id;
    }
    if (!normalized.targetAgentId && targetEmail) {
      const targetMember = appSettings.team.find((member) => normalizeEmail(member.email) === targetEmail);
      if (targetMember?.id) normalized.targetAgentId = targetMember.id;
    }
    if (!normalized.targetAgentEmail && normalized.customerEmail) {
      normalized.targetAgentEmail = normalized.customerEmail;
    }
    if (normalized.direction === 'internal') {
      const orderedParticipants = [
        normalized.targetAgentId,
        normalized.agentId,
        ...(Array.isArray(normalized.participants) ? normalized.participants : []),
        currentUser.id,
      ].filter(Boolean) as string[];
      normalized.participants = Array.from(new Set(orderedParticipants));
    }
    return normalized;
  }, [currentUser?.id, currentUser?.email, appSettings.team]);

  const matchesCurrentUserAsTarget = useCallback((call: Call) => {
    if (!currentUser) return false;
    const normalized = normalizeCallForSession(call);
    const myEmail = normalizeEmail(currentUser.email);
    const targetEmail = normalizeEmail(normalized.targetAgentEmail || normalized.customerEmail);
    const originatedByMe =
      normalized.agentId === currentUser.id ||
      (myEmail && normalizeEmail(normalized.agentEmail) === myEmail);
    if (normalized.targetAgentId && normalized.targetAgentId === currentUser.id) return true;
    if (targetEmail && myEmail && targetEmail === myEmail) return true;
    if (Array.isArray(normalized.participants) && normalized.participants.length > 0) {
      // Internal calls are created as [target, caller], so index 0 is safest incoming indicator.
      if (normalized.participants[0] === currentUser.id && !originatedByMe) return true;
      if (normalized.participants.length === 1 && normalized.participants[0] === currentUser.id && !originatedByMe) return true;
    }
    return false;
  }, [currentUser?.id, currentUser?.email, normalizeCallForSession]);

  const [route, setRoute] = useState(() => ({
    pathname: typeof window !== 'undefined' ? window.location.pathname : '/',
    hash: typeof window !== 'undefined' ? window.location.hash : ''
  }));

  const markTeamPresenceByEmails = useCallback((emails: string[], presence: AgentStatus) => {
    const emailSet = new Set(emails.map((e) => normalizeEmail(e)).filter(Boolean));
    if (!emailSet.size) return;
    setAppSettings((prev) => {
      const nextTeam = (prev.team || []).map((member) => {
        const memberEmail = normalizeEmail(member.email);
        if (!memberEmail || !emailSet.has(memberEmail)) return member;
        return { ...member, currentPresence: presence };
      });
      return { ...prev, team: nextTeam };
    });
  }, []);

  const playIncomingTone = useCallback(() => {
    if (typeof window === 'undefined') return;
    const AudioContextRef = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextRef) return;
    try {
      if (!incomingToneAudioCtxRef.current) {
        incomingToneAudioCtxRef.current = new AudioContextRef();
      }
      const ctx = incomingToneAudioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(920, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
      // Secondary ping for better audibility.
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(760, ctx.currentTime + 0.32);
      gain2.gain.setValueAtTime(0.0001, ctx.currentTime + 0.32);
      gain2.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.36);
      gain2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.58);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.32);
      osc2.stop(ctx.currentTime + 0.6);
    } catch {
      // no-op
    }
  }, []);

  // Callbacks that are dependencies of other hooks must be declared first.
  const persistCall = useCallback(async (call: Call) => {
    const safeCall = sanitizeCallForStorage(call, appSettings.compliance);
    if (!isFirebaseConfigured) {
      await updateCallLog(call.id, safeCall).catch(() => {});
      return;
    }
    await dbService.saveCall(safeCall);
  }, [isFirebaseConfigured, appSettings.compliance]);

  const scheduleUnansweredAutoHangup = useCallback((callId: string) => {
    if (!callId) return;
    const existing = unansweredCallTimersRef.current.get(callId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      try {
        const latest = await fetchCallById(callId).catch(() => null);
        const status = latest?.status;
        if (status === CallStatus.DIALING || status === CallStatus.RINGING) {
          const ended: Call = latest
            ? ({ ...latest, id: callId, status: CallStatus.ENDED } as Call)
            : ({
                id: callId,
                direction: 'internal',
                customerName: 'Missed internal call',
                phoneNumber: 'EXT',
                queue: 'Internal',
                startTime: Date.now(),
                durationSeconds: 0,
                status: CallStatus.ENDED,
                transcript: [],
              } as Call);
          await persistCall(ended);
          setIncomingCallBanner((prev) => (prev?.id === callId ? null : prev));
          setActiveCall((prev) => (prev?.id === callId ? null : prev));
          addNotification('info', 'Call ended automatically after 30s with no answer.');
        }
      } catch {
        // best effort
      } finally {
        unansweredCallTimersRef.current.delete(callId);
      }
    }, 30000);
    unansweredCallTimersRef.current.set(callId, timer);
  }, [persistCall]);

  useEffect(() => {
    let cancelled = false;
    fetch('/version.json', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setBuildMeta({
          gitSha: typeof data.gitSha === 'string' ? data.gitSha : '',
          buildTime: typeof data.buildTime === 'string' ? data.buildTime : '',
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Activity Tracking: 5 minutes idle -> sign out
  const resetIdleTimer = useCallback(() => {
    if (!currentUser || activeCall) return;
    
    if (agentStatus === AgentStatus.AWAY || agentStatus === AgentStatus.OFFLINE) {
      setAgentStatus(AgentStatus.AVAILABLE);
    }

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    
    idleTimerRef.current = setTimeout(() => {
      if (activeCall) return;
      setAuthNotice('Session expired due to inactivity.');
      setAgentStatus(AgentStatus.OFFLINE);
      signOut(auth).catch(() => {}).finally(() => setCurrentUser(null));
    }, 5 * 60 * 1000); // 5 minutes
  }, [currentUser, activeCall, agentStatus]);

  useEffect(() => {
    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('click', resetIdleTimer);
    return () => {
        window.removeEventListener('mousemove', resetIdleTimer);
        window.removeEventListener('keydown', resetIdleTimer);
        window.removeEventListener('click', resetIdleTimer);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleRouteChange = () => {
      setRoute({ pathname: window.location.pathname, hash: window.location.hash });
    };
    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const key = `connectai_broadcast_dismissed_${currentUser.id}`;
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      setDismissedBroadcastIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setDismissedBroadcastIds([]);
    }
  }, [currentUser?.id]);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (incomingToneTimerRef.current) {
        clearInterval(incomingToneTimerRef.current);
        incomingToneTimerRef.current = null;
      }
      if (incomingToneAudioCtxRef.current) {
        incomingToneAudioCtxRef.current.close().catch(() => {});
        incomingToneAudioCtxRef.current = null;
      }
      unansweredCallTimersRef.current.forEach((timer) => clearTimeout(timer));
      unansweredCallTimersRef.current.clear();
    };
  }, []);
  const pathname = route.pathname;
  const hash = route.hash;
  const isHashApp = hash.startsWith('#/app');
  const isLanding = !isHashApp && (pathname === '/' || pathname.startsWith('/landing'));
  const isAppRoute = isHashApp || pathname.startsWith('/app') || pathname.startsWith('/login');

  useEffect(() => {
    let verificationPoller: NodeJS.Timeout;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthBootstrapping(false);
      if (!user) {
        localStorage.removeItem('connectai_auth_token');
        setCurrentUser(null);
        setIsUnverified(false);
        return;
      }
      
      // Smart Verification Handling
      if (!user.emailVerified && user.providerData.some((p) => p.providerId === 'password')) {
        setIsUnverified(true);
        setAuthNotice('Verification Pending');
        // Poll for verification status
        verificationPoller = setInterval(async () => {
            await user.reload();
            if (user.emailVerified) {
                clearInterval(verificationPoller);
                setIsUnverified(false);
                setAuthNotice(null);
                // Trigger re-render/logic by forcing update or just letting effect run
                // But onAuthStateChanged might not fire on reload alone, so we proceed manually:
                finishLogin(user);
            }
        }, 3000);
        return;
      }

      if (user.emailVerified) {
        setIsUnverified(false);
        localStorage.removeItem('connectai_pending_verification_email');
        setAuthNotice(null);
      }
      
      finishLogin(user);
    });
    return () => {
        unsubscribe();
        if (verificationPoller) clearInterval(verificationPoller);
    };
  }, [isFirebaseConfigured]);

  const finishLogin = async (user: any) => {
    try {
      const storedRole = (localStorage.getItem(`connectai_role_${user.uid}`) as Role) || Role.AGENT;
      const normalizedEmail = normalizeEmail(user.email || '');
      const knownMatches = normalizedEmail
        ? appSettings.team.filter((m) => normalizeEmail(m.email) === normalizedEmail)
        : [];
      const lockedRole = knownMatches.length ? getHighestRole(knownMatches.map((m) => m.role)) : null;
      const knownMember = lockedRole ? (knownMatches.find((m) => m.role === lockedRole) || knownMatches[0]) : null;
      const effectiveRole = knownMember?.role || storedRole;
      const roleTemplate = knownMember || appSettings.team.find(u => u.role === effectiveRole) || DEFAULT_SETTINGS.team.find(u => u.role === effectiveRole);
      const profile: User = {
        id: user.uid,
        name: user.displayName || user.email || roleTemplate?.name || 'User',
        role: effectiveRole,
        avatarUrl: roleTemplate?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
        extension: roleTemplate?.extension,
        email: user.email || undefined,
        status: 'active',
        currentPresence: roleTemplate?.currentPresence || AgentStatus.AVAILABLE,
        canAccessRecordings: roleTemplate?.canAccessRecordings ?? (effectiveRole === Role.ADMIN)
      };
      if (effectiveRole !== storedRole) {
        localStorage.setItem(`connectai_role_${user.uid}`, effectiveRole);
      }
      const token = await user.getIdToken();
      localStorage.setItem('connectai_auth_token', token);
      setCurrentUser(profile);
      setAppSettings(prev => {
        const next = { ...prev, team: dedupeTeamMembers(upsertTeamMember(prev.team, profile)) };
        if (hasHydratedSettings) saveSettingsSafely(next).catch(() => {});
        return next;
      });
      setView(effectiveRole === Role.SUPERVISOR ? 'supervisor' : effectiveRole === Role.ADMIN ? 'admin' : 'agent');
      setAgentStatus(profile.currentPresence || AgentStatus.AVAILABLE);
      if (isFirebaseConfigured) await dbService.saveUser(profile);
    } catch (error) {
      console.error('finishLogin failed:', error);
      setAuthNotice('Login sync failed. Refresh and try again.');
    }
  };

  useEffect(() => {
    const apiKey = (auth as any)?.app?.options?.apiKey;
    const firebaseDisabled = (import.meta.env as any).VITE_FIREBASE_DISABLED === 'true';
    setIsFirebaseConfigured(!firebaseDisabled && Boolean(apiKey) && apiKey !== "SIMULATED_KEY");
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const days = Number(appSettings.compliance.retentionDays || 0);
    if (!Number.isFinite(days) || days <= 0) return;
    dbService.purgeExpiredCalls().catch(() => { });
  }, [isFirebaseConfigured, appSettings.compliance.retentionDays]);

  // --- Real-Time Colleague Signaling Listener ---
  useEffect(() => {
    if (!currentUser || !isFirebaseConfigured) return;
    const q = query(
      collection(db, 'calls'),
      where('status', 'in', [CallStatus.DIALING, CallStatus.RINGING, CallStatus.ACTIVE])
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const callData = normalizeCallForSession(change.doc.data() as Call);
          if (!matchesCurrentUserAsTarget(callData)) return;
          if (change.type === 'added' || change.type === 'modified') {
            if (!activeCall || activeCall.id === callData.id || activeCall.status === CallStatus.ENDED) {
              setActiveCall(callData);
              if (callData.status === CallStatus.DIALING) {
                persistCall({ ...callData, status: CallStatus.RINGING });
              }
              if (callData.status === CallStatus.DIALING || callData.status === CallStatus.RINGING) {
                setIncomingCallBanner({ ...callData, status: CallStatus.RINGING });
                addNotification('info', `Incoming ${callData.isVideo ? 'video ' : ''}call from ${callData.agentName || callData.customerName || 'teammate'}.`);
              }
            }
          } else if (change.type === 'removed') {
            if (activeCall?.id === callData.id) handleHangup();
          }
        });
      },
      (err) => {
        const msg = String(err?.message || '').toLowerCase();
        if (msg.includes('permission') || msg.includes('insufficient') || msg.includes('blocked')) {
          setIsFirebaseConfigured(false);
          addNotification('info', 'Realtime channel degraded. Switched to resilient polling mode.');
        }
      }
    );
    return () => unsubscribe();
  }, [currentUser, isFirebaseConfigured, activeCall?.id, matchesCurrentUserAsTarget, normalizeCallForSession]);

  useEffect(() => {
    if (!currentUser) return;
    fetchCampaigns().then((serverCampaigns) => {
      if (serverCampaigns && serverCampaigns.length > 0) {
        setCampaigns(serverCampaigns);
      }
    }).catch(() => { });
    fetchCalendarEvents().then(setMeetings).catch(() => { });
    if (isFirebaseConfigured) {
      const handleFirebaseError = (error: Error) => {
        setIsFirebaseConfigured(false);
      };
      const unsubCalls = dbService.fetchHistoricalCalls((calls) => setCallHistory(calls), handleFirebaseError);
      const unsubLeads = dbService.fetchLeads((leads) => setLeads(leads), handleFirebaseError);
      const unsubUsers = dbService.fetchUsers((users) => {
        setAppSettings((prev) => ({ ...prev, team: mergeTeamWithDirectory(prev.team, users) }));
      }, handleFirebaseError);
      dbService.fetchSettings().then(saved => {
        if (!saved) return;
        const merged = buildMergedSettings(saved);
        setAppSettings((prev) => ({
          ...merged,
          team: dedupeTeamMembers(mergeTeamWithDirectory(merged.team || [], prev.team || [])),
        }));
      }).finally(() => setHasHydratedSettings(true));
      return () => { unsubCalls(); unsubLeads(); unsubUsers(); };
    }
  }, [currentUser, isFirebaseConfigured]);

  useEffect(() => {
    if (!currentUser || isFirebaseConfigured) return;
    const sync = async () => {
      try {
        const saved = await fetchSettingsApi();
        const merged = buildMergedSettings(saved);
        setAppSettings((prev) => ({
          ...merged,
          team: dedupeTeamMembers(mergeTeamWithDirectory(merged.team || [], prev.team || [])),
        }));
      } catch {
        // Best-effort sync for non-Firebase sessions.
      } finally {
        setHasHydratedSettings(true);
      }
    };
    sync();
    const interval = setInterval(sync, 180000);
    return () => clearInterval(interval);
  }, [currentUser, isFirebaseConfigured]);

  useEffect(() => {
    if (!currentUser) return;
    selfHealTeam({ silent: true }).catch(() => {});
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser || isFirebaseConfigured) return;
    let cancelled = false;
    const syncCallFeed = async () => {
      if (Date.now() < callFeedPollCooldownRef.current) return;
      try {
        const calls = await fetchCallLogs({ limit: 300 });
        if (cancelled) return;
        setCallHistory((prev) => {
          const map = new Map<string, Call>();
          for (const item of prev) map.set(item.id, item);
          for (const item of calls) {
            const existing = map.get(item.id);
            map.set(item.id, existing ? { ...existing, ...item } : item);
          }
          if (activeCall && !map.has(activeCall.id)) {
            map.set(activeCall.id, activeCall);
          }
          return Array.from(map.values()).sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
        });
      } catch (err: any) {
        const msg = String(err?.message || '').toLowerCase();
        if (msg.includes('429') || msg.includes('too many requests')) {
          callFeedPollCooldownRef.current = Date.now() + 45000;
        }
      }
    };
    syncCallFeed();
    const interval = setInterval(syncCallFeed, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUser, isFirebaseConfigured, activeCall?.id, activeCall?.status]);

  useEffect(() => {
    if (!currentUser || isFirebaseConfigured) return;
    let cancelled = false;
    const pullInternalSignals = async () => {
      if (activeCall && activeCall.status !== CallStatus.ENDED) return;
      if (Date.now() < internalPollCooldownRef.current) return;
      try {
        const calls = await fetchCallLogs({ limit: 25 });
        if (cancelled) return;
        const signal = calls.find((c) => {
          if (!matchesCurrentUserAsTarget(c)) return false;
          return c.status === CallStatus.DIALING || c.status === CallStatus.RINGING || c.status === CallStatus.ACTIVE;
        });
        if (signal && (!activeCall || activeCall.id === signal.id || activeCall.status === CallStatus.ENDED)) {
          const normalizedSignal = normalizeCallForSession(signal);
          setActiveCall(normalizedSignal);
          if (signal.status === CallStatus.DIALING) {
            await persistCall({ ...normalizedSignal, status: CallStatus.RINGING });
          }
          if (signal.status === CallStatus.DIALING || signal.status === CallStatus.RINGING) {
            setIncomingCallBanner({ ...normalizedSignal, status: CallStatus.RINGING });
            addNotification('info', `Incoming ${normalizedSignal.isVideo ? 'video ' : ''}call from ${normalizedSignal.agentName || normalizedSignal.customerName || 'teammate'}.`);
          }
        }
      } catch (err: any) {
        const msg = String(err?.message || '').toLowerCase();
        if (msg.includes('429') || msg.includes('too many requests')) {
          internalPollCooldownRef.current = Date.now() + 45000;
        }
      }
    };
    pullInternalSignals();
    const interval = setInterval(pullInternalSignals, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUser, isFirebaseConfigured, activeCall?.id, activeCall?.status, persistCall, matchesCurrentUserAsTarget, normalizeCallForSession]);

  const addNotification = (type: Notification['type'], message: string) => {
    const id = Date.now().toString();
    setNotifications(prev => [{ id, type, message }, ...prev]);
    if (!showNotificationPanel) setUnreadCount(prev => prev + 1);
  };

  const roleAudience = currentUser?.role;
  const activeBroadcasts = (appSettings.broadcastCenter?.messages || [])
    .filter((msg: any) => msg.status === 'SENT' && msg.inApp)
    .filter((msg: any) => msg.audience === 'ALL' || msg.audience === roleAudience)
    .filter((msg: any) => !dismissedBroadcastIds.includes(msg.id))
    .sort((a: any, b: any) => {
      const aTs = new Date(a.sentAt || a.createdAt || 0).getTime();
      const bTs = new Date(b.sentAt || b.createdAt || 0).getTime();
      return bTs - aTs;
    });

  useEffect(() => {
    for (const msg of activeBroadcasts.slice(0, 3)) {
      if (seenBroadcastNoticeRef.current[msg.id]) continue;
      seenBroadcastNoticeRef.current[msg.id] = true;
      addNotification('info', `Broadcast: ${msg.title}`);
    }
  }, [activeBroadcasts.map((m: any) => m.id).join('|')]);

  const dismissBroadcast = (broadcastId: string) => {
    if (!currentUser) return;
    const next = Array.from(new Set([...dismissedBroadcastIds, broadcastId]));
    setDismissedBroadcastIds(next);
    const key = `connectai_broadcast_dismissed_${currentUser.id}`;
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore localStorage failures
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    const key = `connectai_active_call_${currentUser.id}`;
    activeCallSessionKeyRef.current = key;
    try {
      if (activeCall && activeCall.status !== CallStatus.ENDED) {
        sessionStorage.setItem(key, activeCall.id);
      } else {
        sessionStorage.removeItem(key);
      }
    } catch {
      // ignore session storage failures
    }
  }, [currentUser?.id, activeCall?.id, activeCall?.status]);

  useEffect(() => {
    if (!incomingCallBanner || incomingCallBanner.status === CallStatus.ENDED || activeCall?.status === CallStatus.ACTIVE) {
      if (incomingToneTimerRef.current) {
        clearInterval(incomingToneTimerRef.current);
        incomingToneTimerRef.current = null;
      }
      return;
    }
    playIncomingTone();
    incomingToneTimerRef.current = setInterval(() => {
      playIncomingTone();
    }, 1800);
    return () => {
      if (incomingToneTimerRef.current) {
        clearInterval(incomingToneTimerRef.current);
        incomingToneTimerRef.current = null;
      }
    };
  }, [incomingCallBanner?.id, incomingCallBanner?.status, activeCall?.status, playIncomingTone]);

  useEffect(() => {
    if (!incomingCallBanner) return;
    const ended = callHistory.find((c) => c.id === incomingCallBanner.id && c.status === CallStatus.ENDED);
    if (ended) {
      setIncomingCallBanner(null);
    }
  }, [incomingCallBanner?.id, callHistory]);

  useEffect(() => {
    if (!activeCall?.id) return;
    if (activeCall.status === CallStatus.DIALING || activeCall.status === CallStatus.RINGING) {
      scheduleUnansweredAutoHangup(activeCall.id);
      return;
    }
    const pending = unansweredCallTimersRef.current.get(activeCall.id);
    if (pending) {
      clearTimeout(pending);
      unansweredCallTimersRef.current.delete(activeCall.id);
    }
  }, [activeCall?.id, activeCall?.status, scheduleUnansweredAutoHangup]);

  useEffect(() => {
    if (!currentUser || activeCall) return;
    let cancelled = false;
    const restoreActiveCall = async () => {
      try {
        const key = `connectai_active_call_${currentUser.id}`;
        const savedId = sessionStorage.getItem(key);
        let recovered: Call | null = null;
        if (savedId) {
          recovered = await fetchCallById(savedId).catch(() => null);
        }
        if (!recovered) {
          const calls = await fetchCallLogs({ limit: 50 });
          const myEmail = normalizeEmail(currentUser.email);
          recovered = calls.find((c) => {
            const active = c.status === CallStatus.DIALING || c.status === CallStatus.RINGING || c.status === CallStatus.ACTIVE || c.status === CallStatus.HOLD;
            if (!active) return false;
            if (c.agentId === currentUser.id || c.targetAgentId === currentUser.id) return true;
            if (myEmail && (normalizeEmail(c.agentEmail) === myEmail || normalizeEmail((c as any).targetAgentEmail || c.customerEmail) === myEmail)) return true;
            return false;
          }) || null;
        }
        if (cancelled || !recovered) return;
        const normalizedRecovered = normalizeCallForSession(recovered);
        setActiveCall(normalizedRecovered);
        if (recovered.status === CallStatus.DIALING || recovered.status === CallStatus.RINGING) {
          setIncomingCallBanner({ ...normalizedRecovered, status: CallStatus.RINGING });
        } else if (recovered.status === CallStatus.ACTIVE || recovered.status === CallStatus.HOLD) {
          setAgentStatus(AgentStatus.BUSY);
        }
      } catch {
        // best effort recovery
      }
    };
    restoreActiveCall();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, currentUser?.email, activeCall?.id, normalizeCallForSession]);

  useEffect(() => {
    if (!currentUser || activeCall || typeof window === 'undefined') return;
    const hash = window.location.hash || '';
    const idx = hash.indexOf('?');
    if (idx === -1) return;
    const qs = hash.slice(idx + 1);
    const params = new URLSearchParams(qs);
    // Recovery boots should skip any automatic room rejoin to avoid loops.
    const isRecoverBoot = params.get('recover');
    if (isRecoverBoot) {
      params.delete('recover');
      const cleanRecoverHash = `#/app${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState(null, '', cleanRecoverHash);
      return;
    }
    const room = params.get('room');
    if (!room) return;

    const linkedMeeting = meetings.find((m) => (m.roomId || `room_${m.id}`) === room);
    const roomCall = callHistory.find(
      (c) => c.roomId === room && c.status !== CallStatus.ENDED
    );
    if (roomCall) {
      const hostId = roomCall.hostId || roomCall.agentId;
      const participantIds = roomCall.participants || [];
      const requiresLobby = Boolean(roomCall.meetingLocked || roomCall.lobbyEnabled);
      const isHost = hostId === currentUser.id;
      const alreadyInRoom = participantIds.includes(currentUser.id);
      if (!isHost && !alreadyInRoom && requiresLobby) {
        const waitingRoom = Array.from(new Set([...(roomCall.waitingRoom || []), currentUser.id]));
        const queuedCall: Call = { ...roomCall, waitingRoom };
        persistCall(queuedCall).catch(() => {});
        setLobbyPending({ roomId: room, callId: roomCall.id, hostId });
        addNotification('info', 'Host approval required. You are in the lobby.');
        params.delete('room');
        const cleanHash = `#/app${params.toString() ? `?${params.toString()}` : ''}`;
        window.history.replaceState(null, '', cleanHash);
        return;
      }
    }

    const callId = linkedMeeting ? `meet_${linkedMeeting.id}` : `meet_link_${room}`;
    const meetingTitle = linkedMeeting?.title || 'Shared Meeting';
    const meetingCall: Call = {
      id: callId,
      direction: 'internal',
      customerName: meetingTitle,
      phoneNumber: 'MEETING',
      queue: 'Meeting',
      startTime: Date.now(),
      durationSeconds: 0,
      status: CallStatus.ACTIVE,
      transcript: [],
      agentId: currentUser.id,
      agentName: currentUser.name,
      agentEmail: currentUser.email,
      agentExtension: currentUser.extension,
      isVideo: true,
      hostId: linkedMeeting?.organizerId || currentUser.id,
      lobbyEnabled: false,
      meetingLocked: false,
      waitingRoom: [],
      participants: Array.from(new Set([currentUser.id, ...(linkedMeeting?.attendees?.map((a) => a.userId) || [])])),
      roomId: room,
      emailSynced: true,
      transcriptionEnabled: true,
    };
    setActiveCall(meetingCall);
    persistCall(meetingCall).catch(() => {});
    setAgentStatus(AgentStatus.BUSY);
    addNotification('success', 'Joined meeting from shared link.');

    params.delete('room');
    const cleanHash = `#/app${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState(null, '', cleanHash);
  }, [currentUser?.id, activeCall?.id, meetings, callHistory]);

  useEffect(() => {
    if (!lobbyPending || activeCall || !currentUser) return;
    const admitted = callHistory.find(
      (c) =>
        (c.id === lobbyPending.callId || c.roomId === lobbyPending.roomId) &&
        c.status !== CallStatus.ENDED &&
        (c.participants || []).includes(currentUser.id)
    );
    if (!admitted) return;
    setActiveCall(admitted);
    setLobbyPending(null);
    setAgentStatus(AgentStatus.BUSY);
    addNotification('success', 'Host admitted you to the meeting.');
  }, [lobbyPending, callHistory, activeCall?.id, currentUser?.id]);

  const selfHealTeam = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    const seedTeam = dedupeTeamMembers([...(appSettings.team || []), ...DEFAULT_SETTINGS.team, ...(currentUser ? [currentUser] : [])]);
    let recovered = seedTeam;
    try {
      const saved = await fetchSettingsApi();
      const merged = buildMergedSettings(saved);
      recovered = dedupeTeamMembers(mergeTeamWithDirectory(seedTeam, merged.team || []));
    } catch {
      // keep seedTeam
    }
    try {
      if (currentUser?.role === Role.ADMIN) {
        const invites = await fetchInvites();
        const accepted = (invites || []).filter((inv: any) => inv.status === 'accepted' && inv.email);
        const placeholders = accepted.map(buildInvitePlaceholder);
        recovered = dedupeTeamMembers(mergeTeamWithDirectory(recovered, placeholders));
      }
    } catch {
      // invite lookup optional
    }
    setAppSettings((prev) => ({ ...prev, team: dedupeTeamMembers(mergeTeamWithDirectory(recovered, prev.team || [])) }));
    if (!silent) addNotification('success', `Team rehydrated (${recovered.length} members).`);
    return recovered;
  }, [appSettings.team, currentUser]);

  const saveSettingsSafely = useCallback(async (next: AppSettings) => {
    if (Date.now() < settingsSaveCooldownRef.current) return;
    try {
      const latest = await fetchSettingsApi();
      const base = buildMergedSettings(latest);
      const mergedPayload: AppSettings = {
        ...base,
        ...next,
        team: dedupeTeamMembers(mergeTeamWithDirectory(base.team || [], next.team || [])),
      };
      await saveSettingsApi(mergedPayload);
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('429') || msg.includes('too many requests')) {
        settingsSaveCooldownRef.current = Date.now() + 30000;
      }
      // Guardrail: skip fallback write when sync is degraded to avoid clobbering shared team state.
      console.warn('saveSettingsSafely skipped remote write:', err?.message || err);
    }
  }, []);

  const syncTeamNow = useCallback(async () => {
    const now = Date.now();
    if (now - lastTeamSyncAt < 15000) {
      await selfHealTeam({ silent: false }).catch(() => {});
      return;
    }
    setLastTeamSyncAt(now);
    try {
      const saved = await fetchSettingsApi();
      const merged = buildMergedSettings(saved);
      setAppSettings((prev) => ({
        ...merged,
        team: dedupeTeamMembers(mergeTeamWithDirectory(merged.team || [], prev.team || [])),
      }));
      addNotification('success', 'Team sync complete.');
    } catch (err: any) {
      const msg = String(err?.message || '').trim();
      if (msg.toLowerCase().includes('too many requests') || msg.includes('429')) {
        await selfHealTeam({ silent: false }).catch(() => {});
        addNotification('info', 'Sync rate-limited, applied local team self-heal.');
        return;
      }
      await selfHealTeam({ silent: false }).catch(() => {});
      addNotification('error', `Team sync failed${msg ? `: ${msg}` : '.'}`);
    }
  }, [lastTeamSyncAt, selfHealTeam]);

  useEffect(() => {
    if (!currentUser) return;
    const normalizedEmail = normalizeEmail(currentUser.email || '');
    if (!normalizedEmail) return;
    const matches = appSettings.team.filter((m) => normalizeEmail(m.email) === normalizedEmail);
    const role = matches.length ? getHighestRole(matches.map((m) => m.role)) : null;
    const member = role ? (matches.find((m) => m.role === role) || matches[0]) : null;
    if (!member) return;
    if (member.role !== currentUser.role || member.canAccessRecordings !== currentUser.canAccessRecordings) {
      const corrected: User = {
        ...currentUser,
        role: member.role,
        extension: member.extension || currentUser.extension,
        canAccessRecordings: member.canAccessRecordings ?? currentUser.canAccessRecordings,
      };
      setCurrentUser(corrected);
      if (member.role !== currentUser.role) {
        setView(member.role === Role.SUPERVISOR ? 'supervisor' : member.role === Role.ADMIN ? 'admin' : 'agent');
        localStorage.setItem(`connectai_role_${currentUser.id}`, member.role);
        addNotification('info', `Session aligned to ${member.role} role from team policy.`);
      }
    }
  }, [currentUser?.id, currentUser?.role, currentUser?.email, appSettings.team]);

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === Role.AGENT && (view === 'admin' || view === 'supervisor')) {
      setView('agent');
    }
    if (currentUser.role === Role.SUPERVISOR && view === 'admin') {
      setView('supervisor');
    }
  }, [currentUser?.role, view]);

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.currentPresence === agentStatus) return;
    const updated = { ...currentUser, currentPresence: agentStatus };
    setCurrentUser(updated);
    setAppSettings((prev) => {
      const nextTeam = dedupeTeamMembers(upsertTeamMember(prev.team, updated));
      const next = { ...prev, team: nextTeam };
      if (hasHydratedSettings) saveSettingsSafely(next).catch(() => {});
      return next;
    });
    if (isFirebaseConfigured) {
      dbService.saveUser(updated).catch(() => {});
    }
  }, [currentUser?.id, agentStatus, isFirebaseConfigured, hasHydratedSettings]);

  useEffect(() => {
    const activeStatuses = new Set([CallStatus.DIALING, CallStatus.RINGING, CallStatus.ACTIVE, CallStatus.HOLD]);
    const presenceByEmail = new Map<string, AgentStatus>();
    const activePool = [...(callHistory || []), ...(activeCall ? [activeCall] : [])]
      .filter((c) => activeStatuses.has(c.status));
    for (const call of activePool) {
      const callerEmail = normalizeEmail(call.agentEmail);
      const targetEmail = normalizeEmail(call.targetAgentEmail || call.customerEmail);
      if (callerEmail) presenceByEmail.set(callerEmail, AgentStatus.BUSY);
      if (targetEmail && call.direction === 'internal') presenceByEmail.set(targetEmail, AgentStatus.BUSY);
    }
    setAppSettings((prev) => {
      const nextTeam = prev.team.map((member) => {
        const email = normalizeEmail(member.email);
        const busy = email ? presenceByEmail.get(email) : undefined;
        if (busy) {
          if (member.currentPresence === AgentStatus.BUSY || member.currentPresence === AgentStatus.OFFLINE) return member;
          return { ...member, currentPresence: AgentStatus.BUSY };
        }
        if (member.currentPresence === AgentStatus.BUSY) {
          return { ...member, currentPresence: AgentStatus.AVAILABLE };
        }
        return member;
      });
      return { ...prev, team: nextTeam };
    });
  }, [callHistory, activeCall?.id, activeCall?.status]);

  const toggleMedia = async (type: 'video' | 'screen') => {
    if (!activeCall) return;
    const updatedCall: Call = { ...activeCall };
    if (type === 'video') updatedCall.isVideo = !activeCall.isVideo;
    else {
      const nextSharing = !activeCall.isScreenSharing;
      updatedCall.isScreenSharing = nextSharing;
      updatedCall.screenShareOwnerId = nextSharing ? currentUser?.id : undefined;
    }
    const normalized = normalizeCallForSession(updatedCall);
    setActiveCall(normalized);
    await persistCall(normalized);
  };

  const updateCall = async (call: Call) => {
    const normalized = normalizeCallForSession(call);
    setActiveCall(normalized);
    await persistCall(normalized);
  };

  const handleHold = () => {
    if (!activeCall) return;
    const nextStatus = activeCall.status === CallStatus.HOLD ? CallStatus.ACTIVE : CallStatus.HOLD;
    updateCall({ ...activeCall, status: nextStatus });
    addNotification('info', nextStatus === CallStatus.HOLD ? 'Call placed on hold.' : 'Call resumed.');
  };

  const handleMute = () => {
    addNotification('info', 'Microphone toggled.');
  };

  const playTtsSample = async () => {
    const sample = appSettings.ivr.welcomeMessage || 'Welcome to ConnectAI. Your call is important to us.';
    const audioBlob = await synthesizeSpeech(sample);
    if (!audioBlob) {
      addNotification('error', 'Gemini TTS unavailable. Check server/API key.');
      return;
    }
    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    try {
      await audio.play();
      addNotification('success', 'Gemini TTS playback started.');
    } catch {
      URL.revokeObjectURL(url);
      addNotification('error', 'Browser blocked audio playback.');
    }
  };

  const openFreeCallRoom = () => {
    const roomId = `connectai-beta-${Date.now()}`;
    window.open(`https://meet.jit.si/${roomId}`, '_blank', 'noopener,noreferrer');
    addNotification('success', 'Free test call room opened in a new tab.');
  };

  const updateUserProfile = async (updated: User) => {
    setCurrentUser(updated);
    setAppSettings(prev => {
      const next = {
        ...prev,
        team: dedupeTeamMembers(upsertTeamMember(prev.team, updated))
      };
      if (hasHydratedSettings) saveSettingsSafely(next).catch(() => {});
      return next;
    });
    if (isFirebaseConfigured) await dbService.saveUser(updated);
    addNotification('success', 'Profile updated.');
  };

  const addParticipantToCall = (userId: string) => {
    if (!activeCall) return;
    const user = appSettings.team.find(u => u.id === userId);
    if (!user) return;
    setActiveCall(prev => {
      if (!prev) return null;
      const currentParticipants = prev.participants || [];
      if (currentParticipants.includes(userId)) return prev;
      const updated = { ...prev, participants: [...currentParticipants, userId] };
      persistCall(updated);
      return updated;
    });
    addNotification('success', `Admitted ${user.name} to neural session.`);
  };

  const handleTransfer = async (targetId: string) => {
    const target = appSettings.team.find(u => u.id === targetId);
    if (!target || !activeCall) return;
    if (currentUser?.id === targetId) {
      addNotification('info', 'Transfer skipped: target is current agent.');
      return;
    }
    addNotification('info', `Dispatching transfer to ${target.name}...`);
    const transferredCall: Call = {
      ...activeCall,
      status: CallStatus.DIALING,
      targetAgentId: targetId,
      agentId: target.id,
      agentName: target.name,
      agentEmail: target.email,
      agentExtension: target.extension,
      participants: Array.from(new Set([...(activeCall.participants || []), target.id])),
    };
    await updateCall(transferredCall);
    setIncomingCallBanner(null);
    setActiveCall(null);
    setAgentStatus(AgentStatus.WRAP_UP);
    addNotification('success', `Call transferred to ${target.name}.`);
  };

  const startExternalCall = async (target: Lead | string) => {
    if (activeCall && activeCall.status !== CallStatus.ENDED) return;
    const name = typeof target === 'string' ? 'Manual Node' : target.name;
    const phone = typeof target === 'string' ? target : target.phone;
    const newCall: Call = {
      id: `ext_${Date.now()}`, direction: 'outbound', customerName: name, phoneNumber: phone, queue: 'External Hub', startTime: Date.now(), durationSeconds: 0, status: CallStatus.DIALING, transcript: [], agentId: currentUser?.id, agentName: currentUser?.name, agentEmail: currentUser?.email, agentExtension: currentUser?.extension, emailSynced: true, transcriptionEnabled: true
    };
    setActiveCall(newCall);
    await persistCall(newCall);
    setAgentStatus(AgentStatus.BUSY);
    setTimeout(async () => {
      setActiveCall(prev => prev ? { ...prev, status: CallStatus.ACTIVE } : null);
      try {
        const service = new LiveCallService({
          persona: `You are ${name}. Be a professional client interested in AI services.`,
          onTranscriptUpdate: (segment) => {
            setActiveCall(prev => prev ? { ...prev, transcript: [...prev.transcript, segment] } : null);
          },
          onAudioOutput: () => { },
          onDisconnect: () => handleHangup(),
          onVolumeChange: (level) => setAudioLevel(level)
        });
        await service.start();
        setLiveService(service);
      } catch (err) {
        addNotification('error', 'Live call failed. Check Gemini Live API setup.');
        handleHangup();
      }
    }, 2500);
  };

  const startSimulatedCall = async (personaId: string) => {
    if (activeCall && activeCall.status !== CallStatus.ENDED) return;
    const persona = PERSONAS.find(p => p.id === personaId) || PERSONAS[0];
    const newCall: Call = {
      id: `sim_${Date.now()}`,
      direction: 'inbound',
      customerName: persona.name,
      phoneNumber: 'SIMULATOR',
      queue: 'AI Simulator',
      startTime: Date.now(),
      durationSeconds: 0,
      status: CallStatus.DIALING,
      transcript: [],
      agentId: currentUser?.id,
      agentName: currentUser?.name,
      agentEmail: currentUser?.email,
      agentExtension: currentUser?.extension,
      emailSynced: true,
      transcriptionEnabled: true
    };
    setShowPersonaModal(false);
    setActiveCall(newCall);
    await persistCall(newCall);
    setAgentStatus(AgentStatus.BUSY);
    setTimeout(async () => {
      setActiveCall(prev => prev ? { ...prev, status: CallStatus.ACTIVE } : null);
      try {
        const service = new LiveCallService({
          persona: persona.prompt,
          onTranscriptUpdate: (segment) => {
            setActiveCall(prev => prev ? { ...prev, transcript: [...prev.transcript, segment] } : null);
          },
          onAudioOutput: () => { },
          onDisconnect: () => handleHangup(),
          onVolumeChange: (level) => setAudioLevel(level)
        });
        await service.start();
        setLiveService(service);
      } catch (err) {
        addNotification('error', 'Simulator failed. Check Gemini Live API setup.');
        handleHangup();
      }
    }, 1500);
  };

  const startInternalCall = async (target: User) => {
    if (activeCall && activeCall.status !== CallStatus.ENDED) return;
    const normalizedTargetEmail = normalizeEmail(target.email);
    const allEmailMatches = normalizedTargetEmail
      ? appSettings.team.filter((member) => normalizeEmail(member.email) === normalizedTargetEmail)
      : [];
    const resolvedByEmail =
      allEmailMatches.find((member) => member.id === target.id) ||
      allEmailMatches.find((member) => !String(member.id || '').startsWith('invite_')) ||
      allEmailMatches[0];
    const resolvedById = appSettings.team.find((member) => member.id === target.id);
    const resolvedTarget = resolvedByEmail || resolvedById || target;
    const canonicalTargetId = resolvedTarget.id || target.id;
    const canonicalTargetEmail = normalizeEmail(resolvedTarget.email || target.email);
    const selfEmail = normalizeEmail(currentUser?.email);
    if ((canonicalTargetId && canonicalTargetId === currentUser?.id) || (selfEmail && canonicalTargetEmail && selfEmail === canonicalTargetEmail)) {
      addNotification('info', 'Calling yourself is blocked. Use a different teammate account.');
      return;
    }
    const isVideoCall = Boolean((target as any).isVideo);
    const newCall: Call = {
      id: `int_${Date.now()}`,
      direction: 'internal',
      customerName: resolvedTarget.name,
      phoneNumber: `EXT ${resolvedTarget.extension}`,
      customerEmail: resolvedTarget.email,
      customerExtension: resolvedTarget.extension,
      queue: 'Internal Matrix',
      startTime: Date.now(),
      durationSeconds: 0,
      status: CallStatus.DIALING,
      transcript: [],
      agentId: currentUser?.id,
      agentName: currentUser?.name,
      agentEmail: currentUser?.email,
      agentExtension: currentUser?.extension,
      targetAgentId: canonicalTargetId,
      targetAgentEmail: canonicalTargetEmail,
      isVideo: isVideoCall,
      hostId: currentUser?.id,
      lobbyEnabled: false,
      meetingLocked: false,
      waitingRoom: [],
      participants: Array.from(new Set([canonicalTargetId, currentUser!.id].filter(Boolean))),
      emailSynced: true,
      transcriptionEnabled: true
    };
    setActiveCall(newCall);
    setIncomingCallBanner(null);
    await persistCall(newCall);
    scheduleUnansweredAutoHangup(newCall.id);
    markTeamPresenceByEmails([currentUser?.email || '', resolvedTarget.email || ''], AgentStatus.BUSY);
    setAgentStatus(AgentStatus.BUSY);
    addNotification('info', `Dialing ${resolvedTarget.name}...`);
  };

  const handleAcceptInternal = async () => {
    if (!activeCall) return;
    const updatedCall = normalizeCallForSession({ ...activeCall, status: CallStatus.ACTIVE });
    setActiveCall(updatedCall);
    await persistCall(updatedCall);
    markTeamPresenceByEmails([currentUser?.email || '', updatedCall.agentEmail || '', updatedCall.targetAgentEmail || '', updatedCall.customerEmail || ''], AgentStatus.BUSY);
    setAgentStatus(AgentStatus.BUSY);
  };

  const handleHangup = async () => {
    liveService?.stop();
    setLiveService(null);
    setAudioLevel(0);
    setIncomingCallBanner(null);
    if (activeCall) {
      const peerEmails = [activeCall.agentEmail || '', activeCall.targetAgentEmail || '', activeCall.customerEmail || ''].filter(Boolean);
      if (activeCall.roomId) {
        const meetingToClose = meetings.find(m => m.roomId === activeCall.roomId);
        if (meetingToClose) {
          const endedMeeting: Meeting = { ...meetingToClose, status: 'ended' };
          setMeetings(prev => prev.map(m => m.id === endedMeeting.id ? endedMeeting : m));
          updateCalendarEvent(endedMeeting).catch(() => { });
        }
      }
      const finalCall: Call = { ...activeCall, status: CallStatus.ENDED, durationSeconds: (Date.now() - activeCall.startTime) / 1000 };
      setCallHistory(h => [finalCall, ...h]);
      await persistCall(finalCall);
      setActiveCall(null);
      setAgentStatus(AgentStatus.WRAP_UP);
      markTeamPresenceByEmails(peerEmails, AgentStatus.WRAP_UP);
      setTimeout(() => {
        setAgentStatus(AgentStatus.AVAILABLE);
        markTeamPresenceByEmails(peerEmails, AgentStatus.AVAILABLE);
      }, 1200);
    }
  };

  const handleSoftphoneCallEnded = async (endedCall: Call) => {
    setCallHistory(h => [endedCall, ...h]);
    setAgentStatus(AgentStatus.WRAP_UP);
    if (isFirebaseConfigured) {
      await dbService.saveCall(endedCall);
    }
    if (!isFirebaseConfigured) {
      const pollEnrichment = async (callId: string, attempts = 12) => {
        if (!mountedRef.current || attempts <= 0) return;
        try {
          const latest = await fetchCallById(callId);
          if (latest) {
            if (!mountedRef.current) return;
            setCallHistory(prev => prev.map(c => c.id === callId ? { ...c, ...latest } : c));
            const hasTranscript = Boolean(latest?.transcript?.length);
            const hasSummary = Boolean(latest?.analysis?.summary);
            const hasRecording = Boolean(latest?.recordingUrl);
            if (hasTranscript || hasSummary || hasRecording) return;
          }
        } catch {
          // ignore
        }
        setTimeout(() => pollEnrichment(callId, attempts - 1), 5000);
      };
      pollEnrichment(endedCall.id);
    }
  };

  const handleCompleteWrapUp = async (finalCall: Call) => {
    setActiveCall(null);
    setAgentStatus(AgentStatus.AVAILABLE);
    addNotification('success', `Session for ${finalCall.customerName} archived to cluster.`);
  };

  const handleUpdateCampaigns = (nextCampaigns: Campaign[]) => {
    setCampaigns(nextCampaigns);
    const newest = nextCampaigns[0];
    if (newest) {
      createCampaign(newest).catch(() => { });
    }
  };

  const handleCreateLead = (lead: Lead) => {
    setLeads(prev => [lead, ...prev]);
  };

  const handleUpdateCampaign = (updated: Campaign) => {
    setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));
    updateCampaign(updated).catch(() => { });
  };

  const handleUpdateMeetings = (nextMeetings: Meeting[]) => {
    setMeetings(nextMeetings);
    const newest = nextMeetings[0];
    if (newest) {
      const exists = meetings.some(meeting => meeting.id === newest.id);
      if (exists) {
        updateCalendarEvent(newest).catch(() => { });
      } else {
        createCalendarEvent(newest).catch(() => { });
      }
    }
  };

  const startMeeting = (meeting: Meeting) => {
    if (!currentUser) return;
    const roomId = meeting.roomId || `room_${meeting.id}`;
    const updatedMeeting: Meeting = { ...meeting, status: 'active', roomId };
    setMeetings(prev => prev.map(m => m.id === meeting.id ? updatedMeeting : m));
    updateCalendarEvent(updatedMeeting).catch(() => { });
    const meetingCall: Call = {
      id: `meet_${meeting.id}`,
      direction: 'internal',
      customerName: meeting.title || 'Team Meeting',
      phoneNumber: 'MEETING',
      queue: 'Meeting',
      startTime: Date.now(),
      durationSeconds: 0,
      status: CallStatus.ACTIVE,
      transcript: [],
      agentId: currentUser.id,
      agentName: currentUser.name,
      isVideo: true,
      hostId: meeting.organizerId || currentUser.id,
      lobbyEnabled: false,
      meetingLocked: false,
      waitingRoom: [],
      participants: [currentUser.id],
      roomId,
      emailSynced: true,
      transcriptionEnabled: true
    };
    setActiveCall(meetingCall);
    persistCall(meetingCall);
    setAgentStatus(AgentStatus.BUSY);
  };

  const handleLogin = async (role: Role, profile?: { uid: string; email?: string | null; displayName?: string | null }) => {
    const normalizedEmail = normalizeEmail(profile?.email || '');
    const knownMatches = normalizedEmail ? appSettings.team.filter((m) => normalizeEmail(m.email) === normalizedEmail) : [];
    const lockedRole = knownMatches.length ? getHighestRole(knownMatches.map((m) => m.role)) : null;
    const knownMember = lockedRole ? (knownMatches.find((m) => m.role === lockedRole) || knownMatches[0]) : null;
    const effectiveRole = lockedRole || role;
    if (knownMember && effectiveRole !== role) {
      addNotification('info', `Role locked to ${effectiveRole} for this account.`);
    }
    const base = knownMember || appSettings.team.find(u => u.role === effectiveRole);
    const fallbackId = base?.id || `u_${effectiveRole.toLowerCase()}`;
    const userId = profile?.uid || fallbackId;
    const displayName = profile?.displayName || profile?.email || base?.name || `${effectiveRole.charAt(0) + effectiveRole.slice(1).toLowerCase()} User`;
    const user: User = {
      id: userId,
      name: displayName,
      role: effectiveRole,
      avatarUrl: base?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(userId)}`,
      extension: base?.extension,
      email: profile?.email || base?.email,
      status: 'active',
      currentPresence: base?.currentPresence || AgentStatus.AVAILABLE,
      canAccessRecordings: base?.canAccessRecordings ?? (effectiveRole === Role.ADMIN)
    };
    if (profile?.uid) {
      localStorage.setItem(`connectai_role_${profile.uid}`, effectiveRole);
    }
    setCurrentUser(user);
    setAppSettings(prev => {
      const next = {
        ...prev,
        team: dedupeTeamMembers(upsertTeamMember(prev.team, user))
      };
      if (hasHydratedSettings) saveSettingsSafely(next).catch(() => {});
      return next;
    });
    setAuthNotice(null);
    setView(effectiveRole === Role.SUPERVISOR ? 'supervisor' : effectiveRole === Role.ADMIN ? 'admin' : 'agent');
    setAgentStatus(user.currentPresence || AgentStatus.AVAILABLE);
    if (isFirebaseConfigured) await dbService.saveUser(user);
  };

  useEffect(() => {
    if (!activeCall || isFirebaseConfigured) return;
    if (activeCall.status === CallStatus.ENDED) return;
    let cancelled = false;
    const syncActiveCall = async () => {
      if (Date.now() < activeCallPollCooldownRef.current) return;
      try {
        const latest = await fetchCallById(activeCall.id);
        if (cancelled || !latest) return;
        const normalizedLatest = normalizeCallForSession(latest);
        setActiveCall((prev) => {
          if (!prev || prev.id !== normalizedLatest.id) return prev;
          return normalizeCallForSession({ ...prev, ...normalizedLatest });
        });
        if (normalizedLatest.status !== CallStatus.DIALING && normalizedLatest.status !== CallStatus.RINGING) {
          setIncomingCallBanner((prev) => (prev?.id === normalizedLatest.id ? null : prev));
        }
        if (normalizedLatest.status === CallStatus.ENDED) {
          setCallHistory((h) => [normalizedLatest, ...h.filter((c) => c.id !== normalizedLatest.id)]);
          setActiveCall((prev) => (prev?.id === normalizedLatest.id ? null : prev));
          setIncomingCallBanner((prev) => (prev?.id === normalizedLatest.id ? null : prev));
          setAgentStatus(AgentStatus.WRAP_UP);
        }
      } catch (err: any) {
        const msg = String(err?.message || '').toLowerCase();
        if (msg.includes('429') || msg.includes('too many requests')) {
          activeCallPollCooldownRef.current = Date.now() + 30000;
        }
      }
    };
    syncActiveCall();
    const interval = setInterval(syncActiveCall, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeCall?.id, activeCall?.status, isFirebaseConfigured, normalizeCallForSession]);

  if (isLanding) return <LandingPage />;
  
  // Handling Unverified Users smartly
  if (isUnverified) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6">
            <div className="bg-white p-10 rounded-[2rem] shadow-xl text-center max-w-md w-full border border-slate-100">
                <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <UserCheck size={32} />
                </div>
                <h2 className="text-2xl font-black italic uppercase tracking-tighter text-slate-800 mb-4">Verify Your Identity</h2>
                <p className="text-slate-500 mb-8 font-medium">We've sent a verification link to your email. Please check your inbox and click the link to activate your session.</p>
                
                <div className="flex items-center justify-center gap-3 text-brand-600 mb-8 animate-pulse">
                    <Loader2 size={18} className="animate-spin" />
                    <span className="text-xs font-black uppercase tracking-widest">Waiting for verification...</span>
                </div>

                <button onClick={() => window.location.reload()} className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg">
                    I've Verified My Email
                </button>
                <button onClick={() => signOut(auth).then(() => { setIsUnverified(false); setCurrentUser(null); })} className="mt-4 text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-slate-600">
                    Sign Out
                </button>
            </div>
        </div>
      );
  }

  if (authBootstrapping && isAppRoute) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 bg-brand-600 rounded-xl animate-pulse"></div>
          <p className="text-xs font-black tracking-widest uppercase text-slate-400">Restoring Session</p>
        </div>
      </div>
    );
  }
  if (!isAppRoute && !currentUser) return <LandingPage />;
  if (!currentUser) return <LoginScreen onLogin={handleLogin} externalMessage={authNotice} onClearExternalMessage={() => setAuthNotice(null)} />;

  const isMeetingActive =
    Boolean(activeCall) &&
    activeCall!.status === CallStatus.ACTIVE &&
    (activeCall!.direction === 'internal' || Boolean(activeCall!.isVideo) || Boolean(activeCall!.roomId));

  const acceptIncomingBannerCall = async () => {
    if (!incomingCallBanner) return;
    const next = normalizeCallForSession({ ...incomingCallBanner, status: CallStatus.ACTIVE });
    setActiveCall(next);
    setIncomingCallBanner(null);
    await persistCall(next);
    setAgentStatus(AgentStatus.BUSY);
  };

  const declineIncomingBannerCall = async () => {
    if (!incomingCallBanner) return;
    const next = { ...incomingCallBanner, status: CallStatus.ENDED };
    setIncomingCallBanner(null);
    setActiveCall(null);
    await persistCall(next);
    setAgentStatus(AgentStatus.AVAILABLE);
  };

  return (
    <div className="flex h-[100dvh] bg-[radial-gradient(120%_120%_at_50%_0%,#0f172a_0%,#020617_58%,#000000_100%)] app-compact flex-col md:flex-row overflow-hidden">
      <ToastContainer notifications={notifications} removeNotification={() => { }} />
      {incomingCallBanner && incomingCallBanner.status !== CallStatus.ENDED && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[140] bg-white border border-slate-200 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Incoming {incomingCallBanner.isVideo ? 'Video' : 'Voice'} Call</p>
            <p className="text-sm font-black uppercase italic text-slate-800">{incomingCallBanner.agentName || incomingCallBanner.customerName || 'Teammate'}</p>
          </div>
          <button onClick={declineIncomingBannerCall} className="px-3 py-2 rounded-lg border border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50">Decline</button>
          <button onClick={acceptIncomingBannerCall} className="px-3 py-2 rounded-lg bg-brand-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-brand-700">Accept</button>
        </div>
      )}
      {!isMeetingActive && (
        <div className="w-full md:w-20 h-16 md:h-full bg-brand-900 flex flex-row md:flex-col items-center justify-between md:justify-start px-4 md:px-0 md:py-6 z-50 shadow-xl shrink-0">
          <button
            onClick={() => { window.location.href = '/'; }}
            className="hover:scale-105 transition-transform"
            title="Go to Landing"
          >
            <BrandLogo size={40} roundedClassName="rounded-xl" className="" />
          </button>
          
          <nav className="flex flex-row md:flex-col items-center gap-2 md:gap-6 md:mt-8">
            <button onClick={() => setView('agent')} className={`p-2.5 rounded-xl transition-all ${view === 'agent' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`} title="Agent Workspace"><Phone size={20} /></button>
            <button onClick={() => setView('logs')} className={`p-2.5 rounded-xl transition-all ${view === 'logs' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`} title="Call Logs"><FileText size={20} /></button>
            <button onClick={() => setShowSoftphone(!showSoftphone)} className={`p-2.5 rounded-xl transition-all ${showSoftphone ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`} title="Soft Box"><PhoneIncoming size={20} /></button>
            {(currentUser.role !== Role.AGENT) && <button onClick={() => setView('supervisor')} className={`p-2.5 rounded-xl transition-all ${view === 'supervisor' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`} title="Supervisor"><LayoutDashboard size={20} /></button>}
            {(currentUser.role === Role.ADMIN) && <button onClick={() => setView('admin')} className={`p-2.5 rounded-xl transition-all ${view === 'admin' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`} title="Admin"><Settings size={20} /></button>}
          </nav>

          <button onClick={() => signOut(auth).then(() => setCurrentUser(null))} className="text-slate-400 hover:text-white p-2.5 md:mt-auto md:mb-4"><LogOut size={20} /></button>
        </div>
      )}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {!isMeetingActive && (
          <header className="h-16 bg-slate-900/70 backdrop-blur-xl border-b border-slate-800 flex items-center justify-between px-4 md:px-8 z-40 shadow-sm shrink-0">
            <div className="flex items-center gap-3">
              <h1 className="text-lg md:text-xl font-black text-slate-100 uppercase italic tracking-tighter">{view} HUB</h1>
              {buildMeta?.gitSha && (
                <span
                  className="hidden md:inline-flex px-2 py-1 rounded-md border border-slate-700 bg-slate-900 text-[10px] font-black uppercase tracking-wider text-slate-300"
                  title={`Build ${buildMeta.gitSha.slice(0, 12)}${buildMeta.buildTime ? ` • ${new Date(buildMeta.buildTime).toLocaleString()}` : ''}`}
                >
                  Build {buildMeta.gitSha.slice(0, 7)}
                </span>
              )}
            </div>
            <HeaderProfileMenu user={currentUser} status={agentStatus} onStatusChange={setAgentStatus} onLogout={() => signOut(auth).then(() => setCurrentUser(null))} onUpdateUser={updateUserProfile} />
          </header>
        )}
        {!isMeetingActive && activeBroadcasts.length > 0 && (
          <div className="px-4 md:px-8 py-3 bg-amber-50/90 border-b border-amber-200 backdrop-blur z-30">
            <div className="space-y-2">
              {activeBroadcasts.slice(0, 2).map((msg: any) => (
                <div key={msg.id} className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-white px-3 py-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Admin Broadcast</p>
                    <p className="text-sm font-black text-slate-800">{msg.title}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{msg.body}</p>
                  </div>
                  <button
                    onClick={() => dismissBroadcast(msg.id)}
                    className="text-slate-400 hover:text-slate-700 p-1"
                    title="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <main className={`flex-1 overflow-hidden relative ${isMeetingActive ? 'bg-slate-950' : ''}`}>
          {isMeetingActive ? (
            <VideoBridge
              activeCall={activeCall}
              currentUser={currentUser}
              onHangup={handleHangup}
              onToggleMedia={toggleMedia}
              onInviteParticipant={addParticipantToCall}
              onUpdateCall={updateCall}
              team={appSettings.team}
              isFirebaseConfigured={isFirebaseConfigured}
            />
          ) : lobbyPending ? (
            <div className="h-full flex items-center justify-center p-6 bg-[radial-gradient(100%_120%_at_50%_0%,rgba(30,41,59,0.35)_0%,rgba(2,6,23,0.85)_70%)]">
              <div className="w-full max-w-lg rounded-[2rem] border border-slate-700/60 bg-slate-900/80 backdrop-blur-md p-8 text-center shadow-2xl">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-300">Meeting Lobby</p>
                <h3 className="mt-3 text-2xl font-black tracking-tight text-white">Waiting For Host Approval</h3>
                <p className="mt-3 text-sm text-slate-300">
                  You are in the lobby for room <span className="font-black text-white">{lobbyPending.roomId}</span>. This page will auto-join once admitted.
                </p>
                <button
                  onClick={() => setLobbyPending(null)}
                  className="mt-6 px-4 py-2 rounded-xl border border-slate-600 text-slate-200 hover:bg-slate-800 text-[11px] font-black uppercase tracking-widest"
                >
                  Leave Lobby
                </button>
              </div>
            </div>
          ) : (
            <>
              {view === 'agent' && (
                <div className="p-4 md:p-8 h-full bg-[radial-gradient(110%_100%_at_50%_0%,rgba(15,23,42,0.55)_0%,rgba(2,6,23,0.15)_55%,rgba(2,6,23,0)_100%)]">
                  <div className="h-full relative">
                    <div className="h-full">
                      <AgentConsole activeCall={activeCall} agentStatus={agentStatus} onCompleteWrapUp={handleCompleteWrapUp} onEndActiveCall={handleHangup} settings={appSettings} addNotification={addNotification} leads={leads} onOutboundCall={startExternalCall} onInternalCall={startInternalCall} history={callHistory} campaigns={campaigns} onUpdateCampaigns={handleUpdateCampaigns} onUpdateCampaign={handleUpdateCampaign} onCreateLead={handleCreateLead} meetings={meetings} onUpdateMeetings={handleUpdateMeetings} user={currentUser} onAddParticipant={addParticipantToCall} onJoinMeeting={startMeeting} isFirebaseConfigured={isFirebaseConfigured} />
                    </div>

                  </div>
                </div>
              )}
              {view === 'supervisor' && <div className="p-8 h-full"><SupervisorDashboard calls={callHistory} team={appSettings.team} addNotification={addNotification} activeCall={activeCall} /></div>}
              {view === 'logs' && <div className="h-full"><CallLogView currentUser={currentUser} /></div>}
              {view === 'admin' && <AdminSettings settings={appSettings} onUpdateSettings={setAppSettings} addNotification={addNotification} onSyncTeamNow={syncTeamNow} />}
              {showSoftphone && (
                <Softphone userExtension={currentUser?.extension} allowedNumbers={currentUser?.allowedNumbers ?? appSettings.voice.allowedNumbers} restrictOutboundNumbers={currentUser?.restrictOutboundNumbers} activeCall={activeCall} agentStatus={agentStatus} onAccept={handleAcceptInternal} onHangup={handleHangup} onHold={handleHold} onMute={handleMute} onTransfer={handleTransfer} onStatusChange={setAgentStatus} onStartSimulator={() => setShowPersonaModal(true)} audioLevel={audioLevel} onToggleMedia={toggleMedia} team={appSettings.team} departments={appSettings.ivr.departments || []} onManualDial={startExternalCall} onTestTts={playTtsSample} onOpenFreeCall={openFreeCallRoom} floating agentId={currentUser?.id} agentName={currentUser?.name} agentEmail={currentUser?.email} enableServerLogs onCallEnded={handleSoftphoneCallEnded} />
              )}
            </>
          )}
        </main>
      </div>

      {showPersonaModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl p-12 border border-white/20 relative overflow-hidden">
            <button onClick={() => setShowPersonaModal(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
            <h3 className="text-3xl font-black italic tracking-tighter uppercase text-slate-800 mb-8 text-center">Select Simulation Persona</h3>
            <div className="space-y-4 mb-8">
              {PERSONAS.map(persona => (
                <button
                  key={persona.id}
                  onClick={() => setSelectedPersonaId(persona.id)}
                  className={`w-full p-5 rounded-2xl border-2 transition-all text-left ${selectedPersonaId === persona.id ? 'border-brand-500 bg-brand-50/50 shadow-lg' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}`}
                >
                  <p className="text-xs font-black uppercase tracking-widest text-slate-700 mb-1">{persona.name}</p>
                  <p className="text-[11px] text-slate-500 italic line-clamp-2">"{persona.prompt}"</p>
                </button>
              ))}
            </div>
            <button onClick={() => startSimulatedCall(selectedPersonaId)} className="w-full py-6 bg-brand-600 text-white rounded-3xl font-black uppercase tracking-widest shadow-2xl hover:bg-brand-700 transition-all">
              Start AI Simulation
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;












