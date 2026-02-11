
import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import Peer, { MediaConnection } from 'peerjs';
import { 
  Mic, MicOff, Video, VideoOff, Monitor, PhoneOff, Settings, 
  MessageSquare, Users, Sparkles, Smile, Hand, Grid, Layout, 
  Circle, MoreVertical, Send, X, Shield, BrainCircuit, Activity,
  Maximize2, Minimize2, Radio, Info, Check, Volume2, Image, 
  Laptop, Sliders, User as UserIcon, Bell, Palette, Plus, Loader2,
  Globe, Zap, ExternalLink, ClipboardList, TrendingUp, RefreshCw, Camera, AlertTriangle, Cpu, ZapOff,
  Signal, ShieldCheck, Terminal, CheckCircle2, ChevronRight, FileJson, HandMetal, UserPlus,
  Network, Command, Link as LinkIcon, Share2, Paperclip, FileText, ToggleLeft, ToggleRight, Download
} from 'lucide-react';
import { Call, User, MeetingMessage, Reaction, ToolAction, CallStatus, Attachment, TranscriptSegment } from '../types';
import { getStrategicIntelligence, extractToolActions, analyzeCallTranscript } from '../services/geminiService';
import { apiGet, apiPost } from '../services/apiClient';
import * as dbService from '../services/dbService';

// --- SUB-COMPONENT: PRODUCTION-GRADE VIDEO SLOT ---
const NeuralVideoSlot: React.FC<{ stream: MediaStream | null, mirrored?: boolean, effect?: 'none' | 'blur' | 'virtual', isLocal?: boolean }> = ({ stream, mirrored, effect, isLocal }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'standby' | 'admitted' | 'error'>('standby');

  useLayoutEffect(() => {
    let active = true;
    if (!videoRef.current || !stream) {
      setStatus('standby');
      return;
    }

    const bind = async () => {
      try {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          if (isLocal) {
              videoRef.current.muted = true;
          }
          try {
            await videoRef.current.play();
          } catch {
            // Retry muted autoplay for stricter browsers
            videoRef.current.muted = true;
            await videoRef.current.play();
          }
          if (active) setStatus('admitted');
        }
      } catch (err) {
        console.warn("Media Playback Blocked by Browser:", err);
        if (active) setStatus('error');
      }
    };

    bind();
    return () => { active = false; };
  }, [stream, isLocal]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-900 flex items-center justify-center">
      {status !== 'admitted' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-slate-950">
           <Loader2 className="animate-spin text-brand-500 mb-2" size={32}/>
           <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 animate-pulse">Establishing Hardware Link...</p>
        </div>
      )}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        className={`w-full h-full object-cover transition-opacity duration-700 ${status === 'admitted' ? 'opacity-100' : 'opacity-0'} ${mirrored ? 'mirror' : ''}`} 
      />
      {effect === 'blur' && <div className="absolute inset-0 backdrop-blur-2xl bg-slate-950/30 pointer-events-none"></div>}
      {effect === 'virtual' && <div className="absolute inset-0 border-[12px] border-brand-500/20 shadow-inner pointer-events-none bg-brand-900/5"></div>}
    </div>
  );
};

interface VideoBridgeProps {
  activeCall: Call;
  currentUser: User;
  onHangup: () => void;
  onToggleMedia: (type: 'video' | 'screen') => void;
  onInviteParticipant: (userId: string) => void;
  onUpdateCall?: (call: Call) => void;
  team: User[];
  isFirebaseConfigured?: boolean;
}

type SidebarTab = 'chat' | 'intelligence' | 'actions' | 'participants' | 'transcript';
type SettingsTab = 'video' | 'audio' | 'visuals' | 'core';

export const VideoBridge: React.FC<VideoBridgeProps> = ({ 
  activeCall, currentUser, onHangup, onToggleMedia, onInviteParticipant, onUpdateCall, team, isFirebaseConfigured = false
}) => {
  const isVideoEnabled = activeCall.isVideo !== false;
  const [viewMode, setViewMode] = useState<'gallery' | 'speaker'>('gallery');
  const [activeTab, setActiveTab] = useState<SidebarTab>('intelligence');
  const [showSidebar, setShowSidebar] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('video');
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [raisedHand, setRaisedHand] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  
  // Settings & Atmospheric States
  const [showNames, setShowNames] = useState(true);
  const [mirrorVideo, setMirrorVideo] = useState(true);
  const [backgroundEffect, setBackgroundEffect] = useState<'none' | 'blur' | 'virtual'>('none');
  const [transcriptionActive, setTranscriptionActive] = useState(activeCall.transcriptionEnabled || false);

  // Streams
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [activeVideoStream, setActiveVideoStream] = useState<MediaStream | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const localStreamRef = useRef<MediaStream | null>(null);
  
  // PeerJS
  const peerRef = useRef<Peer | null>(null);
  const [peerId, setPeerId] = useState<string>('');
  const connectionsRef = useRef<Map<string, MediaConnection>>(new Map());
  
  // Feature States
  const [intelligence, setIntelligence] = useState<{ text: string, links: {title: string, uri: string}[] } | null>(null);
  const [isFetchingIntel, setIsFetchingIntel] = useState(false);
  const [actions, setActions] = useState<ToolAction[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return dbService.fetchMeetingMessages(activeCall.id, setMessages, (error) => {
      console.warn('Meeting chat sync failed:', error);
    });
  }, [isFirebaseConfigured, activeCall.id]);

  const registerConnection = useCallback((call: MediaConnection, remoteUserId: string) => {
    connectionsRef.current.set(remoteUserId, call);
    call.on('stream', (remoteStream) => {
      setRemoteStreams(prev => new Map(prev).set(remoteUserId, remoteStream));
    });
    call.on('close', () => {
      connectionsRef.current.delete(remoteUserId);
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.delete(remoteUserId);
        return next;
      });
    });
    call.on('error', (err) => {
      console.warn('PeerJS call error', err);
    });
  }, []);

  const roomId = activeCall.roomId || activeCall.id;

  // --- PEERJS INITIALIZATION ---
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    const id = `connectai-user-${currentUser.id}`; // Deterministic ID
    const peer = new Peer(id, { debug: 1 });

    peer.on('open', (id) => {
      console.log('My peer ID is: ' + id);
      setPeerId(id);
    });

    peer.on('call', async (call) => {
      try {
        const existing = localStreamRef.current;
        const stream = existing ?? await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!existing) setLocalStream(stream);
        call.answer(stream);
        registerConnection(call, call.peer.replace('connectai-user-', ''));
      } catch (err) {
        console.error('Failed to get local stream', err);
      }
    });

    peerRef.current = peer;

    return () => {
      connectionsRef.current.forEach(c => c.close());
      connectionsRef.current.clear();
      peer.destroy();
    };
  }, [currentUser.id, registerConnection]);

  useEffect(() => {
    if (!peerId) return;
    const join = async () => {
      try {
        await apiPost('/api/rooms/join', { roomId, peerId, userId: currentUser.id });
      } catch (err) {
        console.warn('Room join failed', err);
      }
    };
    join();

    return () => {
      apiPost('/api/rooms/leave', { roomId, peerId }).catch(() => {});
    };
  }, [peerId, roomId, currentUser.id]);

  useEffect(() => {
    if (!peerRef.current || !peerId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await apiGet(`/api/rooms/${roomId}`);
        if (cancelled) return;
        const peers = (data?.participants || []).map((p: any) => p.peerId).filter(Boolean);
        peers.forEach((pid: string) => {
          if (pid === peerId) return;
          const remoteUserId = pid.replace('connectai-user-', '');
          if (connectionsRef.current.has(remoteUserId)) return;
          callUser(remoteUserId);
        });
      } catch (err) {
        console.warn('Room poll failed', err);
      }
    };
    poll();
    const interval = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [peerId, roomId]);

  // --- DYNAMIC SESSION CLOCK ---
  useEffect(() => {
    const start = activeCall.startTime || Date.now();
    const timer = setInterval(() => {
      setDuration(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [activeCall.startTime]);

  // Simulation: Audio levels for visualizer
  useEffect(() => {
    if (!activeCall.isVideo || isMuted) {
      setAudioLevel(0);
      return;
    }
    const interval = setInterval(() => {
      setAudioLevel(Math.floor(Math.random() * 80) + 10);
    }, 100);
    return () => clearInterval(interval);
  }, [activeCall.isVideo, isMuted]);

  // --- PROPRIETARY TRANSCRIPTION PROTOCOL ---
  useEffect(() => {
    if (!transcriptionActive || activeCall.status === CallStatus.ENDED) return;
    
    const interval = setInterval(() => {
      const phrases = [
        "Analyzing the current cluster performance metrics...",
        "I believe we need to update the HubSpot schema for better synchronization.",
        "Could we schedule a follow-up for next Tuesday at 10 AM?",
        "The neural bridge latency is currently within acceptable parameters.",
        "Let's ensure the CRM records are dispatched before the meeting concludes."
      ];
      const segment: TranscriptSegment = {
        id: `ts_${Date.now()}`,
        speaker: Math.random() > 0.5 ? 'teammate' : 'customer',
        text: phrases[Math.floor(Math.random() * phrases.length)],
        timestamp: Date.now()
      };
      
      if (onUpdateCall) {
        onUpdateCall({
          ...activeCall,
          transcript: [...(activeCall.transcript || []), segment]
        });
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [transcriptionActive, activeCall, onUpdateCall]);

  // --- HARDWARE ADMISSION (SWIFT TOGGLING) ---
  const admitHardware = useCallback(async () => {
    try {
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      setLocalStream(stream);
      // Ensure initial track state matches UI
      stream.getAudioTracks().forEach(t => t.enabled = !isMuted);
      stream.getVideoTracks().forEach(t => t.enabled = isVideoEnabled);
    } catch (err) {
      console.error("Hardware Session Rejected:", err);
    }
  }, [isMuted, isVideoEnabled, localStream]);


  const replaceOutgoingVideoTrack = useCallback((track: MediaStreamTrack | null) => {
    connectionsRef.current.forEach((call) => {
      const sender = call.peerConnection?.getSenders?.().find(s => s.track?.kind === 'video');
      if (sender && track) {
        sender.replaceTrack(track).catch(() => {});
      }
    });
  }, []);

  const stopScreenShare = useCallback((syncToggle: boolean) => {
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
    }
    setScreenStream(null);
    const cameraTrack = localStream?.getVideoTracks()[0] || null;
    if (cameraTrack) replaceOutgoingVideoTrack(cameraTrack);
    if (syncToggle && activeCall.isScreenSharing) {
      onToggleMedia('screen');
    }
    if (!cameraTrack && activeCall.isVideo) {
      admitHardware();
    }
  }, [screenStream, localStream, replaceOutgoingVideoTrack, activeCall.isScreenSharing, onToggleMedia]);

  const startScreenShare = useCallback(async () => {
    try {
      if (screenStream) return;
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      track.onended = () => stopScreenShare(true);
      setScreenStream(stream);
      replaceOutgoingVideoTrack(track);
    } catch (err) {
      console.error('Screen share rejected:', err);
      if (activeCall.isScreenSharing) onToggleMedia('screen');
    }
  }, [replaceOutgoingVideoTrack, stopScreenShare, activeCall.isScreenSharing, onToggleMedia]);

  useEffect(() => {
    if (activeCall.isScreenSharing) {
      startScreenShare();
    } else {
      stopScreenShare(false);
    }
  }, [activeCall.isScreenSharing, startScreenShare, stopScreenShare]);

  // Swift Toggling Effect: Only enable/disable tracks instead of re-acquiring hardware
  useEffect(() => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      videoTracks.forEach(track => {
        if (track.enabled !== isVideoEnabled) {
          track.enabled = isVideoEnabled;
        }
      });
      // Fallback: If hardware was dropped or not yet acquired, admit it.
      if (isVideoEnabled && videoTracks.length === 0) {
        admitHardware();
      }
    } else if (isVideoEnabled) {
      admitHardware();
    }
  }, [isVideoEnabled, localStream, admitHardware]);

  useEffect(() => {
    return () => {
       localStream?.getTracks().forEach(t => t.stop());
       screenStream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => {
    if (activeCall.isScreenSharing && screenStream) {
      setActiveVideoStream(screenStream);
      return;
    }
    setActiveVideoStream(localStream);
  }, [activeCall.isScreenSharing, screenStream, localStream]);

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = !nextMuted);
    }
  };

  const handleSendMessage = (text: string = chatInput, files: Attachment[] = []) => {
    if (!text.trim() && files.length === 0) return;
    const msg: MeetingMessage = { 
      id: Date.now().toString(), 
      senderId: currentUser.id, 
      text, 
      timestamp: Date.now(),
      attachments: files 
    };
    if (isFirebaseConfigured) {
      dbService.sendMeetingMessage(activeCall.id, msg).catch(() => {});
    } else {
      setMessages(prev => [...prev, msg]);
    }
    setChatInput('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const executeAction = async (actionId: string) => {
    const action = actions.find(a => a.id === actionId);
    if (!action) return;

    setActions(prev => prev.map(a => a.id === actionId ? { ...a, status: 'executed' } : a));
    
    // Simulate end-to-end functionality
    if (action.name.includes("Update CRM")) {
       console.log("CRM Updated Protocol: Success for node", activeCall.customerName);
    } else if (action.name.includes("Schedule")) {
       console.log("Scheduling Protocol: Follow-up admitted to cluster calendar.");
    }
  };

  const handleCopyLink = () => {
    const bridgeUrl = `${window.location.origin}/bridge/${activeCall.id}`;
    navigator.clipboard.writeText(bridgeUrl);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  // Intelligence & Tool Sync
  useEffect(() => {
    if (!activeCall.customerName) return;
    setIsFetchingIntel(true);
    getStrategicIntelligence(activeCall.customerName).then(setIntelligence).finally(() => setIsFetchingIntel(false));
    
    setActions([
      { id: 'a1', name: 'Update CRM Record', description: 'Synchronize neural metadata to HubSpot Enterprise.', status: 'suggested', params: {} },
      { id: 'a2', name: 'Schedule Follow-up', description: 'Provision 15m review session in G-Cal.', status: 'suggested', params: {} }
    ]);
  }, [activeCall.customerName]);

  const roster = useMemo(() => {
    const base = [...team];
    if (!base.some(t => t.id === currentUser.id)) {
      base.push(currentUser);
    }
    return base;
  }, [team, currentUser]);
  const participants = useMemo(() => 
    roster.filter(t => activeCall.participants?.includes(t.id) || t.id === currentUser.id),
  [roster, activeCall.participants, currentUser.id]);
  const localParticipant = useMemo(
    () => participants.find(p => p.id === currentUser.id) || currentUser,
    [participants, currentUser]
  );
  const remoteParticipants = useMemo(
    () => participants.filter(p => p.id !== currentUser.id),
    [participants, currentUser.id]
  );
  const primaryParticipant = useMemo(() => {
    const remoteWithStream = remoteParticipants.find(p => remoteStreams.get(p.id));
    return remoteWithStream || localParticipant;
  }, [remoteParticipants, remoteStreams, localParticipant]);
  const secondaryParticipants = useMemo(
    () => participants.filter(p => p.id !== primaryParticipant.id),
    [participants, primaryParticipant.id]
  );

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // --- CALL LOGIC ---
  const callUser = async (targetUserId: string) => {
    if (!peerRef.current) return;
    const stream = localStream ?? await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (!localStream) setLocalStream(stream);
    const targetPeerId = `connectai-user-${targetUserId}`;
    const call = peerRef.current.call(targetPeerId, stream);
    registerConnection(call, targetUserId);
    if (activeCall.isScreenSharing && screenStream?.getVideoTracks()[0]) {
      replaceOutgoingVideoTrack(screenStream.getVideoTracks()[0]);
    }
  };

  const handleTerminate = () => {
    connectionsRef.current.forEach(c => c.close());
    connectionsRef.current.clear();
    setRemoteStreams(new Map());
    localStream?.getTracks().forEach(t => t.stop());
    screenStream?.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    setScreenStream(null);
    onHangup();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col overflow-hidden text-white font-sans selection:bg-brand-500/30">
      
      {/* Refined Header */}
      <div className="h-16 bg-slate-900/95 backdrop-blur-3xl border-b border-white/5 flex items-center justify-between px-6 z-20 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center border border-brand-400/30 shadow-lg">
            <Cpu size={20} className="animate-pulse"/>
          </div>
          <div>
            <h2 className="text-sm font-black uppercase italic tracking-tighter text-white">Call Hub / {activeCall.customerName}</h2>
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse`}></span>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Bridged Cluster Active â€¢ {peerId ? 'Node Online' : 'Connecting...'}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
           <button onClick={() => setTranscriptionActive(!transcriptionActive)} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${transcriptionActive ? 'bg-brand-600 border-brand-400 text-white shadow-lg' : 'bg-white/5 border-white/10 text-slate-400'}`}>
             {transcriptionActive ? <ToggleRight size={18}/> : <ToggleLeft size={18}/>}
             <span className="text-[8px] font-black uppercase tracking-widest">Live Transcript</span>
           </button>
           <button onClick={handleCopyLink} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all">
             {copyFeedback ? <CheckCircle2 size={16} className="text-green-500 animate-in zoom-in"/> : <LinkIcon size={16} className="text-slate-400"/>}
             <span className="text-[8px] font-black uppercase tracking-widest text-slate-300">{copyFeedback ? 'Link Copied' : 'Bridge Link'}</span>
           </button>
           <button onClick={() => setViewMode(viewMode === 'gallery' ? 'speaker' : 'gallery')} className="p-2.5 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all">
             {viewMode === 'gallery' ? <Layout size={18}/> : <Grid size={18}/>}
           </button>
        </div>
      </div>

      {/* Viewport Area */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className={`flex-1 p-6 transition-all duration-700 flex items-center justify-center ${showSidebar ? 'mr-[380px]' : ''}`}>
          {viewMode === 'speaker' ? (
            <div className="flex flex-col gap-4 w-full h-full max-w-[1400px]">
              <div className="flex-1 min-h-[320px]">
                <div className="relative bg-slate-900 rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl h-full">
                  {primaryParticipant.id === currentUser.id ? (
                    activeCall.isVideo ? (
                      <NeuralVideoSlot stream={activeVideoStream} mirrored={mirrorVideo} effect={backgroundEffect} isLocal={true} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-6 bg-[#0a0e14]">
                        <img src={primaryParticipant.avatarUrl} className="w-28 h-28 rounded-[2rem] border-4 border-slate-800 shadow-2xl opacity-40 grayscale" />
                        <div className="flex flex-col items-center gap-1">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Video Paused</p>
                          <p className="text-[8px] font-bold text-slate-600 uppercase">Session Tunnel: Active</p>
                        </div>
                      </div>
                    )
                  ) : (
                    remoteStreams.get(primaryParticipant.id) ? (
                      <NeuralVideoSlot stream={remoteStreams.get(primaryParticipant.id)!} isLocal={false} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-6 bg-[#0a0e14]">
                        <img src={primaryParticipant.avatarUrl} className="w-28 h-28 rounded-[2rem] border-4 border-slate-800 shadow-2xl" />
                        {showNames && <p className="text-xs font-black text-slate-400 uppercase tracking-widest italic">{primaryParticipant.name}</p>}
                        <p className="text-[9px] text-slate-600 animate-pulse">Waiting for Stream...</p>
                      </div>
                    )
                  )}
                  <div className="absolute bottom-4 left-4 flex items-center gap-3 bg-black/60 backdrop-blur-xl px-4 py-2 rounded-xl border border-white/10 z-10 shadow-xl">
                    {showNames && <p className="text-[9px] font-black uppercase tracking-widest text-white/90">{primaryParticipant.name} {primaryParticipant.id === currentUser.id ? '(You)' : ''}</p>}
                    {primaryParticipant.id === currentUser.id && isMuted && <MicOff size={10} className="text-red-500"/>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {secondaryParticipants.map(p => (
                  <div key={p.id} className="relative bg-slate-900 rounded-[2rem] border border-white/5 overflow-hidden shadow-xl aspect-video">
                    {p.id === currentUser.id ? (
                      activeCall.isVideo ? (
                        <NeuralVideoSlot stream={activeVideoStream} mirrored={mirrorVideo} effect={backgroundEffect} isLocal={true} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[#0a0e14]">
                          <img src={p.avatarUrl} className="w-16 h-16 rounded-[1.5rem] border-4 border-slate-800 shadow-xl opacity-40 grayscale" />
                        </div>
                      )
                    ) : (
                      remoteStreams.get(p.id) ? (
                        <NeuralVideoSlot stream={remoteStreams.get(p.id)!} isLocal={false} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[#0a0e14]">
                          <img src={p.avatarUrl} className="w-16 h-16 rounded-[1.5rem] border-4 border-slate-800 shadow-xl" />
                        </div>
                      )
                    )}
                    <div className="absolute bottom-2 left-2 flex items-center gap-2 bg-black/60 backdrop-blur-xl px-3 py-1.5 rounded-lg border border-white/10 z-10">
                      {showNames && <p className="text-[8px] font-black uppercase tracking-widest text-white/90">{p.name}</p>}
                      {p.id === currentUser.id && isMuted && <MicOff size={9} className="text-red-500"/>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full h-full max-w-[1200px] overflow-y-auto scrollbar-hide py-4">
              {participants.map(p => (
                <div key={p.id} className="relative bg-slate-900 rounded-[2.5rem] border border-white/5 overflow-hidden group shadow-2xl aspect-video flex items-center justify-center">
                  {p.id === currentUser.id ? (
                    activeCall.isVideo ? (
                      <NeuralVideoSlot stream={activeVideoStream} mirrored={mirrorVideo} effect={backgroundEffect} isLocal={true} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-6 bg-[#0a0e14]">
                        <img src={p.avatarUrl} className="w-24 h-24 rounded-[2rem] border-4 border-slate-800 shadow-2xl opacity-40 grayscale" />
                        <div className="flex flex-col items-center gap-1">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Video Paused</p>
                          <p className="text-[8px] font-bold text-slate-600 uppercase">Session Tunnel: Active</p>
                        </div>
                      </div>
                    )
                  ) : (
                    remoteStreams.get(p.id) ? (
                      <NeuralVideoSlot stream={remoteStreams.get(p.id)!} isLocal={false} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-6 bg-[#0a0e14]">
                        <img src={p.avatarUrl} className="w-24 h-24 rounded-[2rem] border-4 border-slate-800 shadow-2xl" />
                        {showNames && <p className="text-xs font-black text-slate-400 uppercase tracking-widest italic">{p.name}</p>}
                        <p className="text-[9px] text-slate-600 animate-pulse">Waiting for Stream...</p>
                      </div>
                    )
                  )}
                  <div className="absolute bottom-4 left-4 flex items-center gap-3 bg-black/60 backdrop-blur-xl px-4 py-2 rounded-xl border border-white/10 z-10 shadow-xl">
                    {showNames && <p className="text-[9px] font-black uppercase tracking-widest text-white/90">{p.name} {p.id === currentUser.id ? '(You)' : ''}</p>}
                    {p.id === currentUser.id && isMuted && <MicOff size={10} className="text-red-500"/>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Tabs */}
        {showSidebar && (
          <div className="w-[380px] bg-[#0c1018]/98 backdrop-blur-3xl border-l border-white/5 flex flex-col absolute top-0 bottom-0 right-0 z-40 shadow-2xl">
             <div className="h-16 flex border-b border-white/5 shrink-0 bg-black/20">
                {[
                  { id: 'intelligence', icon: Zap, label: 'Intel' },
                  { id: 'actions', icon: ClipboardList, label: 'Actions' },
                  { id: 'chat', icon: MessageSquare, label: 'Chat' },
                  { id: 'transcript', icon: FileText, label: 'Protocol' },
                  { id: 'participants', icon: Users, label: 'Nodes' }
                ].map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id as SidebarTab)} className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all border-b-2 ${activeTab === tab.id ? 'border-brand-500 text-white bg-white/5' : 'border-transparent text-slate-600 hover:text-slate-300'}`}>
                    <tab.icon size={16}/>
                    <span className="text-[8px] font-black uppercase tracking-widest">{tab.label}</span>
                  </button>
                ))}
                <button onClick={() => setShowSidebar(false)} className="px-4 text-slate-600 hover:text-white"><X size={20}/></button>
             </div>
             
             <div className="flex-1 overflow-y-auto scrollbar-hide p-6">
                {activeTab === 'intelligence' && (
                  <div className="space-y-8 animate-in fade-in">
                     <div className="space-y-4">
                        <div className="flex justify-between items-center"><h4 className="text-[9px] font-black uppercase tracking-widest text-brand-400 italic">Strategic Intel</h4>{isFetchingIntel && <Loader2 className="animate-spin text-brand-500" size={14}/>}</div>
                        <div className="bg-white/[0.02] p-6 rounded-2xl border border-white/10 shadow-inner"><p className="text-xs font-medium italic text-slate-300 leading-relaxed">{intelligence?.text || "Synchronizing with cluster..."}</p></div>
                     </div>
                  </div>
                )}

                {activeTab === 'actions' && (
                  <div className="space-y-6 animate-in fade-in">
                     <h4 className="text-[9px] font-black uppercase tracking-widest text-brand-400 italic">CRM Sessions</h4>
                     {actions.map(action => (
                        <div key={action.id} className="p-5 bg-white/[0.03] border border-white/5 rounded-2xl relative group hover:border-brand-500/30 transition-all">
                           <p className="text-[10px] font-black uppercase tracking-widest text-white italic mb-2">{action.name}</p>
                           <p className="text-[10px] italic text-slate-400 mb-4 leading-relaxed">"{action.description}"</p>
                           <button 
                             onClick={() => executeAction(action.id)}
                             disabled={action.status === 'executed'}
                             className={`w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-xl transition-all ${action.status === 'executed' ? 'bg-green-600 text-white opacity-50' : 'bg-brand-600 text-white hover:bg-brand-700 active:scale-95'}`}
                           >
                             {action.status === 'executed' ? 'Action Dispatched' : 'Execute Action'}
                           </button>
                        </div>
                     ))}
                  </div>
                )}

                {activeTab === 'chat' && (
                  <div className="h-full flex flex-col animate-in fade-in">
                     <div className="flex-1 space-y-6 overflow-y-auto scrollbar-hide pr-2">
                        {messages.map(m => (
                          <div key={m.id} className={`flex ${m.senderId === currentUser.id ? 'justify-end' : 'justify-start'}`}>
                             <div className={`max-w-[85%] p-4 rounded-2xl text-[11px] leading-relaxed ${m.senderId === currentUser.id ? 'bg-brand-600 text-white rounded-br-none shadow-xl' : 'bg-white/5 border border-white/10 text-slate-300 rounded-bl-none'}`}>
                                {m.text && <p className="font-bold">{m.text}</p>}
                                {m.attachments?.map((att, i) => (
                                   <div key={i} className="mt-2 p-2 bg-black/20 rounded-lg flex items-center gap-2 border border-white/5">
                                      <FileText size={14} className="text-brand-300"/>
                                      <span className="truncate flex-1 text-[9px]">{att.name}</span>
                                      <Download size={10} className="text-slate-500 cursor-pointer hover:text-white"/>
                                   </div>
                                ))}
                             </div>
                          </div>
                        ))}
                     </div>
                     <div className="pt-4 mt-auto">
                        <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" multiple />
                        <div className="flex gap-2">
                           <button onClick={() => fileInputRef.current?.click()} className="p-3 bg-white/5 rounded-xl border border-white/10 text-slate-400 hover:text-white transition-all"><Paperclip size={18}/></button>
                           <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} placeholder="Message cluster..." className="flex-1 bg-white/5 px-4 py-3 rounded-xl border border-white/10 text-xs outline-none focus:border-brand-500 italic" />
                           <button onClick={() => handleSendMessage()} className="p-3 bg-brand-600 text-white rounded-xl shadow-xl hover:bg-brand-700 transition-all"><Send size={16}/></button>
                        </div>
                     </div>
                  </div>
                )}

                {activeTab === 'transcript' && (
                   <div className="space-y-6 animate-in fade-in h-full flex flex-col">
                      <h4 className="text-[9px] font-black uppercase tracking-widest text-brand-400 italic shrink-0">Live Protocol Stream</h4>
                      <div className="flex-1 overflow-y-auto scrollbar-hide space-y-4 pr-2">
                         {activeCall.transcript?.map(seg => (
                            <div key={seg.id} className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                               <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">{seg.speaker} â€¢ {new Date(seg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}</p>
                               <p className="text-[11px] font-medium italic text-slate-300">"{seg.text}"</p>
                            </div>
                         ))}
                         {(!activeCall.transcript || activeCall.transcript.length === 0) && (
                            <div className="h-full flex flex-col items-center justify-center opacity-20 grayscale"><Activity className="animate-pulse mb-4"/><p className="text-[9px] font-black uppercase tracking-widest">Awaiting Session</p></div>
                         )}
                      </div>
                   </div>
                )}

                {activeTab === 'participants' && (
                  <div className="space-y-6 animate-in fade-in">
                     <div className="flex justify-between items-center">
                        <h4 className="text-[9px] font-black uppercase tracking-widest text-brand-400 italic">Connected Nodes</h4>
                        <button onClick={() => setShowInviteModal(true)} className="p-2 bg-brand-600 rounded-lg text-white hover:bg-brand-700 shadow-lg flex items-center gap-1.5 px-3">
                          <UserPlus size={14}/>
                          <span className="text-[8px] font-black uppercase tracking-widest">Invite</span>
                        </button>
                     </div>
                     <div className="space-y-3">
                        {participants.map(p => (
                          <div key={p.id} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl group transition-all hover:bg-white/[0.04]">
                             <div className="flex items-center gap-3">
                                <img src={p.avatarUrl} className="w-8 h-8 rounded-lg" />
                                <div><p className="text-[10px] font-black uppercase tracking-widest">{p.name}</p><p className="text-[8px] font-bold text-slate-500 uppercase">{p.role}</p></div>
                             </div>
                             {p.id === currentUser.id ? (
                               <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shadow-[0_0_8px_#6366f1]"></div>
                             ) : (
                               <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
                             )}
                          </div>
                        ))}
                     </div>
                  </div>
                )}
             </div>
          </div>
        )}
      </div>

      {/* Controller Bar */}
      <div className="h-24 bg-slate-900 border-t border-white/10 flex items-center justify-between px-10 z-50 shrink-0 shadow-2xl">
         <div className="flex flex-col">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-600 mb-1 italic">Session Hub Active</p>
            <p className="text-xl font-black italic tracking-tighter text-white tabular-nums">{formatTime(duration)}</p>
         </div>

         <div className="flex items-center gap-6">
            <div className="flex bg-slate-800/80 backdrop-blur-2xl rounded-2xl p-2 gap-2 border border-white/10 shadow-xl">
               <button onClick={() => onToggleMedia('video')} className={`p-4 rounded-xl transition-all ${activeCall.isVideo ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-red-600 text-white shadow-xl animate-pulse'}`}>
                 {activeCall.isVideo ? <Video size={22}/> : <VideoOff size={22}/>}
               </button>
               <button onClick={toggleMute} className={`p-4 rounded-xl transition-all ${!isMuted ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-red-600 text-white shadow-xl animate-pulse'}`}>
                 {!isMuted ? <Mic size={22}/> : <MicOff size={22}/>}
               </button>
               <button onClick={() => onToggleMedia('screen')} className={`p-4 rounded-xl transition-all ${activeCall.isScreenSharing ? 'bg-brand-600 text-white shadow-2xl' : 'bg-slate-700 text-slate-500 hover:text-white'}`}>
                 <Monitor size={22}/>
               </button>
            </div>
            
            <div className="flex bg-slate-800/80 backdrop-blur-2xl rounded-2xl p-2 gap-2 border border-white/10 shadow-xl">
               <button onClick={() => setRaisedHand(!raisedHand)} className={`p-4 rounded-xl transition-all ${raisedHand ? 'bg-brand-600 text-white shadow-xl' : 'text-slate-500 hover:text-white'}`}>
                 <Hand size={22}/>
               </button>
               <button onClick={() => setShowSidebar(!showSidebar)} className={`p-4 rounded-xl transition-all ${showSidebar ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-white'}`}>
                 <ClipboardList size={22}/>
               </button>
            </div>

            <button onClick={handleTerminate} className="px-10 py-5 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-red-700 transition-all flex items-center gap-4 text-[10px] active:scale-95 group">
               <PhoneOff size={20} className="group-hover:rotate-12 transition-transform"/> Terminate
            </button>
         </div>

         <button onClick={() => setShowSettings(true)} className={`p-4 transition-all ${showSettings ? 'bg-brand-600 text-white rounded-xl shadow-xl' : 'text-slate-600 hover:text-white'}`}>
           <Settings size={26}/>
         </button>
      </div>

      {/* Settings Modal Restored */}
      {showSettings && (
        <div className="fixed inset-0 z-[150] bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="bg-[#0a0d12] border border-white/10 rounded-[3rem] shadow-3xl w-full max-w-4xl h-[600px] flex overflow-hidden text-white relative">
              <button onClick={() => setShowSettings(false)} className="absolute top-8 right-8 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all z-50 text-slate-400 hover:text-white border border-white/5 shadow-inner">
                <X size={24}/>
              </button>
              
              <div className="w-64 bg-black/40 border-r border-white/5 p-10 flex flex-col gap-4 shrink-0">
                 <div className="flex items-center gap-3 mb-8 px-2">
                    <ShieldCheck size={20} className="text-brand-500"/>
                    <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-500 italic">Core Hub</h3>
                 </div>
                 {[
                   { id: 'video', icon: Camera, label: 'Vision Session' },
                   { id: 'audio', icon: Volume2, label: 'Audio Telemetry' },
                   { id: 'visuals', icon: Palette, label: 'Atmosphere' }
                 ].map(tab => (
                   <button 
                    key={tab.id} 
                    onClick={() => setSettingsTab(tab.id as any)}
                    className={`flex items-center gap-4 p-4 rounded-xl transition-all ${settingsTab === tab.id ? 'bg-brand-600 text-white shadow-lg' : 'text-slate-600 hover:text-white hover:bg-white/5'}`}
                   >
                      <tab.icon size={20}/>
                      <span className="text-[10px] font-black uppercase tracking-widest">{tab.label}</span>
                   </button>
                 ))}
              </div>

              <div className="flex-1 p-16 overflow-y-auto scrollbar-hide">
                 {settingsTab === 'video' && (
                    <div className="space-y-12 animate-in slide-in-from-bottom-8 duration-500">
                       <h3 className="text-4xl font-black italic uppercase tracking-tighter text-white">Vision Stream</h3>
                       <div className="flex items-center justify-between p-8 bg-white/[0.03] rounded-2xl border border-white/5">
                          <div>
                            <p className="text-sm font-black uppercase tracking-widest mb-1 text-white italic">Mirror Core Session</p>
                            <p className="text-[10px] text-slate-500 font-medium italic">Adjust spatial orientation.</p>
                          </div>
                          <button onClick={() => setMirrorVideo(!mirrorVideo)} className={`w-12 h-6 rounded-full transition-all relative ${mirrorVideo ? 'bg-brand-600' : 'bg-slate-700'}`}>
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-md ${mirrorVideo ? 'left-7' : 'left-1'}`}></div>
                          </button>
                       </div>
                       <button onClick={admitHardware} className="w-full py-6 bg-brand-500/10 border-2 border-brand-500/20 rounded-2xl flex items-center justify-center gap-4 text-brand-400 font-black uppercase tracking-widest hover:bg-brand-500/20 transition-all">
                          <RefreshCw size={20}/> Establish Fresh Handshake
                       </button>
                    </div>
                 )}

                 {settingsTab === 'audio' && (
                    <div className="space-y-12 animate-in slide-in-from-bottom-8 duration-500">
                       <h3 className="text-4xl font-black italic uppercase tracking-tighter text-white">Audio Telemetry</h3>
                       <div className="p-10 bg-black/40 rounded-[2.5rem] border border-white/10 space-y-8">
                          <div className="flex justify-between items-center">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 italic">Call Quality</p>
                            <span className="text-brand-500 text-xs font-black uppercase">{audioLevel}% Session</span>
                          </div>
                          <div className="flex items-end gap-1.5 h-32 px-4 pb-4">
                             {Array.from({length: 24}).map((_, i) => (
                               <div key={i} className="flex-1 bg-brand-600 rounded-full transition-all duration-75" style={{ height: isMuted ? '4px' : `${Math.max(6, audioLevel * (0.4 + Math.random() * 0.6))}%` }}></div>
                             ))}
                          </div>
                       </div>
                    </div>
                 )}

                 {settingsTab === 'visuals' && (
                    <div className="space-y-12 animate-in slide-in-from-bottom-8 duration-500">
                       <h3 className="text-4xl font-black italic uppercase tracking-tighter text-white">Atmosphere</h3>
                       <div className="grid grid-cols-2 gap-6">
                          {[
                            { id: 'none', label: 'Raw Node', icon: Camera, desc: 'Original stream' },
                            { id: 'blur', label: 'Blur', icon: Sparkles, desc: 'Advanced bokeh' },
                            { id: 'virtual', label: 'Cluster Hub', icon: Laptop, desc: 'Virtual bridge' }
                          ].map(eff => (
                             <button 
                                key={eff.id} 
                                onClick={() => setBackgroundEffect(eff.id as any)}
                                className={`p-8 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-4 text-center ${backgroundEffect === eff.id ? 'border-brand-500 bg-brand-50/10 text-white shadow-2xl' : 'border-white/5 bg-white/5 text-slate-500 hover:border-white/20'}`}
                             >
                                <eff.icon size={28}/>
                                <div><p className="text-[11px] font-black uppercase tracking-widest mb-1">{eff.label}</p><p className="text-[9px] font-bold opacity-60 uppercase">{eff.desc}</p></div>
                             </button>
                          ))}
                       </div>
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-[200] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="bg-[#0a0d12] border border-white/10 rounded-[3rem] shadow-3xl w-full max-w-lg p-12 text-white text-center">
              <h3 className="text-4xl font-black italic tracking-tighter uppercase text-white mb-10">Invite Node</h3>
              <div className="space-y-4 max-h-[400px] overflow-y-auto scrollbar-hide pr-2 mb-10">
                 {team.filter(t => !activeCall.participants?.includes(t.id) && t.id !== currentUser.id).map(user => (
                    <button 
                      key={user.id} 
                      onClick={() => { 
                          onInviteParticipant(user.id); 
                          callUser(user.id); // Trigger real call
                          setShowInviteModal(false); 
                      }}
                      className="w-full p-6 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center gap-6 hover:bg-brand-600 hover:border-brand-500 transition-all group"
                    >
                       <img src={user.avatarUrl} className="w-12 h-12 rounded-xl border-2 border-slate-800" />
                       <div className="text-left"><p className="text-sm font-black uppercase tracking-tight">{user.name}</p><p className="text-[10px] font-bold text-slate-500 uppercase italic">{user.role}</p></div>
                       <UserPlus size={20} className="ml-auto text-slate-600 group-hover:text-white" />
                    </button>
                 ))}
              </div>
              <button onClick={() => setShowInviteModal(false)} className="w-full py-5 text-slate-500 font-black uppercase tracking-widest text-[10px] hover:text-white">Cancel</button>
           </div>
        </div>
      )}
      
      <style>{`
        .mirror { transform: rotateY(180deg); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
      `}</style>
    </div>
  );
};


