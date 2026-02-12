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
  Network, Command, Link as LinkIcon, Share2, Paperclip, FileText, ToggleLeft, ToggleRight, Download,
  ThumbsUp, Heart, Laugh, MonitorOff, MoreHorizontal, StopCircle, ArrowUp
} from 'lucide-react';
import { Call, User, MeetingMessage, Reaction, ToolAction, CallStatus, Attachment, TranscriptSegment } from '../types';
import { getStrategicIntelligence, extractToolActions, analyzeCallTranscript } from '../services/geminiService';
import { apiGet, apiPost } from '../services/apiClient';
import * as dbService from '../services/dbService';

// --- SUB-COMPONENT: PRODUCTION-GRADE VIDEO SLOT ---
const NeuralVideoSlot: React.FC<{ stream: MediaStream | null, mirrored?: boolean, effect?: 'none' | 'blur' | 'virtual', isLocal?: boolean, label?: string, isMuted?: boolean }> = ({ stream, mirrored, effect, isLocal, label, isMuted }) => {
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
    <div className="relative w-full h-full overflow-hidden bg-[#111] flex items-center justify-center group">
      {status !== 'admitted' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-slate-950">
           <div className="w-16 h-16 rounded-full bg-slate-800 animate-pulse mb-4"></div>
           <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Connecting...</p>
        </div>
      )}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        className={`w-full h-full object-cover transition-transform duration-500 ${status === 'admitted' ? 'opacity-100 scale-100' : 'opacity-0 scale-95'} ${mirrored ? 'mirror' : ''} ${effect === 'blur' ? 'blur-sm scale-105' : ''}`} 
      />
      
      {/* Background Effects Logic */}
      {effect === 'blur' && <div className="absolute inset-0 backdrop-blur-md bg-transparent pointer-events-none"></div>}
      
      {/* Label Overlay */}
      <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-md flex items-center gap-2 border border-white/10 z-20">
         {isMuted && <MicOff size={12} className="text-red-500"/>}
         <span className="text-[10px] font-bold text-white tracking-wide">{label || 'Unknown Node'} {isLocal ? '(You)' : ''}</span>
      </div>

      {/* Speaking Indicator */}
      {!isMuted && !isLocal && (
         <div className="absolute top-4 right-4 w-3 h-3 bg-green-500 rounded-full shadow-[0_0_10px_#22c55e] animate-pulse z-20"></div>
      )}
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
  const [viewMode, setViewMode] = useState<'gallery' | 'speaker' | 'large-gallery'>('gallery');
  const [activeTab, setActiveTab] = useState<SidebarTab>('intelligence');
  const [showSidebar, setShowSidebar] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('video');
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [raisedHand, setRaisedHand] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [flyingEmojis, setFlyingEmojis] = useState<{id: number, emoji: string, left: number}[]>([]);
  
  // Device Management
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('');
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');

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

  // --- DEVICE DISCOVERY ---
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
        setAudioDevices(devices.filter(d => d.kind === 'audioinput'));
      } catch (e) {
        console.warn("Device enumeration failed", e);
      }
    };
    fetchDevices();
    navigator.mediaDevices.addEventListener('devicechange', fetchDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', fetchDevices);
  }, []);

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
    const id = `connectai-user-${currentUser.id}`;
    const peer = new Peer(id, { debug: 1 });

    peer.on('open', (id) => {
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

  // --- DYNAMIC SESSION CLOCK ---
  useEffect(() => {
    const start = activeCall.startTime || Date.now();
    const timer = setInterval(() => {
      setDuration(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [activeCall.startTime]);

  // Audio Visualizer Logic
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

  // --- HARDWARE ADMISSION (ROBUST) ---
  const admitHardware = useCallback(async (deviceId?: string, kind: 'video' | 'audio' = 'video') => {
    try {
      if (localStream) {
         localStream.getTracks().forEach(t => {
             if (deviceId && t.kind === kind.replace('input', '')) t.stop();
             else if (!deviceId) t.stop(); 
         });
      }

      const constraints: MediaStreamConstraints = {
        video: isVideoEnabled ? { 
            deviceId: kind === 'video' && deviceId ? { exact: deviceId } : undefined,
            width: { ideal: 1920 }, 
            height: { ideal: 1080 }, 
            frameRate: { ideal: 30 } 
        } : false,
        audio: { 
            deviceId: kind === 'audio' && deviceId ? { exact: deviceId } : undefined,
            echoCancellation: true, 
            noiseSuppression: true, 
            autoGainControl: true 
        } 
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      
      connectionsRef.current.forEach((call) => {
        const senders = call.peerConnection?.getSenders?.() || [];
        if (videoTrack) {
            const sender = senders.find(s => s.track?.kind === 'video');
            sender?.replaceTrack(videoTrack);
        }
        if (audioTrack) {
            const sender = senders.find(s => s.track?.kind === 'audio');
            sender?.replaceTrack(audioTrack);
        }
      });

    } catch (err) {
      console.error("Hardware Session Rejected:", err);
    }
  }, [isMuted, isVideoEnabled, localStream]);

  // --- ROBUST SCREEN SHARE ---
  const replaceOutgoingVideoTrack = useCallback((track: MediaStreamTrack | null) => {
    connectionsRef.current.forEach((call) => {
      const sender = call.peerConnection?.getSenders?.().find(s => s.track?.kind === 'video');
      if (sender && track) {
        sender.replaceTrack(track).catch(e => console.warn("Track replacement failed", e));
      }
    });
  }, []);

  const stopScreenShare = useCallback(() => {
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
    }
    setScreenStream(null);
    const cameraTrack = localStream?.getVideoTracks()[0] || null;
    if (cameraTrack) replaceOutgoingVideoTrack(cameraTrack);
    
    if (activeCall.isScreenSharing && onToggleMedia) {
        onToggleMedia('screen');
    }
  }, [screenStream, localStream, replaceOutgoingVideoTrack, activeCall.isScreenSharing, onToggleMedia]);

  const startScreenShare = useCallback(async () => {
    try {
      if (screenStream) return;
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { displaySurface: 'monitor' }, 
          audio: true 
      });
      const videoTrack = stream.getVideoTracks()[0];
      
      if (!videoTrack) return;
      
      videoTrack.onended = () => stopScreenShare();
      setScreenStream(stream);
      replaceOutgoingVideoTrack(videoTrack);
      
    } catch (err) {
      console.error('Screen share rejected:', err);
    }
  }, [replaceOutgoingVideoTrack, stopScreenShare, activeCall.isScreenSharing]);

  useEffect(() => {
    if (activeCall.isScreenSharing && !screenStream) {
      startScreenShare();
    } else if (!activeCall.isScreenSharing && screenStream) {
      stopScreenShare();
    }
  }, [activeCall.isScreenSharing, startScreenShare, stopScreenShare, screenStream]);

  // --- REACTIONS ---
  const triggerReaction = (emoji: string) => {
    const id = Date.now();
    setFlyingEmojis(prev => [...prev, { id, emoji, left: Math.random() * 80 + 10 }]);
    setShowReactions(false);
    setTimeout(() => {
        setFlyingEmojis(prev => prev.filter(e => e.id !== id));
    }, 2000);
  };

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
  };

  const handleTerminate = () => {
    stopScreenShare();
    connectionsRef.current.forEach(c => c.close());
    connectionsRef.current.clear();
    setRemoteStreams(new Map());
    localStream?.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    onHangup();
  };

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

  return (
    <div className="fixed inset-0 z-[100] bg-[#111] flex flex-col overflow-hidden text-white font-sans selection:bg-brand-500/30">
      
      {/* 1. Header: Teams Style */}
      <div className="h-14 bg-[#1f1f1f] border-b border-[#333] flex items-center justify-between px-4 z-20 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#292929] rounded-md border border-[#3d3d3d]">
             <ShieldCheck size={14} className="text-green-500"/>
             <span className="text-xs font-semibold text-gray-200">Encrypted</span>
          </div>
          <h2 className="text-sm font-semibold text-gray-100">{activeCall.customerName || 'Ad-Hoc Meeting'}</h2>
          <span className="text-xs text-gray-500 px-2">|</span>
          <span className="text-xs text-gray-400 tabular-nums">{formatTime(duration)}</span>
        </div>

        <div className="flex items-center gap-2">
           <button onClick={() => setViewMode('gallery')} className={`p-2 rounded-md hover:bg-[#333] transition-colors ${viewMode === 'gallery' ? 'bg-[#333] text-white' : 'text-gray-400'}`} title="Gallery View">
             <Grid size={18}/>
           </button>
           <button onClick={() => setViewMode('speaker')} className={`p-2 rounded-md hover:bg-[#333] transition-colors ${viewMode === 'speaker' ? 'bg-[#333] text-white' : 'text-gray-400'}`} title="Speaker View">
             <Layout size={18}/>
           </button>
           <div className="h-6 w-[1px] bg-[#333] mx-2"></div>
           <button onClick={() => setShowSidebar(!showSidebar)} className={`p-2 rounded-md hover:bg-[#333] transition-colors ${showSidebar ? 'bg-[#4f46e5] text-white' : 'text-gray-400'}`}>
             <Users size={18}/>
           </button>
        </div>
      </div>

      {/* 2. Main Stage */}
      <div className="flex-1 flex overflow-hidden relative bg-[#000]">
        
        {/* Screen Share Banner */}
        {activeCall.isScreenSharing && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-red-600/90 backdrop-blur-md px-6 py-2 rounded-full flex items-center gap-3 shadow-2xl border border-red-400/30">
                <Monitor size={16} className="animate-pulse"/>
                <span className="text-xs font-bold uppercase tracking-wider">You are presenting</span>
                <button onClick={stopScreenShare} className="bg-white text-red-600 px-3 py-1 rounded-full text-[10px] font-black hover:bg-gray-100 transition-colors">STOP</button>
            </div>
        )}

        {/* Flying Reactions Layer */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-50">
            {flyingEmojis.map(e => (
                <div key={e.id} className="absolute bottom-20 text-4xl animate-float-up" style={{ left: `${e.left}%` }}>
                    {e.emoji}
                </div>
            ))}
        </div>

        <div className={`flex-1 p-4 transition-all duration-300 flex items-center justify-center ${showSidebar ? 'mr-[320px]' : ''}`}>
          <div className={`grid gap-3 w-full h-full max-h-full transition-all duration-500
             ${participants.length === 1 ? 'grid-cols-1' : ''}
             ${participants.length === 2 ? 'grid-cols-1 md:grid-cols-2' : ''}
             ${participants.length >= 3 && participants.length <= 4 ? 'grid-cols-2' : ''}
             ${participants.length > 4 ? 'grid-cols-2 md:grid-cols-3' : ''}
          `}>
             {participants.map(p => {
                 const isLocal = p.id === currentUser.id;
                 const stream = isLocal ? activeVideoStream : remoteStreams.get(p.id);
                 
                 return (
                    <div key={p.id} className="relative bg-[#1a1a1a] rounded-xl overflow-hidden border border-[#333] shadow-lg group">
                        {stream || (isLocal && activeCall.isVideo) ? (
                            <NeuralVideoSlot 
                                stream={stream || null} 
                                mirrored={isLocal && !activeCall.isScreenSharing && mirrorVideo} 
                                effect={isLocal ? backgroundEffect : 'none'}
                                isLocal={isLocal}
                                label={p.name}
                                isMuted={isLocal ? isMuted : false} 
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                                <div className="w-20 h-20 rounded-full bg-indigo-600 flex items-center justify-center text-2xl font-bold text-white shadow-xl">
                                    {p.name.charAt(0)}
                                </div>
                                <p className="text-sm font-medium text-gray-400">{p.name} {isLocal && '(You)'}</p>
                            </div>
                        )}
                        <div className="absolute top-3 right-3 flex gap-2">
                            {isLocal && isMuted && <div className="p-1.5 bg-black/60 rounded-md backdrop-blur-sm"><MicOff size={14} className="text-red-500"/></div>}
                        </div>
                    </div>
                 );
             })}
          </div>
        </div>

        {/* 3. Sidebar */}
        {showSidebar && (
          <div className="w-[320px] bg-[#1f1f1f] border-l border-[#333] flex flex-col absolute top-0 bottom-0 right-0 z-40 shadow-2xl">
             <div className="flex border-b border-[#333]">
                <button onClick={() => setActiveTab('chat')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider ${activeTab === 'chat' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-gray-400 hover:text-white'}`}>Chat</button>
                <button onClick={() => setActiveTab('participants')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider ${activeTab === 'participants' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-gray-400 hover:text-white'}`}>People ({participants.length})</button>
                <button onClick={() => setActiveTab('intelligence')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider ${activeTab === 'intelligence' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-gray-400 hover:text-white'}`}>AI Intel</button>
             </div>
             <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-700">
                {activeTab === 'chat' && (
                    <div className="flex flex-col h-full">
                        <div className="flex-1 space-y-4 mb-4">
                            {messages.map(m => (
                                <div key={m.id} className={`flex flex-col ${m.senderId === currentUser.id ? 'items-end' : 'items-start'}`}>
                                    <div className={`px-4 py-2 rounded-2xl max-w-[90%] text-sm ${m.senderId === currentUser.id ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-[#333] text-gray-200 rounded-bl-none'}`}>
                                        {m.text}
                                    </div>
                                    <span className="text-[10px] text-gray-500 mt-1">{new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input 
                                className="flex-1 bg-[#2a2a2a] border border-[#333] rounded-full px-4 py-2 text-sm outline-none focus:border-indigo-500 text-white placeholder:text-gray-500"
                                placeholder="Type a message..."
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                            />
                            <button onClick={() => handleSendMessage()} className="p-2 bg-indigo-600 rounded-full text-white hover:bg-indigo-700 transition-colors"><Send size={16}/></button>
                        </div>
                    </div>
                )}
                {activeTab === 'participants' && (
                  <div className="space-y-4">
                     <button onClick={() => setShowInviteModal(true)} className="w-full py-2 bg-[#2a2a2a] rounded-lg text-xs font-bold uppercase tracking-wider text-white hover:bg-[#333] transition-colors border border-[#333] flex items-center justify-center gap-2">
                        <UserPlus size={14}/> Invite Someone
                     </button>
                     <div className="space-y-2">
                        {participants.map(p => (
                          <div key={p.id} className="flex items-center gap-3 p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors">
                             <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">{p.name.charAt(0)}</div>
                             <div className="flex-1">
                                <p className="text-xs font-semibold text-gray-200">{p.name}</p>
                                <p className="text-[10px] text-gray-500 uppercase">{p.role}</p>
                             </div>
                             {p.id === currentUser.id && <span className="text-[10px] text-gray-500">(You)</span>}
                          </div>
                        ))}
                     </div>
                  </div>
                )}
             </div>
          </div>
        )}
      </div>

      {/* 4. Floating Control Bar */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-3 bg-[#222]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
         <div className="flex items-center gap-1 pr-4 border-r border-white/10">
             <span className="text-xs font-bold text-gray-400 tabular-nums">{formatTime(duration)}</span>
         </div>
         <button onClick={toggleMute} className={`p-3 rounded-xl transition-all ${!isMuted ? 'hover:bg-[#333] text-white' : 'bg-red-500/20 text-red-500 border border-red-500/50'}`} title="Toggle Mute">
            {!isMuted ? <Mic size={20}/> : <MicOff size={20}/>}
         </button>
         <button onClick={() => onToggleMedia('video')} className={`p-3 rounded-xl transition-all ${activeCall.isVideo ? 'hover:bg-[#333] text-white' : 'bg-red-500/20 text-red-500 border border-red-500/50'}`} title="Toggle Camera">
            {activeCall.isVideo ? <Video size={20}/> : <VideoOff size={20}/>}
         </button>
         <button onClick={() => onToggleMedia('screen')} className={`p-3 rounded-xl transition-all ${activeCall.isScreenSharing ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'hover:bg-[#333] text-white'}`} title="Share Screen">
            {activeCall.isScreenSharing ? <MonitorOff size={20}/> : <Monitor size={20}/>}
         </button>
         <div className="relative">
             <button onClick={() => setShowReactions(!showReactions)} className="p-3 rounded-xl hover:bg-[#333] text-white transition-all" title="Reactions">
                <Smile size={20}/>
             </button>
             {showReactions && (
                 <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 bg-[#222] border border-[#333] p-2 rounded-full flex gap-2 shadow-xl animate-in slide-in-from-bottom-2">
                     {['👍','❤️','😂','👏','👋'].map(emoji => (
                         <button key={emoji} onClick={() => triggerReaction(emoji)} className="w-8 h-8 flex items-center justify-center hover:bg-[#333] rounded-full text-xl transition-transform hover:scale-125">
                             {emoji}
                         </button>
                     ))}
                 </div>
             )}
         </div>
         <button onClick={() => setShowSettings(true)} className="p-3 rounded-xl hover:bg-[#333] text-white transition-all" title="Device Settings"><Settings size={20}/></button>
         <button onClick={() => setRaisedHand(!raisedHand)} className={`p-3 rounded-xl transition-all ${raisedHand ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/50' : 'hover:bg-[#333] text-white'}`} title="Raise Hand">
            <Hand size={20}/>
         </button>
         <div className="w-[1px] h-6 bg-white/10 mx-2"></div>
         <button onClick={handleTerminate} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg transition-all active:scale-95">Leave</button>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-[#1f1f1f] border border-[#333] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
              <div className="flex items-center justify-between p-6 border-b border-[#333]">
                 <h3 className="text-lg font-bold text-white">Device Settings</h3>
                 <button onClick={() => setShowSettings(false)}><X size={20} className="text-gray-400 hover:text-white"/></button>
              </div>
              <div className="p-6 space-y-6 overflow-y-auto">
                 <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Camera Source</label>
                    <select 
                      value={selectedVideoDevice} 
                      onChange={(e) => { setSelectedVideoDevice(e.target.value); admitHardware(e.target.value, 'video'); }}
                      className="w-full bg-[#2a2a2a] border border-[#333] rounded-lg p-3 text-sm text-white outline-none focus:border-indigo-500"
                    >
                      {videoDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,5)}...`}</option>)}
                    </select>
                 </div>
                 <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Microphone Source</label>
                    <select 
                      value={selectedAudioDevice} 
                      onChange={(e) => { setSelectedAudioDevice(e.target.value); admitHardware(e.target.value, 'audio'); }}
                      className="w-full bg-[#2a2a2a] border border-[#333] rounded-lg p-3 text-sm text-white outline-none focus:border-indigo-500"
                    >
                      {audioDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0,5)}...`}</option>)}
                    </select>
                 </div>
                 <div className="space-y-4 pt-4 border-t border-[#333]">
                    <div className="flex items-center justify-between">
                       <label className="text-sm font-medium text-gray-300">Mirror Video</label>
                       <button onClick={() => setMirrorVideo(!mirrorVideo)} className={`w-10 h-5 rounded-full relative transition-colors ${mirrorVideo ? 'bg-indigo-600' : 'bg-gray-600'}`}>
                          <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${mirrorVideo ? 'left-6' : 'left-1'}`}></div>
                       </button>
                    </div>
                    <div className="flex items-center justify-between">
                       <label className="text-sm font-medium text-gray-300">Background Blur</label>
                       <button onClick={() => setBackgroundEffect(backgroundEffect === 'blur' ? 'none' : 'blur')} className={`w-10 h-5 rounded-full relative transition-colors ${backgroundEffect === 'blur' ? 'bg-indigo-600' : 'bg-gray-600'}`}>
                          <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${backgroundEffect === 'blur' ? 'left-6' : 'left-1'}`}></div>
                       </button>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-[#1f1f1f] border border-[#333] rounded-2xl w-full max-w-md p-6">
              <h3 className="text-lg font-bold text-white mb-4">Invite Participants</h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                 {team.filter(t => !activeCall.participants?.includes(t.id) && t.id !== currentUser.id).map(user => (
                    <button key={user.id} onClick={() => { onInviteParticipant(user.id); callUser(user.id); setShowInviteModal(false); }} className="w-full p-3 bg-[#2a2a2a] rounded-lg flex items-center gap-3 hover:bg-indigo-600 transition-colors group">
                       <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold text-white">{user.name.charAt(0)}</div>
                       <div className="text-left"><p className="text-sm font-bold text-white">{user.name}</p><p className="text-[10px] text-gray-400 group-hover:text-indigo-200">{user.role}</p></div>
                       <Plus size={16} className="ml-auto text-gray-400 group-hover:text-white"/>
                    </button>
                 ))}
              </div>
              <button onClick={() => setShowInviteModal(false)} className="w-full mt-4 py-2 text-gray-400 text-xs font-bold uppercase tracking-wider hover:text-white">Cancel</button>
           </div>
        </div>
      )}
      
      <style>{`
        .mirror { transform: rotateY(180deg); }
        @keyframes float-up {
            0% { transform: translateY(0) scale(0.5); opacity: 0; }
            10% { opacity: 1; }
            100% { transform: translateY(-300px) scale(1.5); opacity: 0; }
        }
        .animate-float-up { animation: float-up 2s ease-out forwards; }
      `}</style>
    </div>
  );
};
