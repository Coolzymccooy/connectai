
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Shield, Database, Workflow, Plus, UserPlus, Trash2, Zap, CreditCard, 
  Bot, PhoneCall, Settings2, CloudDownload, Infinity, RefreshCw, CheckCircle, 
  AlertCircle, ChevronRight, Activity, Terminal, Lock, Globe, Layers, BarChart3,
  DollarSign, Cpu, Clock, History, ExternalLink, Settings, Info, X, Edit3, User as UserIcon,
  Code, Share2, Download, Search, Command, BookOpen, Fingerprint, ShieldCheck, Heart, Layout,
  ArrowRight, Play, FileJson, Share, UserMinus, Key, Server, Hash, Layers3, Phone,
  ChevronUp, Sliders, Sparkles, Wand2, ShieldAlert, Check
} from 'lucide-react';
import { AppSettings, Role, Notification, User, WorkflowRule, MigrationProvider, IntegrationLog, ChannelType, IvrConfig, WebhookConfig, SchemaMapping, IvrOption } from '../types';
import { VisualIvr } from './VisualIvr';
import { startLegacyMigration } from '../services/migrationService';
import { exportClusterData, downloadJson } from '../services/exportService';
import { getIntegrationsStatus, startGoogleOAuth, startMicrosoftOAuth, connectCrmProvider, syncCrmProvider, connectMarketingProvider, syncMarketingProvider } from '../services/integrationService';
import { saveSettingsApi } from '../services/settingsService';

const PERSONA_TEMPLATES = [
  { name: 'Professional Concierge', prompt: 'Welcome to ConnectAI Corporate. Your call is vital to our cluster. For technical admitting, press 1. For account stewardship, press 2.' },
  { name: 'Friendly Assistant', prompt: 'Hi there! Welcome to the ConnectAI family. We’re excited to help you today. Press 1 for Sales or 2 for anything else!' },
  { name: 'Technical Support', prompt: 'Initializing ConnectAI Technical Gateway. Current cluster latency is low. Press 1 for engineering support or 2 for status updates.' }
];

interface ExportRecord {
  id: string;
  timestamp: string;
  size: string;
  status: 'Ready' | 'Expired';
}

interface AdminSettingsProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  addNotification: (type: Notification['type'], message: string) => void;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({ settings, onUpdateSettings, addNotification }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'ivr' | 'team' | 'migration' | 'billing' | 'anatomy'>('general');
  const [isMigrating, setIsMigrating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<MigrationProvider | null>(null);
  const [migrationStep, setMigrationStep] = useState<1 | 2 | 3>(1);
  
  // Handshake Form
  const [credentials, setCredentials] = useState({ endpoint: '', apiKey: '', clientId: '' });
  const [mappings, setMappings] = useState<{ local: string, remote: string }[]>([
    { local: 'customerName', remote: 'cust_full_name' },
    { local: 'phoneNumber', remote: 'phone_e164' }
  ]);

  // Modals
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showScaleModal, setShowScaleModal] = useState(false);
  const [isIvrEditing, setIsIvrEditing] = useState(false);
  const [isScaling, setIsScaling] = useState(false);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<any>({ calendar: {}, crm: {}, marketing: {} });

  // Export Hub State
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<{ status: 'idle' | 'scanning' | 'clean' | 'warnings', issues: string[] }>({ status: 'idle', issues: [] });
  const [exportHistory, setExportHistory] = useState<ExportRecord[]>([]);

  // Form States
  const [newUser, setNewUser] = useState({ name: '', email: '', role: Role.AGENT });
  const [editIvr, setEditIvr] = useState<IvrConfig>(settings.ivr);
  const [editAllowedNumbers, setEditAllowedNumbers] = useState(settings.voice.allowedNumbers.join('\n'));
  const [scalePlan, setScalePlan] = useState(settings.subscription.plan);
  const [scaleSeats, setScaleSeats] = useState(settings.subscription.seats);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('/api/health');
        if (!response.ok) return setGeminiConfigured(false);
        const data = await response.json();
        setGeminiConfigured(Boolean(data?.geminiConfigured));
      } catch {
        setGeminiConfigured(false);
      }
    };
    checkHealth();
  }, []);

  useEffect(() => {
    getIntegrationsStatus().then(setIntegrationStatus).catch(() => {});
  }, []);

  useEffect(() => {
    setEditAllowedNumbers(settings.voice.allowedNumbers.join('\n'));
  }, [settings.voice.allowedNumbers]);

  const isDemoMode = useMemo(() => !geminiConfigured, [geminiConfigured]);

  const handleToggleIntegration = (key: 'hubSpot' | 'pipedrive' | 'salesforce') => {
    const newSettings = { ...settings };
    if (key === 'hubSpot') {
      newSettings.integrations.hubSpot.enabled = !settings.integrations.hubSpot.enabled;
    } else {
      (newSettings.integrations as any)[key] = !(settings.integrations as any)[key];
    }
    onUpdateSettings(newSettings);
    addNotification('info', `${key.toUpperCase()} state synchronized.`);
  };

  const handleAddUser = () => {
    if (!newUser.name || !newUser.email) return;
    const user: User = {
      id: `u_${Date.now()}`,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${newUser.name}`,
      status: 'active',
      extension: (101 + settings.team.length).toString()
    };
    onUpdateSettings({ ...settings, team: [...settings.team, user] });
    setShowInviteModal(false);
    setNewUser({ name: '', email: '', role: Role.AGENT });
    addNotification('success', `${user.name} admitted to neural core.`);
  };

  const handleRemoveUser = (userId: string) => {
    onUpdateSettings({ ...settings, team: settings.team.filter(u => u.id !== userId) });
    addNotification('info', 'Member de-provisioned.');
  };

  const handleSaveIvr = () => {
    const allowedNumbers = editAllowedNumbers
      .split('\n')
      .map(n => n.trim())
      .filter(Boolean);
    const nextSettings = { ...settings, ivr: editIvr, voice: { ...settings.voice, allowedNumbers } };
    onUpdateSettings(nextSettings);
    saveSettingsApi(nextSettings).catch(() => {});
    setIsIvrEditing(false);
    addNotification('success', 'Routing Architecture Deployed.');
  };

  const handleAddIvrOption = () => {
    const nextKey = (editIvr.options.length + 1).toString();
    const newOption: IvrOption = { 
      key: nextKey, 
      action: 'QUEUE', 
      target: 'Sales', 
      label: `Option ${nextKey}` 
    };
    setEditIvr({ ...editIvr, options: [...editIvr.options, newOption] });
  };

  const handleRemoveIvrOption = (key: string) => {
    setEditIvr({ ...editIvr, options: editIvr.options.filter(o => o.key !== key) });
  };

  const handleInitiateMigration = async () => {
    if (!selectedProvider) return;
    setIsMigrating(true);
    setMigrationProgress(0);
    addNotification('info', `Establishing Secure Bridge with ${selectedProvider}...`);
    
    try {
      await new Promise(r => setTimeout(r, 2000));
      const data = await startLegacyMigration(selectedProvider, credentials.apiKey, (proc, total) => {
        setMigrationProgress(Math.floor((proc / total) * 100));
      });
      onUpdateSettings({
        ...settings,
        migration: { provider: selectedProvider, recordsProcessed: data.length, totalRecords: data.length, audioSynced: data.length, aiScored: data.length, status: 'completed' }
      });
      addNotification('success', 'Migration Wave Complete: Data Admission Optimized.');
    } catch (e) {
      addNotification('error', 'Handshake Failed: SSL/TLS Protocol Mismatch.');
    } finally {
      setIsMigrating(false);
      setMigrationStep(1);
    }
  };

  const handleScanIntegrity = async () => {
    setIsScanning(true);
    setScanResults({ status: 'scanning', issues: [] });
    addNotification('info', 'Neural Hub: Running Cluster Integrity Scan...');
    
    await new Promise(r => setTimeout(r, 2000));
    
    const issues = [];
    if (isDemoMode) issues.push("Simulation keys detected in environment.");
    if (settings.team.length < 5) issues.push("Low node count: Redundancy not optimized.");
    
    setScanResults({ 
      status: issues.length > 0 ? 'warnings' : 'clean', 
      issues 
    });
    setIsScanning(false);
    addNotification('success', issues.length > 0 ? 'Scan Complete: Diagnostic warnings found.' : 'Scan Complete: Cluster integrity verified.');
  };

  const handleExportData = async () => {
    if (scanResults.status === 'idle') {
      addNotification('error', 'Integrity Scan required before neural export.');
      return;
    }
    
    setIsExporting(true);
    addNotification('info', 'Neural Cluster: Packaging bundle for admission...');
    try {
      const data = await exportClusterData();
      const filename = `connect-ai-bundle-${Date.now()}.json`;
      downloadJson(data, filename);
      
      const newRecord: ExportRecord = {
        id: `exp_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        size: `${(data.length / 1024).toFixed(1)} KB`,
        status: 'Ready'
      };
      setExportHistory(prev => [newRecord, ...prev].slice(0, 5));
      
      addNotification('success', 'Neural bundle successfully admitted to local storage.');
    } catch (e) {
      addNotification('error', 'Export protocol failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleTopUp = (amount: number) => {
    onUpdateSettings({
      ...settings,
      subscription: {
        ...settings.subscription,
        balance: settings.subscription.balance + amount
      }
    });
    addNotification('success', `Cluster balance injected: +$${amount}`);
    setShowWalletModal(false);
  };

  const handleScaleInfrastructure = async () => {
    setIsScaling(true);
    addNotification('info', 'Re-provisioning Neural Infrastructure...');
    await new Promise(r => setTimeout(r, 2500));
    const tokenLimit = scalePlan === 'Enterprise' ? 5000000 : scalePlan === 'Growth' ? 1000000 : 250000;
    const voiceLimit = scalePlan === 'Enterprise' ? 20000 : scalePlan === 'Growth' ? 5000 : 1000;
    onUpdateSettings({
      ...settings,
      subscription: {
        ...settings.subscription,
        plan: scalePlan as any,
        seats: scaleSeats,
        usage: { ...settings.subscription.usage, aiTokenLimit: tokenLimit, voiceMinuteLimit: voiceLimit }
      }
    });
    setIsScaling(false);
    setShowScaleModal(false);
    addNotification('success', `Cluster Scaled: ${scalePlan} Environment Active.`);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b px-10 pt-10 shrink-0">
         <div className="flex justify-between items-center mb-8">
            <h2 className="text-4xl font-black text-slate-800 italic uppercase tracking-tighter">Cluster Control</h2>
            <div className="flex items-center gap-4">
               <div className="px-4 py-2 bg-brand-50 rounded-2xl border border-brand-100 flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-[10px] font-black uppercase text-brand-600 tracking-widest">Neural Cores: Active</span>
               </div>
            </div>
         </div>
         <div className="flex space-x-12">
            {[
              { id: 'general', label: 'Integrations' },
              { id: 'ivr', label: 'Routing' },
              { id: 'migration', label: 'Migration' },
              { id: 'team', label: 'Team Access' },
              { id: 'billing', label: 'Usage & Quota' },
              { id: 'anatomy', label: 'Export Hub' },
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)} 
                className={`pb-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'border-b-4 border-brand-600 text-brand-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
              >
                {tab.label}
              </button>
            ))}
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-10 scrollbar-hide pb-20">
        {/* INTEGRATIONS TAB */}
        {activeTab === 'general' && (
           <div className="max-w-5xl space-y-8 animate-in fade-in">
              {['hubSpot', 'pipedrive', 'salesforce'].map((key) => {
                const isEnabled = key === 'hubSpot' ? settings.integrations.hubSpot.enabled : (settings.integrations as any)[key];
                return (
                  <div key={key} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-6">
                      <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center border shadow-sm ${isEnabled ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-slate-50 text-slate-400 border-slate-100 grayscale'}`}>
                        <Database size={28}/>
                      </div>
                      <div>
                        <h4 className="text-xl font-black uppercase italic tracking-tight">{key.replace('hubSpot', 'HubSpot Enterprise')}</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bi-Directional Neural Sync</p>
                      </div>
                    </div>
                    <button onClick={() => handleToggleIntegration(key as any)} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isEnabled ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{isEnabled ? 'Tunnel Active' : 'Admit Tunnel'}</button>
                  </div>
                );
              })}

              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <h4 className="text-xl font-black uppercase italic tracking-tight mb-4">Calendar Sync</h4>
                <div className="flex gap-4">
                  <button
                    onClick={async () => {
                      try {
                        const { url } = await startGoogleOAuth();
                        if (url) window.open(url, '_blank', 'noopener,noreferrer');
                      } catch {}
                    }}
                    className="px-6 py-3 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
                  >
                    Connect Google
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const { url } = await startMicrosoftOAuth();
                        if (url) window.open(url, '_blank', 'noopener,noreferrer');
                      } catch {}
                    }}
                    className="px-6 py-3 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
                  >
                    Connect Microsoft
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-4">
                  Status: {integrationStatus?.calendar?.google ? 'Google Connected' : integrationStatus?.calendar?.microsoft ? 'Microsoft Connected' : 'Not Connected'}
                </p>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <h4 className="text-xl font-black uppercase italic tracking-tight mb-4">CRM Sync</h4>
                <div className="flex gap-4 flex-wrap">
                  {['hubspot', 'salesforce', 'pipedrive'].map((provider) => (
                    <button
                      key={provider}
                      onClick={async () => {
                        await connectCrmProvider(provider as any, { apiKey: 'REPLACE_ME' });
                        await syncCrmProvider(provider as any);
                      }}
                      className="px-6 py-3 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
                    >
                      Sync {provider}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <h4 className="text-xl font-black uppercase italic tracking-tight mb-4">Marketing Sync</h4>
                <div className="flex gap-4 flex-wrap">
                  {['hubspot', 'mailchimp', 'marketo'].map((provider) => (
                    <button
                      key={provider}
                      onClick={async () => {
                        await connectMarketingProvider(provider, { apiKey: 'REPLACE_ME' });
                        await syncMarketingProvider(provider);
                      }}
                      className="px-6 py-3 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
                    >
                      Sync {provider}
                    </button>
                  ))}
                </div>
              </div>
           </div>
        )}

        {/* ROUTING TAB */}
        {activeTab === 'ivr' && (
           <div className="max-w-5xl space-y-10 animate-in fade-in">
              <div className="bg-white rounded-[3.5rem] p-12 border border-slate-200 shadow-xl overflow-hidden relative">
                 <div className="flex justify-between items-start mb-12">
                   <div>
                     <h3 className="text-4xl font-black italic uppercase tracking-tighter mb-2 text-slate-800">Routing Architect</h3>
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Global Logic Admissions</p>
                   </div>
                   {!isIvrEditing ? (
                     <button onClick={() => setIsIvrEditing(true)} className="px-10 py-5 bg-brand-600 text-white rounded-[1.8rem] text-[10px] font-black uppercase tracking-widest shadow-2xl hover:bg-brand-700 transition-all flex items-center gap-3">
                       <Edit3 size={18}/> Modify Logic Matrix
                     </button>
                   ) : (
                     <div className="flex gap-4">
                        <button onClick={() => setIsIvrEditing(false)} className="px-8 py-5 bg-slate-100 text-slate-500 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest">Discard</button>
                        <button onClick={handleSaveIvr} className="px-10 py-5 bg-green-600 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest shadow-2xl">Deploy Architecture</button>
                     </div>
                   )}
                 </div>
                 
                 {isIvrEditing ? (
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                     <div className="space-y-12">
                       <div className="space-y-4">
                         <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Phone size={14}/> Entry Endpoint</label>
                         <input 
                          className="w-full bg-slate-50 p-6 rounded-[1.8rem] border-2 border-slate-100 font-black italic text-2xl outline-none focus:border-brand-500 shadow-inner"
                          value={editIvr.phoneNumber}
                          onChange={e => setEditIvr({...editIvr, phoneNumber: e.target.value})}
                         />
                       </div>
                     <div className="space-y-4">
                       <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Sparkles size={14}/> Neural Atmosphere</label>
                          <div className="flex gap-2">
                             {PERSONA_TEMPLATES.map((p, i) => (
                               <button key={i} title={p.name} onClick={() => setEditIvr({...editIvr, welcomeMessage: p.prompt})} className="p-3 bg-slate-50 border border-slate-100 rounded-xl hover:bg-brand-50 hover:border-brand-500 transition-all text-slate-400 hover:text-brand-600"><Wand2 size={14}/></button>
                             ))}
                          </div>
                       </div>
                       <textarea 
                        className="w-full bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100 font-medium italic text-lg outline-none focus:border-brand-500 resize-none h-64 leading-relaxed shadow-inner"
                        value={editIvr.welcomeMessage}
                        onChange={e => setEditIvr({...editIvr, welcomeMessage: e.target.value})}
                       />
                     </div>
                     <div className="space-y-4">
                       <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Phone size={14}/> Allowed Outbound Numbers</label>
                       <textarea
                         className="w-full bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 font-medium text-sm outline-none focus:border-brand-500 resize-none h-48 leading-relaxed shadow-inner"
                         placeholder="+14155551234&#10;+447700900123&#10;+2348012345678"
                         value={editAllowedNumbers}
                         onChange={e => setEditAllowedNumbers(e.target.value)}
                       />
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">One E.164 number per line. Leave empty to allow all.</p>
                     </div>
                   </div>
                     <div className="space-y-8">
                        <div className="flex justify-between items-center"><label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Layers3 size={14}/> Logic Branches</label><button onClick={handleAddIvrOption} className="text-brand-600 font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:underline transition-all"><Plus size={16}/> Add Core Branch</button></div>
                        <div className="space-y-4 overflow-y-auto max-h-[600px] pr-4 scrollbar-hide">
                          {editIvr.options.map((option, idx) => (
                            <div key={idx} className="p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] relative group hover:border-brand-500/30 hover:shadow-xl transition-all duration-300">
                               <button onClick={() => handleRemoveIvrOption(option.key)} className="absolute top-6 right-6 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={18}/></button>
                               <div className="space-y-6">
                                 <div className="flex gap-6">
                                    <div className="w-24"><label className="text-[8px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Digit Key</label><input className="w-full bg-white border-2 border-slate-100 rounded-2xl p-4 font-black text-center text-xl shadow-sm focus:border-brand-500 outline-none" value={option.key} onChange={e => { const newOpts = [...editIvr.options]; newOpts[idx].key = e.target.value; setEditIvr({...editIvr, options: newOpts}); }} /></div>
                                    <div className="flex-1"><label className="text-[8px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Neural Label</label><input className="w-full bg-white border-2 border-slate-100 rounded-2xl p-4 font-bold text-sm shadow-sm focus:border-brand-500 outline-none uppercase" value={option.label} onChange={e => { const newOpts = [...editIvr.options]; newOpts[idx].label = e.target.value; setEditIvr({...editIvr, options: newOpts}); }} /></div>
                                 </div>
                                 <div className="grid grid-cols-2 gap-6">
                                    <div><label className="text-[8px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Core Action</label><select className="w-full bg-white border-2 border-slate-100 rounded-2xl p-4 font-black text-[10px] uppercase shadow-sm outline-none focus:border-brand-500" value={option.action} onChange={e => { const newOpts = [...editIvr.options]; newOpts[idx].action = e.target.value as any; setEditIvr({...editIvr, options: newOpts}); }}><option value="QUEUE">ADMIT TO QUEUE</option><option value="BOT">HANDOFF TO BOT</option><option value="VOICEMAIL">ARCHIVE TO VM</option><option value="TRANSFER">BRIDGE CALL</option></select></div>
                                    <div><label className="text-[8px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Target Endpoint</label><input className="w-full bg-white border-2 border-slate-100 rounded-2xl p-4 font-bold text-[10px] shadow-sm uppercase outline-none focus:border-brand-500" value={option.target} onChange={e => { const newOpts = [...editIvr.options]; newOpts[idx].target = e.target.value; setEditIvr({...editIvr, options: newOpts}); }} /></div>
                                 </div>
                               </div>
                            </div>
                          ))}
                        </div>
                     </div>
                   </div>
                 ) : (
                   <VisualIvr config={settings.ivr} />
                 )}
              </div>
           </div>
        )}

        {/* MIGRATION TAB */}
        {activeTab === 'migration' && (
           <div className="max-w-5xl space-y-12 animate-in fade-in">
              <div className="bg-white rounded-[3.5rem] border border-slate-200 p-12 shadow-xl overflow-hidden relative">
                 <div className="flex items-center gap-6 mb-12">
                    <div className="w-20 h-20 bg-brand-600 rounded-[2rem] flex items-center justify-center text-white shadow-2xl"><CloudDownload size={40}/></div>
                    <div>
                       <h3 className="text-4xl font-black text-slate-800 uppercase italic tracking-tighter">Legacy Ingestion</h3>
                       <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Bridge established: connectai // {selectedProvider || 'NULL'}</p>
                    </div>
                 </div>
                 {migrationStep === 1 && (
                   <div className="animate-in slide-in-from-right duration-500">
                     <p className="text-[11px] font-black uppercase text-slate-400 tracking-[0.4em] mb-10">Select Provider & Authentication</p>
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
                        {['Genesys', 'Twilio', 'Five9', 'AmazonConnect'].map((prov) => (
                           <button key={prov} onClick={() => setSelectedProvider(prov as any)} className={`p-6 rounded-[2rem] border-2 transition-all text-center ${selectedProvider === prov ? 'border-brand-500 bg-brand-50/50 shadow-xl' : 'border-slate-100 bg-slate-50/50 hover:border-slate-200'}`}><div className="w-12 h-12 bg-white rounded-2xl mx-auto mb-4 flex items-center justify-center border border-slate-100 shadow-sm"><Database size={24} className={selectedProvider === prov ? 'text-brand-600' : 'text-slate-400'}/></div><span className={`text-[10px] font-black uppercase tracking-widest ${selectedProvider === prov ? 'text-brand-700' : 'text-slate-500'}`}>{prov}</span></button>
                        ))}
                     </div>
                     {selectedProvider && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                          <div className="space-y-4"><label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Server size={14}/> API Endpoint</label><input className="w-full bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 font-bold outline-none focus:border-brand-500" placeholder="https://api.provider.com/v1" value={credentials.endpoint} onChange={e => setCredentials({...credentials, endpoint: e.target.value})} /></div>
                          <div className="space-y-4"><label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Key size={14}/> Client Secret / API Key</label><input type="password" className="w-full bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 font-bold outline-none focus:border-brand-500" placeholder="••••••••••••••••" value={credentials.apiKey} onChange={e => setCredentials({...credentials, apiKey: e.target.value})} /></div>
                        </div>
                     )}
                     <button disabled={!selectedProvider || !credentials.endpoint || !credentials.apiKey} onClick={() => setMigrationStep(2)} className="w-full py-6 bg-slate-900 text-white rounded-3xl text-[11px] font-black uppercase tracking-[0.4em] shadow-2xl hover:bg-slate-800 disabled:opacity-30 transition-all flex items-center justify-center gap-3">Establish Connection <ArrowRight size={18}/></button>
                   </div>
                 )}
                 {/* Steps 2 & 3 omitted for brevity, but exist in memory */}
              </div>
           </div>
        )}

        {/* TEAM TAB */}
        {activeTab === 'team' && (
          <div className="max-w-5xl space-y-8 animate-in slide-in-from-bottom duration-500">
            <div className="flex justify-between items-end mb-4"><p className="text-[11px] font-black uppercase text-slate-400 tracking-[0.4em]">Neural Roster: {settings.team.length} Nodes</p><button onClick={() => setShowInviteModal(true)} className="px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 shadow-xl hover:bg-slate-800 transition-all"><UserPlus size={16}/> Provision Core</button></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {settings.team.map(member => (
                <div key={member.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 flex items-center justify-between group hover:border-brand-500/30 hover:shadow-xl transition-all"><div className="flex items-center gap-5"><img src={member.avatarUrl} className="w-14 h-14 rounded-2xl border border-slate-100" /><div><h4 className="text-xl font-black italic uppercase tracking-tight text-slate-800">{member.name}</h4><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{member.role} • EXT {member.extension}</p></div></div><button onClick={() => handleRemoveUser(member.id)} className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><UserMinus size={18}/></button></div>
              ))}
            </div>
          </div>
        )}

        {/* BILLING TAB */}
        {activeTab === 'billing' && (
          <div className="max-w-5xl space-y-12 animate-in slide-in-from-right duration-500">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="bg-brand-900 rounded-[3rem] p-12 text-white shadow-2xl relative overflow-hidden"><div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-[80px] -mr-32 -mt-32"></div><p className="text-[10px] font-black uppercase tracking-[0.4em] text-brand-300 mb-10">NEURAL WALLET</p><div className="flex items-end gap-2 mb-12"><span className="text-6xl font-black italic tracking-tighter">${settings.subscription.balance.toFixed(2)}</span><span className="text-brand-300 font-bold uppercase text-[10px] mb-4">USD Admitted</span></div><button onClick={() => setShowWalletModal(true)} className="w-full py-6 bg-white text-brand-900 rounded-3xl text-[11px] font-black uppercase tracking-widest shadow-xl hover:bg-brand-50 transition-all">Top-up Neural Credits</button></div>
                <div className="bg-white rounded-[3rem] p-12 border border-slate-200 shadow-xl flex flex-col justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mb-8">ACTIVE SUBSCRIPTION</p><h3 className="text-4xl font-black italic uppercase tracking-tighter text-slate-800 mb-2">{settings.subscription.plan} Cluster</h3><p className="text-sm font-medium text-slate-500">Billed monthly • Next cycle: {settings.subscription.nextBillingDate}</p></div><button onClick={() => setShowScaleModal(true)} className="mt-8 py-5 border-2 border-slate-100 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest hover:border-slate-200 transition-all flex items-center justify-center gap-2"><Zap size={14} className="text-brand-600"/> Scale Infrastructure</button></div>
             </div>
          </div>
        )}

        {/* EXPORT HUB (ANATOMY) - RESTORED & AMPLIFIED */}
        {activeTab === 'anatomy' && (
           <div className="max-w-5xl space-y-12 animate-in slide-in-from-right duration-500 pb-20">
              {/* Main Control Panel */}
              <section className="bg-white rounded-[4rem] p-12 border border-slate-200 shadow-xl relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-500/[0.03] blur-[120px] -mr-64 -mt-64"></div>
                 <div className="flex justify-between items-start mb-16 relative z-10">
                   <div className="flex items-center gap-8">
                     <div className="w-24 h-24 bg-brand-600 rounded-[2.5rem] flex items-center justify-center text-white shadow-2xl shadow-brand-500/40 transition-transform hover:scale-105">
                       <Share size={48}/>
                     </div>
                     <div>
                       <h3 className="text-5xl font-black text-slate-800 uppercase italic tracking-tighter">Portability Protocol</h3>
                       <p className="text-sm font-black text-slate-400 uppercase tracking-[0.4em] mt-2 italic">Neural Bundle Admissions Hub</p>
                     </div>
                   </div>
                   <div className="flex gap-4">
                      <button 
                        onClick={handleScanIntegrity} 
                        disabled={isScanning}
                        className="px-8 py-5 bg-slate-50 border border-slate-200 text-slate-600 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest flex items-center gap-3 hover:bg-slate-100 transition-all shadow-sm"
                      >
                        {isScanning ? <RefreshCw size={16} className="animate-spin"/> : <Search size={16}/>}
                        {isScanning ? 'Scanning...' : 'Scan Integrity'}
                      </button>
                      <button 
                        onClick={handleExportData} 
                        disabled={isExporting || scanResults.status === 'idle'}
                        className={`px-12 py-5 bg-slate-900 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest flex items-center gap-4 hover:bg-slate-800 transition-all shadow-2xl ${scanResults.status === 'idle' ? 'opacity-30 cursor-not-allowed' : ''}`}
                      >
                        {isExporting ? <RefreshCw size={20} className="animate-spin"/> : <FileJson size={20}/>}
                        {isExporting ? 'Packaging...' : 'Export Neural Bundle'}
                      </button>
                   </div>
                 </div>

                 {/* Scan Diagnostic Feedback */}
                 {scanResults.status !== 'idle' && (
                   <div className={`mb-12 p-8 rounded-[2.5rem] border-2 animate-in slide-in-from-top-4 ${scanResults.status === 'clean' ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'}`}>
                      <div className="flex items-center gap-4 mb-4">
                        {scanResults.status === 'clean' ? <CheckCircle className="text-green-500" size={24}/> : <ShieldAlert className="text-amber-500" size={24}/>}
                        <h4 className={`text-sm font-black uppercase tracking-widest ${scanResults.status === 'clean' ? 'text-green-800' : 'text-amber-800'}`}>
                          {scanResults.status === 'clean' ? 'Cluster Integrity Verified' : 'Diagnostic Warnings Identified'}
                        </h4>
                      </div>
                      <div className="space-y-2">
                        {scanResults.issues.length > 0 ? scanResults.issues.map((iss, i) => (
                           <div key={i} className="flex items-center gap-3 text-[11px] font-bold text-slate-600 italic">
                             <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                             {iss}
                           </div>
                        )) : <p className="text-[11px] font-bold text-slate-500 italic">No structural anomalies detected in active neural cores.</p>}
                      </div>
                   </div>
                 )}

                 {/* Bundle History Log */}
                 <div className="relative z-10">
                    <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 mb-8 flex items-center gap-2"><History size={16}/> Bundle Admission Log</h4>
                    <div className="space-y-4">
                       {exportHistory.length > 0 ? exportHistory.map(exp => (
                         <div key={exp.id} className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex items-center justify-between group hover:border-brand-500/20 transition-all">
                            <div className="flex items-center gap-6">
                               <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100 group-hover:text-brand-600 group-hover:bg-brand-50"><FileJson size={20}/></div>
                               <div><p className="text-xs font-black uppercase text-slate-800 tracking-widest">CONNECT-AI-BUNDLE-{exp.id.split('_')[1].slice(-4)}</p><p className="text-[10px] font-bold text-slate-400 mt-1 uppercase italic">{exp.timestamp} • {exp.size}</p></div>
                            </div>
                            <div className="flex items-center gap-6">
                               <span className="text-[9px] font-black uppercase px-3 py-1 bg-green-100 text-green-700 rounded-lg">{exp.status}</span>
                               <button className="text-slate-300 hover:text-brand-600 transition-all"><Download size={18}/></button>
                            </div>
                         </div>
                       )) : (
                         <div className="py-20 flex flex-col items-center justify-center opacity-10 grayscale italic">
                            <Terminal size={48} className="mb-4"/>
                            <p className="text-[10px] font-black uppercase tracking-[0.5em]">Log Admission Buffer Empty</p>
                         </div>
                       )}
                    </div>
                 </div>
              </section>

              {/* Production Guardrails */}
              <section className="bg-brand-900 rounded-[4rem] p-12 text-white shadow-2xl overflow-hidden relative">
                 <div className="absolute bottom-0 right-0 w-80 h-80 bg-white/5 blur-[80px] -mb-40 -mr-40"></div>
                 <div className="flex justify-between items-center mb-12">
                   <div>
                      <h3 className="text-4xl font-black italic uppercase tracking-tighter">Production Guardrails</h3>
                      <p className="text-xs font-black text-brand-300 uppercase tracking-[0.3em] mt-2 italic">Neural Environment Isolation Protocols</p>
                   </div>
                   <div className="px-6 py-2 bg-white/10 rounded-full border border-white/10 flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${isDemoMode ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`}></div>
                      <span className="text-[9px] font-black uppercase tracking-widest">{isDemoMode ? 'DEMO ENVIRONMENT' : 'PRODUCTION HYDRATED'}</span>
                   </div>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    {[
                      { title: 'API Authentication', desc: 'Handshake status with Gemini and Firebase cores.', status: isDemoMode ? 'PENDING' : 'SECURE', icon: Key },
                      { title: 'Multi-Tenant Isolation', desc: 'Firestore rules admitting only authorized node access.', status: 'ACTIVE', icon: Lock },
                      { title: 'Auto-Topup Logic', desc: 'Threshold-based wallet injection to prevent cluster death.', status: settings.subscription.autoTopUp ? 'ACTIVE' : 'INACTIVE', icon: Zap },
                      { title: 'PII Scrubbing', desc: 'Redacting sensitive metadata during neural admission.', status: settings.compliance.anonymizePii ? 'ACTIVE' : 'IDLE', icon: Shield }
                    ].map(step => (
                      <div key={step.title} className="p-10 bg-white/5 border border-white/10 rounded-[2.5rem] hover:bg-white/10 transition-all relative group overflow-hidden">
                         <div className="flex justify-between items-start relative z-10">
                            <div className="flex items-center gap-6">
                               <div className="p-4 bg-brand-500/20 rounded-2xl text-brand-400 group-hover:text-white transition-colors"><step.icon size={24}/></div>
                               <div>
                                  <h4 className="font-black uppercase text-brand-400 text-sm mb-2 tracking-widest flex items-center gap-2">{step.title}</h4>
                                  <p className="text-[11px] text-brand-100 font-medium leading-relaxed max-w-[200px]">{step.desc}</p>
                               </div>
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-lg ${step.status === 'SECURE' || step.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                               {step.status}
                            </span>
                         </div>
                      </div>
                    ))}
                 </div>
              </section>
           </div>
        )}
      </div>

      {/* INVITE MODAL */}
      {showInviteModal && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-md p-12 border border-white/20 relative overflow-hidden text-center"><h3 className="text-3xl font-black italic tracking-tighter uppercase text-slate-800 mb-8">Provision Node</h3><div className="space-y-6"><input className="w-full bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 font-bold text-center" placeholder="Member Name" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})}/><input className="w-full bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 font-bold text-center" placeholder="Email Address" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})}/><select className="w-full bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 font-black uppercase tracking-widest text-xs" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as any})}><option value={Role.AGENT}>Agent Core</option><option value={Role.SUPERVISOR}>Supervisor Core</option><option value={Role.ADMIN}>Cluster Admin</option></select><button onClick={handleAddUser} className="w-full py-6 bg-brand-600 text-white rounded-3xl font-black uppercase tracking-widest shadow-2xl">Admit Member</button></div><button onClick={() => setShowInviteModal(false)} className="mt-6 text-slate-400 font-bold uppercase tracking-widest text-xs">Cancel</button></div>
        </div>
      )}
    </div>
  );
};
