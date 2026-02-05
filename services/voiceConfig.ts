
// Voice Configuration Service
// In production, this would fetch from an encrypted backend endpoint.

export const VOICE_CONFIG = {
  provider: 'twilio', 
  domain: 'shegz-connect.sip.twilio.com',
  wssUrl: 'wss://edge.sip.twilio.com', // Standard Twilio WSS
  username: 'agents',
  password: 'Connectai@2026',
};

// Helper to check if SIP is ready
export const isVoiceReady = () => {
  return VOICE_CONFIG.username && VOICE_CONFIG.password && VOICE_CONFIG.domain;
};
