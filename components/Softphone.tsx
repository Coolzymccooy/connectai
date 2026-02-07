import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, User, Delete, Minimize2, Maximize2, GripHorizontal, History } from 'lucide-react';
import { Device, Call as TwilioCall } from '@twilio/voice-sdk';
import type { AgentStatus, Call as AppCall, Lead, User as TeamUser } from '../types';

type DialHistoryItem = {
  id: string;
  number: string;
  direction: 'incoming' | 'outgoing';
  status: 'dialing' | 'ringing' | 'connected' | 'ended' | 'missed' | 'failed';
  startedAt: number;
  durationSeconds?: number;
};

interface SoftphoneProps {
  userExtension?: string;
  allowedNumbers?: string[];
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
  onManualDial?: (target: Lead | string) => void;
  onTestTts?: () => void;
  onOpenFreeCall?: () => void;
  floating?: boolean;
}

export const Softphone: React.FC<SoftphoneProps> = ({ userExtension, floating = true }) => {
  const [number, setNumber] = useState('');
  const [status, setStatus] = useState<'idle' | 'dialing' | 'connected' | 'incoming'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [device, setDevice] = useState<Device | null>(null);
  const [call, setCall] = useState<TwilioCall | null>(null);
  const timerRef = useRef<number | null>(null);
  const [clientStatus, setClientStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [clientError, setClientError] = useState<string | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const identity = userExtension || 'agent';
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 120 });
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [history, setHistory] = useState<DialHistoryItem[]>([]);
  const activeHistoryIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const initTwilio = async () => {
      if (deviceRef.current) return;
      setClientStatus('connecting');
      setClientError(null);

      try {
        const response = await fetch(`/api/twilio/token?identity=${encodeURIComponent(identity)}`);
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const data = await response.json();
        if (cancelled) return;

        const nextDevice = new Device(data.token, {
          logLevel: 'info',
          codecPreferences: ['opus', 'pcmu'],
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
          const historyId = `in_${Date.now()}`;
          activeHistoryIdRef.current = historyId;
          setHistory(prev => [{
            id: historyId,
            number: incomingNumber,
            direction: 'incoming',
            status: 'ringing',
            startedAt: Date.now()
          }, ...prev].slice(0, 25));
          incomingCall.on('accept', () => {
            setStatus('connected');
            if (activeHistoryIdRef.current) {
              setHistory(prev => prev.map(entry => entry.id === activeHistoryIdRef.current
                ? { ...entry, status: 'connected', startedAt: Date.now() }
                : entry));
            }
            if (timerRef.current) window.clearInterval(timerRef.current);
            timerRef.current = window.setInterval(() => setDuration(d => d + 1), 1000);
          });
          incomingCall.on('disconnect', handleHangup);
          incomingCall.on('cancel', handleHangup);
          incomingCall.on('reject', handleHangup);
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
      const width = isMinimized ? 180 : 320;
      const height = isMinimized ? 72 : 620;
      const x = Math.max(16, window.innerWidth - width - 32);
      const y = Math.max(80, Math.min(140, window.innerHeight - height - 32));
      setPosition({ x, y });
    };
    setInitialPosition();
  }, [floating]);

  useEffect(() => {
    if (!floating) return;
    const onMove = (event: PointerEvent) => {
      if (!dragRef.current?.active) return;
      const deltaX = event.clientX - dragRef.current.startX;
      const deltaY = event.clientY - dragRef.current.startY;
      const panelWidth = isMinimized ? 180 : 320;
      const panelHeight = isMinimized ? 72 : 620;
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

    if (!device) {
      alert('Twilio Client is not connected. Check your server token endpoint.');
      setStatus('idle');
      return;
    }
    const normalized = normalizeNumber(number);
    if (!normalized) return;

    try {
      const historyId = `out_${Date.now()}`;
      activeHistoryIdRef.current = historyId;
      setHistory(prev => [{
        id: historyId,
        number: normalized,
        direction: 'outgoing',
        status: 'dialing',
        startedAt: Date.now()
      }, ...prev].slice(0, 25));
      const newCall = await device.connect({ params: { To: normalized } });
      setCall(newCall);
      newCall.on('accept', () => {
        setStatus('connected');
        if (activeHistoryIdRef.current) {
          setHistory(prev => prev.map(entry => entry.id === activeHistoryIdRef.current
            ? { ...entry, status: 'connected', startedAt: Date.now() }
            : entry));
        }
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = window.setInterval(() => setDuration(d => d + 1), 1000);
      });
      newCall.on('disconnect', handleHangup);
      newCall.on('cancel', handleHangup);
      newCall.on('reject', handleHangup);
    } catch (err) {
      console.error('Twilio call failed:', err);
      if (activeHistoryIdRef.current) {
        setHistory(prev => prev.map(entry => entry.id === activeHistoryIdRef.current
          ? { ...entry, status: 'failed', durationSeconds: 0 }
          : entry));
      }
      setStatus('idle');
    }
  };

  const handleHangup = () => {
    setStatus('idle');
    setNumber('');
    setDuration(0);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (call) {
      call.disconnect();
    }
    setCall(null);
    device?.disconnectAll();
    if (activeHistoryIdRef.current) {
      const endedAt = Date.now();
      setHistory(prev => prev.map(entry => {
        if (entry.id !== activeHistoryIdRef.current) return entry;
        const durationSeconds = Math.max(0, Math.floor((endedAt - entry.startedAt) / 1000));
        const nextStatus = entry.status === 'connected' ? 'ended' : (entry.direction === 'incoming' ? 'missed' : 'failed');
        return { ...entry, status: nextStatus, durationSeconds };
      }));
      activeHistoryIdRef.current = null;
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
        <span className="flex items-center gap-2"><History size={12}/> Recent Calls</span>
        <span>{history.length}</span>
      </div>
      <div className="space-y-2 max-h-36 overflow-auto pr-1">
        {history.slice(0, 6).map(entry => (
          <div key={entry.id} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
            <div className="flex flex-col">
              <span className="text-xs text-white font-semibold">{entry.number}</span>
              <span className="text-[9px] uppercase tracking-widest text-slate-500">
                {entry.direction} • {entry.status}
              </span>
            </div>
            <span className="text-[10px] text-slate-400">
              {entry.durationSeconds ? formatTime(entry.durationSeconds) : '--:--'}
            </span>
          </div>
        ))}
        {history.length === 0 && (
          <div className="text-[10px] text-slate-500 text-center py-4">No calls yet.</div>
        )}
      </div>
    </div>
  );

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
        className="fixed z-[80] bg-slate-900/95 border border-white/10 shadow-2xl rounded-2xl px-4 py-3 flex items-center gap-3"
        style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      >
        <button onPointerDown={handleDragStart} className="text-slate-400 hover:text-white">
          <GripHorizontal size={16}/>
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
          <Maximize2 size={14}/>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`${floating ? 'fixed z-[70]' : 'relative'} w-[320px] bg-slate-900 rounded-[3rem] p-8 shadow-2xl border border-white/10 flex flex-col items-center overflow-hidden`}
      style={floating ? { transform: `translate3d(${position.x}px, ${position.y}px, 0)` } : undefined}
    >
      {/* Dynamic Island / Status */}
      <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-black/50 to-transparent pointer-events-none"></div>

      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20">
        <button onPointerDown={handleDragStart} className="text-slate-400 hover:text-white">
          <GripHorizontal size={18}/>
        </button>
        <button
          onClick={() => setIsMinimized(true)}
          className="p-2 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10"
          title="Minimize"
        >
          <Minimize2 size={14}/>
        </button>
      </div>

      <div className="mb-8 w-full text-center relative z-10">
         <div className="flex justify-center mb-4">
            <div className={`w-3 h-3 rounded-full ${status === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`}></div>
         </div>
         {status === 'connected' ? (
           <h3 className="text-3xl font-black text-white tracking-tighter mb-1 h-10">{formatTime(duration)}</h3>
         ) : (
           <input
             value={number}
             onChange={(e) => handleInputChange(e.target.value)}
             onPaste={handlePaste}
             placeholder="Enter Number"
             className="w-full bg-transparent text-center text-2xl font-black text-white tracking-tighter mb-1 h-10 outline-none placeholder:text-slate-600"
           />
         )}
         <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">{status === 'idle' ? 'Ready to Admit' : status.toUpperCase()}</p>
         <p className="text-[9px] uppercase tracking-widest text-slate-600 mt-2">{clientStatus} • {identity}</p>
         {clientError && (
           <div className="mt-1 flex items-center justify-center gap-2">
             <p className="text-[9px] text-red-400">{clientError}</p>
           </div>
         )}
      </div>

      {/* Keypad */}
      {status === 'idle' || status === 'dialing' ? (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[1,2,3,4,5,6,7,8,9,'+',0,'#'].map(n => (
            <button 
              key={n} 
              onClick={() => handleDigit(n.toString())}
              className="w-16 h-16 rounded-full bg-white/5 hover:bg-white/10 text-white font-medium text-xl flex items-center justify-center transition-all active:scale-95"
            >
              {n}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 mb-8 w-full">
           <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center relative">
              <User size={40} className="text-slate-500"/>
              <div className="absolute inset-0 border-2 border-green-500/30 rounded-full animate-ping"></div>
           </div>
           <div className="w-full bg-slate-800/50 rounded-xl p-4">
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2"><span>Signal</span><span>HD Voice</span></div>
              <div className="flex gap-1 h-8 items-end">
                 {[...Array(20)].map((_, i) => <div key={i} className="flex-1 bg-green-500 rounded-full animate-pulse" style={{height: `${Math.random() * 100}%`}}></div>)}
              </div>
           </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-6 w-full justify-center">
         {status === 'connected' && (
           <button onClick={() => {
             const nextMuted = !isMuted;
             setIsMuted(nextMuted);
             call?.mute(nextMuted);
           }} className={`p-6 rounded-[2rem] transition-all ${isMuted ? 'bg-white text-slate-900' : 'bg-slate-800 text-white'}`}
           >
             {isMuted ? <MicOff size={24}/> : <Mic size={24}/>}
           </button>
         )}

         {status === 'idle' ? (
           <button onClick={handleCall} className="p-6 bg-green-500 text-white rounded-[2rem] shadow-xl shadow-green-900/50 hover:bg-green-400 transition-all w-full flex justify-center">
             <Phone size={28}/>
           </button>
         ) : (
           <button onClick={handleHangup} className="p-6 bg-red-600 text-white rounded-[2rem] shadow-xl shadow-red-900/50 hover:bg-red-500 transition-all w-full flex justify-center">
             <PhoneOff size={28}/>
           </button>
         )}
         {status !== 'connected' && (
           <button onClick={handleDelete} className="p-6 bg-slate-800 text-white rounded-[2rem] hover:bg-slate-700 transition-all">
             <Delete size={24}/>
           </button>
         )}

         {status === 'connected' && (
            <button className="p-6 bg-slate-800 text-white rounded-[2rem] hover:bg-slate-700 transition-all">
              <Volume2 size={24}/>
            </button>
         )}
      </div>

      {renderHistory()}
    </div>
  );
};
