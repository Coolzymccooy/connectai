
import { apiGet, apiPost } from './apiClient';
import { CrmContact, CrmTask } from '../types';

export const lookupCrmContact = async (phoneNumber: string, platform: 'HubSpot' | 'Pipedrive' = 'HubSpot'): Promise<CrmContact | null> => {
  try {
    const data = await apiGet(`/api/crm/contacts?phone=${encodeURIComponent(phoneNumber)}&platform=${platform}`);
    return data?.contact || null;
  } catch (e) {
    console.error("CRM Lookup Failed", e);
    return null;
  }
};

export const fetchCrmTasks = async (): Promise<CrmTask[]> => {
  try {
    const data = await apiGet('/api/crm/tasks');
    return data || [];
  } catch {
    return [];
  }
};

export const fetchCrmContacts = async (): Promise<CrmContact[]> => {
  try {
    const data = await apiGet('/api/crm/contacts');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

export const fetchCrmDeals = async (): Promise<any[]> => {
  try {
    const data = await apiGet('/api/crm/deals');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

export const createCrmTask = async (task: Partial<CrmTask> & Record<string, any>): Promise<CrmTask | null> => {
  try {
    const data = await apiPost('/api/crm/tasks', task);
    return data || null;
  } catch {
    return null;
  }
};

export const upsertCrmContact = async (contact: CrmContact): Promise<CrmContact | null> => {
  try {
    const data = await apiPost('/api/crm/contacts', contact);
    return data || contact;
  } catch (e) {
    console.error('CRM upsert failed', e);
    return null;
  }
};
