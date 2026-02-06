
import React, { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Phone, Settings, LogOut, Sparkles, Mic, PlayCircle, Bot, Shield, MessageSquare, Bell, X, CheckCircle, Info, AlertTriangle, Trash2, Mail, PhoneIncoming } from 'lucide-react';
import { Role, User, Call, CallStatus, AgentStatus, AppSettings, Notification, Lead, Campaign, Meeting, CallDirection } from './types';
import { AgentConsole } from './components/AgentConsole';
import { SupervisorDashboard } from './components/SupervisorDashboard';
import { AdminSettings } from './components/AdminSettings';
import { Softphone } from './components/Softphone';
import { LoginScreen } from './components/LoginScreen';
import { ToastContainer } from './components/ToastContainer';
import { HeaderProfileMenu } from './components/HeaderProfileMenu';
import { VideoBridge } from './components/VideoBridge';
import { LiveCallService } from './services/liveCallService';
import { auth, db, onAuthStateChanged, signInAnonymously, signOut, collection, query, where, onSnapshot } from './services/firebase';
import * as dbService from './services/dbService';
import { synthesizeSpeech } from './services/geminiService';
import { fetchCalendarEvents, createCalendarEvent } from './services/calendarService';
import { fetchCampaigns, createCampaign } from './services/campaignService';

const DEFAULT_SETTINGS: AppSettings = {
  integrations: { hubSpot: { enabled: true, syncContacts: true, syncDeals: true, syncTasks: false, logs: [] }, webhooks: [], schemaMappings: [], pipedrive: false, salesforce: false },
  compliance: { jurisdiction: 'UK', pciMode: false, playConsentMessage: true, anonymizePii: false, retentionDays: '90', exportEnabled: true },
  subscription: { 
    plan: 'Growth', seats: 20, balance: 420.50, autoTopUp: true, nextBillingDate: 'Nov 01, 2025',
    usage: { aiTokens: 450000, aiTokenLimit: 1000000, voiceMinutes: 1250, voiceMinuteLimit: 5000 },
    paymentMethod: 'Mastercard •••• 9921'
  },
  ivr: { phoneNumber: '+1 (555) 012-3456', welcomeMessage: 'Welcome to ConnectAI. For sales, press 1. For support, press 2.', options: [{ key: '1', action: 'QUEUE', target: 'Sales', label: 'Sales' }, { key: '2', action: 'QUEUE', target: 'Support', label: 'Support' }] },
  voice: { allowedNumbers: [] },
  bot: { enabled: true, name: 'ConnectBot', persona: 'You are a helpful customer service assistant for ConnectAI.', deflectionGoal: 35 },
  team: [
    { id: 'u_agent', name: 'Sarah Agent', role: Role.AGENT, avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah', status: 'active', extension: '101', currentPresence: AgentStatus.AVAILABLE, email: 'sarah@connectai.io' },
    { id: 'u_supervisor', name: 'Mike Supervisor', role: Role.SUPERVISOR, avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Mike', status: 'active', extension: '201', currentPresence: AgentStatus.AVAILABLE, email: 'mike@connectai.io' },
    { id: 'u_admin', name: 'Sys Admin', role: Role.ADMIN, avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin', status: 'active', extension: '999', currentPresence: AgentStatus.AVAILABLE, email: 'admin@connectai.io' }
  ],
  workflows: []
};

const PERSONAS = [
  { id: 'angry_billing', name: 'Angry Customer', prompt: 'You are an angry customer named John. Frustrated about a $50 overcharge.' },
  { id: 'curious_lead', name: 'Curious Lead', prompt: 'You are Lisa, a polite business owner looking for an AI call center.' },
  { id: 'self_service', name: 'AI Voice Bot', prompt: 'ConnectAI Voice Bot mode.' }
];

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(AgentStatus.OFFLINE);
  const [view, setView] = useState<'agent' | 'supervisor' | 'admin'>('agent');
  const [liveService, setLiveService] = useState<LiveCallService | null>(null);
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
    { id: 'cam_1', name: 'Q4 Enterprise Outreach', type: 'call', status: 'running', targetCount: 1500, processedCount: 842, successCount: 156, aiPersona: 'Professional Concierge', hourlyStats: [] },
    { id: 'cam_2', name: 'Retention SMS Bot', type: 'sms', status: 'running', targetCount: 5000, processedCount: 3240, successCount: 1120, aiPersona: 'Friendly Assistant', hourlyStats: [] }
  ]);
  const [isFirebaseConfigured, setIsFirebaseConfigured] = useState(false);

  useEffect(() => {
    const apiKey = (auth as any)?.app?.options?.apiKey;
    setIsFirebaseConfigured(Boolean(apiKey) && apiKey !== "SIMULATED_KEY");
  }, []);

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
            if (callData.status === CallStatus.DIALING) dbService.saveCall({ ...callData, status: CallStatus.RINGING });
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
    }).catch(() => {});
    fetchCalendarEvents().then(setMeetings).catch(() => {});
    if (isFirebaseConfigured) {
      const handleFirebaseError = (error: Error) => {
        console.warn('Firestore snapshot error, disabling Firebase:', error);
        setIsFirebaseConfigured(false);
        addNotification('info', 'Firestore permissions missing. Running in demo mode.');
      };
      const unsubCalls = dbService.fetchHistoricalCalls((calls) => setCallHistory(calls), handleFirebaseError);
      const unsubLeads = dbService.fetchLeads((leads) => setLeads(leads), handleFirebaseError);
      dbService.fetchSettings().then(saved => {
        if (!saved) return;
        const merged = {
          ...DEFAULT_SETTINGS,
          ...saved,
          voice: { ...DEFAULT_SETTINGS.voice, ...(saved as any).voice },
        };
        setAppSettings(merged);
      });
      return () => { unsubCalls(); unsubLeads(); };
    }
  }, [currentUser, isFirebaseConfigured]);

  const addNotification = (type: Notification['type'], message: string) => {
    const id = Date.now().toString();
    setNotifications(prev => [{ id, type, message }, ...prev]);
    if (!showNotificationPanel) setUnreadCount(prev => prev + 1);
  };

  const toggleMedia = async (type: 'video' | 'screen') => {
    if (!activeCall) return;
    const updatedCall: Call = { ...activeCall };
    if (type === 'video') updatedCall.isVideo = !activeCall.isVideo;
    else updatedCall.isScreenSharing = !activeCall.isScreenSharing;
    setActiveCall(updatedCall);
    if (isFirebaseConfigured) await dbService.saveCall(updatedCall);
  };

  const updateCall = async (call: Call) => {
    setActiveCall(call);
    if (isFirebaseConfigured) await dbService.saveCall(call);
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
    setAppSettings(prev => ({
      ...prev,
      team: prev.team.map(u => u.id === updated.id ? updated : u)
    }));
    if (isFirebaseConfigured) await dbService.saveUser(updated);
    addNotification('success', 'Neural Profile Updated Successfully.');
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
      if (isFirebaseConfigured) dbService.saveCall(updated);
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
      id: `ext_${Date.now()}`, direction: 'outbound', customerName: name, phoneNumber: phone, queue: 'External Hub', startTime: Date.now(), durationSeconds: 0, status: CallStatus.DIALING, transcript: [], agentId: currentUser?.id, agentName: currentUser?.name, emailSynced: true, transcriptionEnabled: true
    };
    setActiveCall(newCall);
    if (isFirebaseConfigured) await dbService.saveCall(newCall);
    setAgentStatus(AgentStatus.BUSY);
    setTimeout(async () => {
      setActiveCall(prev => prev ? { ...prev, status: CallStatus.ACTIVE } : null);
      try {
        const service = new LiveCallService({
          persona: `You are ${name}. Be a professional client interested in AI services.`,
          onTranscriptUpdate: (segment) => {
            setActiveCall(prev => prev ? { ...prev, transcript: [...prev.transcript, segment] } : null);
          },
          onAudioOutput: () => {},
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
      emailSynced: true,
      transcriptionEnabled: true
    };
    setShowPersonaModal(false);
    setActiveCall(newCall);
    if (isFirebaseConfigured) await dbService.saveCall(newCall);
    setAgentStatus(AgentStatus.BUSY);
    setTimeout(async () => {
      setActiveCall(prev => prev ? { ...prev, status: CallStatus.ACTIVE } : null);
      try {
        const service = new LiveCallService({
          persona: persona.prompt,
          onTranscriptUpdate: (segment) => {
            setActiveCall(prev => prev ? { ...prev, transcript: [...prev.transcript, segment] } : null);
          },
          onAudioOutput: () => {},
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
    const newCall: Call = {
      id: `int_${Date.now()}`, direction: 'internal', customerName: target.name, phoneNumber: `EXT ${target.extension}`, queue: 'Internal Matrix', startTime: Date.now(), durationSeconds: 0, status: CallStatus.DIALING, transcript: [], agentId: currentUser?.id, agentName: currentUser?.name, targetAgentId: target.id, isVideo: true, participants: [target.id, currentUser!.id], emailSynced: true, transcriptionEnabled: true
    };
    setActiveCall(newCall);
    if (isFirebaseConfigured) await dbService.saveCall(newCall);
    setAgentStatus(AgentStatus.BUSY);
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
    if (isFirebaseConfigured) await dbService.saveCall(updatedCall);
    setAgentStatus(AgentStatus.BUSY);
  };

  const handleHangup = async () => {
    liveService?.stop();
    setLiveService(null);
    setAudioLevel(0);
    if (activeCall) {
      const finalCall: Call = { ...activeCall, status: CallStatus.ENDED, durationSeconds: (Date.now() - activeCall.startTime)/1000 };
      setCallHistory(h => [finalCall, ...h]);
      if (isFirebaseConfigured) await dbService.saveCall(finalCall);
      setActiveCall(null); 
      setAgentStatus(AgentStatus.WRAP_UP);
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
      createCampaign(newest).catch(() => {});
    }
  };

  const handleUpdateMeetings = (nextMeetings: Meeting[]) => {
    setMeetings(nextMeetings);
    const newest = nextMeetings[0];
    if (newest) {
      createCalendarEvent(newest).catch(() => {});
    }
  };

  const handleLogin = async (role: Role) => {
    if (isFirebaseConfigured) {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.warn('Anonymous sign-in failed, continuing in demo mode:', err);
        setIsFirebaseConfigured(false);
        addNotification('info', 'Firebase disabled (auth configuration not ready). Running in demo mode.');
      }
    }
    const user = appSettings.team.find(u => u.role === role) || { id: `u_${role.toLowerCase()}`, name: `${role.charAt(0) + role.slice(1).toLowerCase()} User`, role, avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${role}`, status: 'active' as const, email: `${role.toLowerCase()}@connectai.io` };
    setCurrentUser(user);
    setView(role === Role.SUPERVISOR ? 'supervisor' : role === Role.ADMIN ? 'admin' : 'agent');
    if (role === Role.AGENT) setAgentStatus(AgentStatus.AVAILABLE);
  };

  if (!currentUser) return <LoginScreen onLogin={handleLogin} />;

  const isMeetingActive = activeCall && (activeCall.status !== CallStatus.ENDED) && (activeCall.direction === 'internal' || activeCall.isVideo);

  return (
    <div className="flex h-screen bg-slate-50">
      <ToastContainer notifications={notifications} removeNotification={() => {}} />
      {!isMeetingActive && (
        <div className="w-24 bg-brand-900 flex flex-col items-center py-8 space-y-10 z-50 shadow-2xl shrink-0">
          <div className="w-12 h-12 bg-brand-500 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-xl italic tracking-tighter">C</div>
          <nav className="flex-1 space-y-8 w-full flex flex-col items-center">
            <button onClick={() => setView('agent')} className={`p-4 rounded-2xl transition-all ${view === 'agent' ? 'bg-white/10 text-white shadow-xl' : 'text-slate-500 hover:text-white'}`} title="Agent Workspace"><Phone size={24}/></button>
            {(currentUser.role !== Role.AGENT) && <button onClick={() => setView('supervisor')} className={`p-4 rounded-2xl transition-all ${view === 'supervisor' ? 'bg-white/10 text-white shadow-xl' : 'text-slate-500 hover:text-white'}`} title="Supervisor Analytics"><LayoutDashboard size={24}/></button>}
            {(currentUser.role === Role.ADMIN) && <button onClick={() => setView('admin')} className={`p-4 rounded-2xl transition-all ${view === 'admin' ? 'bg-white/10 text-white shadow-xl' : 'text-slate-500 hover:text-white'}`} title="Cluster Admin"><Settings size={24}/></button>}
          </nav>
          <button onClick={() => signOut(auth).then(() => setCurrentUser(null))} className="text-slate-500 hover:text-white mb-6 p-4"><LogOut size={24}/></button>
        </div>
      )}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {!isMeetingActive && (
          <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-10 z-40 shadow-sm shrink-0">
            <h1 className="text-2xl font-black text-slate-800 uppercase italic tracking-tighter">{view} HUB</h1>
            <HeaderProfileMenu user={currentUser} status={agentStatus} onStatusChange={setAgentStatus} onLogout={() => setCurrentUser(null)} onUpdateUser={updateUserProfile} />
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
            />
          ) : (
            <>
              {view === 'agent' && (
                <div className="p-8 h-full">
                  <div className="h-full flex gap-8">
                    <div className="flex-1 min-w-0">
                      <AgentConsole activeCall={activeCall} agentStatus={agentStatus} onCompleteWrapUp={handleCompleteWrapUp} settings={appSettings} addNotification={addNotification} leads={leads} onOutboundCall={startExternalCall} onInternalCall={startInternalCall} history={callHistory} campaigns={campaigns} onUpdateCampaigns={handleUpdateCampaigns} meetings={meetings} onUpdateMeetings={handleUpdateMeetings} user={currentUser} onAddParticipant={addParticipantToCall} />
                    </div>
                    <div className="shrink-0">
                      <Softphone userExtension={currentUser?.extension} allowedNumbers={appSettings.voice.allowedNumbers} activeCall={activeCall} agentStatus={agentStatus} onAccept={handleAcceptInternal} onHangup={handleHangup} onHold={handleHold} onMute={handleMute} onTransfer={handleTransfer} onStatusChange={setAgentStatus} onStartSimulator={() => setShowPersonaModal(true)} audioLevel={audioLevel} onToggleMedia={toggleMedia} team={appSettings.team} onManualDial={startExternalCall} onTestTts={playTtsSample} onOpenFreeCall={openFreeCallRoom} />
                    </div>
                  </div>
                </div>
              )}
              {view === 'supervisor' && <div className="p-8 h-full"><SupervisorDashboard calls={callHistory} team={appSettings.team} addNotification={addNotification} activeCall={activeCall} /></div>}
              {view === 'admin' && <AdminSettings settings={appSettings} onUpdateSettings={setAppSettings} addNotification={addNotification} />}
            </>
          )}
        </main>
      </div>

      {showPersonaModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl p-12 border border-white/20 relative overflow-hidden">
            <button onClick={() => setShowPersonaModal(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600">
              <X size={18}/>
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
