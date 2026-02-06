import { apiPut } from './apiClient';
import { AppSettings } from '../types';

export const saveSettingsApi = async (settings: AppSettings) => {
  return await apiPut('/settings', settings);
};
