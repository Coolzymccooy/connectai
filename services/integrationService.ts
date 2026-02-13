import { apiGet, apiPost } from './apiClient';

export const getIntegrationsStatus = async () => {
  try {
    return await apiGet('/api/integrations/status');
  } catch {
    return { calendar: {}, crm: {}, marketing: {} };
  }
};

export const startGoogleOAuth = async () => {
  return await apiGet('/api/oauth/google/start');
};

export const startMicrosoftOAuth = async () => {
  return await apiGet('/api/oauth/microsoft/start');
};

export const startHubSpotOAuth = async () => {
  return await apiGet('/api/oauth/hubspot/start');
};

export const getHubSpotStatus = async () => {
  return await apiGet('/api/crm/hubspot/status');
};

export const getHubSpotReadiness = async () => {
  return await apiGet('/api/oauth/hubspot/readiness');
};

export const connectCrmProvider = async (provider: 'hubspot' | 'salesforce' | 'pipedrive', credentials: Record<string, any>) => {
  return await apiPost(`/api/crm/${provider}/connect`, credentials);
};

export const syncCrmProvider = async (provider: 'hubspot' | 'salesforce' | 'pipedrive') => {
  return await apiPost(`/api/crm/${provider}/sync`, {});
};

export const connectMarketingProvider = async (provider: string, credentials: Record<string, any>) => {
  return await apiPost(`/api/marketing/${provider}/connect`, credentials);
};

export const syncMarketingProvider = async (provider: string) => {
  return await apiPost(`/api/marketing/${provider}/sync`, {});
};
