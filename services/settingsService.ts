import { apiGet, apiPut } from './apiClient';
import { AppSettings, StartupGuardReport } from '../types';

const getTenantKey = () => {
  const tenantId =
    localStorage.getItem('connectai_tenant_id') ||
    (import.meta.env as any).VITE_TENANT_ID ||
    (import.meta.env as any).VITE_DEFAULT_TENANT_ID ||
    'default-tenant';
  return `connectai_settings_cache_${tenantId}`;
};

const readCachedSettings = (): AppSettings | null => {
  try {
    const raw = localStorage.getItem(getTenantKey());
    if (!raw) return null;
    return JSON.parse(raw) as AppSettings;
  } catch {
    return null;
  }
};

const writeCachedSettings = (settings: AppSettings) => {
  try {
    localStorage.setItem(getTenantKey(), JSON.stringify(settings));
  } catch {
    // ignore cache write failures
  }
};

const stripSettingsMeta = (settings: AppSettings) => {
  const { _meta, ...payload } = (settings as any) || {};
  return payload as AppSettings;
};

export const saveSettingsApi = async (settings: AppSettings) => {
  const payload = stripSettingsMeta(settings);
  writeCachedSettings(payload);
  const saved = await apiPut('/api/settings', payload);
  writeCachedSettings(saved);
  return saved;
};

export const fetchSettingsApi = async (): Promise<AppSettings> => {
  try {
    const settings = await apiGet<AppSettings>('/api/settings');
    writeCachedSettings(settings);
    return settings;
  } catch (err) {
    const cached = readCachedSettings();
    if (cached) return cached;
    throw err;
  }
};

export const fetchStartupGuardReport = async (): Promise<StartupGuardReport> => {
  return apiGet<StartupGuardReport>('/api/startup-guard');
};
