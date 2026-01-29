
import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Pause, Play, Users, X, ArrowRight, Wifi, GripHorizontal, PhoneOutgoing, ExternalLink, Sparkles, Activity, AlertTriangle, Headset, Radio, Video, VideoOff, ScreenShare, Monitor, UserPlus, Grid, Delete, Shuffle } from 'lucide-react';
import { Call, CallStatus, AgentStatus, User } from '../types';

interface SoftphoneProps {
  activeCall: Call | null;
  agentStatus: AgentStatus;
  onAccept: () => void;
  onHangup: () => void;
  onHold: () => void;
  onMute: () => void;
  onTransfer: (targetId: string) => void;
  onStatusChange: (status: AgentStatus) => void;
  onStartSimulator?: () => void;
  onTestTts?: () => void;
  onOpenFreeCall?: () => void;
  audioLevel?: number;
  onToggleMedia?: (type: 'video' | 'screen') => void;
  team: User[];
  onManualDial?: (number: string) => void;
}

export const Softphone: React.FC<SoftphoneProps> = ({
  activeCall, agentStatus, onAccept, onHangup, onHold, onMute, onTransfer, onStatusChange, onStartSimulator, onTestTts, onOpenFreeCall, audioLevel = 0, onToggleMedia, team, onManualDial
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState({ x: window.innerWidth - 340, y: window.innerHeight - 550 });
  const [isDragging, setIsDragging] = useState(false);
  const [showDialpad, setShowDialpad] = useState(false);
  const [showTransferList, setShowTransferList] = useState(false);
  const [manualInput, setManualInput] = useState('');
  
  const dragRef = useRef<{ startX: number, startY: number, initialLeft: number, initialTop: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('select')) return;
    e.preventDefault(); 
    setIsDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, initialLeft: position.x, initialTop: position.y };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragRef.current) return;
      setPosition({ x: dragRef.current.initialLeft + (e.clientX - dragRef.current.startX), y: dragRef.current.initialTop + (e.clientY - dragRef.current.startY) });
    };
    const handleMouseUp = () => { setIsDragging(false); dragRef.current = null; };
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isDragging]);

  useEffect(() => {
    let interval: number;
    if (activeCall?.status === CallStatus.ACTIVE) {
      interval = window.setInterval(() => setDuration((prev) => prev + 1), 1000);
    } else { setDuration(0); }
    return () => clearInterval(interval);
  }, [activeCall?.status]);

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
    onMute();
  };

  const handleTransfer = (userId: string) => {
    onTransfer(userId);
    setShowTransferList(false);
  };

  const isRinging = activeCall?.status === CallStatus.RINGING;
  const showActiveUI = activeCall && activeCall.status !== CallStatus.ENDED;

  if (!showActiveUI && agentStatus === AgentStatus.OFFLINE) return null;

  if (!showActiveUI) {
    return (
      <div style={{ left: position.x, top: position.y }} className="fixed w-80 bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden z-50 flex flex-col">
        <div onMouseDown={handleMouseDown} className="p-5 bg-slate-900 text-white flex justify-between items-center cursor-move select-none"><div className="flex items-center space-x-3"><GripHorizontal size={16} /><h3 className="font-black text-xs uppercase tracking-widest italic">Gateway Standby</h3></div><button onClick={() => setShowDialpad(!showDialpad)} className={`p-2 rounded-lg transition-all ${showDialpad ? 'bg-brand-500' : 'hover:bg-white/10'}`}><Grid size={16}/></button></div>
        <div className="p-10 text-center bg-white flex flex-col items-center">
          <div className="w-16 h-16 rounded-[1.5rem] bg-slate-100 flex items-center justify-center mb-6 shadow-inner text-slate-300"><Headset size={32} /></div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-6">Cluster Node Standby</p>
          {showDialpad ? (
             <div className="w-full space-y-4 animate-in slide-in-from-bottom">
                <input type="text" value={manualInput} onChange={e => setManualInput(e.target.value)} placeholder="Dial endpoint..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-mono font-bold text-center outline-none focus:border-brand-500"/>
                <button onClick={() => onManualDial?.(manualInput)} className="w-full py-4 bg-brand-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-3"><PhoneOutgoing size={14}/> Initiate Handshake</button>
                {onTestTts && (
                  <button onClick={onTestTts} className="w-full py-3 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all">
                    Play Gemini TTS
                  </button>
                )}
                {onOpenFreeCall && (
                  <button onClick={onOpenFreeCall} className="w-full py-3 bg-white border-2 border-slate-100 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm hover:border-brand-500 hover:text-brand-600 transition-all">
                    Open Free Call Room
                  </button>
                )}
             </div>
          ) : (
             <>
               {onStartSimulator && <button onClick={onStartSimulator} className="w-full py-4 bg-brand-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-brand-700 transition-all flex items-center justify-center gap-3"><Sparkles size={14}/> Admit AI Node</button>}
               {onTestTts && (
                  <button onClick={onTestTts} className="w-full mt-3 py-3 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all">
                    Play Gemini TTS
                  </button>
                )}
                {onOpenFreeCall && (
                  <button onClick={onOpenFreeCall} className="w-full mt-3 py-3 bg-white border-2 border-slate-100 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm hover:border-brand-500 hover:text-brand-600 transition-all">
                    Open Free Call Room
                  </button>
                )}
             </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ left: position.x, top: position.y }} className={`fixed transition-all duration-300 w-80 bg-white rounded-[2.5rem] shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] border border-slate-200 overflow-hidden z-50 flex flex-col animate-in zoom-in-95`}>
      <div onMouseDown={handleMouseDown} className={`p-6 text-white flex justify-between items-center cursor-move select-none ${activeCall?.direction === 'internal' ? 'bg-indigo-700' : 'bg-brand-900'}`}><div className="flex items-center space-x-3"><Radio size={16} className={isRinging ? 'animate-bounce' : 'animate-pulse'} /><h3 className="font-black italic uppercase tracking-tighter text-sm">{isRinging ? 'Inbound Request' : activeCall?.status === CallStatus.DIALING ? 'Dialing Hub...' : 'Live Admission'}</h3></div><span className="text-[10px] font-mono bg-white/10 px-3 py-1 rounded-lg">{isRinging ? 'RINGING' : formatDuration(duration)}</span></div>

      <div className={`p-8 bg-slate-50 flex flex-col items-center flex-1`}>
        {showTransferList ? (
           <div className="w-full animate-in slide-in-from-right">
              <div className="flex justify-between items-center mb-6">
                 <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">Select Target Node</h4>
                 <button onClick={() => setShowTransferList(false)} className="text-slate-400 hover:text-red-500"><X size={16}/></button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-hide">
                 {team.filter(u => u.id !== activeCall.agentId).map(user => (
                    <button key={user.id} onClick={() => handleTransfer(user.id)} className="w-full p-3 bg-white border border-slate-100 rounded-xl text-left hover:bg-brand-50 hover:border-brand-500 transition-all group">
                       <p className="text-[10px] font-black uppercase text-slate-800 tracking-tight group-hover:text-brand-600">{user.name}</p>
                       <p className="text-[8px] font-bold text-slate-400 uppercase">EXT {user.extension}</p>
                    </button>
                 ))}
              </div>
           </div>
        ) : (
          <>
            <div className="flex flex-col items-center">
                <div className="relative mb-6">
                   <div className={`w-24 h-24 rounded-[3rem] flex items-center justify-center text-4xl font-black italic shadow-2xl relative z-10 bg-white text-slate-800 border border-slate-100 ${isRinging ? 'animate-pulse ring-8 ring-brand-500/20' : ''}`}>{activeCall?.customerName.charAt(0)}</div>
                   {audioLevel > 5 && !isRinging && <div className="absolute inset-0 rounded-[3rem] border-4 border-brand-500 animate-ping opacity-30" style={{ transform: `scale(${1 + audioLevel/40})` }}></div>}
                </div>
                <h2 className="text-2xl font-black text-slate-800 text-center italic tracking-tighter mb-1 uppercase">{activeCall?.customerName}</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">{activeCall?.phoneNumber}</p>
            </div>

            <div className={`flex flex-col gap-4 w-full`}>
                {isRinging ? (
                  <div className="space-y-3">
                     <button onClick={onAccept} className="w-full py-5 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all shadow-xl shadow-green-500/20"><Phone size={20}/> Accept Admission</button>
                     <button onClick={onHangup} className="w-full py-4 bg-slate-100 text-slate-400 hover:text-red-500 rounded-2xl font-black uppercase tracking-[0.2em] transition-all">Reject</button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-3">
                        <button onClick={handleMuteToggle} className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all ${isMuted ? 'bg-red-50 text-red-600 shadow-inner' : 'bg-white border border-slate-100 shadow-sm hover:shadow-md'}`}>{isMuted ? <MicOff size={18} /> : <Mic size={18} />}</button>
                        <button onClick={onHold} className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all ${activeCall?.status === CallStatus.HOLD ? 'bg-amber-50 text-amber-600 shadow-inner' : 'bg-white border border-slate-100 shadow-sm hover:shadow-md'}`}>{activeCall?.status === CallStatus.HOLD ? <Play size={18} /> : <Pause size={18} />}</button>
                        <button onClick={() => setShowTransferList(true)} className="flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md text-slate-600 hover:text-brand-600"><Shuffle size={18} /></button>
                        <button onClick={() => onToggleMedia?.('video')} className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all ${activeCall?.isVideo ? 'bg-brand-600 text-white shadow-lg' : 'bg-white border border-slate-100 shadow-sm hover:shadow-md'}`}><Video size={18} /></button>
                    </div>
                    <button onClick={onHangup} className="w-full py-5 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 transition-all shadow-xl shadow-red-500/20 text-xs"><PhoneOff size={18} /> TERMINATE</button>
                  </>
                )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const formatDuration = (secs: number) => {
  const mins = Math.floor(secs / 60);
  const remainingSecs = secs % 60;
  return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
};
