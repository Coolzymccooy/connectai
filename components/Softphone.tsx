import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, User, Delete, Minimize2, Maximize2, GripHorizontal, History } from 'lucide-react';
import { createCall, updateCall, fetchCallLogs } from '../services/callLogService';
import { Device, Call as TwilioCall } from '@twilio/voice-sdk';
import { AgentStatus, Call as AppCall, CallStatus, DepartmentRoute, Lead, User as TeamUser } from '../types';

interface SoftphoneProps {
  userExtension?: string;
  agentId?: string;
  agentName?: string;
  agentEmail?: string;
  allowedNumbers?: string[];
  restrictOutboundNumbers?: boolean;
  activeCall?: AppCall | null;
  agentStatus?: AgentStatus;
  onAccept?: () => void;
  onHangup?: () => void;
  onHold?: () => void;
  onMute?: () => void;
  onTransfer?: (targetId: string) => void;
  onStatusChange?: (status: AgentStatus) => void;
  onStartSimulator?: () => void;
  audioLevel?: number;
  onToggleMedia?: (type: 'video' | 'screen') => void;
  team?: TeamUser[];
  departments?: DepartmentRoute[];
  onManualDial?: (target: Lead | string) => void;
  onTestTts?: () => void;
  onOpenFreeCall?: () => void;
  floating?: boolean;
  enableServerLogs?: boolean;
  onCallEnded?: (call: AppCall) => void;
}

export const Softphone: React.FC<SoftphoneProps> = ({ userExtension, agentId, agentName, agentEmail, allowedNumbers = [], restrictOutboundNumbers = false, team = [], departments = [], floating = true, enableServerLogs = true, onCallEnded }) => {
  const [number, setNumber] = useState('');
  const [status, setStatus] = useState<'idle' | 'dialing' | 'connected' | 'incoming'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [device, setDevice] = useState<Device | null>(null);
  const [call, setCall] = useState<TwilioCall | null>(null);
  const timerRef = useRef<number | null>(null);
  const [clientStatus, setClientStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [clientError, setClientError] = useState<string | null>(null);
  const [clientNotice, setClientNotice] = useState<string | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const identity = userExtension || 'agent';
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 120 });
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [history, setHistory] = useState<AppCall[]>([]);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const tokenCooldownUntilRef = useRef<number>(0);
  const activeHistoryIdRef = useRef<string | null>(null);
  const activeHistoryStartRef = useRef<number | null>(null);
  const activeHistoryRef = useRef<AppCall | null>(null);
  const refreshHistory = async () => {
    if (!enableServerLogs) return;
    const agentKey = agentId || userExtension || '';
    if (!agentKey) return;
    try {
      const calls = await fetchCallLogs({ agentId: agentKey, limit: 6 });
      setHistory(calls);
    } catch {
      // ignore refresh errors
    }
  };

  useEffect(() => {
    if (!enableServerLogs) return;
    const agentKey = agentId || userExtension || '';
    if (!agentKey) return;
    const load = async () => {
      try {
        const calls = await fetchCallLogs({ agentId: agentKey, limit: 6 });
        setHistory(calls);
      } catch (err) {
        console.warn('Failed to fetch softphone history:', err);
      }
    };
    load();
  }, [agentId, userExtension, enableServerLogs]);

  useEffect(() => {
    let cancelled = false;

    const readErrorResponse = async (response: Response) => {
      try {
        const raw = await response.text();
        if (!raw) return '';
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.error) return String(parsed.error);
          return JSON.stringify(parsed).slice(0, 240);
        } catch {
          return raw.slice(0, 240);
        }
      } catch {
        return '';
      }
    };

    const initTwilio = async () => {
      if (deviceRef.current) return;
      const now = Date.now();
      if (now < tokenCooldownUntilRef.current) {
        const waitSec = Math.max(1, Math.ceil((tokenCooldownUntilRef.current - now) / 1000));
        setClientStatus('error');
        setClientError(`Rate limit active. Retry in ${waitSec}s.`);
        return;
      }
      setClientStatus('connecting');
      setClientError(null);

      try {
        const response = await fetch(`/api/twilio/token?identity=${encodeURIComponent(identity)}`);
        if (!response.ok) {
          if (response.status === 429) {
            const retryAfter = Number(response.headers.get('retry-after') || '20');
            tokenCooldownUntilRef.current = Date.now() + (Number.isFinite(retryAfter) ? retryAfter : 20) * 1000;
            const waitSec = Math.max(1, Math.ceil((tokenCooldownUntilRef.current - Date.now()) / 1000));
            setClientStatus('error');
            setClientError(`Token rate-limited. Retry in ${waitSec}s.`);
            setTimeout(() => {
              if (!cancelled) initTwilio();
            }, waitSec * 1000);
            return;
          }
          const details = await readErrorResponse(response);
          throw new Error(`Token endpoint error (${response.status})${details ? ` ${details}` : ''}`);
        }
        const data = await response.json();
        if (cancelled) return;

        const nextDevice = new Device(data.token, {
          logLevel: 'info',
          codecPreferences: ['opus', 'pcmu'] as any[],
        });

        deviceRef.current = nextDevice;
        setDevice(nextDevice);

        nextDevice.on('registered', () => {
          setClientStatus('connected');
          setClientError(null);
        });

        nextDevice.on('registering', () => {
          setClientStatus('connecting');
        });

        nextDevice.on('unregistered', () => {
          setClientStatus('disconnected');
        });

        nextDevice.on('tokenWillExpire', async () => {
          try {
            const tokenRes = await fetch(`/api/twilio/token?identity=${encodeURIComponent(identity)}`);
            if (!tokenRes.ok) {
              if (tokenRes.status === 429) {
                const retryAfter = Number(tokenRes.headers.get('retry-after') || '20');
                tokenCooldownUntilRef.current = Date.now() + (Number.isFinite(retryAfter) ? retryAfter : 20) * 1000;
                const waitSec = Math.max(1, Math.ceil((tokenCooldownUntilRef.current - Date.now()) / 1000));
                setClientError(`Token refresh rate-limited. Retrying in ${waitSec}s.`);
                return;
              }
              const details = await readErrorResponse(tokenRes);
              throw new Error(`Token refresh failed (${tokenRes.status})${details ? ` ${details}` : ''}`);
            }
            const tokenData = await tokenRes.json();
            nextDevice.updateToken(tokenData.token);
          } catch (err) {
            console.error('Twilio token refresh failed', err);
          }
        });

        nextDevice.on('error', (err) => {
          console.error('Twilio Client error', err);
          setClientStatus('error');
          setClientError(err?.message || 'Twilio Client error');
        });

        nextDevice.on('incoming', (incomingCall) => {
          setCall(incomingCall);
          setStatus('incoming');
          const incomingNumber = incomingCall?.parameters?.From || 'Unknown';
          const twilioCallSid = extractTwilioSid(incomingCall);
          const callSid = twilioCallSid || `in_${Date.now()}`;
          activeHistoryIdRef.current = callSid;

          const newCallObs: AppCall = {
            id: callSid,
            direction: 'inbound',
            customerName: incomingNumber,
            phoneNumber: incomingNumber,
            queue: 'Direct',
            startTime: Date.now(),
            durationSeconds: 0,
            status: CallStatus.RINGING,
            transcript: [],
            agentId: agentId || userExtension,
            agentName,
            agentEmail,
            extension: userExtension,
            twilioCallSid: twilioCallSid || callSid,
          };
          activeHistoryRef.current = newCallObs;
          if (enableServerLogs) {
            createCall(newCallObs).then((created) => {
              activeHistoryIdRef.current = created.id;
              activeHistoryStartRef.current = created.startTime || Date.now();
              refreshHistory();
            }).catch(() => {});
          }

          incomingCall.on('accept', () => {
            setStatus('connected');
            const resolvedTwilioSid = extractTwilioSid(incomingCall);
            if (activeHistoryIdRef.current) {
              if (enableServerLogs) {
                updateCall(activeHistoryIdRef.current, {
                  status: CallStatus.ACTIVE,
                  startTime: Date.now(),
                  twilioCallSid: resolvedTwilioSid,
                }).then(refreshHistory).catch(() => {});
              }
            }
            if (activeHistoryRef.current) {
              activeHistoryRef.current = {
                ...activeHistoryRef.current,
                status: CallStatus.ACTIVE,
                startTime: Date.now(),
                twilioCallSid: resolvedTwilioSid || activeHistoryRef.current.twilioCallSid,
              };
            }
            if (timerRef.current) window.clearInterval(timerRef.current);
            timerRef.current = window.setInterval(() => setDuration(d => d + 1), 1000);
          });
          incomingCall.on('disconnect', () => handleHangup(true));
          incomingCall.on('cancel', () => handleHangup(true));
          incomingCall.on('reject', () => handleHangup(true));
          incomingCall.accept();
        });

        await nextDevice.register();
      } catch (err: any) {
        console.error('Twilio init failed:', err);
        setClientStatus('error');
        setClientError(err?.message || 'Twilio init failed');
      }
    };

    initTwilio();

    return () => {
      cancelled = true;
      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
      }
    };
  }, [identity]);

  useEffect(() => {
    if (!floating) return;
    const setInitialPosition = () => {
      const width = isMinimized ? 170 : 286;
      const height = isMinimized ? 66 : 540;
      // Position on right side, but not too far down
      const x = Math.max(16, window.innerWidth - width - 32);
      const y = Math.max(100, Math.min(200, window.innerHeight - height - 32));
      setPosition({ x, y });
    };
    setInitialPosition();
  }, [floating, isMinimized]);

  useEffect(() => {
    if (!floating) return;
    const onMove = (event: PointerEvent) => {
      if (!dragRef.current?.active) return;
      const deltaX = event.clientX - dragRef.current.startX;
      const deltaY = event.clientY - dragRef.current.startY;
      const panelWidth = isMinimized ? 170 : 286;
      const panelHeight = isMinimized ? 66 : 540;
      const nextX = Math.min(Math.max(8, dragRef.current.originX + deltaX), window.innerWidth - panelWidth - 8);
      const nextY = Math.min(Math.max(8, dragRef.current.originY + deltaY), window.innerHeight - panelHeight - 8);
      setPosition({ x: nextX, y: nextY });
    };
    const onUp = () => {
      if (dragRef.current) dragRef.current.active = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [floating, isMinimized]);

  const normalizeNumber = (value: string) => {
    const trimmed = value.trim();
    const keepPlus = trimmed.startsWith('+');
    const digits = trimmed.replace(/[^\d]/g, '');
    return keepPlus ? `+${digits}` : digits;
  };
  const extractTwilioSid = (voiceCall?: TwilioCall | null) => {
    const sid = voiceCall?.parameters?.CallSid;
    if (typeof sid !== 'string') return undefined;
    const trimmed = sid.trim();
    return trimmed || undefined;
  };

  const getRequestHeaders = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('connectai_auth_token');
    const tenantId = localStorage.getItem('connectai_tenant_id');
    if (token) headers.Authorization = `Bearer ${token}`;
    if (tenantId) headers['X-Tenant-Id'] = tenantId;
    return headers;
  };

  const handleDigit = (digit: string) => setNumber(prev => normalizeNumber(prev + digit));
  const handleDelete = () => setNumber(prev => prev.slice(0, -1));
  const handleInputChange = (value: string) => setNumber(normalizeNumber(value));
  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData('text');
    setNumber(normalizeNumber(text));
  };

  const handleCall = async () => {
    if (!number) return;
    setStatus('dialing');
    setClientNotice(null);

    if (!device) {
      alert('Twilio Client is not connected. Check your server token endpoint.');
      setStatus('idle');
      return;
    }
    const normalized = normalizeNumber(number);
    if (!normalized) return;

    if (restrictOutboundNumbers) {
      const allowed = allowedNumbers.map(n => normalizeNumber(n));
      if (!allowed.includes(normalized)) {
        alert('This number is not in your allowed list.');
        setStatus('idle');
        return;
      }
    }

    try {
      const newCall = await device.connect({ params: { To: normalized } });
      setCall(newCall);
      const twilioCallSid = extractTwilioSid(newCall);
      const callSid = twilioCallSid || `out_${Date.now()}`;
      activeHistoryIdRef.current = callSid;
      activeHistoryStartRef.current = Date.now();

      const newCallObs: AppCall = {
        id: callSid,
        direction: 'outbound',
        customerName: normalized,
        phoneNumber: normalized,
        queue: 'Outbound',
        startTime: activeHistoryStartRef.current,
        durationSeconds: 0,
        status: CallStatus.DIALING,
        transcript: [],
        agentId: agentId || userExtension,
        agentName,
        agentEmail,
        extension: userExtension,
        twilioCallSid,
      };
      activeHistoryRef.current = newCallObs;
      if (enableServerLogs) {
        createCall(newCallObs).then((created) => {
          activeHistoryIdRef.current = created.id;
          activeHistoryStartRef.current = created.startTime || activeHistoryStartRef.current || Date.now();
          refreshHistory();
        }).catch(() => {});
      }

      newCall.on('accept', () => {
        setStatus('connected');
        const resolvedTwilioSid = extractTwilioSid(newCall);
        if (activeHistoryIdRef.current) {
          if (enableServerLogs) {
            updateCall(activeHistoryIdRef.current, {
              status: CallStatus.ACTIVE,
              startTime: Date.now(),
              twilioCallSid: resolvedTwilioSid,
            }).then(refreshHistory).catch(() => {});
          }
        }
        if (activeHistoryRef.current) {
          activeHistoryRef.current = {
            ...activeHistoryRef.current,
            status: CallStatus.ACTIVE,
            startTime: Date.now(),
            twilioCallSid: resolvedTwilioSid || activeHistoryRef.current.twilioCallSid,
          };
        }
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = window.setInterval(() => setDuration(d => d + 1), 1000);
      });
      newCall.on('disconnect', () => handleHangup(true));
      newCall.on('cancel', () => handleHangup(true));
      newCall.on('reject', () => handleHangup(true));
      newCall.on('error', (err: any) => {
        setClientError(err?.message || 'Call failed unexpectedly.');
        handleHangup(true);
      });
    } catch (err) {
      console.error('Twilio call failed:', err);
      if (activeHistoryIdRef.current) {
        if (enableServerLogs) {
          updateCall(activeHistoryIdRef.current, {
            status: CallStatus.ENDED,
            durationSeconds: 0,
            twilioCallSid: extractTwilioSid(newCall),
          }).then(refreshHistory).catch(() => {});
        }
      }
      setStatus('idle');
    }
  };

  const handleHangup = (fromRemoteEvent = false) => {
    setStatus('idle');
    setNumber('');
    setDuration(0);
    setClientNotice(null);
    setTransferTargetId('');
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!fromRemoteEvent && call) {
      call.disconnect();
    }
    setCall(null);
    if (!fromRemoteEvent) {
      device?.disconnectAll();
    }
    if (activeHistoryIdRef.current) {
      const endedAt = Date.now();
      const startedAt = activeHistoryStartRef.current || endedAt;
      const currentDuration = Math.max(0, Math.floor((endedAt - startedAt) / 1000));
      const resolvedTwilioSid = extractTwilioSid(call) || activeHistoryRef.current?.twilioCallSid;
      if (enableServerLogs) {
        updateCall(activeHistoryIdRef.current, {
          status: CallStatus.ENDED,
          durationSeconds: currentDuration,
          twilioCallSid: resolvedTwilioSid,
        }).then(refreshHistory).catch(() => {});
      }

      if (activeHistoryRef.current) {
        const finalCall: AppCall = {
          ...activeHistoryRef.current,
          status: CallStatus.ENDED,
          durationSeconds: currentDuration,
          twilioCallSid: resolvedTwilioSid,
        };
        onCallEnded?.(finalCall);
      }

      activeHistoryIdRef.current = null;
      activeHistoryStartRef.current = null;
      activeHistoryRef.current = null;
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const renderHistory = () => (
    <div className="w-full mt-6">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-3">
        <span className="flex items-center gap-2"><History size={12} /> Recent Calls</span>
        <span>{history.length}</span>
      </div>
      <div className="space-y-2 max-h-36 overflow-auto pr-1">
        {history.slice(0, 6).map(entry => (
          <div key={entry.id} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
            <div className="flex flex-col">
              <span className="text-xs text-white font-semibold">{entry.phoneNumber}</span>
              <span className="text-[9px] uppercase tracking-widest text-slate-500">
                {entry.direction} • {entry.status}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400">
                {entry.durationSeconds ? formatTime(entry.durationSeconds) : '--:--'}
              </span>
              <button
                onClick={() => setNumber(normalizeNumber(entry.phoneNumber || ''))}
                className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-green-500/70 transition-colors"
                title="Redial"
              >
                <Phone size={12} />
              </button>
            </div>
          </div>
        ))}
        {history.length === 0 && (
          <div className="text-[10px] text-slate-500 text-center py-4">No calls yet.</div>
        )}
      </div>
    </div>
  );

  const transferCandidates = team.filter((member) => {
    if (!member?.id || member.id === agentId) return false;
    if (member.status === 'disabled') return false;
    return Boolean(member.extension || member.id);
  });

  const departmentCandidates = departments
    .filter((d) => d?.id && d?.name)
    .map((d) => ({
      id: d.id,
      name: d.name,
      targetType: d.targetType,
      target: d.target,
    }));

  const handleTransferCall = async () => {
    if (!transferTargetId || transferBusy) return;
    const activeCallSid = extractTwilioSid(call);
    if (!activeCallSid) {
      setClientError('Transfer unavailable: no active Twilio call sid.');
      return;
    }
    const isDepartmentTransfer = transferTargetId.startsWith('dept:');
    const targetMemberId = isDepartmentTransfer ? '' : transferTargetId.replace(/^member:/, '');
    const targetDeptId = isDepartmentTransfer ? transferTargetId.replace(/^dept:/, '') : '';
    const targetMember = transferCandidates.find((member) => member.id === targetMemberId);
    const targetDept = departmentCandidates.find((dept) => dept.id === targetDeptId);
    if (!targetMember && !targetDept) {
      setClientError('Transfer target not found.');
      return;
    }

    setTransferBusy(true);
    setClientError(null);
    setClientNotice(null);
    try {
      const payload = isDepartmentTransfer
        ? { callSid: activeCallSid, targetDepartment: targetDept?.name }
        : { callSid: activeCallSid, targetIdentity: targetMember?.extension || targetMember?.id };
      const response = await fetch('/api/twilio/transfer', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const raw = await response.text();
        throw new Error(raw || `Transfer failed (${response.status})`);
      }
      setTransferTargetId('');
      setClientNotice(`Transfer initiated to ${targetDept?.name || targetMember?.name}.`);
    } catch (err: any) {
      setClientError(err?.message || 'Transfer failed');
    } finally {
      setTransferBusy(false);
    }
  };

  const handleDragStart = (event: React.PointerEvent<HTMLButtonElement | HTMLDivElement>) => {
    if (!floating) return;
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y
    };
  };

  if (floating && isMinimized) {
    return (
      <div
        className="fixed z-[9999] bg-slate-900/95 border border-white/10 shadow-2xl rounded-2xl px-4 py-3 flex items-center gap-3"
        style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      >
        <button onPointerDown={handleDragStart} className="text-slate-400 hover:text-white">
          <GripHorizontal size={16} />
        </button>
        <div className="flex flex-col">
          <span className="text-xs text-white font-semibold">Softphone</span>
          <span className="text-[10px] uppercase tracking-widest text-slate-500">{clientStatus}</span>
        </div>
        <button
          onClick={() => setIsMinimized(false)}
          className="ml-2 p-2 rounded-xl bg-white/10 text-white hover:bg-white/20"
          title="Restore"
        >
          <Maximize2 size={14} />
        </button>
      </div>
    );
  }

  return (
      <div
      className={`${floating ? 'fixed z-[9999]' : 'relative'} w-[286px] bg-slate-900 rounded-[2.2rem] p-5 shadow-2xl border border-white/10 flex flex-col items-center overflow-hidden`}
      style={floating ? { transform: `translate3d(${position.x}px, ${position.y}px, 0)`, top: 0, left: 0 } : undefined}
    >
      {/* Dynamic Island / Status */}
      <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-black/50 to-transparent pointer-events-none"></div>

      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20">
        <button onPointerDown={handleDragStart} className="text-slate-400 hover:text-white">
          <GripHorizontal size={18} />
        </button>
        <button
          onClick={() => setIsMinimized(true)}
          className="p-2 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10"
          title="Minimize"
        >
          <Minimize2 size={14} />
        </button>
      </div>

      <div className="mb-5 w-full text-center relative z-10">
        <div className="flex justify-center mb-4">
          <div className={`w-3 h-3 rounded-full ${status === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`}></div>
        </div>
        {status === 'connected' ? (
          <h3 className="text-2xl font-black text-white tracking-tighter mb-1 h-8">{formatTime(duration)}</h3>
        ) : (
          <input
            value={number}
            onChange={(e) => handleInputChange(e.target.value)}
            onPaste={handlePaste}
            placeholder="Enter Number"
            className="w-full bg-transparent text-center text-xl font-black text-white tracking-tighter mb-1 h-8 outline-none placeholder:text-slate-600"
          />
        )}
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">{status === 'idle' ? 'Ready to Call' : status.toUpperCase()}</p>
        <p className="text-[9px] uppercase tracking-widest text-slate-600 mt-2">{clientStatus} • {identity}</p>
        {clientError && (
          <div className="mt-1 flex items-center justify-center gap-2">
            <p className="text-[9px] text-red-400">{clientError}</p>
          </div>
        )}
        {clientNotice && (
          <div className="mt-1 flex items-center justify-center gap-2">
            <p className="text-[9px] text-emerald-400">{clientNotice}</p>
          </div>
        )}
      </div>

      {/* Keypad */}
      {status === 'idle' || status === 'dialing' ? (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, '+', 0, '#'].map(n => (
            <button
              key={n}
              onClick={() => handleDigit(n.toString())}
              className="w-14 h-14 rounded-full bg-white/5 hover:bg-white/10 text-white font-medium text-lg flex items-center justify-center transition-all active:scale-95"
            >
              {n}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 mb-5 w-full">
          <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center relative">
            <User size={32} className="text-slate-500" />
            <div className="absolute inset-0 border-2 border-green-500/30 rounded-full animate-ping"></div>
          </div>
          <div className="w-full bg-slate-800/50 rounded-xl p-4">
            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2"><span>Signal</span><span>HD Voice</span></div>
            <div className="flex gap-1 h-8 items-end">
              {[...Array(20)].map((_, i) => <div key={i} className="flex-1 bg-green-500 rounded-full animate-pulse" style={{ height: `${Math.random() * 100}%` }}></div>)}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 w-full justify-center">
        {status === 'connected' && (
          <button onClick={() => {
            const nextMuted = !isMuted;
            setIsMuted(nextMuted);
            call?.mute(nextMuted);
          }} className={`p-4 rounded-2xl transition-all ${isMuted ? 'bg-white text-slate-900' : 'bg-slate-800 text-white'}`}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
        )}

        {status === 'idle' ? (
          <button onClick={handleCall} className="p-4 bg-green-500 text-white rounded-2xl shadow-xl shadow-green-900/50 hover:bg-green-400 transition-all w-full flex justify-center">
            <Phone size={22} />
          </button>
        ) : (
          <button onClick={handleHangup} className="p-4 bg-red-600 text-white rounded-2xl shadow-xl shadow-red-900/50 hover:bg-red-500 transition-all w-full flex justify-center">
            <PhoneOff size={22} />
          </button>
        )}
        {status !== 'connected' && (
          <button onClick={handleDelete} className="p-4 bg-slate-800 text-white rounded-2xl hover:bg-slate-700 transition-all">
            <Delete size={20} />
          </button>
        )}

        {status === 'connected' && (
          <button className="p-4 bg-slate-800 text-white rounded-2xl hover:bg-slate-700 transition-all">
            <Volume2 size={20} />
          </button>
        )}
      </div>

      {status === 'connected' && (transferCandidates.length > 0 || departmentCandidates.length > 0) && (
        <div className="mt-3 w-full grid grid-cols-[1fr_auto] gap-2">
          <select
            value={transferTargetId}
            onChange={(e) => setTransferTargetId(e.target.value)}
            className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-[11px] font-bold text-white outline-none focus:border-brand-500"
          >
            <option value="">Transfer call...</option>
            {transferCandidates.length > 0 && (
              <optgroup label="Teammates">
                {transferCandidates.map((member) => (
                  <option key={member.id} value={`member:${member.id}`}>
                    {member.name} ({member.extension || member.id})
                  </option>
                ))}
              </optgroup>
            )}
            {departmentCandidates.length > 0 && (
              <optgroup label="Departments">
                {departmentCandidates.map((dept) => (
                  <option key={dept.id} value={`dept:${dept.id}`}>
                    {dept.name} ({dept.targetType}: {dept.target})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            onClick={handleTransferCall}
            disabled={!transferTargetId || transferBusy}
            className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
              !transferTargetId || transferBusy
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-brand-600 text-white hover:bg-brand-500'
            }`}
          >
            {transferBusy ? '...' : 'Transfer'}
          </button>
        </div>
      )}

      {renderHistory()}
    </div>
  );
};

