
// Voice Configuration Service
// In production, this would fetch from an encrypted backend endpoint.

export const VOICE_CONFIG = {
  provider: 'twilio', 
  domain: import.meta.env.VITE_TWILIO_SIP_DOMAIN || '',
  wssUrl: import.meta.env.VITE_TWILIO_SIP_WSS_URL || 'wss://edge.sip.twilio.com:7443', // Standard Twilio WSS
  fallbackWssUrl: import.meta.env.VITE_TWILIO_SIP_WSS_FALLBACK_URL || '',
  wssUrls: (import.meta.env.VITE_TWILIO_SIP_WSS_URLS || '').split(',').map((v) => v.trim()).filter(Boolean),
  username: import.meta.env.VITE_TWILIO_SIP_USERNAME || '',
  password: import.meta.env.VITE_TWILIO_SIP_PASSWORD || '',
};

// Helper to check if SIP is ready
export const isVoiceReady = () => {
  return VOICE_CONFIG.username && VOICE_CONFIG.password && VOICE_CONFIG.domain;
};
