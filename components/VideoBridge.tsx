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
  ThumbsUp, Heart, Laugh, MonitorOff, MoreHorizontal, StopCircle, ArrowUp, GripHorizontal
} from 'lucide-react';
import { Call, User, MeetingMessage, Reaction, ToolAction, CallStatus, Attachment, TranscriptSegment } from '../types';
import { getStrategicIntelligence, extractToolActions, analyzeCallTranscript } from '../services/geminiService';
import { apiGet, apiPost } from '../services/apiClient';
import * as dbService from '../services/dbService';
import { buildIdentityKey, buildPeerId, normalizeEmail, normalizeName } from '../utils/identity';

// --- SUB-COMPONENT: PRODUCTION-GRADE VIDEO SLOT ---
const NeuralVideoSlot: React.FC<{ stream: MediaStream | null, mirrored?: boolean, effect?: 'none' | 'blur' | 'virtual', isLocal?: boolean, label?: string, isMuted?: boolean }> = ({ stream, mirrored, effect, isLocal, label, isMuted }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'standby' | 'admitted' | 'error'>('standby');
  const [needsAudioTap, setNeedsAudioTap] = useState(false);

  useLayoutEffect(() => {
    let active = true;
    if (!videoRef.current || !stream) {
      setStatus('standby');
      setNeedsAudioTap(false);
      return;
    }

    const bind = async () => {
      try {
        const videoEl = videoRef.current;
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.muted = Boolean(isLocal);
          videoEl.autoplay = true;
          videoEl.playsInline = true;
          setNeedsAudioTap(false);
          try {
            await videoEl.play();
          } catch {
            if (!isLocal) {
              // Browsers can block autoplay-with-audio. Keep rendering, then request user tap to unmute.
              videoEl.muted = true;
              try {
                await videoEl.play();
              } catch {
                // keep rendering fallback
              }
              if (active) setNeedsAudioTap(true);
            } else {
              videoEl.muted = true;
              try {
                await videoEl.play();
              } catch {
                // keep rendering fallback
              }
            }
          }
          if (active) setStatus('admitted');
        }
      } catch (err) {
        console.warn("Media Playback Blocked by Browser:", err);
        if (active) setStatus(stream ? 'admitted' : 'error');
      }
    };

    bind();
    return () => { active = false; };
  }, [stream, isLocal]);

  const handleEnableAudio = async () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    try {
      videoEl.muted = false;
      await videoEl.play();
      setNeedsAudioTap(false);
    } catch (err) {
      console.warn('Unable to enable remote audio:', err);
      setNeedsAudioTap(true);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#111] flex items-center justify-center group">
      {status !== 'admitted' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-slate-950">
           <div className="w-16 h-16 rounded-full bg-slate-800 animate-pulse mb-4"></div>
           <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Connecting...</p>
        </div>
      )}
      {needsAudioTap && !isLocal && status === 'admitted' && (
        <button
          onClick={handleEnableAudio}
          className="absolute top-4 left-4 z-30 rounded-full border border-white/20 bg-black/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-black/80"
        >
          Tap To Enable Audio
        </button>
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
type SessionParticipant = {
  id: string;
  identityKey: string;
  name: string;
  role: string;
  email?: string;
  extension?: string;
  isSynthetic?: boolean;
};

const ROUTING_DEBUG = (import.meta.env as any).VITE_DEBUG_ROUTING === 'true';
const debugRouting = (...args: any[]) => {
  if (ROUTING_DEBUG) console.info('[routing][bridge]', ...args);
};

export const VideoBridge: React.FC<VideoBridgeProps> = ({ 
  activeCall, currentUser, onHangup, onToggleMedia, onInviteParticipant, onUpdateCall, team, isFirebaseConfigured = false
}) => {
  const isVideoEnabled = activeCall.isVideo !== false;
  const [viewMode, setViewMode] = useState<'gallery' | 'speaker' | 'large-gallery'>('gallery');
  const [participantRailDock, setParticipantRailDock] = useState<'top' | 'right' | 'left'>('right');
  const [focusedParticipantId, setFocusedParticipantId] = useState<string | null>(null);
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
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [reconnectRunning, setReconnectRunning] = useState(false);
  const [reconnectNote, setReconnectNote] = useState('');
  const [mediaError, setMediaError] = useState<string | null>(null);
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
  const remoteAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [needsRemoteAudioUnlock, setNeedsRemoteAudioUnlock] = useState(false);
  const [remoteAudioDiagnostic, setRemoteAudioDiagnostic] = useState<'ok' | 'blocked' | 'no-track'>('ok');
  
  // PeerJS
  const peerRef = useRef<Peer | null>(null);
  const [peerId, setPeerId] = useState<string>('');
  const connectionsRef = useRef<Map<string, MediaConnection>>(new Map());
  const dialingPeersRef = useRef<Set<string>>(new Set());
  const peerIdentityLookupRef = useRef<Map<string, string>>(new Map());
  const callParticipantIdentityKeysRef = useRef<string[]>([]);
  const screenShareAttemptingRef = useRef(false);
  const screenSharePromptCooldownRef = useRef(0);
  
  // Feature States
  const [intelligence, setIntelligence] = useState<{ text: string, links: {title: string, uri: string}[] } | null>(null);
  const [isFetchingIntel, setIsFetchingIntel] = useState(false);
  const [actions, setActions] = useState<ToolAction[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const messageDedupeRef = useRef<Set<string>>(new Set());
  const [isBottomBarCollapsed, setIsBottomBarCollapsed] = useState(false);
  const [controlBarPosition, setControlBarPosition] = useState<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bridgeRootRef = useRef<HTMLDivElement>(null);
  const controlBarRef = useRef<HTMLDivElement>(null);
  const controlBarDragRef = useRef<{ active: boolean; offsetX: number; offsetY: number } | null>(null);
  const mediaDevicesRef = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  const roomId = activeCall.roomId || activeCall.id;
  const legacyThreadId = activeCall.id !== roomId ? activeCall.id : undefined;
  const currentIdentityKey = useMemo(
    () => buildIdentityKey({ id: currentUser.id, email: currentUser.email, name: currentUser.name }),
    [currentUser.id, currentUser.email, currentUser.name]
  );
  const dedupeMeetingMessages = useCallback((input: MeetingMessage[]) => {
    const dedupe = new Map<string, MeetingMessage>();
    input.forEach((message) => {
      const key = `${String(message.id || '').trim()}::${String(message.senderId || '').trim()}::${Number(message.timestamp || 0)}`;
      if (!dedupe.has(key)) dedupe.set(key, message);
    });
    return Array.from(dedupe.values())
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .slice(-500);
  }, []);

  const getUserMediaSafe = useCallback(async (constraints: MediaStreamConstraints) => {
    const fn = mediaDevicesRef?.getUserMedia?.bind(mediaDevicesRef);
    if (!fn) {
      const msg = 'Media devices unavailable. Use HTTPS or localhost and allow camera/mic permissions.';
      setMediaError(msg);
      throw new Error(msg);
    }
    setMediaError(null);
    return fn(constraints);
  }, [mediaDevicesRef]);

  const getDisplayMediaSafe = useCallback(async (constraints: DisplayMediaStreamOptions) => {
    const fn = (mediaDevicesRef as any)?.getDisplayMedia?.bind(mediaDevicesRef);
    if (!fn) {
      const msg = 'Screen share unavailable on this origin. Use HTTPS or localhost.';
      setMediaError(msg);
      throw new Error(msg);
    }
    setMediaError(null);
    return fn(constraints);
  }, [mediaDevicesRef]);

  // --- DEVICE DISCOVERY ---
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const enumerateFn = mediaDevicesRef?.enumerateDevices?.bind(mediaDevicesRef);
        if (!enumerateFn) return;
        const devices = await enumerateFn();
        setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
        setAudioDevices(devices.filter(d => d.kind === 'audioinput'));
      } catch (e) {
        console.warn("Device enumeration failed", e);
        setMediaError('Device access failed. Check browser permissions and secure origin.');
      }
    };
    fetchDevices();
    if (!mediaDevicesRef?.addEventListener || !mediaDevicesRef?.removeEventListener) return;
    mediaDevicesRef.addEventListener('devicechange', fetchDevices);
    return () => mediaDevicesRef.removeEventListener('devicechange', fetchDevices);
  }, [mediaDevicesRef]);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return dbService.fetchMeetingMessages(roomId, (incoming) => {
      setMessages((prev) => {
        const merged = dedupeMeetingMessages([...prev, ...incoming]);
        messageDedupeRef.current = new Set(
          merged.map((message) => `${String(message.id || '').trim()}::${String(message.senderId || '').trim()}::${Number(message.timestamp || 0)}`)
        );
        return merged;
      });
    }, (error) => {
      console.warn('Meeting chat sync failed:', error);
      setMediaError('Meeting chat channel degraded.');
    });
  }, [isFirebaseConfigured, roomId, dedupeMeetingMessages]);

  useEffect(() => {
    setIsBottomBarCollapsed(false);
    setControlBarPosition(null);
    messageDedupeRef.current = new Set();
  }, [activeCall.id]);

  useEffect(() => {
    if (localStream) return;
    let cancelled = false;
    const constraints: MediaStreamConstraints = isVideoEnabled
      ? { video: true, audio: true }
      : { video: false, audio: true };
    getUserMediaSafe(constraints)
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.getAudioTracks().forEach((track) => {
          track.enabled = !isMuted;
        });
        setLocalStream(stream);
      })
      .catch((err) => {
        console.warn('Local media bootstrap failed:', err);
        setMediaError(String((err as any)?.message || 'Failed to start camera/microphone.'));
      });
    return () => {
      cancelled = true;
    };
  }, [activeCall.id, isVideoEnabled, localStream, isMuted, getUserMediaSafe]);

  const resolveRemoteIdentityFromPeer = useCallback((peerValue: string): string => {
    const peerKey = String(peerValue || '').trim();
    const mapped = peerIdentityLookupRef.current.get(peerKey);
    if (mapped) return mapped;
    if (peerKey.startsWith('connectai-user-')) {
      const legacyId = peerKey.slice('connectai-user-'.length).trim();
      const member = team.find((candidate) => candidate.id === legacyId);
      return buildIdentityKey({ id: legacyId, email: member?.email, name: member?.name });
    }
    const fallbackTargets = callParticipantIdentityKeysRef.current.filter((identityKey) => identityKey !== currentIdentityKey);
    if (fallbackTargets.length === 1) return fallbackTargets[0];
    const notConnected = fallbackTargets.find((identityKey) => !connectionsRef.current.has(identityKey));
    if (notConnected) return notConnected;
    return `peer:${peerKey || 'unknown'}`;
  }, [team, currentIdentityKey]);

  const registerConnection = useCallback((call: MediaConnection, remoteIdentityKey: string) => {
    connectionsRef.current.set(remoteIdentityKey, call);
    call.on('stream', (remoteStream) => {
      dialingPeersRef.current.delete(remoteIdentityKey);
      remoteStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      debugRouting('remoteStream.received', {
        remoteIdentityKey,
        peer: call.peer,
        audioTracks: remoteStream.getAudioTracks().length,
      });
      setRemoteStreams(prev => new Map(prev).set(remoteIdentityKey, remoteStream));
    });
    call.on('close', () => {
      connectionsRef.current.delete(remoteIdentityKey);
      dialingPeersRef.current.delete(remoteIdentityKey);
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.delete(remoteIdentityKey);
        return next;
      });
    });
    call.on('error', (err) => {
      console.warn('PeerJS call error', err);
      dialingPeersRef.current.delete(remoteIdentityKey);
    });
  }, []);

  // --- PEERJS INITIALIZATION ---
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    const id = buildPeerId(currentIdentityKey);
    const peer = new Peer(id, { debug: 1 });

    peer.on('open', (id) => {
      setPeerId(id);
      debugRouting('peer.open', { peerId: id, currentIdentityKey });
    });

    peer.on('call', async (call) => {
      try {
        const existing = localStreamRef.current;
        const stream = existing ?? await getUserMediaSafe(
          isVideoEnabled ? { video: true, audio: true } : { video: false, audio: true }
        );
        stream.getAudioTracks().forEach((track) => {
          track.enabled = !isMuted;
        });
        if (!existing) setLocalStream(stream);
        call.answer(stream);
        const remoteIdentityKey = resolveRemoteIdentityFromPeer(call.peer);
        debugRouting('peer.incomingCall', {
          peer: call.peer,
          remoteIdentityKey,
        });
        registerConnection(call, remoteIdentityKey);
      } catch (err) {
        console.error('Failed to get local stream', err);
        setMediaError(String((err as any)?.message || 'Failed to access local media.'));
      }
    });

    peerRef.current = peer;

    return () => {
      connectionsRef.current.forEach(c => c.close());
      connectionsRef.current.clear();
      peer.destroy();
    };
  }, [currentIdentityKey, registerConnection, isVideoEnabled, isMuted, getUserMediaSafe, resolveRemoteIdentityFromPeer]);

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

  // --- PROPRIETARY TRANSCRIPTION PROTOCOL ---
  useEffect(() => {
    if (!transcriptionActive || activeCall.status === CallStatus.ENDED) return;
    
    // Simulation for demo purposes if no real backend stream is connected
    const interval = setInterval(() => {
      const phrases = [
        "Analyzing the current cluster performance metrics...",
        "I believe we need to update the HubSpot schema for better synchronization.",
        "Could we schedule a follow-up for next Tuesday at 10 AM?",
        "The neural bridge latency is currently within acceptable parameters.",
        "Let's ensure the CRM records are dispatched before the meeting concludes."
      ];
      // Only add if not already dense
      if ((activeCall.transcript?.length || 0) > 20) return;

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

      const stream = await getUserMediaSafe(constraints);
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
  }, [isMuted, isVideoEnabled, localStream, getUserMediaSafe]);

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
    
    if (activeCall.isScreenSharing && activeCall.screenShareOwnerId === currentUser.id && onToggleMedia) {
        onToggleMedia('screen');
    }
  }, [screenStream, localStream, replaceOutgoingVideoTrack, activeCall.isScreenSharing, activeCall.screenShareOwnerId, currentUser.id, onToggleMedia]);

  const startScreenShare = useCallback(async () => {
    try {
      const now = Date.now();
      if (activeCall.screenShareOwnerId && activeCall.screenShareOwnerId !== currentUser.id) return;
      if (screenShareAttemptingRef.current) return;
      if (now < screenSharePromptCooldownRef.current) return;
      if (screenStream) return;
      screenShareAttemptingRef.current = true;
      const stream = await getDisplayMediaSafe({ 
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
      // Avoid re-prompt loops when user cancels browser picker.
      screenSharePromptCooldownRef.current = Date.now() + 4000;
      if (activeCall.isScreenSharing && activeCall.screenShareOwnerId === currentUser.id) {
        onToggleMedia('screen');
      }
    } finally {
      screenShareAttemptingRef.current = false;
    }
  }, [replaceOutgoingVideoTrack, stopScreenShare, activeCall.isScreenSharing, activeCall.screenShareOwnerId, onToggleMedia, screenStream, currentUser.id, getDisplayMediaSafe]);

  useEffect(() => {
    const isLocalShareOwner = activeCall.screenShareOwnerId === currentUser.id;
    if (activeCall.isScreenSharing && isLocalShareOwner && !screenStream) {
      startScreenShare();
    } else if ((!activeCall.isScreenSharing || !isLocalShareOwner) && screenStream) {
      stopScreenShare();
    }
  }, [activeCall.isScreenSharing, activeCall.screenShareOwnerId, currentUser.id, startScreenShare, stopScreenShare, screenStream]);

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
    setMediaError(null);
  };

  const handleSendMessage = (text: string = chatInput, files: Attachment[] = []) => {
    if (!text.trim() && files.length === 0) return;
    const msg: MeetingMessage = { 
      id: `${currentUser.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      senderId: currentUser.id, 
      text, 
      timestamp: Date.now(),
      attachments: files,
      threadIds: Array.from(new Set([roomId, legacyThreadId].filter(Boolean))),
      canonicalRoomId: roomId,
    };
    const pushLocal = () => {
      const dedupeKey = `${msg.id}::${msg.senderId}::${msg.timestamp}`;
      if (!messageDedupeRef.current.has(dedupeKey)) {
        messageDedupeRef.current.add(dedupeKey);
        setMessages((prev) => dedupeMeetingMessages([...prev, msg]));
      }
    };
    debugRouting('meetingMessage.send', {
      roomId,
      messageId: msg.id,
      senderId: msg.senderId,
    });
    if (!isFirebaseConfigured) {
      pushLocal();
      setChatInput('');
      return;
    }
    dbService.sendMeetingMessage(roomId, msg, { roomId: activeCall.roomId, legacyCallId: legacyThreadId })
      .then((res: any) => {
        if (res?.ok) {
          pushLocal();
        } else {
          setMediaError(res?.error || 'Meeting chat failed to send.');
        }
      })
      .catch((err: any) => {
        setMediaError(String(err?.message || 'Meeting chat failed to send.'));
      })
      .finally(() => setChatInput(''));
  };

  const beginControlBarDrag = useCallback((event: React.PointerEvent<HTMLButtonElement | HTMLDivElement>) => {
    const rootRect = bridgeRootRef.current?.getBoundingClientRect();
    const barRect = controlBarRef.current?.getBoundingClientRect();
    if (!rootRect || !barRect) return;
    controlBarDragRef.current = {
      active: true,
      offsetX: event.clientX - barRect.left,
      offsetY: event.clientY - barRect.top,
    };
    setControlBarPosition({
      x: barRect.left - rootRect.left,
      y: barRect.top - rootRect.top,
    });
    event.preventDefault();
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const dragState = controlBarDragRef.current;
      if (!dragState?.active) return;
      const rootRect = bridgeRootRef.current?.getBoundingClientRect();
      const barRect = controlBarRef.current?.getBoundingClientRect();
      if (!rootRect || !barRect) return;
      const maxX = Math.max(8, rootRect.width - barRect.width - 8);
      const maxY = Math.max(8, rootRect.height - barRect.height - 8);
      const nextX = Math.min(Math.max(8, event.clientX - rootRect.left - dragState.offsetX), maxX);
      const nextY = Math.min(Math.max(8, event.clientY - rootRect.top - dragState.offsetY), maxY);
      setControlBarPosition({ x: nextX, y: nextY });
    };
    const onUp = () => {
      if (controlBarDragRef.current) controlBarDragRef.current.active = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const meetingShareLink = useMemo(() => {
    if (typeof window === 'undefined') return `/#/app?room=${encodeURIComponent(roomId)}`;
    return `${window.location.origin}/#/app?room=${encodeURIComponent(roomId)}`;
  }, [roomId]);

  const handleCopyMeetingLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(meetingShareLink);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1600);
    } catch {
      // noop
    }
  }, [meetingShareLink]);

  const handlePopOutMeeting = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.open(meetingShareLink, '_blank', 'noopener,noreferrer');
  }, [meetingShareLink]);

  // --- CALL LOGIC ---
  const callUser = useCallback(async (targetIdentityKey: string, legacyUserId?: string) => {
    const peer = peerRef.current;
    if (!peer || peer.destroyed || peer.disconnected || !peer.id) return;
    const identityKey = String(targetIdentityKey || '').trim();
    if (!identityKey || identityKey === currentIdentityKey) return;
    if (connectionsRef.current.has(identityKey)) return;
    if (dialingPeersRef.current.has(identityKey)) return;
    dialingPeersRef.current.add(identityKey);
    let stream: MediaStream;
    try {
      stream = localStream ?? await getUserMediaSafe(
        isVideoEnabled ? { video: true, audio: true } : { video: false, audio: true }
      );
    } catch {
      dialingPeersRef.current.delete(identityKey);
      return;
    }
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
    if (!localStream) setLocalStream(stream);
    const identityIdFallback = identityKey.startsWith('id:') ? identityKey.slice(3).trim() : '';
    const candidatePeerIds = Array.from(new Set([
      buildPeerId(identityKey),
      legacyUserId ? `connectai-user-${legacyUserId}` : '',
      identityIdFallback ? `connectai-user-${identityIdFallback}` : '',
    ].filter(Boolean)));
    debugRouting('peer.dialCandidates', { targetIdentityKey: identityKey, candidatePeerIds });
    let attemptIndex = 0;
    const attemptDial = () => {
      const currentPeer = peerRef.current;
      if (!currentPeer || currentPeer.destroyed || currentPeer.disconnected || !currentPeer.id || attemptIndex >= candidatePeerIds.length) {
        dialingPeersRef.current.delete(identityKey);
        return;
      }
      const targetPeerId = candidatePeerIds[attemptIndex];
      attemptIndex += 1;
      debugRouting('peer.dialAttempt', { targetIdentityKey: identityKey, targetPeerId });
      let connected = false;
      let call: MediaConnection;
      try {
        call = currentPeer.call(targetPeerId, stream);
      } catch (error) {
        debugRouting('peer.dialError', { targetIdentityKey: identityKey, targetPeerId, error: String((error as any)?.message || error) });
        attemptDial();
        return;
      }
      if (!call || !call.peerConnection) {
        debugRouting('peer.dialNullConnection', { targetIdentityKey: identityKey, targetPeerId });
        attemptDial();
        return;
      }
      const fallbackTimer = window.setTimeout(() => {
        if (connected || connectionsRef.current.has(identityKey)) return;
        try { call.close(); } catch {}
        attemptDial();
      }, 2600);
      call.on('stream', () => {
        connected = true;
        window.clearTimeout(fallbackTimer);
      });
      call.on('close', () => {
        window.clearTimeout(fallbackTimer);
        if (!connected && !connectionsRef.current.has(identityKey)) attemptDial();
      });
      call.on('error', () => {
        window.clearTimeout(fallbackTimer);
        if (!connected && !connectionsRef.current.has(identityKey)) attemptDial();
      });
      registerConnection(call, identityKey);
    };
    attemptDial();
  }, [localStream, registerConnection, isVideoEnabled, isMuted, getUserMediaSafe, currentIdentityKey]);

  const bindRemoteAudioEl = useCallback((remoteIdentityKey: string, element: HTMLAudioElement | null) => {
    if (!element) {
      remoteAudioRefs.current.delete(remoteIdentityKey);
      return;
    }
    remoteAudioRefs.current.set(remoteIdentityKey, element);
    const stream = remoteStreams.get(remoteIdentityKey);
    if (!stream) return;
    if (element.srcObject !== stream) {
      element.srcObject = stream;
    }
    stream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
    element.muted = false;
    element.volume = 1;
    element.play().catch(() => {
      setNeedsRemoteAudioUnlock(true);
    });
  }, [remoteStreams]);

  useEffect(() => {
    const attachAndPlay = async () => {
      let blocked = false;
      let missingTracks = false;
      for (const [identityKey, stream] of remoteStreams.entries()) {
        const audioEl = remoteAudioRefs.current.get(identityKey);
        if (!audioEl) continue;
        if (audioEl.srcObject !== stream) {
          audioEl.srcObject = stream;
        }
        if ((stream.getAudioTracks() || []).length === 0) {
          missingTracks = true;
          continue;
        }
        stream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        audioEl.muted = false;
        audioEl.volume = 1;
        try {
          await audioEl.play();
        } catch {
          blocked = true;
        }
      }
      setNeedsRemoteAudioUnlock(blocked);
      setRemoteAudioDiagnostic(missingTracks ? 'no-track' : blocked ? 'blocked' : 'ok');
    };
    attachAndPlay();
  }, [remoteStreams]);

  const unlockRemoteAudio = useCallback(async () => {
    let blocked = false;
    let missingTracks = false;
    for (const audioEl of remoteAudioRefs.current.values()) {
      try {
        audioEl.muted = false;
        audioEl.volume = 1;
        await audioEl.play();
      } catch {
        blocked = true;
      }
    }
    for (const stream of remoteStreams.values()) {
      if ((stream.getAudioTracks() || []).length === 0) {
        missingTracks = true;
        break;
      }
    }
    setNeedsRemoteAudioUnlock(blocked);
    setRemoteAudioDiagnostic(missingTracks ? 'no-track' : blocked ? 'blocked' : 'ok');
  }, [remoteStreams]);

  useEffect(() => {
    if (!remoteStreams.size) return;
    const unlock = () => {
      unlockRemoteAudio().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [remoteStreams.size, unlockRemoteAudio]);

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
  const resolveMemberByIdentityKey = useCallback((identityKey: string): User | undefined => {
    const key = String(identityKey || '').trim();
    if (!key) return undefined;
    if (key.startsWith('email:')) {
      const email = normalizeEmail(key.slice(6));
      if (email && normalizeEmail(currentUser.email) === email) return currentUser;
      return roster.find((member) => normalizeEmail(member.email) === email);
    }
    if (key.startsWith('id:')) {
      const id = key.slice(3).trim();
      if (id && id === currentUser.id) return currentUser;
      return roster.find((member) => member.id === id);
    }
    if (key.startsWith('name:')) {
      const name = normalizeName(key.slice(5));
      if (name && normalizeName(currentUser.name) === name) return currentUser;
      return roster.find((member) => normalizeName(member.name) === name);
    }
    if (key === currentIdentityKey) return currentUser;
    return roster.find((member) => buildIdentityKey(member) === key);
  }, [roster, currentIdentityKey, currentUser]);
  const parseIdentityLabel = useCallback((identityKey: string) => {
    if (identityKey.startsWith('email:')) {
      const email = identityKey.slice(6);
      return email.split('@')[0] || email;
    }
    if (identityKey.startsWith('id:')) return identityKey.slice(3);
    if (identityKey.startsWith('name:')) return identityKey.slice(5);
    return identityKey.replace(/^peer:/, '');
  }, []);
  const callParticipantIdentityKeys = useMemo(() => {
    const keys = new Set<string>();
    const addKey = (value?: string | null) => {
      const key = String(value || '').trim();
      if (!key || key === 'unknown') return;
      keys.add(key);
    };
    addKey(currentIdentityKey);
    addKey(activeCall.agentIdentityKey);
    addKey(activeCall.targetIdentityKey);
    addKey(buildIdentityKey({
      id: activeCall.agentId,
      email: activeCall.agentEmail,
      name: activeCall.agentName,
    }));
    addKey(buildIdentityKey({
      id: activeCall.targetAgentId,
      email: activeCall.targetAgentEmail || activeCall.customerEmail,
      name: activeCall.customerName,
    }));
    (activeCall.participantIdentityKeys || []).forEach((key) => addKey(key));
    (activeCall.participants || []).forEach((participantId) => {
      const member = roster.find((teamMember) => teamMember.id === participantId);
      addKey(buildIdentityKey({ id: participantId, email: member?.email, name: member?.name }));
    });
    const filtered = Array.from(keys).filter((key) => {
      if (!key) return false;
      if (key === currentIdentityKey) return true;
      if (key === activeCall.agentIdentityKey || key === activeCall.targetIdentityKey) return true;
      return Boolean(resolveMemberByIdentityKey(key));
    });
    return filtered;
  }, [
    activeCall.agentEmail,
    activeCall.agentId,
    activeCall.agentIdentityKey,
    activeCall.agentName,
    activeCall.customerEmail,
    activeCall.customerName,
    activeCall.participantIdentityKeys,
    activeCall.participants,
    activeCall.targetAgentEmail,
    activeCall.targetAgentId,
    activeCall.targetIdentityKey,
    currentIdentityKey,
    roster,
    resolveMemberByIdentityKey,
  ]);
  useEffect(() => {
    callParticipantIdentityKeysRef.current = callParticipantIdentityKeys;
  }, [callParticipantIdentityKeys]);

  const callParticipants = useMemo<SessionParticipant[]>(() => {
    const merged = new Map<string, SessionParticipant>();
    const resolveCanonicalIdentity = (member: User, fallbackIdentity: string) => {
      if (member.id === currentUser.id) return currentIdentityKey;
      const canonical = buildIdentityKey({ id: member.id, email: member.email, name: member.name });
      return canonical && canonical !== 'unknown' ? canonical : fallbackIdentity;
    };
    callParticipantIdentityKeys.forEach((identityKey) => {
      const member = resolveMemberByIdentityKey(identityKey);
      if (member) {
        const canonicalIdentityKey = resolveCanonicalIdentity(member, identityKey);
        const canonicalParticipantKey = member.id ? `id:${member.id}` : canonicalIdentityKey;
        merged.set(canonicalParticipantKey, {
          id: member.id,
          identityKey: canonicalIdentityKey,
          name: member.name,
          role: member.role,
          email: member.email,
          extension: member.extension,
        });
        return;
      }
      const fallbackId = identityKey.startsWith('id:') ? identityKey.slice(3).trim() : identityKey;
      const fallbackName = parseIdentityLabel(identityKey) || 'Teammate';
      merged.set(identityKey, {
        id: fallbackId || identityKey,
        identityKey,
        name: fallbackName,
        role: 'AGENT',
        isSynthetic: true,
      });
    });
    const currentCanonicalKey = `id:${currentUser.id}`;
    merged.set(currentCanonicalKey, {
        id: currentUser.id,
        identityKey: currentIdentityKey,
        name: currentUser.name,
        role: currentUser.role,
        email: currentUser.email,
        extension: currentUser.extension,
      });
    return Array.from(merged.values());
  }, [callParticipantIdentityKeys, resolveMemberByIdentityKey, parseIdentityLabel, currentIdentityKey, currentUser]);
  const renderedParticipants = useMemo<SessionParticipant[]>(() => {
    const merged = new Map<string, SessionParticipant>();
    callParticipants.forEach((participant) => merged.set(participant.identityKey, participant));
    return Array.from(merged.values());
  }, [callParticipants]);
  const isMeetingSession = Boolean(activeCall.roomId || (activeCall.direction === 'internal' && activeCall.isVideo));
  const isPresentationMode = Boolean(activeCall.isScreenSharing);
  const hostId = activeCall.hostId || activeCall.agentId || callParticipants[0]?.id || currentUser.id;
  const isHost = hostId === currentUser.id;
  const waitingRoom = useMemo(
    () => (Array.isArray(activeCall.waitingRoom) ? activeCall.waitingRoom : []),
    [activeCall.waitingRoom]
  );
  const expectedRemoteIdentityKeys = useMemo(
    () => callParticipants.filter((p) => p.identityKey !== currentIdentityKey).map((p) => p.identityKey),
    [callParticipants, currentIdentityKey]
  );
  const focusedParticipant = useMemo(() => {
    if (!renderedParticipants.length) return null;
    if (focusedParticipantId) {
      const existing = renderedParticipants.find((p) => p.identityKey === focusedParticipantId);
      if (existing) return existing;
    }
    return renderedParticipants.find((p) => p.identityKey !== currentIdentityKey) || renderedParticipants[0] || null;
  }, [renderedParticipants, focusedParticipantId, currentIdentityKey]);
  const callParticipantMap = useMemo(() => {
    const map = new Map<string, SessionParticipant>();
    callParticipants.forEach((participant) => map.set(participant.identityKey, participant));
    return map;
  }, [callParticipants]);
  useEffect(() => {
    const lookup = new Map<string, string>();
    callParticipants.forEach((participant) => {
      lookup.set(buildPeerId(participant.identityKey), participant.identityKey);
      if (participant.id) lookup.set(`connectai-user-${participant.id}`, participant.identityKey);
    });
    peerIdentityLookupRef.current = lookup;
  }, [callParticipants]);

  useEffect(() => {
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      Array.from(next.keys()).forEach((identityKey) => {
        if (!expectedRemoteIdentityKeys.includes(identityKey)) {
          const conn = connectionsRef.current.get(identityKey);
          try { conn?.close(); } catch {}
          connectionsRef.current.delete(identityKey);
          next.delete(identityKey);
        }
      });
      return next;
    });
  }, [expectedRemoteIdentityKeys]);

  const updateMeetingControls = useCallback((patch: Partial<Call>) => {
    if (!onUpdateCall) return;
    onUpdateCall({
      ...activeCall,
      hostId,
      ...patch,
    });
  }, [onUpdateCall, activeCall, hostId]);

  const handleToggleLobby = useCallback(() => {
    if (!isHost) return;
    updateMeetingControls({ lobbyEnabled: !activeCall.lobbyEnabled });
  }, [isHost, updateMeetingControls, activeCall.lobbyEnabled]);

  const handleToggleMeetingLock = useCallback(() => {
    if (!isHost) return;
    updateMeetingControls({ meetingLocked: !activeCall.meetingLocked });
  }, [isHost, updateMeetingControls, activeCall.meetingLocked]);

  const admitOneFromLobby = useCallback((userId: string) => {
    if (!isHost) return;
    const nextParticipants = Array.from(new Set([...(Array.isArray(activeCall.participants) ? activeCall.participants : []), userId]));
    const nextWaiting = (activeCall.waitingRoom || []).filter((id) => id !== userId);
    updateMeetingControls({ participants: nextParticipants, waitingRoom: nextWaiting });
  }, [isHost, activeCall.participants, activeCall.waitingRoom, updateMeetingControls]);

  const admitAllFromLobby = useCallback(() => {
    if (!isHost || !waitingRoom.length) return;
    const nextParticipants = Array.from(new Set([...(Array.isArray(activeCall.participants) ? activeCall.participants : []), ...waitingRoom]));
    updateMeetingControls({ participants: nextParticipants, waitingRoom: [] });
  }, [isHost, waitingRoom, activeCall.participants, updateMeetingControls]);

  const reconnectDiagnostics = useMemo(() => {
    const connectedRemoteIds = new Set(remoteStreams.keys());
    const missing = expectedRemoteIdentityKeys.filter((identityKey) => !connectedRemoteIds.has(identityKey));
    const localAudioTracks = localStream?.getAudioTracks().length || 0;
    const localVideoTracks = localStream?.getVideoTracks().length || 0;
    return {
      peerReady: Boolean(peerRef.current && !peerRef.current.destroyed),
      expected: expectedRemoteIdentityKeys.length,
      connected: connectedRemoteIds.size,
      missing,
      localAudioTracks,
      localVideoTracks,
      needsRemoteAudioUnlock,
    };
  }, [remoteStreams, expectedRemoteIdentityKeys, localStream, needsRemoteAudioUnlock]);

  const runReconnectSweep = useCallback(async () => {
    if (reconnectRunning) return;
    setReconnectRunning(true);
    setReconnectNote('Running reconnect sweep...');
    try {
      const reconnectTargets = expectedRemoteIdentityKeys
        .filter((identityKey) => !remoteStreams.has(identityKey))
        .map((identityKey) => callParticipantMap.get(identityKey) || ({
          id: identityKey,
          identityKey,
          name: parseIdentityLabel(identityKey) || 'Teammate',
          role: 'AGENT',
          isSynthetic: true,
        } as SessionParticipant));
      reconnectTargets.forEach((participant) => {
        const existing = connectionsRef.current.get(participant.identityKey);
        if (existing) {
          try { existing.close(); } catch {}
          connectionsRef.current.delete(participant.identityKey);
        }
      });
      for (const target of reconnectTargets) {
        await callUser(target.identityKey, target.id).catch(() => {});
      }
      if (!reconnectTargets.length) {
        setReconnectNote('No missing peers detected. Media state looks healthy.');
      } else {
        setReconnectNote(`Reconnect attempted for ${reconnectTargets.length} participant(s).`);
      }
    } finally {
      setReconnectRunning(false);
      setTimeout(() => setReconnectNote(''), 2800);
    }
  }, [reconnectRunning, expectedRemoteIdentityKeys, remoteStreams, callUser, callParticipantMap, parseIdentityLabel]);

  useEffect(() => {
    if (!peerId) return;
    expectedRemoteIdentityKeys.forEach((identityKey) => {
      if (remoteStreams.has(identityKey)) return;
      if (connectionsRef.current.has(identityKey)) return;
      if (dialingPeersRef.current.has(identityKey)) return;
      const participant = callParticipantMap.get(identityKey);
      callUser(identityKey, participant?.id).catch(() => {
        dialingPeersRef.current.delete(identityKey);
      });
    });
  }, [expectedRemoteIdentityKeys, peerId, remoteStreams, callUser, callParticipantMap]);

  useEffect(() => {
    if (!peerId) return;
    if (activeCall.status !== CallStatus.ACTIVE) return;
    const interval = window.setInterval(() => {
      expectedRemoteIdentityKeys.forEach((identityKey) => {
        if (remoteStreams.has(identityKey)) return;
        const existing = connectionsRef.current.get(identityKey);
        if (existing) return;
        const participant = callParticipantMap.get(identityKey);
        callUser(identityKey, participant?.id).catch(() => {});
      });
    }, 2500);
    return () => window.clearInterval(interval);
  }, [peerId, activeCall.status, expectedRemoteIdentityKeys, remoteStreams, callUser, callParticipantMap]);

  return (
    <div ref={bridgeRootRef} className="relative h-full w-full z-[100] bg-[#111] flex flex-col overflow-hidden text-white font-sans selection:bg-brand-500/30">
      
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
          {needsRemoteAudioUnlock && (
            <button onClick={unlockRemoteAudio} className="ml-3 px-3 py-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 text-[10px] font-black uppercase tracking-wider text-amber-300 hover:bg-amber-500/20">
              Enable Audio
            </button>
          )}
          {remoteAudioDiagnostic === 'no-track' && (
            <span className="ml-3 px-3 py-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 text-[10px] font-black tracking-wide text-rose-200">
              Remote stream has no audio tracks
            </span>
          )}
          {remoteAudioDiagnostic === 'blocked' && !needsRemoteAudioUnlock && (
            <span className="ml-3 px-3 py-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 text-[10px] font-black tracking-wide text-amber-200">
              Audio playback blocked by browser
            </span>
          )}
          {mediaError && (
            <div className="ml-3 px-3 py-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 text-[10px] font-black tracking-wide text-rose-200 max-w-[420px] truncate" title={mediaError}>
              {mediaError}
            </div>
          )}
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
           {isPresentationMode && (
             <>
               <div className="h-6 w-[1px] bg-[#333] mx-1"></div>
               <button onClick={() => setParticipantRailDock('top')} className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${participantRailDock === 'top' ? 'bg-indigo-600 text-white' : 'bg-[#2b2b2b] text-gray-300 hover:bg-[#3a3a3a]'}`}>Top</button>
               <button onClick={() => setParticipantRailDock('left')} className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${participantRailDock === 'left' ? 'bg-indigo-600 text-white' : 'bg-[#2b2b2b] text-gray-300 hover:bg-[#3a3a3a]'}`}>Left</button>
               <button onClick={() => setParticipantRailDock('right')} className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${participantRailDock === 'right' ? 'bg-indigo-600 text-white' : 'bg-[#2b2b2b] text-gray-300 hover:bg-[#3a3a3a]'}`}>Right</button>
             </>
           )}
        </div>
      </div>
      <div className="h-12 bg-[#171717] border-b border-[#2c2c2c] flex items-center gap-2 px-3 text-[10px] font-black uppercase tracking-wider text-slate-300 overflow-x-auto scrollbar-hide">
        <button onClick={() => setRaisedHand((v) => !v)} className={`px-3 py-1.5 rounded-md border ${raisedHand ? 'bg-amber-500/20 border-amber-400/40 text-amber-200' : 'bg-[#232323] border-[#3b3b3b] hover:bg-[#2f2f2f]'}`}>Take Control</button>
        <button onClick={handlePopOutMeeting} className="px-3 py-1.5 rounded-md border bg-[#232323] border-[#3b3b3b] hover:bg-[#2f2f2f]">Pop Out</button>
        <button onClick={() => setActiveTab('chat')} className="px-3 py-1.5 rounded-md border bg-[#232323] border-[#3b3b3b] hover:bg-[#2f2f2f]">Chat</button>
        <button onClick={() => { setActiveTab('participants'); setShowSidebar(true); }} className="px-3 py-1.5 rounded-md border bg-[#232323] border-[#3b3b3b] hover:bg-[#2f2f2f]">People</button>
        <button onClick={() => setShowReactions((v) => !v)} className="px-3 py-1.5 rounded-md border bg-[#232323] border-[#3b3b3b] hover:bg-[#2f2f2f]">React</button>
        <button onClick={() => setViewMode((v) => (v === 'gallery' ? 'speaker' : 'gallery'))} className="px-3 py-1.5 rounded-md border bg-[#232323] border-[#3b3b3b] hover:bg-[#2f2f2f]">View</button>
        <button onClick={() => setShowSettings(true)} className="px-3 py-1.5 rounded-md border bg-[#232323] border-[#3b3b3b] hover:bg-[#2f2f2f]">Camera</button>
        <button onClick={toggleMute} className="px-3 py-1.5 rounded-md border bg-[#232323] border-[#3b3b3b] hover:bg-[#2f2f2f]">Mic</button>
        <button onClick={handleCopyMeetingLink} className="px-3 py-1.5 rounded-md border bg-indigo-600 border-indigo-500 hover:bg-indigo-500 text-white">Share Link</button>
        <button onClick={() => setShowDiagnostics((v) => !v)} className={`px-3 py-1.5 rounded-md border ${showDiagnostics ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-[#232323] border-[#3b3b3b] hover:bg-[#2f2f2f]'}`}>Reconnect</button>
        {isHost && (
          <>
            <button onClick={handleToggleLobby} className={`px-3 py-1.5 rounded-md border ${activeCall.lobbyEnabled ? 'bg-amber-600/20 border-amber-400/40 text-amber-200' : 'bg-[#232323] border-[#3b3b3b] hover:bg-[#2f2f2f]'}`}>
              {activeCall.lobbyEnabled ? 'Lobby On' : 'Lobby Off'}
            </button>
            <button onClick={handleToggleMeetingLock} className={`px-3 py-1.5 rounded-md border ${activeCall.meetingLocked ? 'bg-rose-600/20 border-rose-400/40 text-rose-200' : 'bg-[#232323] border-[#3b3b3b] hover:bg-[#2f2f2f]'}`}>
              {activeCall.meetingLocked ? 'Meeting Locked' : 'Lock Meeting'}
            </button>
            {waitingRoom.length > 0 && (
              <button onClick={admitAllFromLobby} className="px-3 py-1.5 rounded-md border bg-emerald-600 border-emerald-500 hover:bg-emerald-500 text-white">
                Admit {waitingRoom.length}
              </button>
            )}
          </>
        )}
        <span className={`text-[9px] ${copyFeedback ? 'text-emerald-300' : 'text-slate-500'}`}>{copyFeedback ? 'Link Copied' : 'Invite participants with link'}</span>
        {reconnectNote && <span className="text-[9px] text-emerald-300">{reconnectNote}</span>}
      </div>

      {/* 2. Main Stage */}
      <div className="flex-1 flex overflow-hidden relative bg-[#000]">
        
        {/* Screen Share Banner */}
        {activeCall.isScreenSharing && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-red-600/90 backdrop-blur-md px-6 py-2 rounded-full flex items-center gap-3 shadow-2xl border border-red-400/30">
                <Monitor size={16} className="animate-pulse"/>
                <span className="text-xs font-bold uppercase tracking-wider">
                  {activeCall.screenShareOwnerId === currentUser.id ? 'You are presenting' : 'Screen share live'}
                </span>
                {activeCall.screenShareOwnerId === currentUser.id && (
                  <button onClick={stopScreenShare} className="bg-white text-red-600 px-3 py-1 rounded-full text-[10px] font-black hover:bg-gray-100 transition-colors">STOP</button>
                )}
            </div>
        )}

        {showDiagnostics && (
          <div className="absolute top-4 right-4 z-40 w-[300px] rounded-xl border border-emerald-400/30 bg-black/75 backdrop-blur-md p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Reconnect Diagnostics</p>
              <button
                onClick={runReconnectSweep}
                disabled={reconnectRunning}
                className="px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60"
              >
                {reconnectRunning ? 'Running...' : 'Run Sweep'}
              </button>
            </div>
            <div className="space-y-1 text-[10px] text-slate-200">
              <p>Peer: {reconnectDiagnostics.peerReady ? 'Ready' : 'Not Ready'}</p>
              <p>Remote Connected: {reconnectDiagnostics.connected}/{reconnectDiagnostics.expected}</p>
              <p>Local Tracks: audio {reconnectDiagnostics.localAudioTracks} / video {reconnectDiagnostics.localVideoTracks}</p>
              <p>Audio Unlock: {reconnectDiagnostics.needsRemoteAudioUnlock ? 'Required' : 'OK'}</p>
              {reconnectDiagnostics.missing.length > 0 && (
                <p className="text-amber-300">Missing: {reconnectDiagnostics.missing.join(', ')}</p>
              )}
            </div>
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
          {isPresentationMode ? (
            <div className={`w-full h-full grid gap-3 ${participantRailDock === 'top' ? 'grid-rows-[120px_1fr]' : participantRailDock === 'left' ? 'grid-cols-[220px_1fr]' : 'grid-cols-[1fr_220px]'}`}>
              <div className={`rounded-xl border border-[#333] bg-[#0d1117] overflow-hidden ${participantRailDock === 'right' ? 'order-2' : participantRailDock === 'left' ? 'order-1' : 'order-1'}`}>
                <div className={`${participantRailDock === 'top' ? 'h-full flex overflow-x-auto gap-2 p-2' : 'h-full overflow-y-auto p-2 space-y-2'}`}>
                  {renderedParticipants.map((p) => {
                    const isLocal = p.identityKey === currentIdentityKey;
                    const stream = isLocal ? activeVideoStream : remoteStreams.get(p.identityKey);
                    return (
                      <button
                        key={`rail-${p.identityKey}`}
                        onClick={() => setFocusedParticipantId(p.identityKey)}
                        className={`${participantRailDock === 'top' ? 'min-w-[160px] w-[160px]' : 'w-full h-[104px]'} rounded-lg overflow-hidden border ${focusedParticipant?.identityKey === p.identityKey ? 'border-indigo-500' : 'border-[#2b313c]'} bg-[#111827] relative`}
                        title={`Focus ${p.name}`}
                      >
                        {stream || (isLocal && activeCall.isVideo) ? (
                          <NeuralVideoSlot
                            stream={stream || null}
                            mirrored={isLocal && !activeCall.isScreenSharing && mirrorVideo}
                            effect="none"
                            isLocal={isLocal}
                            label={p.name}
                            isMuted={isLocal ? isMuted : false}
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                            <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white">{p.name.charAt(0)}</div>
                            <p className="text-[10px] text-gray-300">{p.name}</p>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className={`relative rounded-xl border border-[#333] overflow-hidden bg-[#070b13] ${participantRailDock === 'right' ? 'order-1' : participantRailDock === 'left' ? 'order-2' : 'order-2'}`}>
                {(screenStream || activeVideoStream) ? (
                  <NeuralVideoSlot
                    stream={screenStream || activeVideoStream}
                    mirrored={false}
                    effect="none"
                    isLocal={Boolean(screenStream)}
                    label={screenStream ? `${currentUser.name} (Presenting)` : (focusedParticipant?.name || currentUser.name)}
                    isMuted={screenStream ? isMuted : Boolean(focusedParticipant?.identityKey === currentIdentityKey ? isMuted : false)}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                    <Monitor size={38} className="text-slate-500" />
                    <p className="text-xs uppercase tracking-widest text-slate-400 font-black">Presentation Starting...</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={`grid gap-3 w-full h-full max-h-full transition-all duration-500
               ${renderedParticipants.length === 1 ? 'grid-cols-1' : ''}
               ${renderedParticipants.length === 2 ? 'grid-cols-1 md:grid-cols-2' : ''}
               ${renderedParticipants.length >= 3 && renderedParticipants.length <= 4 ? 'grid-cols-2' : ''}
               ${renderedParticipants.length > 4 ? 'grid-cols-2 md:grid-cols-3' : ''}
            `}>
              {renderedParticipants.map(p => {
                const isLocal = p.identityKey === currentIdentityKey;
                const stream = isLocal ? activeVideoStream : remoteStreams.get(p.identityKey);

                return (
                  <div key={p.identityKey} className="relative bg-[#1a1a1a] rounded-xl overflow-hidden border border-[#333] shadow-lg group">
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
          )}
        </div>

        {/* 3. Sidebar */}
        {showSidebar && (
          <div className="w-[320px] bg-[#1f1f1f] border-l border-[#333] flex flex-col absolute top-0 bottom-0 right-0 z-40 shadow-2xl">
             <div className="flex border-b border-[#333]">
                <button onClick={() => setActiveTab('chat')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider ${activeTab === 'chat' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-gray-400 hover:text-white'}`}>Chat</button>
                <button onClick={() => setActiveTab('participants')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider ${activeTab === 'participants' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-gray-400 hover:text-white'}`}>People ({renderedParticipants.length})</button>
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
                     {isHost && (
                       <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Lobby</p>
                            <span className="text-[10px] text-amber-200">{waitingRoom.length} waiting</span>
                          </div>
                          {waitingRoom.length === 0 ? (
                            <p className="text-[10px] text-slate-400">No one is waiting right now.</p>
                          ) : (
                            <div className="space-y-2">
                              {waitingRoom.map((waitingId) => {
                                const user = team.find((u) => u.id === waitingId);
                                return (
                                  <div key={`waiting-${waitingId}`} className="flex items-center justify-between gap-2 text-[10px] text-slate-200">
                                    <span>{user?.name || waitingId}</span>
                                    <button
                                      onClick={() => admitOneFromLobby(waitingId)}
                                      className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider"
                                    >
                                      Admit
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                       </div>
                     )}
                     <button onClick={() => setShowInviteModal(true)} className="w-full py-2 bg-[#2a2a2a] rounded-lg text-xs font-bold uppercase tracking-wider text-white hover:bg-[#333] transition-colors border border-[#333] flex items-center justify-center gap-2">
                        <UserPlus size={14}/> Invite Someone
                     </button>
                     <div className="space-y-2">
                        {renderedParticipants.map(p => (
                          <div key={p.identityKey} className="flex items-center gap-3 p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors">
                             <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">{p.name.charAt(0)}</div>
                             <div className="flex-1">
                                <p className="text-xs font-semibold text-gray-200">{p.name}</p>
                                <p className="text-[10px] text-gray-500 uppercase">{p.role}</p>
                             </div>
                             {p.identityKey === currentIdentityKey && <span className="text-[10px] text-gray-500">(You)</span>}
                          </div>
                        ))}
                     </div>
                  </div>
                )}
                {activeTab === 'intelligence' && (
                  <div className="space-y-6 animate-in fade-in">
                     <div className="p-4 bg-[#2a2a2a] rounded-xl border border-[#333]">
                        <div className="flex justify-between items-center mb-3">
                           <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Strategic Intel</h4>
                           {isFetchingIntel && <Loader2 className="animate-spin text-indigo-500" size={14}/>}
                        </div>
                        <p className="text-xs font-medium text-gray-300 leading-relaxed italic">{intelligence?.text || "Synchronizing with neural cluster..."}</p>
                     </div>

                     <div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-3">Suggested Actions</h4>
                        <div className="space-y-3">
                           {actions.map(action => (
                              <div key={action.id} className="p-3 bg-[#2a2a2a] border border-[#333] rounded-xl hover:border-indigo-500/50 transition-colors">
                                 <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-bold text-white">{action.name}</span>
                                    <span className={`text-[9px] uppercase font-black px-1.5 py-0.5 rounded ${action.status === 'executed' ? 'bg-green-500/20 text-green-400' : 'bg-indigo-500/20 text-indigo-400'}`}>{action.status}</span>
                                 </div>
                                 <p className="text-[10px] text-gray-400 mb-3">{action.description}</p>
                                 <button disabled={action.status === 'executed'} className="w-full py-1.5 bg-[#333] hover:bg-indigo-600 text-white rounded text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 disabled:hover:bg-[#333]">
                                    {action.status === 'executed' ? 'Completed' : 'Execute'}
                                 </button>
                              </div>
                           ))}
                           {actions.length === 0 && <p className="text-[10px] text-gray-500 italic text-center">No actions detected yet.</p>}
                        </div>
                     </div>
                  </div>
                )}
             </div>
          </div>
        )}
      </div>

            {/* 4. Floating Control Bar */}
      <div
        ref={controlBarRef}
        className={`absolute z-50 flex items-center py-3 bg-[#222]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-visible transition-all duration-300 ${controlBarPosition ? '' : 'bottom-8 right-6'} ${isBottomBarCollapsed ? 'w-[210px] px-3 gap-2' : 'w-[min(96vw,900px)] px-6 gap-3'}`}
        style={controlBarPosition ? { left: `${controlBarPosition.x}px`, top: `${controlBarPosition.y}px` } : undefined}
      >
        {isBottomBarCollapsed ? (
          <>
            <button
              onPointerDown={beginControlBarDrag}
              className="p-2 rounded-lg text-slate-300 hover:bg-[#333] hover:text-white transition-all"
              title="Move controls"
            >
              <GripHorizontal size={16} />
            </button>
            <div className="flex items-center gap-1 pr-2 border-r border-white/10">
              <span className="text-xs font-bold text-gray-400 tabular-nums">{formatTime(duration)}</span>
            </div>
            <button
              onClick={() => setIsBottomBarCollapsed(false)}
              className="ml-auto p-2 rounded-lg text-slate-300 hover:bg-[#333] hover:text-white transition-all"
              title="Expand controls"
            >
              <ChevronRight size={16} className="rotate-180" />
            </button>
          </>
        ) : (
          <>
            <button
              onPointerDown={beginControlBarDrag}
              className="p-2 rounded-lg text-slate-300 hover:bg-[#333] hover:text-white transition-all"
              title="Move controls"
            >
              <GripHorizontal size={16} />
            </button>
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
                  {[':+1:', '<3', ':D', 'clap', 'wave'].map(emoji => (
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
            <button onClick={handleTerminate} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg transition-all active:scale-95">{isMeetingSession ? 'End Meeting' : 'Leave'}</button>
            <button
              onClick={() => setIsBottomBarCollapsed(true)}
              className="p-2 rounded-lg text-slate-300 hover:bg-[#333] hover:text-white transition-all"
              title="Collapse controls"
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}
      </div>

      {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
        <audio
          key={`remote-audio-${userId}-${stream.id}`}
          ref={(el) => bindRemoteAudioEl(userId, el)}
          autoPlay
          playsInline
          className="hidden"
        />
      ))}

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
                    <button key={user.id} onClick={() => { onInviteParticipant(user.id); callUser(buildIdentityKey(user), user.id); setShowInviteModal(false); }} className="w-full p-3 bg-[#2a2a2a] rounded-lg flex items-center gap-3 hover:bg-indigo-600 transition-colors group">
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

