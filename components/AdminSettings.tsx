
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
import { AppSettings, DepartmentRoute, Role, Notification, User, WorkflowRule, MigrationProvider, IntegrationLog, ChannelType, IvrConfig, WebhookConfig, SchemaMapping, IvrOption, BroadcastAudience, BroadcastMessage } from '../types';
import { VisualIvr } from './VisualIvr';
import { startLegacyMigration } from '../services/migrationService';
import { exportClusterData, downloadJson } from '../services/exportService';
import { getIntegrationsStatus, startGoogleOAuth, startMicrosoftOAuth, startHubSpotOAuth, getHubSpotStatus, getHubSpotReadiness, connectCrmProvider, syncCrmProvider, connectMarketingProvider, syncMarketingProvider } from '../services/integrationService';
import { apiRequest } from '../services/apiClient';
import { saveSettingsApi } from '../services/settingsService';
import { createInvite, fetchInvites } from '../services/authPolicyService';

const PERSONA_TEMPLATES = [
  { name: 'Professional Concierge', prompt: 'Welcome to ConnectAI Corporate. Your call is vital to our cluster. For technical admitting, press 1. For account stewardship, press 2.' },
  { name: 'Friendly Assistant', prompt: 'Hi there! Welcome to the ConnectAI family. Weâ€™re excited to help you today. Press 1 for Sales or 2 for anything else!' },
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
  onSyncTeamNow?: () => void | Promise<void>;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({ settings, onUpdateSettings, addNotification, onSyncTeamNow }) => {
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
  const [billingProcessing, setBillingProcessing] = useState(false);
  const [showCrmModal, setShowCrmModal] = useState(false);
  const [crmProvider, setCrmProvider] = useState<'hubspot' | 'salesforce' | 'pipedrive' | null>(null);
  const [crmCredentials, setCrmCredentials] = useState({ apiKey: '', endpoint: '', clientId: '' });
  const [showMarketingModal, setShowMarketingModal] = useState(false);
  const [marketingProvider, setMarketingProvider] = useState<string | null>(null);
  const [marketingCredentials, setMarketingCredentials] = useState({ apiKey: '', endpoint: '' });
  const [isIvrEditing, setIsIvrEditing] = useState(false);
  const [isScaling, setIsScaling] = useState(false);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<any>({ calendar: {}, crm: {}, marketing: {} });
  const [hubSpotStatus, setHubSpotStatus] = useState<any>(null);
  const [opsMetrics, setOpsMetrics] = useState<any>(null);
  const [twilioHealth, setTwilioHealth] = useState<{ canMonitor: boolean; configured: boolean; monitoringEnabled: boolean; missing: string[] } | null>(null);
  const [twilioHealthCheckedAt, setTwilioHealthCheckedAt] = useState<number | null>(null);
  const [twilioHealthLoading, setTwilioHealthLoading] = useState(false);
  const [twilioHealthError, setTwilioHealthError] = useState<string | null>(null);
  const [migrationConnected, setMigrationConnected] = useState(false);

  // Export Hub State
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<{ status: 'idle' | 'scanning' | 'clean' | 'warnings', issues: string[] }>({ status: 'idle', issues: [] });
  const [exportHistory, setExportHistory] = useState<ExportRecord[]>([]);
  const [exportPayloads, setExportPayloads] = useState<Record<string, string>>({});

  // Form States
  const [newUser, setNewUser] = useState({ name: '', email: '', role: Role.AGENT });
  const [editIvr, setEditIvr] = useState<IvrConfig>(settings.ivr);
  const [editDepartments, setEditDepartments] = useState<DepartmentRoute[]>(settings.ivr.departments || []);
  const [editAllowedNumbers, setEditAllowedNumbers] = useState(settings.voice.allowedNumbers.join('\n'));
  const [scalePlan, setScalePlan] = useState(settings.subscription.plan);
  const [scaleSeats, setScaleSeats] = useState(settings.subscription.seats);
  const [authSettings, setAuthSettings] = useState(settings.auth);
  const [authDomains, setAuthDomains] = useState(settings.auth.allowedDomains.join('\n'));
  const [domainTenantMap, setDomainTenantMap] = useState(
    settings.auth.domainTenantMap.map((m) => `${m.domain}=${m.tenantId}`).join('\n')
  );
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>(Role.AGENT);
  const [inviteTenantId, setInviteTenantId] = useState('');
  const [invites, setInvites] = useState<any[]>([]);
  const teamMembers = useMemo(() => {
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
  const [collapsedGeneral, setCollapsedGeneral] = useState<Record<string, boolean>>({
    access: false,
    providers: false,
    calendar: false,
    crm: false,
    broadcast: false,
    desktopRelease: false,
    observability: false,
    marketing: true,
  });
  const [broadcastDraft, setBroadcastDraft] = useState({
    title: '',
    body: '',
    audience: 'ALL' as BroadcastAudience,
    inApp: true,
    email: false,
  });
  const [desktopReleaseDraft, setDesktopReleaseDraft] = useState({
    latestVersion: settings.desktopRelease?.latestVersion || '',
    windowsDownloadUrl: settings.desktopRelease?.windowsDownloadUrl || '',
    releaseNotesUrl: settings.desktopRelease?.releaseNotesUrl || '',
    releasesPageUrl: settings.desktopRelease?.releasesPageUrl || '',
    publishedAt: settings.desktopRelease?.publishedAt ? String(settings.desktopRelease?.publishedAt).slice(0, 10) : '',
    fileName: settings.desktopRelease?.fileName || '',
    fileSizeLabel: settings.desktopRelease?.fileSizeLabel || '',
    unsignedBeta: settings.desktopRelease?.unsignedBeta ?? true,
  });
  const [desktopReleaseSaving, setDesktopReleaseSaving] = useState(false);
  const toggleGeneralSection = (key: string) => {
    setCollapsedGeneral((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
    getHubSpotStatus().then(setHubSpotStatus).catch(() => {});
  }, []);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      const payload = event?.data;
      if (!payload || payload.type !== 'connectai-oauth' || payload.provider !== 'HubSpot') return;
      if (payload.status === 'success') {
        addNotification('success', 'HubSpot OAuth connected.');
        try {
          const status = await getIntegrationsStatus();
          setIntegrationStatus(status);
          const hsStatus = await getHubSpotStatus();
          setHubSpotStatus(hsStatus);
        } catch {
          // ignore
        }
      } else {
        addNotification('error', 'HubSpot OAuth failed.');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [addNotification]);

  const refreshTwilioHealth = async (options?: { silent?: boolean }) => {
    setTwilioHealthLoading(true);
    setTwilioHealthError(null);
    try {
      const data = await apiRequest<any>('/api/twilio/capabilities', { method: 'GET' });
      setTwilioHealth({
        canMonitor: Boolean(data?.canMonitor),
        configured: Boolean(data?.configured),
        monitoringEnabled: Boolean(data?.monitoringEnabled),
        missing: Array.isArray(data?.missing) ? data.missing : [],
      });
      setTwilioHealthCheckedAt(Date.now());
    } catch (err: any) {
      const message = String(err?.message || 'Unable to load Twilio health.');
      setTwilioHealthError(message);
      if (!options?.silent) addNotification('error', `Twilio health refresh failed: ${message}`);
    } finally {
      setTwilioHealthLoading(false);
    }
  };

  useEffect(() => {
    refreshTwilioHealth({ silent: true });
  }, []);

  useEffect(() => {
    if (activeTab !== 'general') return;
    const interval = setInterval(() => {
      refreshTwilioHealth({ silent: true }).catch(() => {});
    }, 20000);
    return () => clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    const fetchOps = async () => {
      try {
        const data = await apiRequest<any>('/api/metrics/summary', { method: 'GET' });
        setOpsMetrics(data);
      } catch {
        // keep previous values
      }
    };
    fetchOps();
  }, []);

  useEffect(() => {
    setEditAllowedNumbers(settings.voice.allowedNumbers.join('\n'));
  }, [settings.voice.allowedNumbers]);

  useEffect(() => {
    setEditIvr(settings.ivr);
    setEditDepartments(settings.ivr.departments || []);
  }, [settings.ivr]);

  useEffect(() => {
    setAuthSettings(settings.auth);
    setAuthDomains(settings.auth.allowedDomains.join('\n'));
    setDomainTenantMap(settings.auth.domainTenantMap.map((m) => `${m.domain}=${m.tenantId}`).join('\n'));
  }, [settings.auth]);

  useEffect(() => {
    setDesktopReleaseDraft({
      latestVersion: settings.desktopRelease?.latestVersion || '',
      windowsDownloadUrl: settings.desktopRelease?.windowsDownloadUrl || '',
      releaseNotesUrl: settings.desktopRelease?.releaseNotesUrl || '',
      releasesPageUrl: settings.desktopRelease?.releasesPageUrl || '',
      publishedAt: settings.desktopRelease?.publishedAt ? String(settings.desktopRelease?.publishedAt).slice(0, 10) : '',
      fileName: settings.desktopRelease?.fileName || '',
      fileSizeLabel: settings.desktopRelease?.fileSizeLabel || '',
      unsignedBeta: settings.desktopRelease?.unsignedBeta ?? true,
    });
  }, [settings.desktopRelease]);

  useEffect(() => {
    fetchInvites().then(setInvites).catch(() => {});
  }, []);

  const isDemoMode = useMemo(() => !geminiConfigured, [geminiConfigured]);

  const handleToggleIntegration = (key: 'hubSpot' | 'pipedrive' | 'salesforce') => {
    const newSettings = { ...settings };
    if (key === 'hubSpot') {
      newSettings.integrations.hubSpot.enabled = !settings.integrations.hubSpot.enabled;
    } else {
      (newSettings.integrations as any)[key] = !(settings.integrations as any)[key];
    }
    onUpdateSettings(newSettings);
    saveSettingsApi(newSettings).catch(() => {});
    addNotification('info', `${key.toUpperCase()} state synchronized.`);
  };

  const handleConnectHubSpotOAuth = async () => {
    try {
      const readiness = await getHubSpotReadiness();
      if (!readiness?.configured) {
        const missing = Array.isArray(readiness?.missing) ? readiness.missing.join(', ') : 'HubSpot env vars';
        addNotification('error', `HubSpot OAuth not configured. Missing: ${missing}`);
        return;
      }
      const { url } = await startHubSpotOAuth();
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer,width=800,height=860');
      } else {
        addNotification('error', 'HubSpot OAuth URL not returned.');
      }
    } catch (err: any) {
      const message = String(err?.message || 'start failed');
      addNotification('error', `HubSpot OAuth failed: ${message}`);
    }
  };

  const handleSyncHubSpot = async () => {
    try {
      const result = await syncCrmProvider('hubspot');
      const status = await getIntegrationsStatus();
      const hsStatus = await getHubSpotStatus();
      setIntegrationStatus(status);
      setHubSpotStatus(hsStatus);
      addNotification('success', `HubSpot synced: ${result?.contacts ?? 0} contacts, ${result?.deals ?? 0} deals.`);
    } catch (err: any) {
      addNotification('error', `HubSpot sync failed: ${String(err?.message || 'unknown error')}`);
    }
  };

  const handleSaveAll = async () => {
    try {
      await saveSettingsApi(settings);
      addNotification('success', 'Admin settings saved.');
    } catch {
      addNotification('error', 'Failed to save admin settings.');
    }
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
      extension: (101 + settings.team.length).toString(),
      canAccessRecordings: newUser.role === Role.ADMIN
    };
    const next = { ...settings, team: [...settings.team, user] };
    onUpdateSettings(next);
    saveSettingsApi(next).catch(() => {});
    setShowInviteModal(false);
    setNewUser({ name: '', email: '', role: Role.AGENT });
    addNotification('success', `${user.name} admitted to neural core.`);
  };

  const handleRemoveUser = (userId: string) => {
    const next = { ...settings, team: settings.team.filter(u => u.id !== userId) };
    onUpdateSettings(next);
    saveSettingsApi(next).catch(() => {});
    addNotification('info', 'Member de-provisioned.');
  };

  const handleUpdateMember = (userId: string, updates: Partial<User>) => {
    const nextSettings = {
      ...settings,
      team: settings.team.map(u => u.id === userId ? { ...u, ...updates } : u)
    };
    onUpdateSettings(nextSettings);
    saveSettingsApi(nextSettings).catch(() => {});
  };

  const handleSaveIvr = () => {
    const allowedNumbers = editAllowedNumbers
      .split('\n')
      .map(n => n.trim())
      .filter(Boolean);
    const sanitizedDepartments = editDepartments
      .map((d, idx) => ({
        id: d.id || `dept_${Date.now()}_${idx}`,
        name: d.name.trim(),
        targetType: d.targetType || 'queue',
        target: d.target.trim(),
      }))
      .filter((d) => d.name && d.target);
    const nextSettings = { ...settings, ivr: { ...editIvr, departments: sanitizedDepartments }, voice: { ...settings.voice, allowedNumbers } };
    onUpdateSettings(nextSettings);
    saveSettingsApi(nextSettings).catch(() => {});
    setIsIvrEditing(false);
    addNotification('success', 'Call Routing Architecture Deployed.');
  };

  const handleSaveAuth = () => {
    const allowedDomains = authDomains
      .split('\n')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    const domainTenantMapParsed = domainTenantMap
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [domain, tenantId] = line.split('=').map((v) => v.trim());
        return { domain: (domain || '').toLowerCase(), tenantId: tenantId || '' };
      })
      .filter((m) => m.domain && m.tenantId);
    const nextSettings = {
      ...settings,
      auth: {
        ...authSettings,
        allowedDomains,
        domainTenantMap: domainTenantMapParsed,
      },
    };
    onUpdateSettings(nextSettings);
    saveSettingsApi(nextSettings).catch(() => {});
    addNotification('success', 'Access policy updated.');
  };

  const handleCreateInvite = async () => {
    if (!inviteEmail) return;
    try {
      await createInvite({ email: inviteEmail, role: inviteRole, tenantId: inviteTenantId || undefined });
      setInviteEmail('');
      setInviteTenantId('');
      const latest = await fetchInvites(inviteTenantId || undefined);
      setInvites(latest);
      addNotification('success', 'Invite sent.');
    } catch {
      addNotification('error', 'Failed to create invite.');
    }
  };

  const handleSaveDesktopRelease = async () => {
    const isHttpUrl = (value: string) => /^https?:\/\//i.test(value.trim());
    if (!desktopReleaseDraft.latestVersion.trim()) {
      addNotification('error', 'Desktop release version is required.');
      return;
    }
    if (desktopReleaseDraft.windowsDownloadUrl && !isHttpUrl(desktopReleaseDraft.windowsDownloadUrl)) {
      addNotification('error', 'Windows download URL must start with http:// or https://');
      return;
    }
    if (desktopReleaseDraft.releaseNotesUrl && !isHttpUrl(desktopReleaseDraft.releaseNotesUrl)) {
      addNotification('error', 'Release notes URL must start with http:// or https://');
      return;
    }
    if (desktopReleaseDraft.releasesPageUrl && !isHttpUrl(desktopReleaseDraft.releasesPageUrl)) {
      addNotification('error', 'Releases page URL must start with http:// or https://');
      return;
    }
    const publishedAtIso = desktopReleaseDraft.publishedAt
      ? new Date(`${desktopReleaseDraft.publishedAt}T00:00:00.000Z`).toISOString()
      : new Date().toISOString();

    const nextSettings: AppSettings = {
      ...settings,
      desktopRelease: {
        latestVersion: desktopReleaseDraft.latestVersion.trim(),
        windowsDownloadUrl: desktopReleaseDraft.windowsDownloadUrl.trim(),
        releaseNotesUrl: desktopReleaseDraft.releaseNotesUrl.trim(),
        releasesPageUrl: desktopReleaseDraft.releasesPageUrl.trim(),
        publishedAt: publishedAtIso,
        fileName: desktopReleaseDraft.fileName.trim(),
        fileSizeLabel: desktopReleaseDraft.fileSizeLabel.trim(),
        unsignedBeta: Boolean(desktopReleaseDraft.unsignedBeta),
      },
    };

    setDesktopReleaseSaving(true);
    try {
      const saved = await saveSettingsApi(nextSettings);
      onUpdateSettings(saved);
      addNotification('success', 'Desktop release metadata updated.');
    } catch {
      addNotification('error', 'Failed to save desktop release metadata.');
    } finally {
      setDesktopReleaseSaving(false);
    }
  };

  const handleSendBroadcast = async () => {
    if (!broadcastDraft.title.trim() || !broadcastDraft.body.trim()) {
      addNotification('error', 'Broadcast title and message are required.');
      return;
    }

    try {
      const response = await apiRequest<{ settings: AppSettings; broadcast: BroadcastMessage }>('/api/broadcasts/send', {
        method: 'POST',
        body: {
          title: broadcastDraft.title.trim(),
          body: broadcastDraft.body.trim(),
          audience: broadcastDraft.audience,
          inApp: broadcastDraft.inApp,
          email: broadcastDraft.email,
        },
      });
      onUpdateSettings(response.settings);
      setBroadcastDraft({ title: '', body: '', audience: 'ALL', inApp: true, email: false });
      addNotification('success', 'Broadcast sent.');
      if (response.broadcast?.email) {
        const delivered = response.broadcast?.delivery?.delivered || 0;
        const failed = response.broadcast?.delivery?.failed || 0;
        addNotification('info', `Email delivery: ${delivered} delivered, ${failed} failed.`);
      }
    } catch {
      addNotification('error', 'Failed to send broadcast.');
    }
  };

  const handleArchiveBroadcast = async (id: string) => {
    try {
      const response = await apiRequest<{ settings: AppSettings }>(`/api/broadcasts/${id}/archive`, { method: 'POST' });
      onUpdateSettings(response.settings);
      addNotification('success', 'Broadcast archived.');
    } catch {
      addNotification('error', 'Failed to archive broadcast.');
    }
  };

  const handleAddIvrOption = () => {
    const maxExisting = editIvr.options.reduce((max, option) => {
      const parsed = Number(option.key);
      return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
    }, 0);
    const nextKey = String(maxExisting + 1 || editIvr.options.length + 1);
    const defaultTarget = editDepartments[0]?.name || 'Sales';
    const newOption: IvrOption = { 
      key: nextKey, 
      action: 'QUEUE', 
      target: defaultTarget, 
      label: `Option ${nextKey}` 
    };
    setEditIvr({ ...editIvr, options: [...editIvr.options, newOption] });
  };

  const handleRemoveIvrOption = (key: string) => {
    setEditIvr({ ...editIvr, options: editIvr.options.filter(o => o.key !== key) });
  };

  const handleAddDepartmentRoute = () => {
    const next: DepartmentRoute = {
      id: `dept_${Date.now()}`,
      name: `Department ${editDepartments.length + 1}`,
      targetType: 'queue',
      target: `Department ${editDepartments.length + 1}`,
    };
    setEditDepartments((prev) => [...prev, next]);
  };

  const handleUpdateDepartmentRoute = (id: string, updates: Partial<DepartmentRoute>) => {
    setEditDepartments((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));
  };

  const handleRemoveDepartmentRoute = (id: string) => {
    setEditDepartments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleEstablishMigration = () => {
    if (!selectedProvider || !credentials.endpoint || !credentials.apiKey) return;
    setMigrationConnected(true);
    setMigrationStep(2);
    addNotification('success', `${selectedProvider} bridge handshake completed.`);
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
      const nextSettings = {
        ...settings,
        migration: { provider: selectedProvider, recordsProcessed: data.length, totalRecords: data.length, audioSynced: data.length, aiScored: data.length, status: 'completed' }
      } as AppSettings;
      onUpdateSettings(nextSettings);
      await saveSettingsApi(nextSettings).catch(() => {});
      setMigrationStep(3);
      addNotification('success', 'Migration complete.');
    } catch (e) {
      addNotification('error', 'Connection failed. Please check SSL/TLS settings.');
    } finally {
      setIsMigrating(false);
    }
  };

  const handleScanIntegrity = async () => {
    setIsScanning(true);
    setScanResults({ status: 'scanning', issues: [] });
    addNotification('info', 'Running system check...');
    const issues: string[] = [];
    try {
      const res = await fetch('/api/health/deps');
      if (res.ok) {
        const data = await res.json();
        if (!data.mongo) issues.push('MongoDB not connected.');
        if (!data.firebase) issues.push('Firebase admin not configured.');
        if (!data.storage) issues.push('Storage provider not configured.');
        if (data.jobWorker?.pendingCount > 20) issues.push('Job backlog above threshold.');
      }
    } catch {
      issues.push('Unable to reach health dependencies endpoint.');
    }
    if (isDemoMode) issues.push("Simulation keys detected in environment.");
    if (settings.team.length < 5) issues.push("Low node count: Redundancy not optimized.");

    setScanResults({
      status: issues.length > 0 ? 'warnings' : 'clean',
      issues
    });
    setIsScanning(false);
    addNotification('success', issues.length > 0 ? 'Scan complete: warnings found.' : 'Scan complete: all good.');
  };

  const handleExportData = async () => {
    if (scanResults.status === 'idle') {
      addNotification('error', 'Integrity Scan required before neural export.');
      return;
    }
    
    setIsExporting(true);
    addNotification('info', 'Preparing export bundle...');
    try {
      const data = await exportClusterData();
      const fileId = `exp_${Date.now()}`;
      const filename = `connect-ai-bundle-${fileId.slice(-6)}.json`;
      downloadJson(data, filename);
      
      const newRecord: ExportRecord = {
        id: fileId,
        timestamp: new Date().toLocaleTimeString(),
        size: `${(data.length / 1024).toFixed(1)} KB`,
        status: 'Ready'
      };
      setExportHistory(prev => [newRecord, ...prev].slice(0, 5));
      setExportPayloads(prev => ({ ...prev, [fileId]: data }));
      
      addNotification('success', 'Export saved locally.');
    } catch (e) {
      addNotification('error', 'Export protocol failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const currency = ((settings.subscription.currency || 'GBP').toUpperCase() as 'USD' | 'GBP' | 'NGN');
  const currencySymbols: Record<'USD' | 'GBP' | 'NGN', string> = { USD: '$', GBP: '£', NGN: '₦' };
  const currencyLabel: Record<'USD' | 'GBP' | 'NGN', string> = { USD: 'US Dollar', GBP: 'British Pound', NGN: 'Nigerian Naira' };
  const topUpPresets: Record<'USD' | 'GBP' | 'NGN', number[]> = {
    USD: [50, 100, 250],
    GBP: [25, 50, 100],
    NGN: [20000, 50000, 100000],
  };
  const formatMoney = (value: number, code: 'USD' | 'GBP' | 'NGN') =>
    new Intl.NumberFormat(code === 'NGN' ? 'en-NG' : 'en-GB', { style: 'currency', currency: code }).format(value);

  const handleTopUp = (amount: number) => {
    const nextSettings = {
      ...settings,
      subscription: {
        ...settings.subscription,
        balance: settings.subscription.balance + amount
      }
    };
    onUpdateSettings(nextSettings);
    saveSettingsApi(nextSettings).catch(() => {});
    addNotification('success', `Balance updated: +${formatMoney(amount, currency)}`);
    setShowWalletModal(false);
  };

  const handleCurrencyChange = async (nextCurrency: 'USD' | 'GBP' | 'NGN') => {
    const nextSettings = {
      ...settings,
      subscription: {
        ...settings.subscription,
        currency: nextCurrency,
      },
    };
    onUpdateSettings(nextSettings);
    try {
      const saved = await saveSettingsApi(nextSettings);
      onUpdateSettings(saved);
      addNotification('success', `Billing currency updated to ${nextCurrency}.`);
    } catch {
      addNotification('error', 'Failed to update billing currency.');
    }
  };

  const handleStripeCheckout = async (mode: 'topup' | 'subscription', amount?: number) => {
    setBillingProcessing(true);
    try {
      const config = await apiRequest<any>('/api/billing/stripe/config', { method: 'GET' });
      if (!config?.configured) {
        throw new Error('BILLING_NOT_CONFIGURED');
      }
      const payload: any = { mode };
      if (mode === 'topup' && amount) payload.amount = amount;
      if (mode === 'subscription') payload.plan = settings.subscription.plan;
      const response = await apiRequest<{ url: string }>('/api/billing/stripe/checkout', { method: 'POST', body: payload });
      if (!response?.url) throw new Error('Stripe checkout URL missing.');
      window.open(response.url, '_blank', 'noopener,noreferrer');
      addNotification('success', 'Stripe checkout opened.');
    } catch (err: any) {
      const raw = String(err?.message || 'unknown error');
      const lower = raw.toLowerCase();
      if (raw === 'BILLING_NOT_CONFIGURED' || lower.includes('stripe not configured') || lower.includes('missing stripe_secret_key')) {
        addNotification('error', 'Billing checkout is not configured yet. Add Stripe server keys in environment settings, then retry.');
      } else if (lower.includes('cannot post /api/billing/stripe/checkout') || lower.includes('<!doctype')) {
        addNotification('error', 'Billing service is temporarily unavailable. Start/restart backend API and ensure Stripe routes are deployed.');
      } else if (lower.includes('missing stripe price')) {
        addNotification('error', 'Billing plan price is not configured yet. Add STRIPE_PRICE_* values in environment settings.');
      } else {
        addNotification('error', `Stripe checkout failed: ${raw}`);
      }
    } finally {
      setBillingProcessing(false);
    }
  };

  const handleScaleInfrastructure = async () => {
    setIsScaling(true);
    addNotification('info', 'Scaling environment...');
    await new Promise(r => setTimeout(r, 2500));
    const tokenLimit = scalePlan === 'Enterprise' ? 5000000 : scalePlan === 'Growth' ? 1000000 : 250000;
    const voiceLimit = scalePlan === 'Enterprise' ? 20000 : scalePlan === 'Growth' ? 5000 : 1000;
    const nextSettings = {
      ...settings,
      subscription: {
        ...settings.subscription,
        plan: scalePlan as any,
        seats: scaleSeats,
        usage: { ...settings.subscription.usage, aiTokenLimit: tokenLimit, voiceMinuteLimit: voiceLimit }
      }
    };
    onUpdateSettings(nextSettings);
    saveSettingsApi(nextSettings).catch(() => {});
    setIsScaling(false);
    setShowScaleModal(false);
    addNotification('success', `Scaled to ${scalePlan}.`);
  };

  return (
    <div className="h-full flex flex-col bg-[radial-gradient(120%_120%_at_50%_0%,rgba(15,23,42,0.42)_0%,rgba(2,6,23,0.14)_58%,rgba(2,6,23,0.02)_100%)] overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b px-6 pt-6 shrink-0">
         <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4">
            <h2 className="text-2xl font-black text-slate-800 italic uppercase tracking-tighter">Admin Settings</h2>
            <div className="flex items-center gap-4">
               <button onClick={handleSaveAll} className="px-5 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all">
                 Save Settings
               </button>
               <div className="px-3 py-1.5 bg-brand-50 rounded-xl border border-brand-100 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-[9px] font-black uppercase text-brand-600 tracking-widest">System: Active</span>
               </div>
            </div>
         </div>
         <div className="flex space-x-8 overflow-x-auto scrollbar-hide">
            {[
              { id: 'general', label: 'Integrations' },
              { id: 'ivr', label: 'Call Routing' },
              { id: 'migration', label: 'Migration' },
              { id: 'team', label: 'Team Access' },
              { id: 'billing', label: 'Usage & Quota' },
              { id: 'anatomy', label: 'Export Hub' },
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)} 
                className={`pb-3 whitespace-nowrap text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === tab.id ? 'border-brand-600 text-brand-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
              >
                {tab.label}
              </button>
            ))}
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide pb-12">
        {/* INTEGRATIONS TAB */}
        {activeTab === 'general' && (
           <div className="max-w-6xl space-y-4 animate-in fade-in [&_input]:p-2.5 [&_textarea]:p-2.5 [&_select]:p-2.5 [&_button]:tracking-[0.12em]">
              <div className="bg-white p-4 rounded-[1.4rem] border border-slate-200 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-widest text-slate-700">Twilio Health</h4>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                      Monitor/listen readiness {twilioHealthCheckedAt ? `• ${new Date(twilioHealthCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}
                    </p>
                  </div>
                  <button disabled={twilioHealthLoading} onClick={refreshTwilioHealth} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2 ${twilioHealthLoading ? 'bg-slate-400 text-white cursor-not-allowed' : 'bg-slate-900 text-white'}`}>
                    <RefreshCw size={12} className={twilioHealthLoading ? 'animate-spin' : ''} /> {twilioHealthLoading ? 'Refreshing' : 'Refresh'}
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">canMonitor</p>
                    <p className={`mt-1 text-sm font-black ${twilioHealth?.canMonitor ? 'text-green-600' : 'text-amber-600'}`}>{twilioHealth?.canMonitor ? 'true' : 'false'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">configured</p>
                    <p className={`mt-1 text-sm font-black ${twilioHealth?.configured ? 'text-green-600' : 'text-amber-600'}`}>{twilioHealth?.configured ? 'true' : 'false'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">monitoringEnabled</p>
                    <p className={`mt-1 text-sm font-black ${twilioHealth?.monitoringEnabled ? 'text-green-600' : 'text-amber-600'}`}>{twilioHealth?.monitoringEnabled ? 'true' : 'false'}</p>
                  </div>
                </div>
                {twilioHealth?.missing?.length ? (
                  <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Missing</p>
                    <p className="mt-1 text-[10px] font-bold text-amber-700 break-all">{twilioHealth.missing.join(', ')}</p>
                  </div>
                ) : (
                  <div className="mt-3 p-3 rounded-xl bg-green-50 border border-green-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-green-700">Twilio monitor stack healthy.</p>
                  </div>
                )}
                {twilioHealthError && (
                  <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-100">
                    <p className="text-[9px] font-black uppercase tracking-widest text-red-700">Error</p>
                    <p className="mt-1 text-[10px] font-bold text-red-700 break-all">{twilioHealthError}</p>
                  </div>
                )}
              </div>
              <div className="bg-white p-4 rounded-[1.4rem] border border-slate-200 shadow-sm">
                <h4 className="text-sm font-black uppercase tracking-widest text-slate-700">Compliance Regime</h4>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">Shown in inbox and consent prompts</p>
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                  <ShieldCheck size={14} className="text-emerald-600" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                    {settings.compliance.jurisdiction === 'EU' || settings.compliance.jurisdiction === 'UK'
                      ? 'GDPR'
                      : settings.compliance.jurisdiction === 'US'
                        ? 'US PRIVACY'
                        : 'NDPA'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-[1.4rem] border border-slate-200 shadow-sm">
                  <button onClick={() => toggleGeneralSection('access')} className="w-full flex items-center justify-between text-left">
                    <h4 className="text-sm font-black uppercase tracking-widest text-slate-700">Access Control</h4>
                    <ChevronUp size={16} className={`text-slate-400 transition-transform ${collapsedGeneral.access ? 'rotate-180' : ''}`} />
                  </button>
                  {!collapsedGeneral.access && (
                    <div className="mt-4 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                          Invite-Only
                          <input type="checkbox" checked={Boolean(authSettings.inviteOnly)} onChange={(e) => setAuthSettings({ ...authSettings, inviteOnly: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                        </label>
                        <label className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                          Auto-Tenant Domain
                          <input type="checkbox" checked={Boolean(authSettings.autoTenantByDomain)} onChange={(e) => setAuthSettings({ ...authSettings, autoTenantByDomain: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                        </label>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <textarea className="w-full bg-slate-50 rounded-xl border border-slate-200 font-bold text-[10px] uppercase tracking-widest outline-none focus:border-brand-500" rows={3} placeholder="Allowed domains&#10;company.com" value={authDomains} onChange={(e) => setAuthDomains(e.target.value)} />
                        <textarea className="w-full bg-slate-50 rounded-xl border border-slate-200 font-bold text-[10px] uppercase tracking-widest outline-none focus:border-brand-500" rows={3} placeholder="domain=tenantId&#10;company.com=connectai-main" value={domainTenantMap} onChange={(e) => setDomainTenantMap(e.target.value)} />
                      </div>
                      <button onClick={handleSaveAuth} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase">Save Policy</button>
                    </div>
                  )}
                </div>

                <div className="bg-white p-4 rounded-[1.4rem] border border-slate-200 shadow-sm">
                  <button onClick={() => toggleGeneralSection('providers')} className="w-full flex items-center justify-between text-left">
                    <h4 className="text-sm font-black uppercase tracking-widest text-slate-700">Core Providers</h4>
                    <ChevronUp size={16} className={`text-slate-400 transition-transform ${collapsedGeneral.providers ? 'rotate-180' : ''}`} />
                  </button>
                  {!collapsedGeneral.providers && (
                    <div className="mt-4 grid grid-cols-1 gap-2.5">
                      {['hubSpot', 'pipedrive', 'salesforce'].map((key) => {
                        const provider = key === 'hubSpot' ? 'hubspot' : key;
                        const isConnected = provider === 'hubspot'
                          ? Boolean(hubSpotStatus?.connected || integrationStatus?.crm?.hubspot?.status === 'connected')
                          : Boolean(integrationStatus?.crm?.[provider]?.status);
                        return (
                          <div key={key} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                            <div>
                              <p className="text-xs font-black uppercase tracking-widest text-slate-700">{key.replace('hubSpot', 'HubSpot')}</p>
                              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Two-way sync</p>
                            </div>
                            <button onClick={() => { provider === 'hubspot' ? handleConnectHubSpotOAuth() : (setCrmProvider(provider as any), setShowCrmModal(true)); }} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase ${isConnected ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{isConnected ? 'Connected' : 'Connect'}</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="bg-white p-4 rounded-[1.4rem] border border-slate-200 shadow-sm">
                  <button onClick={() => toggleGeneralSection('calendar')} className="w-full flex items-center justify-between text-left">
                    <h4 className="text-sm font-black uppercase tracking-widest text-slate-700">Calendar Sync</h4>
                    <ChevronUp size={16} className={`text-slate-400 transition-transform ${collapsedGeneral.calendar ? 'rotate-180' : ''}`} />
                  </button>
                  {!collapsedGeneral.calendar && (
                    <div className="mt-4 space-y-3">
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={async () => { try { const { url } = await startGoogleOAuth(); if (url) window.open(url, '_blank', 'noopener,noreferrer'); } catch {} }} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase">Google</button>
                        <button onClick={async () => { try { const { url } = await startMicrosoftOAuth(); if (url) window.open(url, '_blank', 'noopener,noreferrer'); } catch {} }} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase">Microsoft</button>
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Status: {integrationStatus?.calendar?.google ? 'Google Connected' : integrationStatus?.calendar?.microsoft ? 'Microsoft Connected' : 'Not Connected'}</p>
                    </div>
                  )}
                </div>

                <div className="bg-white p-4 rounded-[1.4rem] border border-slate-200 shadow-sm">
                  <button onClick={() => toggleGeneralSection('crm')} className="w-full flex items-center justify-between text-left">
                    <h4 className="text-sm font-black uppercase tracking-widest text-slate-700">CRM Sync</h4>
                    <ChevronUp size={16} className={`text-slate-400 transition-transform ${collapsedGeneral.crm ? 'rotate-180' : ''}`} />
                  </button>
                  {!collapsedGeneral.crm && (
                    <div className="mt-4 space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Primary: {(settings.integrations.primaryCrm || 'HubSpot')}</p>
                      <div className="flex gap-2 flex-wrap">
                        {['hubspot', 'salesforce', 'pipedrive'].map((provider) => (
                          <button key={provider} onClick={() => { provider === 'hubspot' ? handleConnectHubSpotOAuth() : (setCrmProvider(provider as any), setShowCrmModal(true)); }} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase">
                            {provider === 'hubspot'
                              ? (hubSpotStatus?.connected ? 'Connected: hubspot' : 'Connect hubspot')
                              : (integrationStatus?.crm?.[provider]?.status ? `Connected: ${provider}` : `Connect ${provider}`)}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={handleSyncHubSpot} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-[9px] font-black uppercase">
                          Sync HubSpot Now
                        </button>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 self-center">
                          {hubSpotStatus?.lastSyncAt ? `Last sync ${new Date(hubSpotStatus.lastSyncAt).toLocaleString()}` : 'No sync yet'}
                        </span>
                      </div>
                      <div className="mt-3 rounded-xl border border-slate-200 overflow-hidden">
                        <div className="grid grid-cols-12 bg-slate-50 px-3 py-2">
                          <span className="col-span-4 text-[9px] font-black uppercase tracking-widest text-slate-500">Time</span>
                          <span className="col-span-2 text-[9px] font-black uppercase tracking-widest text-slate-500">Status</span>
                          <span className="col-span-2 text-[9px] font-black uppercase tracking-widest text-slate-500">Contacts</span>
                          <span className="col-span-2 text-[9px] font-black uppercase tracking-widest text-slate-500">Deals</span>
                          <span className="col-span-2 text-[9px] font-black uppercase tracking-widest text-slate-500">Error</span>
                        </div>
                        <div className="max-h-44 overflow-y-auto">
                          {(hubSpotStatus?.syncHistory || []).length ? (
                            (hubSpotStatus.syncHistory as any[]).map((row, idx) => (
                              <div key={row?.id || idx} className="grid grid-cols-12 px-3 py-2 border-t border-slate-100">
                                <span className="col-span-4 text-[10px] font-bold text-slate-700">{row?.finishedAt ? new Date(row.finishedAt).toLocaleString() : 'n/a'}</span>
                                <span className={`col-span-2 text-[10px] font-black uppercase ${row?.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>{row?.status || 'unknown'}</span>
                                <span className="col-span-2 text-[10px] font-bold text-slate-700">{Number(row?.contacts || 0)}</span>
                                <span className="col-span-2 text-[10px] font-bold text-slate-700">{Number(row?.deals || 0)}</span>
                                <span className="col-span-2 text-[10px] font-bold text-slate-500 truncate" title={row?.error || ''}>{row?.error || '-'}</span>
                              </div>
                            ))
                          ) : (
                            <div className="px-3 py-3 border-t border-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              No HubSpot sync runs yet.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white p-4 rounded-[1.4rem] border border-slate-200 shadow-sm xl:col-span-2">
                  <button onClick={() => toggleGeneralSection('broadcast')} className="w-full flex items-center justify-between text-left">
                    <h4 className="text-sm font-black uppercase tracking-widest text-slate-700">Broadcast Center</h4>
                    <ChevronUp size={16} className={`text-slate-400 transition-transform ${collapsedGeneral.broadcast ? 'rotate-180' : ''}`} />
                  </button>
                  {!collapsedGeneral.broadcast && (
                    <div className="mt-4 space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Send operational updates to specific roles across the app.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          className="w-full bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-widest outline-none focus:border-brand-500 md:col-span-2"
                          placeholder="Broadcast title"
                          value={broadcastDraft.title}
                          onChange={(e) => setBroadcastDraft((prev) => ({ ...prev, title: e.target.value }))}
                        />
                        <textarea
                          className="w-full bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-bold tracking-wide outline-none focus:border-brand-500 md:col-span-2"
                          rows={3}
                          placeholder="Write message to your team..."
                          value={broadcastDraft.body}
                          onChange={(e) => setBroadcastDraft((prev) => ({ ...prev, body: e.target.value }))}
                        />
                        <select
                          className="w-full bg-slate-50 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest outline-none focus:border-brand-500"
                          value={broadcastDraft.audience}
                          onChange={(e) => setBroadcastDraft((prev) => ({ ...prev, audience: e.target.value as BroadcastAudience }))}
                        >
                          <option value="ALL">All roles</option>
                          <option value="AGENT">Agents only</option>
                          <option value="SUPERVISOR">Supervisors only</option>
                          <option value="ADMIN">Admins only</option>
                        </select>
                        <div className="flex gap-3">
                          <label className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 flex-1">
                            In-app
                            <input type="checkbox" checked={broadcastDraft.inApp} onChange={(e) => setBroadcastDraft((prev) => ({ ...prev, inApp: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
                          </label>
                          <label className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 flex-1">
                            Email
                            <input type="checkbox" checked={broadcastDraft.email} onChange={(e) => setBroadcastDraft((prev) => ({ ...prev, email: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
                          </label>
                        </div>
                      </div>
                      <button onClick={handleSendBroadcast} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase">
                        Send Broadcast
                      </button>

                      <div className="mt-2 rounded-xl border border-slate-200 overflow-hidden">
                        <div className="grid grid-cols-12 bg-slate-50 px-3 py-2">
                          <span className="col-span-3 text-[9px] font-black uppercase tracking-widest text-slate-500">Time</span>
                          <span className="col-span-2 text-[9px] font-black uppercase tracking-widest text-slate-500">Audience</span>
                          <span className="col-span-3 text-[9px] font-black uppercase tracking-widest text-slate-500">Message</span>
                          <span className="col-span-2 text-[9px] font-black uppercase tracking-widest text-slate-500">Delivery</span>
                          <span className="col-span-1 text-[9px] font-black uppercase tracking-widest text-slate-500">InApp</span>
                          <span className="col-span-1 text-[9px] font-black uppercase tracking-widest text-slate-500">Email</span>
                          <span className="col-span-1 text-[9px] font-black uppercase tracking-widest text-slate-500">Action</span>
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                          {(settings.broadcastCenter?.messages || []).length ? (
                            (settings.broadcastCenter?.messages || []).slice(0, 20).map((row) => (
                              <div key={row.id} className="grid grid-cols-12 px-3 py-2 border-t border-slate-100">
                                <span className="col-span-3 text-[10px] font-bold text-slate-700">{row.sentAt ? new Date(row.sentAt).toLocaleString() : '-'}</span>
                                <span className="col-span-2 text-[10px] font-black uppercase text-slate-600">{row.audience}</span>
                                <span className="col-span-3 text-[10px] font-bold text-slate-700 truncate" title={row.body}>{row.title}</span>
                                <span className="col-span-2 text-[10px] font-bold text-slate-700">
                                  {row.email
                                    ? `${row.delivery?.delivered || 0}/${row.delivery?.attempted || 0} (${row.delivery?.failed || 0} fail)`
                                    : 'N/A'}
                                  {Boolean(row.delivery?.failed) && (
                                    <span className="block text-[9px] font-bold text-red-500 truncate" title={(row.delivery?.logs || []).filter((l: any) => l.status === 'FAILED').map((l: any) => `${l.email}: ${l.reason || 'unknown error'}`).join('\n')}>
                                      {(row.delivery?.logs || []).find((l: any) => l.status === 'FAILED')?.reason || 'Delivery error'}
                                    </span>
                                  )}
                                </span>
                                <span className="col-span-1 text-[10px] font-bold text-slate-700">{row.inApp ? 'Y' : 'N'}</span>
                                <span className="col-span-1 text-[10px] font-bold text-slate-700">{row.email ? 'Y' : 'N'}</span>
                                <span className="col-span-1 text-[10px] font-bold">
                                  {row.status === 'ARCHIVED' ? (
                                    <span className="text-slate-400 uppercase">Done</span>
                                  ) : (
                                    <button onClick={() => handleArchiveBroadcast(row.id)} className="text-brand-600 uppercase">Archive</button>
                                  )}
                                </span>
                              </div>
                            ))
                          ) : (
                            <div className="px-3 py-3 border-t border-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              No broadcasts sent yet.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white p-4 rounded-[1.4rem] border border-slate-200 shadow-sm xl:col-span-2">
                  <button onClick={() => toggleGeneralSection('desktopRelease')} className="w-full flex items-center justify-between text-left">
                    <h4 className="text-sm font-black uppercase tracking-widest text-slate-700">Desktop Release Manager</h4>
                    <ChevronUp size={16} className={`text-slate-400 transition-transform ${collapsedGeneral.desktopRelease ? 'rotate-180' : ''}`} />
                  </button>
                  {!collapsedGeneral.desktopRelease && (
                    <div className="mt-4 space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Admin-only metadata for website download card.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          className="w-full bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-widest outline-none focus:border-brand-500"
                          placeholder="Latest version e.g. 0.1.0-beta"
                          value={desktopReleaseDraft.latestVersion}
                          onChange={(e) => setDesktopReleaseDraft((prev) => ({ ...prev, latestVersion: e.target.value }))}
                        />
                        <input
                          className="w-full bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-widest outline-none focus:border-brand-500"
                          placeholder="Installer file name"
                          value={desktopReleaseDraft.fileName}
                          onChange={(e) => setDesktopReleaseDraft((prev) => ({ ...prev, fileName: e.target.value }))}
                        />
                        <input
                          className="w-full bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-widest outline-none focus:border-brand-500 md:col-span-2"
                          placeholder="Windows download URL"
                          value={desktopReleaseDraft.windowsDownloadUrl}
                          onChange={(e) => setDesktopReleaseDraft((prev) => ({ ...prev, windowsDownloadUrl: e.target.value }))}
                        />
                        <input
                          className="w-full bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-widest outline-none focus:border-brand-500"
                          placeholder="Release notes URL"
                          value={desktopReleaseDraft.releaseNotesUrl}
                          onChange={(e) => setDesktopReleaseDraft((prev) => ({ ...prev, releaseNotesUrl: e.target.value }))}
                        />
                        <input
                          className="w-full bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-widest outline-none focus:border-brand-500"
                          placeholder="All releases URL"
                          value={desktopReleaseDraft.releasesPageUrl}
                          onChange={(e) => setDesktopReleaseDraft((prev) => ({ ...prev, releasesPageUrl: e.target.value }))}
                        />
                        <input
                          type="date"
                          className="w-full bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-widest outline-none focus:border-brand-500"
                          value={desktopReleaseDraft.publishedAt}
                          onChange={(e) => setDesktopReleaseDraft((prev) => ({ ...prev, publishedAt: e.target.value }))}
                        />
                        <input
                          className="w-full bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-widest outline-none focus:border-brand-500"
                          placeholder="Size label e.g. 121 MB"
                          value={desktopReleaseDraft.fileSizeLabel}
                          onChange={(e) => setDesktopReleaseDraft((prev) => ({ ...prev, fileSizeLabel: e.target.value }))}
                        />
                      </div>
                      <label className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                        Unsigned Beta Warning
                        <input
                          type="checkbox"
                          checked={desktopReleaseDraft.unsignedBeta}
                          onChange={(e) => setDesktopReleaseDraft((prev) => ({ ...prev, unsignedBeta: e.target.checked }))}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          disabled={desktopReleaseSaving}
                          onClick={handleSaveDesktopRelease}
                          className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${desktopReleaseSaving ? 'bg-slate-300 text-slate-600 cursor-not-allowed' : 'bg-slate-900 text-white'}`}
                        >
                          {desktopReleaseSaving ? 'Saving...' : 'Save Desktop Release'}
                        </button>
                        {desktopReleaseDraft.windowsDownloadUrl ? (
                          <a href={desktopReleaseDraft.windowsDownloadUrl} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-lg border border-slate-200 text-[10px] font-black uppercase text-slate-600 inline-flex items-center gap-1">
                            Verify Link <ExternalLink size={12} />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white p-4 rounded-[1.4rem] border border-slate-200 shadow-sm xl:col-span-2">
                  <button onClick={() => toggleGeneralSection('observability')} className="w-full flex items-center justify-between text-left">
                    <h4 className="text-sm font-black uppercase tracking-widest text-slate-700">Observability</h4>
                    <ChevronUp size={16} className={`text-slate-400 transition-transform ${collapsedGeneral.observability ? 'rotate-180' : ''}`} />
                  </button>
                  {!collapsedGeneral.observability && (
                    <div className="mt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Latency</p><p className="text-sm font-black text-slate-800 mt-1">Avg {opsMetrics?.requests?.latency?.avg ?? 0} ms</p><p className="text-[9px] text-slate-500 mt-1">P95 {opsMetrics?.requests?.latency?.p95 ?? 0}</p></div>
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Errors</p><p className="text-sm font-black text-slate-800 mt-1">{opsMetrics?.requests?.errors ?? 0}</p><p className="text-[9px] text-slate-500 mt-1">Total {opsMetrics?.requests?.total ?? 0}</p></div>
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Backlog</p><p className="text-sm font-black text-slate-800 mt-1">{opsMetrics?.jobs?.pendingCount ?? 0}</p><p className="text-[9px] text-slate-500 mt-1">{opsMetrics?.jobs?.lastRunAt ? new Date(opsMetrics.jobs.lastRunAt).toLocaleTimeString() : 'n/a'}</p></div>
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Last Error</p><p className="text-[10px] font-bold text-slate-700 mt-1 line-clamp-2">{opsMetrics?.jobs?.lastError || 'None'}</p></div>
                      </div>
                      <button onClick={async () => { try { const data = await apiRequest<any>('/api/metrics/summary', { method: 'GET' }); setOpsMetrics(data); addNotification('success', 'Metrics refreshed.'); } catch { addNotification('error', 'Metrics refresh failed.'); } }} className="mt-3 px-4 py-2 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase">Refresh Metrics</button>
                    </div>
                  )}
                </div>

                <div className="bg-white p-4 rounded-[1.4rem] border border-slate-200 shadow-sm xl:col-span-2">
                  <button onClick={() => toggleGeneralSection('marketing')} className="w-full flex items-center justify-between text-left">
                    <h4 className="text-sm font-black uppercase tracking-widest text-slate-700">Marketing Sync</h4>
                    <ChevronUp size={16} className={`text-slate-400 transition-transform ${collapsedGeneral.marketing ? 'rotate-180' : ''}`} />
                  </button>
                  {!collapsedGeneral.marketing && (
                    <div className="mt-4 flex gap-2 flex-wrap">
                      {['hubspot', 'mailchimp', 'marketo'].map((provider) => (
                        <button key={provider} onClick={() => { setMarketingProvider(provider); setShowMarketingModal(true); }} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase">
                          Connect {provider}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
           </div>
        )}

        {/* ROUTING TAB */}
        {activeTab === 'ivr' && (
           <div className="max-w-4xl space-y-8 animate-in fade-in">
              <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-xl overflow-hidden relative">
                 <div className="flex justify-between items-start mb-8">
                   <div>
                     <h3 className="text-3xl font-black italic uppercase tracking-tighter mb-2 text-slate-800">Call Routing Architect</h3>
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Global settings</p>
                   </div>
                   {!isIvrEditing ? (
                     <button onClick={() => setIsIvrEditing(true)} className="px-6 py-3 bg-brand-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-brand-700 transition-all flex items-center gap-2">
                       <Edit3 size={16}/> Modify Logic Matrix
                     </button>
                   ) : (
                     <div className="flex gap-3">
                        <button onClick={() => setIsIvrEditing(false)} className="px-5 py-3 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest">Discard</button>
                        <button onClick={handleSaveIvr} className="px-6 py-3 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg">Deploy Architecture</button>
                     </div>
                   )}
                 </div>
                 
                 {isIvrEditing ? (
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                     <div className="space-y-12">
                       <div className="space-y-4">
                         <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Phone size={14}/> Phone Number</label>
                         <input 
                          className="w-full bg-slate-50 p-6 rounded-[1.8rem] border-2 border-slate-100 font-black italic text-2xl outline-none focus:border-brand-500 shadow-inner"
                          value={editIvr.phoneNumber}
                          onChange={e => setEditIvr({...editIvr, phoneNumber: e.target.value})}
                         />
                       </div>
                     <div className="space-y-4">
                       <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Sparkles size={14}/> Theme</label>
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
                        <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl">
                          <div className="flex justify-between items-center mb-4">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Workflow size={14}/> Department Transfer Map</label>
                            <button type="button" onClick={handleAddDepartmentRoute} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-2"><Plus size={12}/> Add Department</button>
                          </div>
                          <div className="space-y-3">
                            {editDepartments.length === 0 && (
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">No departments configured yet.</p>
                            )}
                            {editDepartments.map((dept) => (
                              <div key={dept.id} className="grid grid-cols-12 gap-2 items-center">
                                <input value={dept.name} onChange={(e) => handleUpdateDepartmentRoute(dept.id, { name: e.target.value })} className="col-span-4 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest outline-none focus:border-brand-500" placeholder="Department name" />
                                <select value={dept.targetType} onChange={(e) => handleUpdateDepartmentRoute(dept.id, { targetType: e.target.value as DepartmentRoute['targetType'] })} className="col-span-3 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest outline-none focus:border-brand-500">
                                  <option value="queue">Queue</option>
                                  <option value="client">Client</option>
                                  <option value="phone">Phone</option>
                                </select>
                                <input value={dept.target} onChange={(e) => handleUpdateDepartmentRoute(dept.id, { target: e.target.value })} className="col-span-4 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-brand-500" placeholder="Target value" />
                                <button type="button" onClick={() => handleRemoveDepartmentRoute(dept.id)} className="col-span-1 p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"><Trash2 size={14}/></button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Layers3 size={14}/> Menu Options</label>
                          <button type="button" onClick={handleAddIvrOption} className="px-3 py-2 rounded-lg bg-brand-600 text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-brand-700 transition-all shadow-sm"><Plus size={14}/> Add Core Branch</button>
                        </div>
                        <div className="space-y-4 overflow-y-auto max-h-[600px] pr-4 scrollbar-hide">
                          {editIvr.options.map((option, idx) => (
                            <div key={idx} className="p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] relative group hover:border-brand-500/30 hover:shadow-xl transition-all duration-300">
                               <button onClick={() => handleRemoveIvrOption(option.key)} className="absolute top-6 right-6 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={18}/></button>
                               <div className="space-y-6">
                                 <div className="flex gap-6">
                                    <div className="w-24"><label className="text-[8px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Digit Key</label><input className="w-full bg-white border-2 border-slate-100 rounded-2xl p-4 font-black text-center text-xl shadow-sm focus:border-brand-500 outline-none" value={option.key} onChange={e => { const newOpts = [...editIvr.options]; newOpts[idx].key = e.target.value; setEditIvr({...editIvr, options: newOpts}); }} /></div>
                                    <div className="flex-1"><label className="text-[8px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Menu Label</label><input className="w-full bg-white border-2 border-slate-100 rounded-2xl p-4 font-bold text-sm shadow-sm focus:border-brand-500 outline-none uppercase" value={option.label} onChange={e => { const newOpts = [...editIvr.options]; newOpts[idx].label = e.target.value; setEditIvr({...editIvr, options: newOpts}); }} /></div>
                                 </div>
                                 <div className="grid grid-cols-2 gap-6">
                                    <div><label className="text-[8px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Action</label><select className="w-full bg-white border-2 border-slate-100 rounded-2xl p-4 font-black text-[10px] uppercase shadow-sm outline-none focus:border-brand-500" value={option.action} onChange={e => { const newOpts = [...editIvr.options]; newOpts[idx].action = e.target.value as any; setEditIvr({...editIvr, options: newOpts}); }}><option value="QUEUE">ADMIT TO QUEUE</option><option value="BOT">HANDOFF TO BOT</option><option value="VOICEMAIL">SEND TO VOICEMAIL</option><option value="TRANSFER">BRIDGE CALL</option></select></div>
                                    <div><label className="text-[8px] font-black uppercase text-slate-400 mb-2 block tracking-widest">Target</label><input className="w-full bg-white border-2 border-slate-100 rounded-2xl p-4 font-bold text-[10px] shadow-sm uppercase outline-none focus:border-brand-500" value={option.target} onChange={e => { const newOpts = [...editIvr.options]; newOpts[idx].target = e.target.value; setEditIvr({...editIvr, options: newOpts}); }} /></div>
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

        {/* Setup TAB */}
        {activeTab === 'migration' && (
           <div className="max-w-4xl space-y-8 animate-in fade-in">
              <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-xl overflow-hidden relative">
                 <div className="flex items-center gap-6 mb-8">
                    <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center text-white shadow-xl"><CloudDownload size={32}/></div>
                    <div>
                       <h3 className="text-3xl font-black text-slate-800 uppercase italic tracking-tighter">Legacy Ingestion</h3>
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
                          <div className="space-y-4"><label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Key size={14}/> Client Secret / API Key</label><input type="password" className="w-full bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 font-bold outline-none focus:border-brand-500" placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" value={credentials.apiKey} onChange={e => setCredentials({...credentials, apiKey: e.target.value})} /></div>
                        </div>
                     )}
                     <button disabled={!selectedProvider || !credentials.endpoint || !credentials.apiKey} onClick={handleEstablishMigration} className="w-full py-6 bg-slate-900 text-white rounded-3xl text-[11px] font-black uppercase tracking-[0.4em] shadow-2xl hover:bg-slate-800 disabled:opacity-30 transition-all flex items-center justify-center gap-3">Establish Connection <ArrowRight size={18}/></button>
                   </div>
                 )}
                 {migrationStep === 2 && (
                   <div className="animate-in slide-in-from-right duration-500">
                     <p className="text-[11px] font-black uppercase text-slate-400 tracking-[0.4em] mb-6">Schema Mapping</p>
                     <div className="space-y-3 mb-6">
                       {mappings.map((pair, idx) => (
                         <div key={`${pair.local}_${idx}`} className="grid grid-cols-[1fr_auto_1fr_auto] gap-3 items-center">
                           <input value={pair.local} onChange={(e) => setMappings((prev) => prev.map((m, i) => i === idx ? { ...m, local: e.target.value } : m))} className="bg-slate-50 p-4 rounded-xl border border-slate-200 font-black text-[10px] uppercase tracking-widest outline-none focus:border-brand-500" />
                           <ArrowRight size={14} className="text-slate-300" />
                           <input value={pair.remote} onChange={(e) => setMappings((prev) => prev.map((m, i) => i === idx ? { ...m, remote: e.target.value } : m))} className="bg-slate-50 p-4 rounded-xl border border-slate-200 font-black text-[10px] uppercase tracking-widest outline-none focus:border-brand-500" />
                           <button type="button" onClick={() => setMappings((prev) => prev.filter((_, i) => i !== idx))} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={14}/></button>
                         </div>
                       ))}
                     </div>
                     <div className="flex gap-3">
                       <button type="button" onClick={() => setMappings((prev) => [...prev, { local: '', remote: '' }])} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest">Add Mapping</button>
                       <button type="button" onClick={() => setMigrationStep(1)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-widest">Back</button>
                       <button type="button" onClick={handleInitiateMigration} disabled={isMigrating || !migrationConnected} className={`ml-auto px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${isMigrating || !migrationConnected ? 'bg-slate-300 text-white cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}>{isMigrating ? 'Migrating...' : 'Start Ingestion'}</button>
                     </div>
                     {isMigrating && (
                       <div className="mt-4">
                         <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                           <div className="h-full bg-brand-600 transition-all duration-300" style={{ width: `${migrationProgress}%` }}></div>
                         </div>
                         <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{migrationProgress}% complete</p>
                       </div>
                     )}
                   </div>
                 )}
                 {migrationStep === 3 && (
                   <div className="animate-in fade-in">
                     <div className="p-6 rounded-2xl bg-green-50 border border-green-100">
                       <h4 className="text-lg font-black uppercase tracking-widest text-green-700">Legacy Ingestion Complete</h4>
                       <p className="text-[11px] font-bold text-green-700 mt-2">Provider {selectedProvider} synced with mapping table applied.</p>
                     </div>
                     <div className="mt-4 flex gap-3">
                       <button type="button" onClick={() => { setMigrationStep(1); setMigrationConnected(false); setMigrationProgress(0); }} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest">Run Again</button>
                     </div>
                   </div>
                 )}
              </div>
           </div>
        )}

        {/* TEAM TAB */}
        {activeTab === 'team' && (
          <div className="max-w-4xl space-y-6 animate-in slide-in-from-bottom duration-500">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
              <h4 className="text-xl font-black uppercase italic tracking-tight mb-4">Invite Staff</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <input
                  className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 font-bold text-[10px] uppercase tracking-widest outline-none focus:border-brand-500"
                  placeholder="Email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <select
                  className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 font-bold text-[10px] uppercase tracking-widest outline-none focus:border-brand-500"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                >
                  <option value={Role.AGENT}>Agent</option>
                  <option value={Role.SUPERVISOR}>Supervisor</option>
                  <option value={Role.ADMIN}>Admin</option>
                </select>
                <input
                  className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 font-bold text-[10px] uppercase tracking-widest outline-none focus:border-brand-500"
                  placeholder="Tenant ID (optional)"
                  value={inviteTenantId}
                  onChange={(e) => setInviteTenantId(e.target.value)}
                />
                <button
                  onClick={handleCreateInvite}
                  className="px-6 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest"
                >
                  Send Invite
                </button>
              </div>
              <div className="space-y-2">
                {invites.length === 0 && (
                  <div className="text-[10px] text-slate-400 uppercase tracking-widest">No invites yet.</div>
                )}
                {invites.slice(0, 8).map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">{invite.email}</span>
                      <span className="text-[9px] uppercase tracking-widest text-slate-400">{invite.role} • {invite.status}</span>
                    </div>
                    <span className="text-[9px] uppercase tracking-widest text-slate-400">{invite.tenantId}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap justify-between items-end gap-3 mb-4">
              <p className="text-[11px] font-black uppercase text-slate-400 tracking-[0.4em]">Team members: {teamMembers.length}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => onSyncTeamNow?.()} className="px-4 py-3 border border-slate-200 text-slate-600 bg-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">
                  Sync Team Now
                </button>
                <button onClick={() => setShowInviteModal(true)} className="px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-xl hover:bg-slate-800 transition-all">
                  <UserPlus size={14}/> Invite Member
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {teamMembers.map(member => (
                <div key={member.id} className="bg-white/95 backdrop-blur-sm p-5 rounded-[1.8rem] border border-slate-200 group hover:border-brand-500/30 hover:shadow-xl transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img src={member.avatarUrl} className="w-11 h-11 rounded-xl border border-slate-100" />
                      <div>
                        <h4 className="text-lg font-black italic uppercase tracking-tight text-slate-800 line-clamp-1">{member.name}</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{member.role} â€¢ EXT {member.extension}</p>
                      </div>
                    </div>
                    <button onClick={() => handleRemoveUser(member.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><UserMinus size={16}/></button>
                  </div>
                  <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
                    <label className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Restrict Outbound Numbers
                      <input
                        type="checkbox"
                        checked={Boolean(member.restrictOutboundNumbers)}
                        onChange={(e) => handleUpdateMember(member.id, { restrictOutboundNumbers: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </label>
                    <label className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Recording Access
                      <input
                        type="checkbox"
                        checked={Boolean(member.canAccessRecordings)}
                        onChange={(e) => handleUpdateMember(member.id, { canAccessRecordings: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </label>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Allowed Numbers (one per line)</label>
                      <textarea
                        className="mt-2 w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-[10px] uppercase tracking-widest outline-none focus:border-brand-500"
                        rows={2}
                        placeholder="+12025550123"
                        value={(member.allowedNumbers || []).join('\n')}
                        onChange={(e) => handleUpdateMember(member.id, { allowedNumbers: e.target.value.split('\n').map(v => v.trim()).filter(Boolean) })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BILLING TAB */}
        {activeTab === 'billing' && (
          <div className="max-w-5xl space-y-8 animate-in slide-in-from-right duration-500">
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-brand-900 rounded-[2.2rem] p-8 text-white shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 blur-[60px] -mr-24 -mt-24"></div>
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-brand-300 mb-6">Wallet</p>
                  <div className="flex items-end gap-2 mb-8">
                    <span className="text-4xl font-black italic tracking-tighter">{formatMoney(settings.subscription.balance, currency)}</span>
                    <span className="text-brand-300 font-bold uppercase text-[9px] mb-2">{currency}</span>
                  </div>
                  <div className="mb-4">
                    <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-brand-300 mb-2">Currency</label>
                    <select
                      value={currency}
                      onChange={(e) => handleCurrencyChange(e.target.value as 'USD' | 'GBP' | 'NGN')}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white"
                    >
                      <option value="GBP" className="text-slate-800">GBP • British Pound</option>
                      <option value="NGN" className="text-slate-800">NGN • Nigerian Naira</option>
                      <option value="USD" className="text-slate-800">USD • US Dollar</option>
                    </select>
                  </div>
                  <button onClick={() => setShowWalletModal(true)} className="w-full py-4 bg-white text-brand-900 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-brand-50 transition-all">Add Credits</button>
                </div>
                <div className="bg-white rounded-[2.2rem] p-8 border border-slate-200 shadow-lg flex flex-col justify-between">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-6">Subscription</p>
                    <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-800 mb-2">{settings.subscription.plan} Plan</h3>
                    <p className="text-xs font-medium text-slate-500">Billed monthly • Next cycle: {settings.subscription.nextBillingDate}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-2">Base currency: {currencyLabel[currency]} ({currency})</p>
                  </div>
                  <div className="mt-6 grid grid-cols-1 gap-2">
                    <button onClick={() => setShowScaleModal(true)} className="py-4 border-2 border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-slate-200 transition-all flex items-center justify-center gap-2"><Zap size={14} className="text-brand-600"/> Scale Plan</button>
                    <button onClick={() => handleStripeCheckout('subscription')} disabled={billingProcessing} className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${billingProcessing ? 'bg-slate-300 text-white cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                      {billingProcessing ? 'Opening checkout...' : 'Pay Subscription (Stripe)'}
                    </button>
                  </div>
                </div>
             </div>
          </div>
        )}

        {/* Exports (ANATOMY) - RESTORED & AMPLIFIED */}
        {activeTab === 'anatomy' && (
           <div className="max-w-6xl space-y-5 animate-in slide-in-from-right duration-500 pb-6">
              {/* Main Control Panel */}
              <section className="bg-white rounded-[2rem] p-5 border border-slate-200 shadow-sm relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-[360px] h-[360px] bg-brand-500/[0.03] blur-[100px] -mr-40 -mt-40"></div>
                 <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start mb-5 relative z-10 gap-4">
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-brand-500/20 transition-transform hover:scale-105">
                       <Share size={22}/>
                     </div>
                     <div>
                       <h3 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">Data Export</h3>
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.28em] mt-1 italic">Download your data</p>
                     </div>
                   </div>
                   <div className="flex gap-3 flex-wrap">
                      <button 
                        onClick={handleScanIntegrity} 
                        disabled={isScanning}
                        className="px-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-100 transition-all shadow-sm"
                      >
                        {isScanning ? <RefreshCw size={16} className="animate-spin"/> : <Search size={16}/>}
                        {isScanning ? 'Scanning...' : 'Scan Integrity'}
                      </button>
                      <button 
                        onClick={handleExportData} 
                        disabled={isExporting || scanResults.status === 'idle'}
                        className={`px-5 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg ${scanResults.status === 'idle' ? 'opacity-30 cursor-not-allowed' : ''}`}
                      >
                        {isExporting ? <RefreshCw size={16} className="animate-spin"/> : <FileJson size={16}/>}
                        {isExporting ? 'Preparing...' : 'Export Data'}
                      </button>
                   </div>
                 </div>

                 {/* Scan Diagnostic Feedback */}
                 {scanResults.status !== 'idle' && (
                   <div className={`mb-5 p-4 rounded-xl border animate-in slide-in-from-top-4 ${scanResults.status === 'clean' ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'}`}>
                      <div className="flex items-center gap-3 mb-3">
                        {scanResults.status === 'clean' ? <CheckCircle className="text-green-500" size={24}/> : <ShieldAlert className="text-amber-500" size={24}/>}
                        <h4 className={`text-sm font-black uppercase tracking-widest ${scanResults.status === 'clean' ? 'text-green-800' : 'text-amber-800'}`}>
                          {scanResults.status === 'clean' ? 'System looks good' : 'Warnings found'}
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
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 flex items-center gap-2"><History size={14}/> Export History</h4>
                    <div className="space-y-2.5">
                       {exportHistory.length > 0 ? exportHistory.map(exp => (
                         <div key={exp.id} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between group hover:border-brand-500/20 transition-all">
                            <div className="flex items-center gap-3">
                               <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-400 border border-slate-100 group-hover:text-brand-600 group-hover:bg-brand-50"><FileJson size={14}/></div>
                               <div><p className="text-xs font-black uppercase text-slate-800 tracking-widest">CONNECT-AI-BUNDLE-{exp.id.split('_')[1].slice(-4)}</p><p className="text-[10px] font-bold text-slate-400 mt-1 uppercase italic">{exp.timestamp} â€¢ {exp.size}</p></div>
                            </div>
                            <div className="flex items-center gap-3">
                               <span className="text-[9px] font-black uppercase px-3 py-1 bg-green-100 text-green-700 rounded-lg">{exp.status}</span>
                               <button
                                 onClick={() => {
                                   const payload = exportPayloads[exp.id];
                                   if (payload) {
                                     downloadJson(payload, `connect-ai-bundle-${exp.id.slice(-6)}.json`);
                                   } else {
                                     addNotification('error', 'Export payload expired. Run a new export.');
                                   }
                                 }}
                                 className="text-slate-300 hover:text-brand-600 transition-all"
                               >
                                 <Download size={18}/>
                               </button>
                            </div>
                         </div>
                       )) : (
                         <div className="py-5 flex flex-col items-center justify-center opacity-20 grayscale italic">
                            <Terminal size={30} className="mb-2"/>
                            <p className="text-[10px] font-black uppercase tracking-[0.5em]">No exports yet</p>
                         </div>
                       )}
                    </div>
                 </div>
              </section>

              {/* Production Guardrails */}
              <section className="bg-brand-900 rounded-[1.6rem] p-4 text-white shadow-lg overflow-hidden relative">
                 <div className="absolute bottom-0 right-0 w-80 h-80 bg-white/5 blur-[80px] -mb-40 -mr-40"></div>
                 <div className="flex justify-between items-center mb-4">
                   <div>
                      <h3 className="text-lg font-black italic uppercase tracking-tighter">Production Guardrails</h3>
                      <p className="text-[9px] font-black text-brand-300 uppercase tracking-[0.2em] mt-1 italic">Environment settings</p>
                   </div>
                   <div className="px-3 py-1.5 bg-white/10 rounded-full border border-white/10 flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isDemoMode ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`}></div>
                      <span className="text-[9px] font-black uppercase tracking-widest">{isDemoMode ? 'DEMO ENVIRONMENT' : 'PRODUCTION HYDRATED'}</span>
                   </div>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { title: 'API Authentication', desc: 'Status for Gemini and Firebase.', status: isDemoMode ? 'PENDING' : 'SECURE', icon: Key },
                      { title: 'Multi-Tenant Isolation', desc: 'Firestore rules admitting only authorized node access.', status: 'ACTIVE', icon: Lock },
                      { title: 'Auto-Topup Logic', desc: 'Threshold-based wallet injection to prevent cluster death.', status: settings.subscription.autoTopUp ? 'ACTIVE' : 'INACTIVE', icon: Zap },
                      { title: 'PII Scrubbing', desc: 'Redacting sensitive metadata during neural admission.', status: settings.compliance.anonymizePii ? 'ACTIVE' : 'IDLE', icon: Shield }
                    ].map(step => (
                      <div key={step.title} className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all relative group overflow-hidden">
                         <div className="flex justify-between items-start relative z-10">
                            <div className="flex items-center gap-3">
                               <div className="p-2 bg-brand-500/20 rounded-lg text-brand-400 group-hover:text-white transition-colors"><step.icon size={16}/></div>
                               <div>
                                  <h4 className="font-black uppercase text-brand-400 text-xs mb-2 tracking-widest flex items-center gap-2">{step.title}</h4>
                                  <p className="text-[10px] text-brand-100 font-medium leading-relaxed max-w-[200px]">{step.desc}</p>
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

      {showCrmModal && crmProvider && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg p-10 border border-white/20 relative overflow-hidden">
            <button onClick={() => setShowCrmModal(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600"><X size={18} /></button>
            <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-800 mb-6">Connect {crmProvider}</h3>
            <div className="space-y-5">
              {crmProvider === 'hubspot' && (
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Status: {hubSpotStatus?.connected ? 'Connected' : 'Not Connected'}
                  </p>
                  <p className="mt-1 text-[10px] font-bold text-slate-600">
                    {hubSpotStatus?.lastSyncAt ? `Last sync: ${new Date(hubSpotStatus.lastSyncAt).toLocaleString()}` : 'No sync completed yet.'}
                  </p>
                </div>
              )}
              {crmProvider !== 'hubspot' && (
                <>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">API Key</label>
                <input
                  className="mt-2 w-full bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 font-bold text-[10px] uppercase tracking-widest outline-none focus:border-brand-500"
                  value={crmCredentials.apiKey}
                  onChange={(e) => setCrmCredentials({ ...crmCredentials, apiKey: e.target.value })}
                  placeholder="Paste API key"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Endpoint (optional)</label>
                <input
                  className="mt-2 w-full bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 font-bold text-[10px] uppercase tracking-widest outline-none focus:border-brand-500"
                  value={crmCredentials.endpoint}
                  onChange={(e) => setCrmCredentials({ ...crmCredentials, endpoint: e.target.value })}
                  placeholder="https://api.your-crm.com"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Client ID (optional)</label>
                <input
                  className="mt-2 w-full bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 font-bold text-[10px] uppercase tracking-widest outline-none focus:border-brand-500"
                  value={crmCredentials.clientId}
                  onChange={(e) => setCrmCredentials({ ...crmCredentials, clientId: e.target.value })}
                  placeholder="Client ID"
                />
              </div>
                </>
              )}
              <button
                onClick={async () => {
                  try {
                    if (crmProvider === 'hubspot') {
                      await handleConnectHubSpotOAuth();
                      return;
                    }
                    await connectCrmProvider(crmProvider as any, crmCredentials);
                    await syncCrmProvider(crmProvider as any);
                    const status = await getIntegrationsStatus();
                    setIntegrationStatus(status);
                    addNotification('success', `${crmProvider} connected and syncing.`);
                    setShowCrmModal(false);
                    setCrmCredentials({ apiKey: '', endpoint: '', clientId: '' });
                  } catch {
                    addNotification('error', `Failed to connect ${crmProvider}.`);
                  }
                }}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest"
              >
                {crmProvider === 'hubspot' ? 'Connect via HubSpot OAuth' : 'Connect & Sync'}
              </button>
              {crmProvider === 'hubspot' && (
                <button onClick={handleSyncHubSpot} className="w-full py-4 border border-slate-200 text-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest">
                  Sync Contacts & Deals
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showMarketingModal && marketingProvider && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg p-10 border border-white/20 relative overflow-hidden">
            <button onClick={() => setShowMarketingModal(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600"><X size={18} /></button>
            <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-800 mb-6">Connect {marketingProvider}</h3>
            <div className="space-y-5">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">API Key</label>
                <input
                  className="mt-2 w-full bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 font-bold text-[10px] uppercase tracking-widest outline-none focus:border-brand-500"
                  value={marketingCredentials.apiKey}
                  onChange={(e) => setMarketingCredentials({ ...marketingCredentials, apiKey: e.target.value })}
                  placeholder="Paste API key"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Endpoint (optional)</label>
                <input
                  className="mt-2 w-full bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 font-bold text-[10px] uppercase tracking-widest outline-none focus:border-brand-500"
                  value={marketingCredentials.endpoint}
                  onChange={(e) => setMarketingCredentials({ ...marketingCredentials, endpoint: e.target.value })}
                  placeholder="https://api.your-marketing.com"
                />
              </div>
              <button
                onClick={async () => {
                  try {
                    await connectMarketingProvider(marketingProvider, marketingCredentials);
                    await syncMarketingProvider(marketingProvider);
                    const status = await getIntegrationsStatus();
                    setIntegrationStatus(status);
                    addNotification('success', `${marketingProvider} connected and syncing.`);
                    setShowMarketingModal(false);
                    setMarketingCredentials({ apiKey: '', endpoint: '' });
                  } catch {
                    addNotification('error', `Failed to connect ${marketingProvider}.`);
                  }
                }}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest"
              >
                Connect & Sync
              </button>
            </div>
          </div>
        </div>
      )}

      {showWalletModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white rounded-[2.2rem] shadow-2xl w-full max-w-md p-8 border border-white/20 relative">
            <button onClick={() => setShowWalletModal(false)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"><X size={18} /></button>
            <h3 className="text-xl font-black italic uppercase tracking-tighter text-slate-800 mb-2">Add Credits</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-6">Wallet top-up • {currency}</p>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {topUpPresets[currency].map((amount) => (
                <button key={amount} onClick={() => handleTopUp(amount)} className="py-3 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-800">
                  +{currencySymbols[currency]}{amount}
                </button>
              ))}
            </div>
            <button onClick={() => handleStripeCheckout('topup', topUpPresets[currency][0])} disabled={billingProcessing} className={`w-full mb-3 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest ${billingProcessing ? 'bg-slate-300 text-white cursor-not-allowed' : 'bg-brand-600 text-white hover:bg-brand-700'}`}>
              {billingProcessing ? 'Opening checkout...' : `Top up via Stripe (${currencySymbols[currency]}${topUpPresets[currency][0]})`}
            </button>
            <button onClick={() => setShowWalletModal(false)} className="w-full py-3 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-600">Close</button>
          </div>
        </div>
      )}

      {showScaleModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white rounded-[2.2rem] shadow-2xl w-full max-w-lg p-8 border border-white/20 relative">
            <button onClick={() => setShowScaleModal(false)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"><X size={18} /></button>
            <h3 className="text-xl font-black italic uppercase tracking-tighter text-slate-800 mb-2">Scale Plan</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-6">Usage & quota controls</p>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Plan</label>
                <select value={scalePlan} onChange={(e) => setScalePlan(e.target.value as AppSettings['subscription']['plan'])} className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-widest outline-none focus:border-brand-500">
                  <option value="Starter">Starter</option>
                  <option value="Growth">Growth</option>
                  <option value="Enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Seats</label>
                <input type="number" min={1} value={scaleSeats} onChange={(e) => setScaleSeats(Math.max(1, Number(e.target.value || 1)))} className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-widest outline-none focus:border-brand-500" />
              </div>
              <button onClick={handleScaleInfrastructure} disabled={isScaling} className={`w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest ${isScaling ? 'bg-slate-300 text-white cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                {isScaling ? 'Scaling...' : 'Apply Scaling'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INVITE MODAL */}
      {showInviteModal && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-md p-12 border border-white/20 relative overflow-hidden text-center"><h3 className="text-3xl font-black italic tracking-tighter uppercase text-slate-800 mb-8">Add Team Member</h3><div className="space-y-6"><input className="w-full bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 font-bold text-center" placeholder="Member Name" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})}/><input className="w-full bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 font-bold text-center" placeholder="Email Address" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})}/><select className="w-full bg-slate-50 p-5 rounded-2xl border-2 border-slate-100 font-black uppercase tracking-widest text-xs" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as any})}><option value={Role.AGENT}>Agent</option><option value={Role.SUPERVISOR}>Supervisor</option><option value={Role.ADMIN}>Admin</option></select><button onClick={handleAddUser} className="w-full py-6 bg-brand-600 text-white rounded-3xl font-black uppercase tracking-widest shadow-2xl">Add Member</button></div><button onClick={() => setShowInviteModal(false)} className="mt-6 text-slate-400 font-bold uppercase tracking-widest text-xs">Cancel</button></div>
        </div>
      )}
    </div>
  );
};



