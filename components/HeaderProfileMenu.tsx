
import React, { useState, useEffect, useRef } from 'react';
import { User as UserIcon, Mic, Volume2, Keyboard, LogOut, ChevronDown, Monitor, Settings, Play, StopCircle, Check, Camera, Upload } from 'lucide-react';
import { User, AgentStatus } from '../types';

interface HeaderProfileMenuProps {
  user: User;
  status: AgentStatus;
  onStatusChange: (status: AgentStatus) => void;
  onLogout: () => void;
  onUpdateUser?: (updated: User) => void;
}

export const HeaderProfileMenu: React.FC<HeaderProfileMenuProps> = ({ user, status, onStatusChange, onLogout, onUpdateUser }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);

  // Audio Logic State
  const [mic, setMic] = useState('default');
  const [speaker, setSpeaker] = useState('default');
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleMenu = () => setIsOpen(!isOpen);

  useEffect(() => {
    if (!showAudioSettings) stopMicTest();
  }, [showAudioSettings]);

  const startMicTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      source.connect(analyser);
      setIsTestingMic(true);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const average = sum / dataArray.length;
        setAudioLevel(Math.min(100, Math.round(average * 2.5)));
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  const stopMicTest = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    if (audioContextRef.current) audioContextRef.current.close();
    setIsTestingMic(false);
    setAudioLevel(0);
  };

  const playTestSound = () => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 440;
    gain.gain.value = 0.1;
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUpdateUser) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onUpdateUser({ ...user, avatarUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="relative z-50">
      <button onClick={toggleMenu} className="flex items-center space-x-3 hover:bg-slate-50 p-2 rounded-lg transition-colors focus:outline-none">
        <div className="text-right hidden sm:block">
          <p className="font-semibold text-slate-700 text-sm">{user.name}</p>
          <div className="flex items-center justify-end space-x-1">
             <span className={`w-2 h-2 rounded-full ${
                status === AgentStatus.AVAILABLE ? 'bg-green-500' :
                status === AgentStatus.BUSY ? 'bg-red-500' :
                status === AgentStatus.WRAP_UP ? 'bg-amber-500' : 'bg-slate-400'
             }`}></span>
             <p className="text-xs text-slate-500 capitalize">{status.replace('_', ' ')}</p>
          </div>
        </div>
        <img src={user.avatarUrl} alt="User" className="w-9 h-9 rounded-full border border-slate-200 object-cover" />
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
            <div className="p-4 border-b border-slate-100 bg-slate-50">
               <p className="text-xs font-bold text-slate-500 uppercase mb-2">Set Status</p>
               <div className="grid grid-cols-2 gap-2">
                  {[AgentStatus.AVAILABLE, AgentStatus.BUSY, AgentStatus.WRAP_UP, AgentStatus.OFFLINE].map((s) => (
                    <button key={s} onClick={() => { onStatusChange(s); setIsOpen(false); }} className={`text-xs px-2 py-1.5 rounded border transition-colors ${status === s ? 'bg-brand-50 border-brand-200 text-brand-700 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{s.replace('_', ' ')}</button>
                  ))}
               </div>
            </div>
            
            <div className="py-2">
              <button onClick={() => { setShowProfileEdit(true); setIsOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-3">
                <div className="p-1.5 bg-green-50 rounded text-green-600"><Camera size={14}/></div>
                <span>Edit Profile Picture</span>
              </button>
              <button onClick={() => { setShowAudioSettings(true); setIsOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-3">
                <div className="p-1.5 bg-indigo-50 rounded text-indigo-600"><Mic size={14}/></div>
                <span>Audio Settings</span>
              </button>
              <button onClick={() => { setShowShortcuts(true); setIsOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-3">
                <div className="p-1.5 bg-blue-50 rounded text-blue-600"><Keyboard size={14}/></div>
                <span>Keyboard Shortcuts</span>
              </button>
            </div>

            <div className="border-t border-slate-100 py-2">
              <button onClick={onLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-3">
                <LogOut size={16} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </>
      )}

      {showProfileEdit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
           <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-8 animate-in zoom-in-95 text-center">
              <h3 className="text-lg font-bold text-slate-800 mb-6">Profile</h3>
              <div className="flex flex-col items-center gap-6">
                 <img src={user.avatarUrl} className="w-24 h-24 rounded-full border-4 border-slate-100 shadow-lg object-cover" />
                 <input type="file" ref={fileInputRef} onChange={handleAvatarUpload} accept="image/*" className="hidden" />
                 <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-brand-700 transition-all shadow-xl">
                    <Upload size={16}/> Upload New Image
                 </button>
              </div>
              <button onClick={() => setShowProfileEdit(false)} className="mt-8 text-slate-400 font-bold uppercase text-[10px] tracking-widest">Close</button>
           </div>
        </div>
      )}

      {showAudioSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
           <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Settings size={20}/> Device Settings</h3>
                 <button onClick={() => setShowAudioSettings(false)} className="text-slate-400 hover:text-slate-600">âœ•</button>
              </div>
              <div className="space-y-6">
                 <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-sm font-medium text-slate-700 flex items-center gap-2"><Mic size={16}/> Microphone</label>
                      <button onClick={isTestingMic ? stopMicTest : startMicTest} className={`text-xs px-2 py-1 rounded border flex items-center gap-1 ${isTestingMic ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                         {isTestingMic ? <StopCircle size={12}/> : <Play size={12}/>} {isTestingMic ? 'Stop Test' : 'Test Mic'}
                      </button>
                    </div>
                    <select value={mic} onChange={(e) => setMic(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                       <option value="default">System Default</option>
                    </select>
                    <div className="mt-3 bg-slate-100 rounded-full h-2 overflow-hidden w-full"><div className="h-full bg-green-500 transition-all duration-75" style={{ width: `${audioLevel}%` }}></div></div>
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2"><Volume2 size={16}/> Speaker</label>
                    <div className="flex gap-2">
                      <select value={speaker} onChange={(e) => setSpeaker(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"><option value="default">System Default</option></select>
                      <button onClick={playTestSound} className="px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg border border-slate-200"><Volume2 size={18}/></button>
                    </div>
                 </div>
              </div>
              <div className="mt-8 flex justify-end">
                 <button onClick={() => setShowAudioSettings(false)} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 flex items-center gap-2"><Check size={16} /> Save Preferences</button>
              </div>
           </div>
        </div>
      )}

      {showShortcuts && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
           <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-6"><h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Keyboard size={20}/> Keyboard Shortcuts</h3><button onClick={() => setShowShortcuts(false)} className="text-slate-400 hover:text-slate-600">âœ•</button></div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase">Call Control</h4>
                    <div className="flex justify-between text-sm py-1 border-b border-slate-50"><span>Accept</span><kbd className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono">Enter</kbd></div>
                    <div className="flex justify-between text-sm py-1 border-b border-slate-50"><span>Hangup</span><kbd className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono">Esc</kbd></div>
                 </div>
              </div>
              <div className="mt-6 text-center"><button onClick={() => setShowShortcuts(false)} className="text-brand-600 text-sm font-medium hover:underline">Close</button></div>
           </div>
        </div>
      )}
    </div>
  );
};

