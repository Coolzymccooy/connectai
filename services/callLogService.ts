import { apiGet, apiPost, apiPut } from './apiClient';
import type { Call } from '../types';

export type CallLogFilters = {
  agentId?: string;
  direction?: string;
  startDate?: number;
  endDate?: number;
  status?: string;
  limit?: number;
};

const toQuery = (filters: CallLogFilters) => {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.direction) params.set('direction', filters.direction);
  if (filters.agentId) params.set('agentId', filters.agentId);
  if (filters.startDate) params.set('startDate', String(filters.startDate));
  if (filters.endDate) params.set('endDate', String(filters.endDate));
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

export const fetchCallLogs = async (filters: CallLogFilters = {}): Promise<Call[]> => {
  const query = toQuery(filters);
  return apiGet<Call[]>(`/api/calls${query}`);
};

export const createCall = async (call: Partial<Call>): Promise<Call> => {
  return apiPost<Call>('/api/calls', call);
};

export const updateCall = async (id: string, updates: Partial<Call>): Promise<Call> => {
  return apiPut<Call>(`/api/calls/${encodeURIComponent(id)}`, updates);
};
