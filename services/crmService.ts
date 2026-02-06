
import { apiGet, apiPost } from './apiClient';
import { CrmContact, CrmTask } from '../types';

export const lookupCrmContact = async (phoneNumber: string, platform: 'HubSpot' | 'Pipedrive' = 'HubSpot'): Promise<CrmContact | null> => {
  try {
    const data = await apiGet(`/crm/contacts?phone=${encodeURIComponent(phoneNumber)}&platform=${platform}`);
    return data?.contact || null;
  } catch (e) {
    console.error("CRM Lookup Failed", e);
    return null;
  }
};

export const fetchCrmTasks = async (): Promise<CrmTask[]> => {
  try {
    const data = await apiGet('/crm/tasks');
    return data || [];
  } catch {
    return [];
  }
};
