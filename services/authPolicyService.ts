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

const policyCache = new Map<string, { policy: AuthPolicy; at: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export const fetchAuthPolicy = async (email: string): Promise<AuthPolicy> => {
  const key = (email || '').toLowerCase().trim();
  const cached = policyCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.policy;
  }
  const params = new URLSearchParams({ email });
  const policy = await apiGet(`/api/auth/policy?${params.toString()}`);
  policyCache.set(key, { policy, at: Date.now() });
  return policy;
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
