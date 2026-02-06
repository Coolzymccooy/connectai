import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, User, Delete } from 'lucide-react';
import { Device, Call as TwilioCall } from '@twilio/voice-sdk';
import type { AgentStatus, Call as AppCall, Lead, User as TeamUser } from '../types';

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
}

export const Softphone: React.FC<SoftphoneProps> = ({ userExtension, allowedNumbers = [] }) => {
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
          incomingCall.on('accept', () => {
            setStatus('connected');
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

    if (allowedNumbers.length > 0) {
      const allowed = allowedNumbers.map(n => normalizeNumber(n));
      if (!allowed.includes(normalized)) {
        alert('This number is not in the allowed list.');
        setStatus('idle');
        return;
      }
    }

    try {
      const newCall = await device.connect({ params: { To: normalized } });
      setCall(newCall);
      newCall.on('accept', () => {
        setStatus('connected');
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = window.setInterval(() => setDuration(d => d + 1), 1000);
      });
      newCall.on('disconnect', handleHangup);
      newCall.on('cancel', handleHangup);
      newCall.on('reject', handleHangup);
    } catch (err) {
      console.error('Twilio call failed:', err);
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
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-[320px] bg-slate-900 rounded-[3rem] p-8 shadow-2xl border border-white/10 flex flex-col items-center relative overflow-hidden">
      {/* Dynamic Island / Status */}
      <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-black/50 to-transparent pointer-events-none"></div>

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
           }} className={`p-6 rounded-[2rem] transition-all ${isMuted ? 'bg-white text-slate-900' : 'bg-slate-800 text-white'}`}>
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
    </div>
  );
};
