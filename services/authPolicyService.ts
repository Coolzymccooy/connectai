import { apiGet, apiPost } from './apiClient';

export type AuthPolicy = {
  inviteOnly: boolean;
  allowedDomains: string[];
  autoTenantByDomain: boolean;
  tenantId: string;
  invite?: {
    id: string;
    email: string;
    role?: string;
    status: 'pending' | 'accepted' | 'expired';
  } | null;
};

export const fetchAuthPolicy = async (email: string): Promise<AuthPolicy> => {
  const params = new URLSearchParams({ email });
  return await apiGet(`/api/auth/policy?${params.toString()}`);
};

export const acceptInvite = async (inviteId: string) => {
  return await apiPost('/api/invites/accept', { inviteId });
};

export const createInvite = async (payload: { email: string; role: string; tenantId?: string; expiresInDays?: number }) => {
  return await apiPost('/api/invites', payload);
};

export const fetchInvites = async (tenantId?: string) => {
  const params = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
  return await apiGet(`/api/invites${params}`);
};
