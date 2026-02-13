
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
  integrations: { hubSpot: { enabled: true, syncContacts: true, syncDeals: true, syncTasks: false, logs: [] }, primaryCrm: 'HubSpot', webhooks: [], schemaMappings: [], pipedrive: false, salesforce: false },
  compliance: { jurisdiction: 'UK', pciMode: false, playConsentMessage: true, anonymizePii: false, retentionDays: '90', exportEnabled: true },
  subscription: {
    plan: 'Growth', seats: 20, balance: 420.50, autoTopUp: true, nextBillingDate: 'Nov 01, 2025',
    usage: { aiTokens: 450000, aiTokenLimit: 1000000, voiceMinutes: 1250, voiceMinuteLimit: 5000 },
    paymentMethod: 'Mastercard •••• 9921'
  },
  ivr: { phoneNumber: '+1 (555) 012-3456', welcomeMessage: 'Welcome to ConnectAI. For sales, press 1. For support, press 2.', options: [{ key: '1', action: 'QUEUE', target: 'Sales', label: 'Sales' }, { key: '2', action: 'QUEUE', target: 'Support', label: 'Support' }] },
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
    next[idx] = { ...next[idx], ...normalizedMember };
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
    canAccessRecordings: role === Role.ADMIN,
  };
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
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

  const [route, setRoute] = useState(() => ({
    pathname: typeof window !== 'undefined' ? window.location.pathname : '/',
    hash: typeof window !== 'undefined' ? window.location.hash : ''
  }));

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
    return () => {
      mountedRef.current = false;
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
      const roleTemplate = DEFAULT_SETTINGS.team.find(u => u.role === storedRole);
      const profile: User = {
        id: user.uid,
        name: user.displayName || user.email || roleTemplate?.name || 'User',
        role: storedRole,
        avatarUrl: roleTemplate?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
        extension: roleTemplate?.extension,
        email: user.email || undefined,
        status: 'active',
        currentPresence: roleTemplate?.currentPresence || AgentStatus.AVAILABLE,
        canAccessRecordings: roleTemplate?.canAccessRecordings ?? (storedRole === Role.ADMIN)
      };
      const token = await user.getIdToken();
      localStorage.setItem('connectai_auth_token', token);
      setCurrentUser(profile);
      setAppSettings(prev => {
        const next = { ...prev, team: dedupeTeamMembers(upsertTeamMember(prev.team, profile)) };
        if (hasHydratedSettings) saveSettingsSafely(next).catch(() => {});
        return next;
      });
      setView(storedRole === Role.SUPERVISOR ? 'supervisor' : storedRole === Role.ADMIN ? 'admin' : 'agent');
      setAgentStatus(profile.currentPresence || AgentStatus.AVAILABLE);
      if (isFirebaseConfigured) await dbService.saveUser(profile);
    } catch (error) {
      console.error('finishLogin failed:', error);
      setAuthNotice('Login sync failed. Refresh and try again.');
    }
  };

  const persistCall = useCallback(async (call: Call) => {
    const safeCall = sanitizeCallForStorage(call, appSettings.compliance);
    if (!isFirebaseConfigured) {
      await updateCallLog(call.id, safeCall).catch(() => {});
      return;
    }
    await dbService.saveCall(safeCall);
  }, [isFirebaseConfigured, appSettings.compliance]);

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
      where('targetAgentId', '==', currentUser.id),
      where('status', 'in', [CallStatus.DIALING, CallStatus.RINGING, CallStatus.ACTIVE])
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const callData = change.doc.data() as Call;
        if (change.type === 'added' || change.type === 'modified') {
          if (!activeCall || activeCall.id === callData.id) {
            setActiveCall(callData);
            if (callData.status === CallStatus.DIALING) {
              persistCall({ ...callData, status: CallStatus.RINGING });
              setIncomingCallBanner({ ...callData, status: CallStatus.RINGING });
              addNotification('info', `Incoming ${callData.isVideo ? 'video ' : ''}call from ${callData.agentName || callData.customerName || 'teammate'}.`);
            }
          }
        } else if (change.type === 'removed') {
          if (activeCall?.id === callData.id) handleHangup();
        }
      });
    });
    return () => unsubscribe();
  }, [currentUser, isFirebaseConfigured, activeCall?.id]);

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
    const pullInternalSignals = async () => {
      if (activeCall && activeCall.status !== CallStatus.ENDED) return;
      if (Date.now() < internalPollCooldownRef.current) return;
      try {
        const calls = await fetchCallLogs({ limit: 25 });
        if (cancelled) return;
        const signal = calls.find((c) => {
          if (c.targetAgentId !== currentUser.id) return false;
          return c.status === CallStatus.DIALING || c.status === CallStatus.RINGING || c.status === CallStatus.ACTIVE;
        });
        if (signal && (!activeCall || activeCall.id === signal.id || activeCall.status === CallStatus.ENDED)) {
          setActiveCall(signal);
          if (signal.status === CallStatus.DIALING) {
            await persistCall({ ...signal, status: CallStatus.RINGING });
            setIncomingCallBanner({ ...signal, status: CallStatus.RINGING });
            addNotification('info', `Incoming ${signal.isVideo ? 'video ' : ''}call from ${signal.agentName || signal.customerName || 'teammate'}.`);
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
    const interval = setInterval(pullInternalSignals, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUser, isFirebaseConfigured, activeCall?.id, activeCall?.status, persistCall]);

  const addNotification = (type: Notification['type'], message: string) => {
    const id = Date.now().toString();
    setNotifications(prev => [{ id, type, message }, ...prev]);
    if (!showNotificationPanel) setUnreadCount(prev => prev + 1);
  };

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
    try {
      const latest = await fetchSettingsApi();
      const base = buildMergedSettings(latest);
      const mergedPayload: AppSettings = {
        ...base,
        ...next,
        team: dedupeTeamMembers(mergeTeamWithDirectory(base.team || [], next.team || [])),
      };
      await saveSettingsApi(mergedPayload);
    } catch {
      await saveSettingsApi(next);
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
    if (currentUser.currentPresence === agentStatus) return;
    const updated = { ...currentUser, currentPresence: agentStatus };
    setCurrentUser(updated);
    setAppSettings((prev) => {
      const next = { ...prev, team: dedupeTeamMembers(upsertTeamMember(prev.team, updated)) };
      if (hasHydratedSettings) saveSettingsSafely(next).catch(() => {});
      return next;
    });
    if (isFirebaseConfigured) {
      dbService.saveUser(updated).catch(() => {});
    }
  }, [agentStatus, currentUser, isFirebaseConfigured]);

  const toggleMedia = async (type: 'video' | 'screen') => {
    if (!activeCall) return;
    const updatedCall: Call = { ...activeCall };
    if (type === 'video') updatedCall.isVideo = !activeCall.isVideo;
    else updatedCall.isScreenSharing = !activeCall.isScreenSharing;
    setActiveCall(updatedCall);
    await persistCall(updatedCall);
  };

  const updateCall = async (call: Call) => {
    setActiveCall(call);
    await persistCall(call);
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

  const handleTransfer = (targetId: string) => {
    const target = appSettings.team.find(u => u.id === targetId);
    if (!target || !activeCall) return;
    addNotification('info', `Dispatching Transfer Handshake to ${target.name}...`);
    const transferredCall = { ...activeCall, targetAgentId: targetId, agentId: targetId };
    updateCall(transferredCall);
    handleHangup();
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
    const resolvedByEmail = normalizedTargetEmail
      ? appSettings.team.find((member) => normalizeEmail(member.email) === normalizedTargetEmail && member.id !== target.id)
      : undefined;
    const resolvedById = appSettings.team.find((member) => member.id === target.id);
    const resolvedTarget = resolvedByEmail || resolvedById || target;
    const isVideoCall = Boolean((target as any).isVideo);
    const newCall: Call = {
      id: `int_${Date.now()}`, direction: 'internal', customerName: resolvedTarget.name, phoneNumber: `EXT ${resolvedTarget.extension}`, customerEmail: resolvedTarget.email, customerExtension: resolvedTarget.extension, queue: 'Internal Matrix', startTime: Date.now(), durationSeconds: 0, status: CallStatus.DIALING, transcript: [], agentId: currentUser?.id, agentName: currentUser?.name, agentEmail: currentUser?.email, agentExtension: currentUser?.extension, targetAgentId: resolvedTarget.id, isVideo: isVideoCall, participants: [resolvedTarget.id, currentUser!.id], emailSynced: true, transcriptionEnabled: true
    };
    setActiveCall(newCall);
    await persistCall(newCall);
    setAgentStatus(AgentStatus.BUSY);
    addNotification('info', `Dialing ${resolvedTarget.name}...`);
    if (!isFirebaseConfigured) {
      setTimeout(() => {
        setActiveCall(prev => (prev?.id === newCall.id) ? { ...prev, status: CallStatus.ACTIVE } : prev);
      }, 2000);
    }
  };

  const handleAcceptInternal = async () => {
    if (!activeCall) return;
    const updatedCall = { ...activeCall, status: CallStatus.ACTIVE };
    setActiveCall(updatedCall);
    await persistCall(updatedCall);
    setAgentStatus(AgentStatus.BUSY);
  };

  const handleHangup = async () => {
    liveService?.stop();
    setLiveService(null);
    setAudioLevel(0);
    setIncomingCallBanner(null);
    if (activeCall) {
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
    }
  };

  const handleSoftphoneCallEnded = async (endedCall: Call) => {
    setCallHistory(h => [endedCall, ...h]);
    setAgentStatus(AgentStatus.WRAP_UP);
    if (isFirebaseConfigured) {
      await dbService.saveCall(endedCall);
    }
    if (!isFirebaseConfigured) {
      const pollTranscript = async (callId: string, attempts = 8) => {
        if (!mountedRef.current || attempts <= 0) return;
        try {
          const latest = await fetchCallById(callId);
          if (latest?.transcript?.length) {
            if (!mountedRef.current) return;
            setCallHistory(prev => prev.map(c => c.id === callId ? { ...c, ...latest } : c));
            return;
          }
        } catch {
          // ignore
        }
        setTimeout(() => pollTranscript(callId, attempts - 1), 5000);
      };
      pollTranscript(endedCall.id);
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
    const base = appSettings.team.find(u => u.role === role);
    const fallbackId = base?.id || `u_${role.toLowerCase()}`;
    const userId = profile?.uid || fallbackId;
    const displayName = profile?.displayName || profile?.email || base?.name || `${role.charAt(0) + role.slice(1).toLowerCase()} User`;
    const user: User = {
      id: userId,
      name: displayName,
      role,
      avatarUrl: base?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(userId)}`,
      extension: base?.extension,
      email: profile?.email || base?.email,
      status: 'active',
      currentPresence: base?.currentPresence || AgentStatus.AVAILABLE,
      canAccessRecordings: base?.canAccessRecordings ?? (role === Role.ADMIN)
    };
    if (profile?.uid) {
      localStorage.setItem(`connectai_role_${profile.uid}`, role);
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
    setView(role === Role.SUPERVISOR ? 'supervisor' : role === Role.ADMIN ? 'admin' : 'agent');
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
        setActiveCall((prev) => {
          if (!prev || prev.id !== latest.id) return prev;
          return { ...prev, ...latest };
        });
        if (latest.status === CallStatus.ENDED) {
          setCallHistory((h) => [latest, ...h.filter((c) => c.id !== latest.id)]);
          setActiveCall((prev) => (prev?.id === latest.id ? null : prev));
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
    const interval = setInterval(syncActiveCall, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeCall?.id, activeCall?.status, isFirebaseConfigured]);

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
    const next = { ...incomingCallBanner, status: CallStatus.ACTIVE };
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
            className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg hover:scale-105 transition-transform"
            title="Go to Landing"
          >
            C
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
            <h1 className="text-lg md:text-xl font-black text-slate-100 uppercase italic tracking-tighter">{view} HUB</h1>
            <HeaderProfileMenu user={currentUser} status={agentStatus} onStatusChange={setAgentStatus} onLogout={() => signOut(auth).then(() => setCurrentUser(null))} onUpdateUser={updateUserProfile} />
          </header>
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
                <Softphone userExtension={currentUser?.extension} allowedNumbers={currentUser?.allowedNumbers ?? appSettings.voice.allowedNumbers} restrictOutboundNumbers={currentUser?.restrictOutboundNumbers} activeCall={activeCall} agentStatus={agentStatus} onAccept={handleAcceptInternal} onHangup={handleHangup} onHold={handleHold} onMute={handleMute} onTransfer={handleTransfer} onStatusChange={setAgentStatus} onStartSimulator={() => setShowPersonaModal(true)} audioLevel={audioLevel} onToggleMedia={toggleMedia} team={appSettings.team} onManualDial={startExternalCall} onTestTts={playTtsSample} onOpenFreeCall={openFreeCallRoom} floating agentId={currentUser?.id} agentName={currentUser?.name} agentEmail={currentUser?.email} enableServerLogs onCallEnded={handleSoftphoneCallEnded} />
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












