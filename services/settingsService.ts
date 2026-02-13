import { apiGet, apiPut } from './apiClient';
import { AppSettings } from '../types';

export const saveSettingsApi = async (settings: AppSettings) => {
  return await apiPut('/api/settings', settings);
};

export const fetchSettingsApi = async (): Promise<AppSettings> => {
  return await apiGet('/api/settings');
};
