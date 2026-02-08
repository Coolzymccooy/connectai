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
import { generateLeadBriefing, generateAiDraft, analyzeCallTranscript, extractToolActions } from '../services/geminiService';
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
  meetings: Meeting[];
  onUpdateMeetings: (m: Meeting[]) => void;
  user: User;
  isFirebaseConfigured?: boolean;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); 
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
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
  campaigns, onUpdateCampaigns, meetings, onUpdateMeetings, user, onJoinMeeting, isFirebaseConfigured = false
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'voice' | 'omnichannel' | 'campaigns' | 'outbound' | 'team' | 'calendar'>('voice');
  
  // Neural Copilot & Analysis State
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [liveTools, setLiveTools] = useState<ToolAction[]>([]);
  const [wrapUpAnalysis, setWrapUpAnalysis] = useState<CallAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastEndedCall, setLastEndedCall] = useState<Call | null>(null);
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

  // Campaign States
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: '', type: 'call' as any, target: 100, persona: 'Professional Concierge' });

  // Outbound Dialer States
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadBrief, setLeadBrief] = useState<string | null>(null);
  const [isLoadingBrief, setIsLoadingBrief] = useState(false);
  const [dialerSearch, setDialerSearch] = useState('');
  const [leadNotes, setLeadNotes] = useState<Record<string, string>>({});

  // Calendar States
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [newMeeting, setNewMeeting] = useState({ title: '', attendeeId: '', date: new Date().toISOString().split('T')[0], time: '10:00', isRecurring: false, pattern: 'weekly' as any });

  const activeConversation = conversations.find(c => c.id === selectedConvId);
  const activeMessages = selectedConvId ? (messageMap[selectedConvId] || activeConversation?.messages || []) : (activeConversation?.messages || []);

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
    if (agentStatus === AgentStatus.WRAP_UP && history.length > 0 && !wrapUpAnalysis && !isAnalyzing) {
      const lastCall = history[0];
      setLastEndedCall(lastCall);
      setIsAnalyzing(true);
      analyzeCallTranscript(lastCall.transcript)
        .then((analysis) => {
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
      setWrapUpActions({
        qaApproved: false,
        dispositionApplied: false,
        crmSynced: false,
        followUpScheduled: false,
      });
    }
  }, [agentStatus, history, wrapUpAnalysis, isAnalyzing]);

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
      hourlyStats: [] 
    };
    onUpdateCampaigns([cam, ...campaigns]);
    setShowCampaignModal(false);
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

  const handleMessageTeammate = async (member: User) => {
    const convId = buildInternalConversationId(user.id, member.id);
    if (isFirebaseConfigured) {
      const conv: Conversation = {
        id: convId,
        contactName: member.name,
        contactPhone: `EXT ${member.extension}`,
        channel: 'chat',
        lastMessage: 'Neural Link Established',
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
        lastMessage: 'Neural Link Established', 
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
    if (l) onOutboundCall?.(l);
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
          { id: 'outbound', label: 'DIALER' }
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

                  {/* Neural Copilot Sidebar */}
                    <div className="col-span-12 lg:col-span-4 space-y-6 md:space-y-8 flex flex-col overflow-hidden">
                       <div className="flex-1 bg-slate-100 rounded-[3.5rem] border border-slate-200 shadow-inner p-6 md:p-10 flex flex-col overflow-hidden">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-8 flex items-center gap-2"><BrainCircuit size={14} className="text-brand-500"/> Neural Copilot</h4>
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
               <div className="h-full animate-in zoom-in-95 duration-500">
                  <div className="h-full bg-white rounded-[3.5rem] border border-slate-200 shadow-4xl flex flex-col overflow-hidden">
                     <div className="p-12 border-b bg-brand-900 text-white flex justify-between items-end">
                        <div>
                           <div className="flex items-center gap-4 mb-4">
                              <ShieldCheck size={24} className="text-brand-400"/>
                              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-brand-300">Call Wrap-Up</h3>
                           </div>
                           <h2 className="text-5xl font-black italic uppercase tracking-tighter">Wrap-Up</h2>
                        </div>
                        <div className="text-right">
                           <p className="text-[10px] font-black uppercase text-brand-300 mb-2">Neural Sentiment Score</p>
                           <p className="text-6xl font-black italic text-brand-400">{wrapUpAnalysis.sentimentScore}%</p>
                        </div>
                     </div>
                     
                     <div className="flex-1 overflow-y-auto p-12 scrollbar-hide">
                        <div className="grid grid-cols-12 gap-12">
                           <div className="col-span-7 space-y-12">
                              <section>
                                 <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 mb-6 flex items-center gap-3"><Terminal size={16}/> Summary Packet</h4>
                                 <div className="bg-slate-50 p-10 rounded-[3rem] border-2 border-slate-100 shadow-inner">
                                    <p className="text-xl font-medium italic text-slate-700 leading-relaxed">"{wrapUpAnalysis.summary}"</p>
                                 </div>
                              </section>
                              
                              <div className="grid grid-cols-2 gap-8">
                                 <div className="p-8 bg-brand-50 rounded-[2.5rem] border border-brand-100 shadow-sm">
                                    <p className="text-[10px] font-black uppercase text-brand-600 tracking-widest mb-3 italic">QA CHECK</p>
                                    <div className="flex items-end gap-2">
                                       <span className="text-5xl font-black italic text-slate-800">{wrapUpAnalysis.qaScore}</span>
                                       <span className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">Protocol Grade</span>
                                    </div>
                                    <button
                                      onClick={handleApproveQa}
                                      disabled={wrapUpActions.qaApproved}
                                      className={`mt-6 w-full py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all ${wrapUpActions.qaApproved ? 'bg-green-500/10 text-green-600 cursor-not-allowed' : 'bg-white border border-brand-200 text-brand-700 hover:bg-brand-600 hover:text-white shadow-lg active:scale-95'}`}
                                    >
                                      {wrapUpActions.qaApproved ? 'QA approved' : 'Approve QA'}
                                    </button>
                                 </div>
                                 <div className="p-8 bg-slate-100 rounded-[2.5rem] border border-slate-200 shadow-sm">
                                    <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest mb-3 italic">DISPOSITION LINK</p>
                                    <p className="text-2xl font-black italic uppercase tracking-tighter text-slate-800">{wrapUpAnalysis.dispositionSuggestion}</p>
                                    <button
                                      onClick={handleApplyDisposition}
                                      disabled={wrapUpActions.dispositionApplied}
                                      className={`mt-6 w-full py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all ${wrapUpActions.dispositionApplied ? 'bg-green-500/10 text-green-600 cursor-not-allowed' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-900 hover:text-white shadow-lg active:scale-95'}`}
                                    >
                                      {wrapUpActions.dispositionApplied ? 'Disposition Applied' : 'Apply Disposition'}
                                    </button>
                                 </div>
                              </div>
                           </div>

                           <div className="col-span-5 space-y-12">
                              <section>
                                 <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 mb-6">Neural Topic Map</h4>
                                 <div className="flex flex-wrap gap-4">
                                    {wrapUpAnalysis.topics.map((topic, i) => (
                                       <span key={i} className="px-6 py-3 bg-white border-2 border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-sm hover:border-brand-500 hover:text-brand-600 transition-all cursor-default">{topic}</span>
                                    ))}
                                 </div>
                              </section>

                              <section className="bg-slate-900 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden">
                                 <div className="absolute top-0 right-0 w-48 h-48 bg-brand-500/10 blur-[60px] -mr-24 -mt-24"></div>
                                 <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-brand-400 mb-8 flex items-center gap-3"><Bot size={18}/> Next steps</h4>
                                 <div className="space-y-4">
                                    <button
                                      onClick={handleSyncCrm}
                                      disabled={wrapUpActions.crmSynced}
                                      className={`w-full py-5 rounded-3xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-3 ${wrapUpActions.crmSynced ? 'bg-green-500/20 text-green-200 cursor-not-allowed' : 'bg-white text-slate-900 hover:bg-slate-100'}`}
                                    >
                                      <CheckCircle size={16}/> {wrapUpActions.crmSynced ? 'CRM Core Synchronized' : 'Synchronize to CRM Core'}
                                    </button>
                                    <button
                                      onClick={handleScheduleFollowUp}
                                      disabled={wrapUpActions.followUpScheduled}
                                      className={`w-full py-5 border rounded-3xl text-[11px] font-black uppercase tracking-widest transition-all ${wrapUpActions.followUpScheduled ? 'bg-green-500/10 text-green-200 border-green-500/20 cursor-not-allowed' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                                    >
                                      {wrapUpActions.followUpScheduled ? 'Follow-up Scheduled' : 'Schedule Cluster Sync'}
                                    </button>
                                 </div>
                              </section>
                           </div>
                        </div>
                     </div>

                     <div className="p-10 border-t bg-slate-50 flex justify-center">
                        <button onClick={completeWrapUp} className="px-24 py-6 bg-slate-900 text-white rounded-[2rem] text-xs font-black uppercase tracking-[0.4em] shadow-3xl hover:bg-slate-800 transition-all flex items-center gap-6">Finish Wrap-Up <ArrowRight size={18}/></button>
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
             <div className="h-full flex flex-col space-y-6 md:space-y-8 animate-in slide-in-from-bottom">
                <div className="flex flex-col md:flex-row md:justify-between md:items-end px-2 md:px-4 gap-4">
                 <div>
                      <h3 className="text-5xl font-black text-slate-800 uppercase italic tracking-tighter">Team Directory</h3>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.4em] mt-2 italic">See who is online</p>
                 </div>
                   <div className="relative w-full md:w-80">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                    <input type="text" placeholder="Search roster..." className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-14 pr-6 text-xs font-bold outline-none focus:border-brand-500 shadow-xl transition-all" />
                 </div>
              </div>
                <div className="flex-1 bg-white rounded-[4rem] border border-slate-200 shadow-2xl p-6 md:p-12 overflow-y-auto scrollbar-hide">
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                    {settings.team.map(member => (
                         <div key={member.id} className="bg-slate-50 border border-slate-100 p-6 md:p-8 rounded-[3rem] group hover:border-brand-500/30 hover:shadow-xl transition-all relative overflow-hidden">
                          <div className="flex items-center gap-6 mb-8 relative z-10">
                             <div className="relative">
                                <img src={member.avatarUrl} className="w-20 h-20 rounded-[2rem] border-2 border-white shadow-xl" />
                                <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-4 border-slate-50 ${
                                  member.currentPresence === AgentStatus.AVAILABLE ? 'bg-green-500' :
                                  member.currentPresence === AgentStatus.BUSY ? 'bg-red-500' : 'bg-slate-400'
                                } shadow-sm`}></div>
                             </div>
                             <div>
                                <h4 className="text-xl font-black uppercase italic tracking-tighter text-slate-800 leading-tight">{member.name}</h4>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{member.role}</p>
                             </div>
                          </div>
                          <div className="grid grid-cols-1 gap-3 relative z-10">
                             <div className="grid grid-cols-2 gap-3">
                                <button 
                                  onClick={() => handleInternalLink(member, false)}
                                  disabled={member.id === user.id}
                                  className="flex items-center justify-center gap-3 py-4 bg-white border-2 border-slate-100 rounded-2xl text-[9px] font-black uppercase tracking-widest text-slate-600 hover:bg-brand-50 hover:border-brand-500/20 hover:text-brand-600 transition-all disabled:opacity-30"
                                >
                                     <Phone size={14}/> Call
                                </button>
                                <button 
                                  onClick={() => handleInternalLink(member, true)}
                                  disabled={member.id === user.id}
                                  className="flex items-center justify-center gap-3 py-4 bg-brand-600 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-brand-700 transition-all disabled:opacity-30 shadow-lg"
                                >
                                     <Video size={14}/> Video Call
                                </button>
                             </div>
                             <button 
                               onClick={() => handleMessageTeammate(member)}
                               disabled={member.id === user.id}
                               className="flex items-center justify-center gap-3 py-4 bg-white border-2 border-slate-100 rounded-2xl text-[9px] font-black uppercase tracking-widest text-slate-600 hover:bg-brand-50 hover:border-brand-500/20 hover:text-brand-600 transition-all disabled:opacity-30"
                             >
                                  <MessageCircle size={14}/> Message
                             </button>
                          </div>
                          <div className="mt-6 pt-6 border-t border-slate-200/50 flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400 relative z-10 italic">
                             <span>Extension: {member.extension}</span>
                               <span className="opacity-40">Team member</span>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
           </div>
        )}

        {/* CAMPAIGNS HUB */}
        {activeTab === 'campaigns' && (
           <div className="h-full flex flex-col space-y-8 animate-in slide-in-from-right">
              <div className="flex justify-between items-end px-4">
                 <div>
                    <h3 className="text-5xl font-black text-slate-800 uppercase italic tracking-tighter">Campaigns</h3>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.4em] mt-2 italic">Autonomous Wave Orchestration</p>
                 </div>
                 <button onClick={() => setShowCampaignModal(true)} className="px-10 py-5 bg-brand-900 text-white rounded-[1.8rem] text-[10px] font-black uppercase tracking-widest flex items-center gap-4 shadow-3xl hover:bg-slate-800 transition-all active:scale-95"><Plus size={18}/> Create Campaign</button>
              </div>
              <div className="flex-1 bg-white rounded-[4rem] border border-slate-200 shadow-2xl p-12 overflow-y-auto scrollbar-hide">
                 <div className="space-y-8">
                    {campaigns.map(cam => (
                       <div key={cam.id} className="bg-slate-50 border border-slate-100 p-10 rounded-[3.5rem] group hover:border-brand-500/30 transition-all shadow-sm">
                          <div className="flex justify-between items-start mb-10">
                             <div className="flex items-center gap-8">
                                <div className={`w-20 h-20 rounded-[2.5rem] flex items-center justify-center shadow-xl ${
                                   cam.type === 'call' ? 'bg-orange-500 text-white' : 'bg-brand-600 text-white'
                                }`}>
                                   {cam.type === 'call' ? <PhoneOutgoing size={36}/> : <Mail size={36}/>}
                                </div>
                                <div>
                                   <div className="flex items-center gap-4 mb-2">
                                      <h4 className="text-3xl font-black uppercase italic tracking-tighter text-slate-800">{cam.name}</h4>
                                      <span className="px-4 py-1.5 bg-green-100 text-green-700 text-[9px] font-black uppercase rounded-lg tracking-widest border border-green-200">{cam.status}</span>
                                   </div>
                                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                      <Sparkles size={12} className="text-brand-500"/> AI Persona: {cam.aiPersona}
                                   </p>
                                </div>
                             </div>
                             <div className="flex gap-4">
                                <button className="p-4 bg-white border border-slate-200 rounded-2xl hover:bg-slate-100 transition-all text-slate-400"><BarChart3 size={20}/></button>
                                <button className="p-4 bg-white border border-slate-200 rounded-2xl hover:bg-slate-100 transition-all text-slate-400"><Settings size={20}/></button>
                             </div>
                          </div>
                          <div className="grid grid-cols-4 gap-8">
                             <div className="p-6 bg-white rounded-[2rem] border border-slate-200/50 shadow-sm text-center">
                                <p className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest italic">TARGET POPULATION</p>
                                <p className="text-3xl font-black italic text-slate-800">{cam.targetCount}</p>
                             </div>
                             <div className="p-6 bg-white rounded-[2rem] border border-slate-200/50 shadow-sm text-center">
                                <p className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest italic">PROCESSED ADMISSIONS</p>
                                <p className="text-3xl font-black italic text-slate-800">{cam.processedCount}</p>
                             </div>
                             <div className="p-6 bg-white rounded-[2rem] border border-slate-200/50 shadow-sm text-center">
                                <p className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest italic">SUCCESS HANDSHAKES</p>
                                <p className="text-3xl font-black italic text-green-600">{cam.successCount}</p>
                             </div>
                             <div className="p-6 bg-white rounded-[2rem] border border-slate-200/50 shadow-sm flex flex-col justify-center items-center">
                                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mb-3 shadow-inner">
                                   <div className="h-full bg-brand-500 transition-all duration-1000" style={{ width: `${(cam.processedCount / cam.targetCount) * 100}%` }}></div>
                                </div>
                                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{Math.round((cam.processedCount / cam.targetCount) * 100)}% COMPLETE</p>
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
           <div className="h-full flex gap-8 animate-in slide-in-from-left">
              <div className="w-[450px] flex flex-col space-y-6">
                 <div className="bg-white rounded-[3rem] border border-slate-200 shadow-xl flex flex-col overflow-hidden h-full">
                    <div className="p-10 border-b bg-slate-900 text-white flex justify-between items-center shrink-0">
                       <div>
                          <h3 className="text-2xl font-black uppercase italic tracking-tighter">Call Queue</h3>
                          <p className="text-[10px] font-black uppercase text-brand-400 tracking-[0.4em] mt-1">Ready for Dialing</p>
                       </div>
                       <div className="p-4 bg-white/10 rounded-2xl"><Users size={24}/></div>
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
                             <ChevronRight size={16} className={`text-slate-300 transition-transform ${selectedLeadId === lead.id ? 'translate-x-1 text-brand-500' : ''}`}/>
                          </button>
                       ))}
                    </div>
                 </div>
              </div>

              <div className="flex-1 bg-white rounded-[4rem] border border-slate-200 shadow-2xl flex flex-col overflow-hidden relative">
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
                             <button onClick={handleLeadCall} className="px-12 py-6 bg-green-600 text-white rounded-[2rem] text-xs font-black uppercase tracking-[0.3em] shadow-3xl hover:bg-green-700 transition-all flex items-center gap-4 active:scale-95 group">
                                <PhoneOutgoing size={20} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform"/> Start Call
                             </button>
                          </div>
                       </div>

                       <div className="flex-1 overflow-y-auto p-12 scrollbar-hide">
                          <div className="grid grid-cols-12 gap-12">
                             <div className="col-span-8 space-y-12">
                                <section className="relative">
                                   <div className="flex items-center gap-4 mb-8">
                                      <div className="p-3 bg-brand-50 rounded-xl text-brand-600"><Sparkles size={24}/></div>
                                      <h4 className="text-[11px] font-black uppercase tracking-[0.5em] text-slate-400">Neural Strategic Briefing</h4>
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
                                   <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-brand-400 mb-10 flex items-center gap-3"><Terminal size={18}/> Behavioral Notes</h4>
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
           <div className="h-full flex gap-8 animate-in slide-in-from-right">
              <div className="w-96 bg-white rounded-[3rem] border border-slate-200 shadow-xl flex flex-col overflow-hidden">
                 <div className="p-10 border-b bg-slate-50 flex items-center justify-between">
                    <h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-800">Inbox</h3>
                    <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white text-[10px] font-black">{conversations.filter(c => c.unreadCount > 0).length}</div>
                 </div>
                 <div className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-4">
                    {conversations.map(conv => (
                       <button key={conv.id} onClick={() => setSelectedConvId(conv.id)} className={`w-full p-8 rounded-[2.5rem] text-left transition-all border-2 group ${selectedConvId === conv.id ? 'bg-brand-50 border-brand-500 shadow-lg' : 'border-transparent hover:bg-slate-50'}`}>
                          <div className="flex justify-between items-start mb-2">
                             <h4 className="font-black text-slate-800 uppercase text-xs italic group-hover:text-brand-600">{conv.contactName}</h4>
                             <span className="text-[9px] font-black text-slate-400">{new Date(conv.lastMessageTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 line-clamp-1 italic leading-relaxed">"{conv.lastMessage}"</p>
                       </button>
                    ))}
                 </div>
              </div>
              
              <div className="flex-1 bg-white rounded-[3.5rem] border border-slate-200 shadow-2xl flex flex-col overflow-hidden relative">
                 {activeConversation ? (
                    <>
                      <div className="p-10 border-b bg-slate-900 text-white flex justify-between items-center relative">
                         <div className="flex items-center gap-6">
                            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center"><MessageCircle size={28}/></div>
                            <div>
                               <h4 className="font-black italic uppercase text-2xl tracking-tighter">{activeConversation.contactName}</h4>
                               <p className="text-[10px] font-black text-brand-400 uppercase tracking-[0.3em]">{activeConversation.channel} HUB PORT</p>
                            </div>
                         </div>
                         <div className="flex gap-4 items-center">
                            <button onClick={() => onOutboundCall?.(activeConversation.contactPhone)} className="p-5 bg-white/10 rounded-2xl hover:bg-white/20 transition-all text-white shadow-lg"><Phone size={20}/></button>
                            <div className="relative">
                               <button onClick={() => setShowInboxMenu(!showInboxMenu)} className="p-5 bg-white/10 rounded-2xl hover:bg-white/20 transition-all"><MoreVertical size={24}/></button>
                               {showInboxMenu && (
                                  <div className="absolute right-0 top-full mt-4 w-64 bg-[#12161f] border border-white/10 rounded-3xl shadow-3xl z-50 p-4 animate-in zoom-in-95 overflow-hidden">
                                     <button className="w-full text-left p-4 hover:bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-300 flex items-center gap-3 transition-all"><Eye size={16}/> View contact</button>
                                     <button className="w-full text-left p-4 hover:bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-300 flex items-center gap-3 transition-all"><Settings size={16}/> Settings</button>
                                     <button className="w-full text-left p-4 hover:bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-3 transition-all"><Trash2 size={16}/> Terminate Thread</button>
                                  </div>
                               )}
                            </div>
                         </div>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto p-12 space-y-10 scrollbar-hide bg-slate-50/50">
                        {activeMessages.map(m => (
                          <div key={m.id} className={`flex ${m.sender === 'agent' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] p-8 rounded-[2.5rem] text-base leading-relaxed shadow-sm ${m.sender === 'agent' ? 'bg-brand-600 text-white rounded-br-none' : 'bg-white border border-slate-100 text-slate-800 rounded-bl-none'}`}>
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

                      <div className="p-10 border-t bg-white space-y-6">
                         {aiDraftText && (
                            <div className="p-8 bg-brand-50 border-2 border-brand-200 rounded-[2.5rem] relative animate-in slide-in-from-bottom duration-300">
                               <button onClick={() => setAiDraftText(null)} className="absolute top-6 right-6 text-brand-400 hover:text-brand-600"><X size={18}/></button>
                               <div className="flex items-center gap-3 mb-3">
                                  <Sparkles size={16} className="text-brand-600"/>
                                  <p className="text-[10px] font-black uppercase tracking-widest text-brand-600">Suggested Neural Packet Reply</p>
                               </div>
                               <p className="text-sm font-medium italic text-slate-700 leading-relaxed">"{aiDraftText}"</p>
                               <div className="mt-6 flex gap-4">
                                  <button onClick={() => handleSendMessage(aiDraftText)} className="px-6 py-2.5 bg-brand-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-brand-700 shadow-lg">Admit and Stream</button>
                                  <button onClick={() => setMessageInput(aiDraftText)} className="px-6 py-2.5 bg-white border border-brand-200 text-brand-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-brand-50">Edit Logic</button>
                               </div>
                            </div>
                         )}
                         <input type="file" ref={fileInputRef} onChange={handleFileAttach} className="hidden" multiple />
                         <div className="flex gap-4">
                            <button onClick={() => fileInputRef.current?.click()} className="p-5 bg-slate-100 text-slate-400 rounded-2xl hover:bg-slate-200 transition-all border border-slate-200 shadow-inner group"><Paperclip size={24} className="group-hover:rotate-12 transition-transform"/></button>
                            <button onClick={handleGenerateDraft} disabled={isDrafting} className="p-5 bg-brand-50 text-brand-600 rounded-2xl hover:bg-brand-100 transition-all shadow-sm flex items-center justify-center relative overflow-hidden">
                               {isDrafting ? <RefreshCw size={24} className="animate-spin"/> : <Sparkles size={24}/>}
                            </button>
                            <input type="text" value={messageInput} onChange={e => setMessageInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} placeholder="Admit packet to neural stream..." className="flex-1 bg-slate-100 p-6 rounded-[2.5rem] border border-slate-200 italic outline-none focus:border-brand-500 font-medium shadow-inner" />
                            <button onClick={() => handleSendMessage()} className="p-6 bg-slate-900 text-white rounded-[2.2rem] shadow-2xl hover:bg-slate-800 transition-all group active:scale-95"><Send size={24} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform"/></button>
                         </div>
                      </div>
                    </>
                 ) : (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-10 italic grayscale">
                       <MessageSquare size={120} className="mb-8"/>
                       <p className="text-3xl font-black uppercase tracking-[0.6em]">Select a conversation</p>
                    </div>
                 )}
              </div>
           </div>
        )}

        {/* CALENDAR VIEW */}
        {activeTab === 'calendar' && (
          <div className="h-full flex flex-col space-y-6 md:space-y-8 animate-in fade-in">
            <div className="flex flex-col md:flex-row md:justify-between md:items-end px-2 md:px-4 gap-4">
              <div>
                <h3 className="text-5xl font-black text-slate-800 uppercase italic tracking-tighter">Calendar</h3>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.4em] mt-2 italic">Your meetings</p>
              </div>
              <button onClick={() => setShowScheduleModal(true)} className="px-10 py-5 bg-slate-900 text-white rounded-[1.8rem] text-[10px] font-black uppercase tracking-widest flex items-center gap-4 shadow-3xl hover:bg-slate-800 transition-all active:scale-95"><Plus size={18}/> Schedule Meeting</button>
            </div>

            <div className="flex-1 bg-white rounded-[4rem] border border-slate-200 shadow-2xl flex flex-col overflow-hidden relative">
              <div className="overflow-x-auto">
                <div className="min-w-[900px] grid grid-cols-[100px_1fr_1fr_1fr_1fr_1fr] border-b bg-slate-50 shadow-sm relative z-10">
                  <div className="p-4"></div>
                  {DAYS.map(day => (
                    <div key={day} className="p-8 text-center border-l border-slate-200/50">
                      <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mb-1 block">{day}</span>
                      <span className="text-2xl font-black italic text-slate-800 tracking-tighter">1{DAYS.indexOf(day) + 2}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-hide relative bg-white">
                {HOURS.map(hour => (
                  <div key={hour} className="min-w-[900px] grid grid-cols-[100px_1fr_1fr_1fr_1fr_1fr] h-28 border-b border-slate-100 group">
                    <div className="p-6 text-[10px] font-black text-slate-300 text-right pr-8 uppercase tracking-widest">{hour}:00</div>
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
                            <div className={`absolute inset-3 rounded-[2rem] p-5 text-left shadow-xl hover:scale-[1.03] transition-all animate-in zoom-in-95 group/event ${event.attendees.some(a => a.userId === user.id) ? 'bg-brand-900 text-white' : 'bg-white border-2 border-slate-100 text-slate-600'}`}>
                              <div className="flex justify-between items-start mb-2">
                                <p className="text-[9px] font-black uppercase tracking-widest opacity-60 italic">{hour}:00 meeting</p>
                                {event.isRecurring && <Repeat size={10} className="opacity-40" />}
                              </div>
                              <p className="font-black italic uppercase tracking-tighter text-sm leading-tight line-clamp-2">{event.title}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {event.attendees.find(a => a.userId === user.id)?.status === 'pending' && (
                                  <>
                                    <button
                                      onClick={() => handleAcceptMeeting(event)}
                                      className="px-3 py-1 rounded-xl bg-white/10 text-[9px] font-black uppercase tracking-widest"
                                    >
                                      Accept
                                    </button>
                                    <button
                                      onClick={() => handleDeclineMeeting(event)}
                                      className="px-3 py-1 rounded-xl bg-white/10 text-[9px] font-black uppercase tracking-widest"
                                    >
                                      Decline
                                    </button>
                                  </>
                                )}
                                {(event.organizerId === user.id || event.attendees.find(a => a.userId === user.id)?.status === 'accepted') && (
                                  <button
                                    onClick={() => handleJoinMeeting(event)}
                                    className="px-3 py-1 rounded-xl bg-brand-600 text-[9px] font-black uppercase tracking-widest text-white"
                                  >
                                    Join
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-[3rem] border border-slate-200 shadow-2xl px-10 py-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h4 className="text-xl font-black uppercase tracking-widest text-slate-700">Meeting History</h4>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mt-2">Last 8 sessions</p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{pastMeetings.length} entries</span>
              </div>
              {pastMeetings.length === 0 ? (
                <div className="text-slate-400 text-sm font-bold">No past meetings yet.</div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {pastMeetings.map(meeting => (
                    <div key={meeting.id} className="p-5 rounded-2xl border border-slate-100 bg-slate-50/60 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {new Date(meeting.startTime).toLocaleDateString()}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          {meeting.status}
                        </span>
                      </div>
                      <div className="text-sm font-black text-slate-800 uppercase italic line-clamp-1">{meeting.title}</div>
                      <div className="text-[11px] text-slate-500">
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
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-white rounded-[4rem] shadow-4xl w-full max-w-2xl p-16 border border-white/20 relative overflow-hidden">
              <h3 className="text-4xl font-black italic tracking-tighter uppercase text-slate-800 mb-10 text-center">Create Campaign</h3>
              <div className="space-y-8">
                 <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Wave Identifier</label>
                    <input className="w-full bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 font-bold text-xl focus:border-brand-500 outline-none transition-all" placeholder="e.g. Q4 Growth Core" value={newCampaign.name} onChange={e => setNewCampaign({...newCampaign, name: e.target.value})}/>
                 </div>
                 <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                       <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Protocol Type</label>
                       <select className="w-full bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 font-black uppercase text-xs focus:border-brand-500 outline-none" value={newCampaign.type} onChange={e => setNewCampaign({...newCampaign, type: e.target.value as any})}>
                          <option value="call">Calls</option>
                          <option value="sms">Omnichannel Packet</option>
                       </select>
                    </div>
                    <div className="space-y-3">
                       <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Target Nodes</label>
                       <input type="number" className="w-full bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 font-black text-center text-xl focus:border-brand-500 outline-none" value={newCampaign.target} onChange={e => setNewCampaign({...newCampaign, target: parseInt(e.target.value)})}/>
                    </div>
                 </div>
                 <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Neural Persona Logic</label>
                    <div className="grid grid-cols-2 gap-4">
                       {['Professional Concierge', 'Friendly Assistant', 'Technical Handoff', 'Closing Logic'].map(p => (
                          <button key={p} onClick={() => setNewCampaign({...newCampaign, persona: p})} className={`p-5 rounded-2xl border-2 transition-all text-xs font-black uppercase tracking-widest ${newCampaign.persona === p ? 'bg-brand-900 border-brand-900 text-white shadow-xl' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'}`}>{p}</button>
                       ))}
                    </div>
                 </div>
                 <button onClick={provisionCampaign} className="w-full py-7 bg-brand-600 text-white rounded-[2.5rem] font-black uppercase tracking-[0.3em] shadow-3xl hover:bg-brand-700 transition-all active:scale-95 text-xs">Initialize Campaign Wave</button>
                 <button onClick={() => setShowCampaignModal(false)} className="w-full text-slate-400 font-bold uppercase tracking-widest text-[10px] hover:text-slate-600 transition-all">Cancel</button>
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
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Sync Identifier</label>
                    <input className="w-full bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 font-bold focus:border-brand-500 outline-none transition-all" placeholder="e.g. Behavioral Flux Review" value={newMeeting.title} onChange={e => setNewMeeting({...newMeeting, title: e.target.value})}/>
                 </div>
                 <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Target Node</label>
                    <select className="w-full bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 font-black uppercase text-xs focus:border-brand-500 outline-none" value={newMeeting.attendeeId} onChange={e => setNewMeeting({...newMeeting, attendeeId: e.target.value})}>
                       <option value="">Select Cluster Node</option>
                       {settings.team.filter(t => t.id !== user.id).map(t => (
                          <option key={t.id} value={t.id}>{t.name} (EXT {t.extension})</option>
                       ))}
                    </select>
                 </div>
                 <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                       <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Date Port</label>
                       <input type="date" className="w-full bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 font-black text-center text-xs focus:border-brand-500 outline-none" value={newMeeting.date} onChange={e => setNewMeeting({...newMeeting, date: e.target.value})}/>
                    </div>
                    <div className="space-y-3">
                       <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Time Entry</label>
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
