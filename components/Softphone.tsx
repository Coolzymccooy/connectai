
import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, User, Globe, Activity, Grip, Delete } from 'lucide-react';
import * as SIP from 'sip.js';

interface SoftphoneProps {
  userExtension: string;
}

export const Softphone: React.FC<SoftphoneProps> = ({ userExtension }) => {
  const [number, setNumber] = useState('');
  const [status, setStatus] = useState<'idle' | 'dialing' | 'connected' | 'incoming'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [userAgent, setUserAgent] = useState<SIP.UserAgent | null>(null);
  const [session, setSession] = useState<SIP.Session | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // SIP CONFIG (In production, fetch from AdminSettings)
  const sipConfig = {
    uri: `sip:${userExtension}@sip.connectai.com`,
    transportOptions: {
      server: 'wss://sip.connectai.com:7443', // Placeholder WSS
    },
    authorizationUsername: userExtension,
    authorizationPassword: 'password123',
  };

  useEffect(() => {
    // Initialize SIP User Agent
    /* 
    // Commented out to prevent crash without real WSS server
    const ua = new SIP.UserAgent(sipConfig);
    ua.start().then(() => {
      setStatus('idle');
      setUserAgent(ua);
    }).catch(console.error); 
    */
  }, []);

  const handleDigit = (digit: string) => setNumber(prev => prev + digit);
  
  const handleCall = async () => {
    if (!number) return;
    setStatus('dialing');
    
    // Simulate Call for Demo
    setTimeout(() => {
      setStatus('connected');
      const timer = setInterval(() => setDuration(d => d + 1), 1000);
      return () => clearInterval(timer);
    }, 2000);

    /* Real SIP Logic
    if (userAgent) {
      const target = SIP.UserAgent.makeURI(`sip:${number}@sip.provider.com`);
      if (target) {
        const inviter = new SIP.Inviter(userAgent, target);
        await inviter.invite();
        setSession(inviter);
      }
    }
    */
  };

  const handleHangup = () => {
    setStatus('idle');
    setNumber('');
    setDuration(0);
    // session?.bye();
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
         <h3 className="text-3xl font-black text-white tracking-tighter mb-1 h-10">{status === 'connected' ? formatTime(duration) : number || 'Enter Number'}</h3>
         <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">{status === 'idle' ? 'Ready to Admit' : status.toUpperCase()}</p>
      </div>

      {/* Keypad */}
      {status === 'idle' || status === 'dialing' ? (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[1,2,3,4,5,6,7,8,9,'*',0,'#'].map(n => (
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
           <button onClick={() => setIsMuted(!isMuted)} className={`p-6 rounded-[2rem] transition-all ${isMuted ? 'bg-white text-slate-900' : 'bg-slate-800 text-white'}`}>
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
         
         {status === 'connected' && (
            <button className="p-6 bg-slate-800 text-white rounded-[2rem] hover:bg-slate-700 transition-all">
              <Volume2 size={24}/>
            </button>
         )}
      </div>
      
      {/* Hidden Audio for SIP */}
      <audio ref={audioRef} autoPlay />
    </div>
  );
};
