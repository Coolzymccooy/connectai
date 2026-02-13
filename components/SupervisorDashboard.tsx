
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Activity, Sparkles, Zap, Shield, FileText, AlertTriangle, Eye, Volume2, History, 
  PieChart as PieIcon, TrendingUp, Radio, PlayCircle, PauseCircle, Clock, Infinity, 
  Database, Search, Filter, ArrowUpRight, ShieldCheck, Globe, User, X, RefreshCw,
  SearchCode, ShieldAlert, Heart, Terminal, MessageSquare, ExternalLink, Headset
} from 'lucide-react';
import { Call, User as UserType, Notification, CallStatus } from '../types';
import { ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, Tooltip, CartesianGrid, XAxis, YAxis } from 'recharts';

interface SupervisorDashboardProps {
  calls: Call[];
  activeCall?: Call | null;
  team?: UserType[];
  addNotification?: (type: Notification['type'], message: string) => void;
  risks?: Record<string, string>; 
}

const COLORS = ['#6366f1', '#818cf8', '#4f46e5', '#312e81', '#1e1b4b'];

export const SupervisorDashboard: React.FC<SupervisorDashboardProps> = ({ 
  calls = [], 
  activeCall,
  team = [],
  addNotification,
}) => {
  const getApiHeaders = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('connectai_auth_token');
    const tenantId = localStorage.getItem('connectai_tenant_id');
    if (token) headers.Authorization = `Bearer ${token}`;
    if (tenantId) headers['X-Tenant-Id'] = tenantId;
    return headers;
  };
  const [activeTab, setActiveTab] = useState<'floor' | 'performance' | 'history' | 'alerts'>('floor');
  const [filterSource, setFilterSource] = useState<'all' | 'native' | 'migrated'>('all');
  const [monitoringMode, setMonitoringMode] = useState<Record<string, 'none' | 'listening' | 'whispering'>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [detectedRisks, setDetectedRisks] = useState<Record<string, string>>({});
  const [isAuditing, setIsAuditing] = useState(false);
  
  // Real-time Simulation State for Call Center & History
  const [liveHistory, setLiveHistory] = useState<Call[]>([]);
  const [ingestionLogs, setIngestionLogs] = useState<string[]>([]);
  const [monitoredCallId, setMonitoredCallId] = useState<string | null>(null);
  const [monitorSession, setMonitorSession] = useState<{ participantSid?: string; callId?: string } | null>(null);
  const [monitoringBusy, setMonitoringBusy] = useState(false);
  const [monitorCapabilities, setMonitorCapabilities] = useState<{ canMonitor: boolean; configured: boolean; monitoringEnabled: boolean; missing: string[] } | null>(null);
  const monitorNoticeShownRef = useRef(false);

  const simulationEnabled = Boolean(import.meta.env.VITE_DEV_SIMULATION);

  useEffect(() => {
    let cancelled = false;
    const loadCapabilities = async () => {
      try {
        const res = await fetch('/api/twilio/capabilities', { headers: getApiHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setMonitorCapabilities({
            canMonitor: Boolean(data?.canMonitor),
            configured: Boolean(data?.configured),
            monitoringEnabled: Boolean(data?.monitoringEnabled),
            missing: Array.isArray(data?.missing) ? data.missing : [],
          });
        }
      } catch {
        // non-blocking
      }
    };
    loadCapabilities();
    return () => {
      cancelled = true;
    };
  }, []);

  // Simulation: Background Ingestion for Call Center
  useEffect(() => {
    if (!simulationEnabled) return;
    const interval = setInterval(() => {
      const providers = ['Genesys', 'Twilio', 'Five9', 'AmazonConnect'];
      const prov = providers[Math.floor(Math.random() * providers.length)];
      const names = ['Team Alpha', 'Legacy Port 80', 'External SIP 44', 'Legacy Link'];
      const name = names[Math.floor(Math.random() * names.length)];
      
      const newCall: Call = {
        id: `mig_auto_${Date.now()}`,
        direction: Math.random() > 0.5 ? 'inbound' : 'outbound',
        customerName: `${name} ${Math.floor(Math.random() * 9000) + 1000}`,
        phoneNumber: `+1 (555) ${Math.floor(Math.random() * 800) + 200}-0123`,
        queue: Math.random() > 0.5 ? 'Sales' : 'Support',
        startTime: Date.now(),
        durationSeconds: Math.floor(Math.random() * 400) + 60,
        status: CallStatus.ENDED,
        transcript: [],
        isMigrated: true,
        legacyProvider: prov,
        analysis: {
          summary: "Autonomous record admission from legacy infrastructure.",
          sentimentScore: Math.floor(Math.random() * 40) + 50,
          sentimentLabel: Math.random() > 0.8 ? 'Positive' : 'Neutral',
          topics: ['Unified Sync'],
          qaScore: Math.floor(Math.random() * 20) + 75,
          dispositionSuggestion: 'Archive'
        }
      };
      setLiveHistory(prev => [newCall, ...prev].slice(0, 15));
      setIngestionLogs(prev => [`[${new Date().toLocaleTimeString()}] Admitted record from ${prov}`, ...prev].slice(0, 6));
    }, 12000); 
    return () => clearInterval(interval);
  }, [simulationEnabled]);

  // Analytics: Chart Data Hydration
  const chartData = useMemo(() => {
    const allCalls = [...calls, ...liveHistory];
    
    // Trend Data: Combine real and simulated for smooth EKG
    const trend = Array.from({ length: 15 }).map((_, i) => {
      const call = allCalls[i];
      return {
        name: `T-${15 - i}`,
        value: call?.analysis?.sentimentScore || (50 + Math.sin(i) * 15 + Math.random() * 10)
      };
    }).reverse();
    
    // Distribution Data: Queue counts
    const categories = allCalls.reduce((acc: any, c) => {
       const q = c.queue || 'Sales';
       acc[q] = (acc[q] || 0) + 1;
       return acc;
    }, {});
    
    const pie = Object.keys(categories).length > 0 
      ? Object.keys(categories).map(k => ({ name: k, value: categories[k] })) 
      : [{ name: 'SALES', value: 12 }, { name: 'SUPPORT', value: 8 }, { name: 'BILLING', value: 5 }];
      
    return { trend, pie };
  }, [calls, liveHistory]);

  // Peer Monitoring Logic
  const globalActiveCalls = useMemo(() => {
    return calls.filter(c => c.status === CallStatus.DIALING || c.status === CallStatus.RINGING || c.status === CallStatus.ACTIVE);
  }, [calls]);

  const agentActivityMap = useMemo(() => {
    const map: Record<string, Call> = {};
    globalActiveCalls.forEach(c => { if (c.agentId) map[c.agentId] = c; });
    if (activeCall && activeCall.agentId) map[activeCall.agentId] = activeCall;
    return map;
  }, [globalActiveCalls, activeCall]);

  const monitoredCall = useMemo(() => {
    if (!monitoredCallId) return null;
    return calls.find(c => c.id === monitoredCallId) || (activeCall?.id === monitoredCallId ? activeCall : null);
  }, [monitoredCallId, calls, activeCall]);

  const [monitorStatus, setMonitorStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');

  const notifyMonitorUnavailable = (reason?: string) => {
    if (monitorNoticeShownRef.current) return;
    monitorNoticeShownRef.current = true;
    const suffix = reason ? ` (${reason})` : '';
    addNotification?.('info', `Live listen/whisper requires Twilio monitor config${suffix}.`);
  };

  const startMonitoring = async (call: Call, mode: 'listening' | 'whispering') => {
    if (!call) return;
    if (monitorCapabilities && !monitorCapabilities.canMonitor) {
      notifyMonitorUnavailable(monitorCapabilities.missing?.join(', '));
      return;
    }
    setMonitoringBusy(true);
    try {
      const monitorKey = call.twilioCallSid || call.id;
      const res = await fetch('/api/supervisor/monitor', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ callId: monitorKey, mode: mode === 'whispering' ? 'whisper' : 'listen' }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = String(payload?.error || 'monitor failed');
        if (message.toLowerCase().includes('twilio not configured') || message.toLowerCase().includes('monitoring not enabled')) {
          setMonitorCapabilities(prev => ({ canMonitor: false, configured: prev?.configured ?? false, monitoringEnabled: prev?.monitoringEnabled ?? false, missing: prev?.missing || [] }));
          notifyMonitorUnavailable(message);
          return;
        }
        throw new Error(message);
      }
      setMonitoredCallId(call.id);
      if (call.agentId) setMonitoringMode(prev => ({ ...prev, [call.agentId as string]: mode }));
      setMonitorSession({ participantSid: payload.participantSid, callId: payload.callId || monitorKey });
      addNotification?.('info', `Now monitoring ${call.agentName || call.customerName || 'call'}.`);
    } catch (err: any) {
      addNotification?.('error', err?.message || 'Monitor failed');
    } finally {
      setMonitoringBusy(false);
    }
  };

  useEffect(() => {
    if (monitorCapabilities && !monitorCapabilities.canMonitor) return;
    if (!monitorSession?.callId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/supervisor/monitor/status', {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify({ participantSid: monitorSession?.participantSid, callId: monitorSession?.callId }),
        });
        if (!res.ok) throw new Error('status failed');
        const data = await res.json();
        if (!cancelled) {
          setMonitorStatus(data.active ? 'active' : 'connecting');
        }
      } catch {
        if (!cancelled) setMonitorStatus('error');
      }
    };
    setMonitorStatus('connecting');
    const id = window.setInterval(poll, 5000);
    poll();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [monitorSession?.callId, monitorSession?.participantSid, monitorCapabilities?.canMonitor]);

  const filteredHistory = useMemo(() => {
    let list = [...calls, ...liveHistory];
    if (filterSource === 'native') list = list.filter(c => !c.isMigrated);
    if (filterSource === 'migrated') list = list.filter(c => c.isMigrated);
    if (searchQuery) {
        list = list.filter(c => 
          c.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || 
          (c.legacyProvider && c.legacyProvider.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }
    return list.sort((a, b) => b.startTime - a.startTime);
  }, [calls, liveHistory, filterSource, searchQuery]);

  const liveCallList = useMemo(() => {
    return globalActiveCalls
      .map(call => ({
        ...call,
        duration: Math.max(0, Math.floor((Date.now() - call.startTime) / 1000)),
      }))
      .sort((a, b) => b.startTime - a.startTime);
  }, [globalActiveCalls]);

  const handleMonitor = (agentId: string, mode: 'listening' | 'whispering') => {
    const call = agentActivityMap[agentId];
    if (!call) {
      addNotification?.('error', 'Action failed: Agent is currently offline.');
      return;
    }
    startMonitoring(call, mode);
  };

  const stopMonitoring = async () => {
    if (monitorCapabilities && !monitorCapabilities.canMonitor) {
      setMonitoredCallId(null);
      setMonitorSession(null);
      setMonitorStatus('idle');
      return;
    }
    if (!monitorSession?.callId && !monitorSession?.participantSid) return;
    setMonitoringBusy(true);
    try {
      await fetch('/api/supervisor/monitor/stop', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ participantSid: monitorSession.participantSid, callId: monitorSession.callId }),
      });
      setMonitoredCallId(null);
      setMonitorSession(null);
      addNotification?.('info', 'Monitoring ended.');
    } finally {
      setMonitoringBusy(false);
    }
  };

  const handleRunRiskAudit = async () => {
    setIsAuditing(true);
    addNotification?.('info', 'Running risk scan...');
    
    // Actually scan for risks in current data
    await new Promise(r => setTimeout(r, 2500));
    const newRisks: Record<string, string> = {};
    
    const lowSentimentCalls = calls.filter(c => (c.liveSentiment || 100) < 45 || (c.analysis?.sentimentScore || 100) < 45);
    
    lowSentimentCalls.forEach(c => {
      if (c.agentId) {
        newRisks[c.agentId] = `Escalation Risk: Sentiment dropped to ${c.liveSentiment || c.analysis?.sentimentScore}% during admission. Interaction mitigation advised.`;
      }
    });

    setDetectedRisks(newRisks);
    setIsAuditing(false);
    addNotification?.('info', `Risk scan complete: ${Object.keys(newRisks).length} issues found.`);
    setActiveTab('alerts');
  };

  return (
    <div className="h-full flex flex-col bg-[#0b0e14] p-4 overflow-hidden rounded-[2rem] shadow-2xl m-2 border border-white/5 relative">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-500/5 blur-[120px] -mr-64 -mt-64 pointer-events-none"></div>

      {/* Tabs Header */}
      <div className="flex justify-between items-center mb-6 shrink-0 relative z-10">
         <div className="flex space-x-8">
           {[
             { id: 'floor', label: 'LIVE FLOOR' },
             { id: 'performance', label: 'NEURAL ANALYTICS' },
             { id: 'history', label: 'LEGACY HUB' },
             { id: 'alerts', label: 'RISK CONSOLE' }
           ].map(tab => (
             <button 
               key={tab.id}
               onClick={() => setActiveTab(tab.id as any)} 
               className={`pb-3 text-[10px] font-black tracking-[0.15em] transition-all border-b-2 relative ${activeTab === tab.id ? 'border-brand-500 text-white' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
             >
               {tab.label}
               {tab.id === 'alerts' && Object.keys(detectedRisks).length > 0 && <span className="absolute -top-1 -right-3 w-3 h-3 bg-red-600 rounded-full animate-pulse border-2 border-[#0b0e14]"></span>}
             </button>
           ))}
         </div>
         
         <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{globalActiveCalls.length} Peer Link{globalActiveCalls.length !== 1 ? 's' : ''} Active</span>
            </div>
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                {['ALL', 'NATIVE', 'MIGRATED'].map(src => (
                   <button key={src} onClick={() => setFilterSource(src.toLowerCase() as any)} className={`px-4 py-1.5 text-[8px] font-black tracking-widest rounded-lg transition-all ${filterSource === src.toLowerCase() ? 'bg-brand-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>{src}</button>
                ))}
            </div>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-4 scrollbar-hide relative z-10">
        {/* LIVE FLOOR */}
        {activeTab === 'floor' && (
           <div className="space-y-6 animate-in fade-in duration-500 pb-8 md:pb-12">
              <div className="bg-[#12161f] rounded-[2rem] border border-white/5 p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Live Floor</p>
                    <h3 className="text-2xl font-black text-white italic tracking-tighter mt-2">Active Calls: {liveCallList.length}</h3>
                    <p className="text-[10px] font-black uppercase tracking-[0.1em] text-brand-400 mt-1">Select a call to monitor</p>
                    {monitorCapabilities && !monitorCapabilities.canMonitor && (
                      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-400 mt-2">Listen/Whisper disabled: monitor config missing.</p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full lg:w-[480px]">
                    {liveCallList.length === 0 && (
                      <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-600">No active calls</div>
                    )}
                    {liveCallList.slice(0, 4).map(call => (
                      <div key={call.id} className="p-3 rounded-xl border border-white/10 bg-white/5 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-white uppercase">{call.agentName || call.customerName}</p>
                          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{call.queue} • {Math.floor(call.duration / 60)}m {call.duration % 60}s</p>
                        </div>
                        <button
                          onClick={() => {
                            if (monitoredCallId === call.id) {
                              stopMonitoring();
                              return;
                            }
                            startMonitoring(call, 'listening');
                          }}
                          disabled={monitoringBusy || Boolean(monitorCapabilities && !monitorCapabilities.canMonitor)}
                          className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wide ${monitoredCallId === call.id ? 'bg-brand-500 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'} ${(monitoringBusy || Boolean(monitorCapabilities && !monitorCapabilities.canMonitor)) ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          {monitorCapabilities && !monitorCapabilities.canMonitor ? 'Config Req.' : (monitoredCallId === call.id ? 'Stop' : 'Listen')}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {team?.filter(u => u.role === 'AGENT').map(agent => {
                const liveCall = agentActivityMap[agent.id];
                const isLive = !!liveCall;
                const mode = monitoringMode[agent.id] || 'none';
                const risk = detectedRisks[agent.id];
                const isPeer = isLive && liveCall.id !== activeCall?.id;

                return (
                   <div key={agent.id} className={`bg-[#12161f] rounded-[2rem] p-6 transition-all duration-500 overflow-hidden relative border ${isLive ? 'border-brand-500/40 bg-brand-500/[0.04] shadow-lg' : 'border-white/5 opacity-60'}`}>
                      {isLive && (
                        <div className="absolute inset-0 z-0 opacity-10">
                           <div className="absolute inset-0 bg-brand-500/20 animate-pulse rounded-[2rem]"></div>
                        </div>
                      )}
                      {risk && <div className="absolute top-0 left-0 w-full bg-red-600/90 py-1.5 text-center text-[8px] font-black uppercase text-white animate-pulse z-20 tracking-widest">Intervention Required</div>}
                      <div className="flex items-center gap-4 mb-6 relative z-10">
                         <img src={agent.avatarUrl} className={`w-16 h-16 rounded-2xl shadow-lg transition-all ${isLive ? 'ring-2 ring-brand-500/50' : 'grayscale'}`}/>
                         <div className="flex-1">
                            <p className="font-bold text-white uppercase text-lg leading-tight">{agent.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                               <div className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-slate-700'}`}></div>
                               <p className={`text-[9px] font-bold uppercase tracking-wider ${isLive ? 'text-brand-400' : 'text-slate-600'}`}>{isLive ? (isPeer ? 'Peer Active' : 'Local') : 'Standby'}</p>
                            </div>
                         </div>
                      </div>
                      {isLive ? (
                         <div className="space-y-6 relative z-10">
                            <div className="h-16 bg-black/40 rounded-xl flex items-center justify-center gap-1 overflow-hidden relative border border-white/5 px-4">
                               {[...Array(16)].map((_, i) => (
                                 <div 
                                  key={i} 
                                  className="w-1 bg-brand-500/50 rounded-full transition-all duration-200 animate-pulse" 
                                  style={{ height: `${20 + Math.random() * 80}%`, animationDelay: `${i * 0.04}s` }}
                                 ></div>
                               ))}
                               <div className="absolute bottom-1 left-3 text-[7px] font-black text-brand-500/40 uppercase tracking-wider">{isPeer ? 'Remote' : 'Local'}</div>
                            </div>
                            <div className="flex gap-3">
                               <button onClick={() => handleMonitor(agent.id, 'listening')} disabled={monitoringBusy || Boolean(monitorCapabilities && !monitorCapabilities.canMonitor)} className={`flex-1 py-3 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all border flex items-center justify-center gap-2 ${monitoredCallId === liveCall.id ? 'bg-brand-500 text-white border-brand-500 shadow-md' : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'} ${(monitoringBusy || Boolean(monitorCapabilities && !monitorCapabilities.canMonitor)) ? 'opacity-60 cursor-not-allowed' : ''}`}><Headset size={12}/> {monitorCapabilities && !monitorCapabilities.canMonitor ? 'Config Req.' : (monitoredCallId === liveCall.id ? 'Monitoring' : 'Monitor')}</button>
                               <button onClick={() => handleMonitor(agent.id, 'whispering')} disabled={monitoringBusy || Boolean(monitorCapabilities && !monitorCapabilities.canMonitor)} className={`flex-1 py-3 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all border ${mode === 'whispering' ? 'bg-brand-600 text-white border-brand-600 shadow-md' : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'} ${(monitoringBusy || Boolean(monitorCapabilities && !monitorCapabilities.canMonitor)) ? 'opacity-60 cursor-not-allowed' : ''}`}>Whisper</button>
                            </div>
                         </div>
                      ) : (
                        <div className="py-6 border-t border-white/5 flex flex-col items-center justify-center gap-2 text-slate-700 italic text-[10px] font-bold uppercase tracking-widest">
                           <Clock size={14} className="opacity-20"/>
                           Waiting...
                        </div>
                      )}
                   </div>
                );
              })}
              </div>
           </div>
        )}

        {/* NEURAL ANALYTICS */}
        {activeTab === 'performance' && (
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-700 pb-12">
              <div className="lg:col-span-4 bg-[#12161f] border border-white/5 rounded-[2.5rem] p-8 relative overflow-hidden">
                 <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-8">QUEUE ADMISSIONS</h4>
                 <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                       <PieChart>
                          <Pie data={chartData.pie} innerRadius={60} outerRadius={85} paddingAngle={6} dataKey="value" stroke="none">
                             {chartData.pie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: '#0b0e14', border: '1px solid #ffffff10', borderRadius: '12px' }} />
                       </PieChart>
                    </ResponsiveContainer>
                 </div>
                 <div className="mt-8 space-y-3">
                    {chartData.pie.map((entry, i) => (
                      <div key={entry.name} className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider">
                         <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div> <span className="text-slate-400">{entry.name}</span></div>
                         <span className="text-white">{entry.value} NODES</span>
                      </div>
                    ))}
                 </div>
              </div>
              <div className="lg:col-span-8 bg-[#12161f] border border-white/5 rounded-[2.5rem] p-8 relative overflow-hidden">
                 <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-8">SENTIMENT FLUX EKG</h4>
                 <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                       <AreaChart data={chartData.trend}>
                          <defs>
                             <linearGradient id="ekgGlow" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                             </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 10 }} />
                          <YAxis hide domain={[0, 100]} />
                          <Tooltip contentStyle={{ backgroundColor: '#0b0e14', border: '1px solid #ffffff10', borderRadius: '12px' }} />
                          <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={4} fillOpacity={1} fill="url(#ekgGlow)" dot={{ fill: '#6366f1', stroke: '#0b0e14', r: 4 }} />
                       </AreaChart>
                    </ResponsiveContainer>
                 </div>
              </div>
           </div>
        )}

        {/* LEGACY HUB */}
        {activeTab === 'history' && (
           <div className="space-y-6 animate-in slide-in-from-right duration-500 pb-12">
              <div className="flex justify-between items-end">
                 <div>
                    <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter flex items-center gap-3"><Infinity size={24} className="text-brand-500 animate-spin-slow"/> LEGACY HUB</h3>
                    <p className="text-[9px] font-black uppercase text-slate-500 tracking-[0.1em] mt-1 flex items-center gap-2">
                       <RefreshCw size={10} className="animate-spin"/> Loading team data
                    </p>
                 </div>
                 <div className="flex gap-4 items-center">
                    <div className="bg-white/5 p-2.5 rounded-xl border border-white/10 hidden lg:block min-w-[200px]">
                       <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2"><Terminal size={8}/> ADMISSION LOGS</p>
                       <div className="space-y-0.5">
                          {ingestionLogs.map((log, i) => <p key={i} className="text-[8px] font-mono text-brand-400 opacity-60 animate-in slide-in-from-bottom-2 truncate">{log}</p>)}
                       </div>
                    </div>
                    <div className="relative w-56">
                       <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14}/>
                       <input type="text" placeholder="Search archive..." className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-9 pr-3 text-white text-[10px] font-bold outline-none focus:border-brand-500 shadow-xl transition-all" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                    </div>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {filteredHistory.map(call => (
                    <div key={call.id} className="p-5 bg-[#12161f] border border-white/5 rounded-[1.5rem] group hover:bg-[#1a1f2b] transition-all duration-500 animate-in zoom-in-95">
                       <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-xl bg-brand-50/5 flex items-center justify-center text-brand-500 border border-brand-500/10"><Database size={20}/></div>
                             <div>
                                <h4 className="text-white font-black italic uppercase text-sm tracking-tight mb-0.5">{call.customerName}</h4>
                                <div className="flex gap-2">
                                  <span className="text-[7px] px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 font-black uppercase tracking-widest">{call.isMigrated ? call.legacyProvider : 'NATIVE'} HUB</span>
                                  {call.id.includes('peer') && <span className="text-[7px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-black uppercase tracking-widest animate-pulse">PEER SYNC</span>}
                                </div>
                             </div>
                          </div>
                          <div className="text-right">
                             <p className="text-[8px] font-black uppercase text-slate-600 mb-0.5">Sentiment</p>
                             <p className="text-xl font-black italic text-brand-400">{call.analysis?.sentimentScore || call.liveSentiment || 50}%</p>
                          </div>
                       </div>
                       <div className="grid grid-cols-3 gap-3">
                          <div className="p-3 bg-white/5 rounded-xl border border-white/5"><p className="text-[7px] font-black uppercase text-slate-500 mb-0.5">Start time</p><p className="text-xs font-bold text-slate-300">{new Date(call.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p></div>
                          <div className="p-3 bg-white/5 rounded-xl border border-white/5"><p className="text-[7px] font-black uppercase text-slate-500 mb-0.5">Duration</p><p className="text-xs font-bold text-slate-300">{Math.floor(call.durationSeconds / 60)}m {Math.floor(call.durationSeconds % 60)}s</p></div>
                          <div className="p-3 bg-white/5 rounded-xl border border-white/5"><p className="text-[7px] font-black uppercase text-slate-500 mb-0.5">QA Match</p><p className="text-xs font-bold text-slate-300">{call.analysis?.qaScore || '--'}</p></div>
                       </div>
                    </div>
                 ))}
                 {filteredHistory.length === 0 && (
                   <div className="col-span-2 py-16 flex flex-col items-center justify-center opacity-10 italic">
                      <SearchCode size={48} className="mb-3"/>
                      <p className="text-lg font-black uppercase tracking-[0.3em]">No Records Admitted</p>
                   </div>
                 )}
              </div>
           </div>
        )}

        {/* RISK CONSOLE */}
        {activeTab === 'alerts' && (
           <div className="space-y-6 animate-in slide-in-from-bottom duration-700 pb-12">
              <div className="flex justify-between items-center mb-6">
                 <div>
                    <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter flex items-center gap-3"><ShieldAlert size={24} className="text-red-500"/> RISK CONSOLE</h3>
                    <p className="text-[9px] font-black uppercase text-slate-500 tracking-[0.2em] mt-1 italic">NEURAL SAFEGUARD AUDIT CLUSTER</p>
                 </div>
                 <button onClick={handleRunRiskAudit} disabled={isAuditing} className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[9px] font-black uppercase tracking-[0.2em] shadow-lg transition-all flex items-center gap-2 disabled:opacity-50">
                    {isAuditing ? <RefreshCw size={14} className="animate-spin"/> : <SearchCode size={14}/>}
                    {isAuditing ? 'AUDITING...' : 'RUN AUDIT'}
                 </button>
              </div>
              <div className="space-y-3">
                 {Object.entries(detectedRisks).map(([id, msg]) => {
                    const agent = team?.find(t => t.id === id);
                    return (
                      <div key={id} className="bg-red-950/10 border border-red-500/30 rounded-[2rem] p-6 flex justify-between items-center animate-in slide-in-from-left duration-300">
                         <div className="flex items-center gap-6">
                            <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-xl relative z-10 animate-pulse"><AlertTriangle size={28}/></div>
                            <div>
                               <h3 className="text-xl font-black text-white italic tracking-tighter uppercase mb-1 leading-tight">THREAT DETECTED</h3>
                               <p className="text-red-400 font-bold uppercase tracking-wider text-[9px] mb-2 italic">SOURCE: {agent?.name || 'EXTERNAL NODE'}</p>
                               <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                 <p className="text-white font-medium italic text-xs leading-relaxed max-w-lg">"{msg}"</p>
                               </div>
                            </div>
                         </div>
                         <div className="flex flex-col gap-2 min-w-[160px]">
                            <button onClick={() => handleMonitor(id, 'whispering')} disabled={Boolean(monitorCapabilities && !monitorCapabilities.canMonitor)} className={`w-full py-2.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all shadow-md ${monitorCapabilities && !monitorCapabilities.canMonitor ? 'bg-white/20 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-900 hover:bg-slate-100'}`}>NEURAL BARGE-IN</button>
                            <button onClick={() => { setDetectedRisks(prev => { const n = {...prev}; delete n[id]; return n; }); addNotification?.('success', 'Marked as resolved.'); }} className="w-full py-2.5 bg-white/5 text-white border border-white/10 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">MARK RESOLVED</button>
                         </div>
                      </div>
                    );
                 })}
                 {Object.keys(detectedRisks).length === 0 && !isAuditing && (
                    <div className="text-center py-24 opacity-10 flex flex-col items-center">
                       <ShieldCheck size={80} className="text-brand-500 mb-4"/>
                       <p className="text-white font-black uppercase tracking-[0.4em] text-lg">GLOBAL SAFEGUARDS: SECURE</p>
                    </div>
                 )}
              </div>
           </div>
        )}
      </div>

      {/* Real-time Monitor Drawer */}
      {monitoredCallId && monitoredCall && (
        <div className="fixed top-0 right-0 w-full md:w-[400px] h-full bg-[#0b0e14] border-l border-white/10 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] z-[100] flex flex-col animate-in slide-in-from-right duration-500">
           <div className="p-6 bg-brand-600 text-white flex justify-between items-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-2xl -mr-16 -mt-16"></div>
                 <div className="relative z-10">
                 <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand-200 mb-1">Monitoring Peer</p>
                 <h3 className="text-2xl font-black italic uppercase tracking-tighter">{monitoredCall.agentName || monitoredCall.customerName}</h3>
                 <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-brand-200/80">
                   Customer: {monitoredCall.customerName}
                 </div>
              </div>
              <button onClick={() => setMonitoredCallId(null)} className="relative z-10 p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all"><X size={18}/></button>
           </div>
           
           <div className="p-6 border-b border-white/5 bg-white/[0.02]">
              <div className="flex justify-between items-center mb-4">
                 <div>
                 <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Target agent</p>
                 <p className="text-lg font-black text-white italic tracking-tight">{monitoredCall.agentName || 'Unknown agent'}</p>
              </div>
              <div className="text-right">
                 <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Sentiment</p>
                 <p className="text-2xl font-black text-brand-400 italic">{monitoredCall.liveSentiment || monitoredCall.analysis?.sentimentScore || 50}%</p>
              </div>
           </div>
           <div className="flex items-center gap-2 mt-2">
             <div className={`w-1.5 h-1.5 rounded-full ${monitorStatus === 'active' ? 'bg-green-500 animate-pulse' : monitorStatus === 'error' ? 'bg-red-500' : 'bg-amber-400 animate-pulse'}`}></div>
             <p className="text-[8px] font-black uppercase tracking-[0.2em] text-brand-300">{monitorStatus === 'active' ? 'Monitoring Active' : monitorStatus === 'error' ? 'Monitor Error' : 'Connecting'}</p>
           </div>
           </div>

           <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide bg-black/40">
              {monitoredCall.transcript.length > 0 ? monitoredCall.transcript.map((seg, idx) => (
                <div key={idx} className={`flex ${seg.speaker === 'agent' ? 'justify-end' : 'justify-start'}`}>
                   <div className={`max-w-[85%] p-4 rounded-2xl text-xs leading-relaxed border ${
                     seg.speaker === 'agent' ? 'bg-brand-600/10 border-brand-500/20 text-brand-100 rounded-br-none' : 'bg-white/5 border-white/10 text-slate-300 rounded-bl-none'
                   }`}>
                      <p className="font-medium italic opacity-40 text-[8px] uppercase tracking-widest mb-1">{seg.speaker}</p>
                      <p className="font-bold">{seg.text}</p>
                   </div>
                </div>
              )) : (
                <div className="h-full flex flex-col items-center justify-center opacity-10 italic">
                   <Terminal size={32} className="mb-4"/>
                   <p className="text-[10px] font-black uppercase tracking-[0.3em]">Awaiting Packets</p>
                </div>
              )}
           </div>
           
           <div className="p-6 bg-slate-900 border-t border-white/10 grid grid-cols-3 gap-3">
              <button
                onClick={() => monitoredCall?.agentId && handleMonitor(monitoredCall.agentId, 'listening')}
                disabled={monitoringBusy || Boolean(monitorCapabilities && !monitorCapabilities.canMonitor)}
                className="py-3 bg-white text-slate-900 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-md disabled:opacity-60"
              >
                Join
              </button>
              <button
                onClick={() => monitoredCall?.agentId && handleMonitor(monitoredCall.agentId, 'whispering')}
                disabled={monitoringBusy || Boolean(monitorCapabilities && !monitorCapabilities.canMonitor)}
                className="py-3 bg-white/5 text-white border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-60"
              >
                Coach
              </button>
              <button
                onClick={stopMonitoring}
                disabled={monitoringBusy}
                className="py-3 bg-red-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-60"
              >
                Break
              </button>
           </div>
        </div>
      )}
    </div>
  );
};
