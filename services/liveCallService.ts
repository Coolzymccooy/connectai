
import { GoogleGenAI, LiveServerMessage, Modality, LiveSession } from "@google/genai";
import { TranscriptSegment } from "../types";

// --- AUDIO UTILITIES ---

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Float32Array to 16-bit PCM
function floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(i * 2, s, true);
  }
  return buffer;
}

// Decode raw PCM (24kHz default from Gemini)
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  if (data.byteLength % 2 !== 0) {
    data = data.subarray(0, data.byteLength - 1);
  }
  
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- SERVICE CLASS ---

interface LiveCallConfig {
  persona: string;
  onTranscriptUpdate: (segment: TranscriptSegment) => void;
  onAudioOutput: (active: boolean) => void;
  onDisconnect: () => void;
  onVolumeChange?: (level: number) => void; // For visualizer
}

export class LiveCallService {
  private ai: GoogleGenAI | null = null;
  private sessionPromise: Promise<LiveSession> | null = null;
  private audioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private outputNode: GainNode | null = null;
  private stream: MediaStream | null = null;
  private nextStartTime = 0;
  private isProcessing = false;
  
  // Transcription State
  private currentInputTranscript = '';
  private currentOutputTranscript = '';

  constructor(private config: LiveCallConfig) {}

  private async fetchLiveToken(): Promise<string> {
    const response = await fetch('/api/gemini/live-token', { method: 'POST' });
    if (!response.ok) throw new Error('Unable to fetch Live API token');
    const data = await response.json();
    if (!data?.token) throw new Error('Live API token missing');
    return data.token;
  }

  async start() {
    this.isProcessing = true;

    const token = await this.fetchLiveToken();
    this.ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });
    
    // Initializing AudioContext with standard 16kHz for model compatibility
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const actualSampleRate = this.audioContext.sampleRate;
    console.log(`[Audio] Context created at ${actualSampleRate}Hz`);

    this.outputNode = this.audioContext.createGain();
    this.outputNode.gain.value = 1.5; 
    this.outputNode.connect(this.audioContext.destination);

    // Get Microphone Stream
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }});
    } catch (e) {
      console.error("Microphone access failed", e);
      throw new Error("Microphone access denied. Please allow permissions.");
    }

    // Connect to Gemini Live
    // Fix: Updated model name to gemini-2.5-flash-native-audio-preview-12-2025 as per latest guidelines
    if (!this.ai) throw new Error('Live client unavailable');
    this.sessionPromise = this.ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: this.config.persona,
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
        },
        // Transcription config set to empty objects as per guidelines
        inputAudioTranscription: {}, 
        outputAudioTranscription: {}
      },
      callbacks: {
        onopen: () => this.handleOpen(actualSampleRate),
        onmessage: this.handleMessage.bind(this),
        onclose: () => {
          console.log("Live session closed");
          if (this.isProcessing) this.config.onDisconnect();
        },
        onerror: (err) => {
          console.error("Live session error:", err);
          if (this.isProcessing) this.config.onDisconnect();
        }
      }
    });
  }

  private handleOpen(sampleRate: number) {
    console.log("Live Session Connected");
    if (!this.audioContext || !this.stream || !this.sessionPromise) return;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    this.inputSource = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.inputSource.connect(this.analyser);
    this.analyser.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    // Audio Level Monitoring Loop
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    const checkVolume = () => {
        if (!this.isProcessing || !this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a,b) => a+b, 0) / dataArray.length;
        this.config.onVolumeChange?.(avg);
        requestAnimationFrame(checkVolume);
    };
    checkVolume();

    // Solely rely on sessionPromise resolves to send real-time input
    this.processor.onaudioprocess = (e) => {
      if (!this.isProcessing) return;
      
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = floatTo16BitPCM(inputData);
      const uint8 = new Uint8Array(pcm16);
      const base64 = encode(uint8);

      this.sessionPromise?.then(session => {
        session.sendRealtimeInput({
          media: {
            mimeType: 'audio/pcm;rate=16000', 
            data: base64
          }
        });
      });
    };
  }

  private async handleMessage(message: LiveServerMessage) {
    if (!this.audioContext || !this.outputNode || !this.isProcessing) return;

    // 1. Audio Output
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData) {
      if (this.audioContext.state === 'suspended') await this.audioContext.resume();
      this.config.onAudioOutput(true);
      
      const currentTime = this.audioContext.currentTime;
      // Gapless playback scheduling
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime;
      }
      
      try {
        const audioBuffer = await decodeAudioData(
          decode(audioData),
          this.audioContext,
          24000, 
          1
        );

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputNode);
        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
        
        source.onended = () => {
           if (this.audioContext && this.audioContext.currentTime >= this.nextStartTime - 0.1) {
             this.config.onAudioOutput(false);
           }
        };
      } catch (e) {
        console.error("Error decoding audio data", e);
      }
    }

    // 2. Transcripts
    const inputTranscript = message.serverContent?.inputTranscription?.text;
    if (inputTranscript) {
      this.currentInputTranscript += inputTranscript;
      this.config.onTranscriptUpdate({
        id: 'temp_user',
        speaker: 'agent',
        text: this.currentInputTranscript,
        timestamp: Date.now(),
        isFinal: false
      });
    }

    const outputTranscript = message.serverContent?.outputTranscription?.text;
    if (outputTranscript) {
      this.currentOutputTranscript += outputTranscript;
      this.config.onTranscriptUpdate({
        id: 'temp_ai',
        speaker: 'customer',
        text: this.currentOutputTranscript,
        timestamp: Date.now(),
        isFinal: false
      });
    }

    if (message.serverContent?.turnComplete) {
      if (this.currentInputTranscript.trim()) {
        this.config.onTranscriptUpdate({
          id: Date.now().toString() + '_user',
          speaker: 'agent', 
          text: this.currentInputTranscript.trim(),
          timestamp: Date.now(),
          isFinal: true
        });
        this.currentInputTranscript = '';
      }

      if (this.currentOutputTranscript.trim()) {
        this.config.onTranscriptUpdate({
          id: Date.now().toString() + '_ai',
          speaker: 'customer', 
          text: this.currentOutputTranscript.trim(),
          timestamp: Date.now(),
          isFinal: true
        });
        this.currentOutputTranscript = '';
      }
    }
  }

  stop() {
    this.isProcessing = false;
    this.stream?.getTracks().forEach(t => t.stop());
    this.processor?.disconnect();
    this.inputSource?.disconnect();
    this.outputNode?.disconnect();
    this.analyser?.disconnect();
    this.audioContext?.close();
    this.sessionPromise?.then(session => session.close());
    
    this.stream = null;
    this.processor = null;
    this.inputSource = null;
    this.outputNode = null;
    this.audioContext = null;
    this.sessionPromise = null;
  }
}
