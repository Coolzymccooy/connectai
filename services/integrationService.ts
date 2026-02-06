import { apiGet, apiPost } from './apiClient';

export const getIntegrationsStatus = async () => {
  try {
    return await apiGet('/integrations/status');
  } catch {
    return { calendar: {}, crm: {}, marketing: {} };
  }
};

export const startGoogleOAuth = async () => {
  return await apiGet('/oauth/google/start');
};

export const startMicrosoftOAuth = async () => {
  return await apiGet('/oauth/microsoft/start');
};

export const connectCrmProvider = async (provider: 'hubspot' | 'salesforce' | 'pipedrive', credentials: Record<string, any>) => {
  return await apiPost(`/crm/${provider}/connect`, credentials);
};

export const syncCrmProvider = async (provider: 'hubspot' | 'salesforce' | 'pipedrive') => {
  return await apiPost(`/crm/${provider}/sync`, {});
};

export const connectMarketingProvider = async (provider: string, credentials: Record<string, any>) => {
  return await apiPost(`/marketing/${provider}/connect`, credentials);
};

export const syncMarketingProvider = async (provider: string) => {
  return await apiPost(`/marketing/${provider}/sync`, {});
};
