/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
  readonly VITE_TWILIO_SIP_DOMAIN?: string;
  readonly VITE_TWILIO_SIP_WSS_URL?: string;
  readonly VITE_TWILIO_SIP_WSS_FALLBACK_URL?: string;
  readonly VITE_TWILIO_SIP_WSS_URLS?: string;
  readonly VITE_TWILIO_SIP_USERNAME?: string;
  readonly VITE_TWILIO_SIP_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
