export type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
};

const getTenantId = () => {
  const raw = (
    localStorage.getItem('connectai_tenant_id') ||
    (import.meta.env as any).VITE_TENANT_ID ||
    (import.meta.env as any).VITE_DEFAULT_TENANT_ID ||
    'default-tenant'
  );
  const normalized = raw === 'connectai-main' ? 'default-tenant' : raw;
  if (normalized !== raw) {
    try {
      localStorage.setItem('connectai_tenant_id', normalized);
    } catch {
      // ignore
    }
  }
  return normalized;
};

const getAuthToken = () => {
  return localStorage.getItem('connectai_auth_token') || '';
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type BackoffState = {
  backoffUntil: number;
  attempt: number;
  lastGoodResponse?: any;
};

const backoffByPath: Record<string, BackoffState> = {};

const normalizeBackoffPath = (path: string) => {
  const [base] = String(path || '').split('?');
  if (base === '/api/calls') return '/api/calls';
  if (base.startsWith('/api/calls/')) return '/api/calls/:id';
  return base || path;
};

const jitteredDelay = (baseMs: number, attempt: number) => {
  const exp = Math.min(60_000, baseMs * Math.pow(2, attempt - 1));
  const jitter = exp * (0.2 * Math.random());
  return Math.min(60_000, exp + jitter);
};

const shouldCachePath = (path: string) => {
  const normalized = normalizeBackoffPath(path);
  // Avoid backoff/cache on auth policy to prevent login loops/429 spam
  if (normalized === '/api/auth/policy') return false;
  return (
    normalized.startsWith('/api') ||
    normalized.startsWith('/crm') ||
    normalized.startsWith('/marketing') ||
    normalized.startsWith('/integrations')
  );
};

export const isBackoffActive = (path?: string) => {
  if (!path) return Object.values(backoffByPath).some((s) => s.backoffUntil > Date.now());
  const state = backoffByPath[normalizeBackoffPath(path)];
  return state ? state.backoffUntil > Date.now() : false;
};

const notifyBackoff = (() => {
  let lastAt = 0;
  const MIN_INTERVAL = 15000; // 15s to avoid toast floods
  return (path: string, until: number) => {
    const now = Date.now();
    if (now - lastAt < MIN_INTERVAL) return;
    lastAt = now;
    try {
      window.dispatchEvent(new CustomEvent('connectai-api-backoff', { detail: { path, until } }));
    } catch {
      // ignore
    }
  };
})();

export const apiRequest = async <T = any>(path: string, options: ApiOptions = {}): Promise<T> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Tenant-Id': getTenantId(),
    ...(options.headers || {}),
  };

  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const method = options.method || 'GET';
  const backoffKey = normalizeBackoffPath(path);
  const state = backoffByPath[backoffKey] || { backoffUntil: 0, attempt: 0 };
  const now = Date.now();
  if (state.backoffUntil > now) {
    if (state.lastGoodResponse !== undefined) return state.lastGoodResponse as T;
    const err: any = new Error('temporarily throttled');
    err.code = 'backoff';
    throw err;
  }

  try {
    const res = await fetch(path, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      const retryable = res.status === 429 || res.status === 503 || res.status === 502 || res.status === 500;
      if (retryable && shouldCachePath(path)) {
        const nextAttempt = state.attempt + 1;
        const delay = jitteredDelay(1000, nextAttempt);
        backoffByPath[backoffKey] = {
          backoffUntil: Date.now() + delay,
          attempt: nextAttempt,
          lastGoodResponse: state.lastGoodResponse,
        };
        notifyBackoff(backoffKey, Date.now() + delay);
      }
      const err = new Error(text || `Request failed: ${res.status}`);
      (err as any).status = res.status;
      throw err;
    }

    const payload = await res.json();
    if (shouldCachePath(path)) {
      backoffByPath[backoffKey] = { backoffUntil: 0, attempt: 0, lastGoodResponse: payload };
    }
    return payload;
  } catch (err: any) {
    // Network errors (connection refused/timeouts) also trigger backoff for cached endpoints
    if (shouldCachePath(path) && (err.code === 'backoff' || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError'))) {
      const nextAttempt = state.attempt + 1;
      const delay = jitteredDelay(1000, nextAttempt);
      backoffByPath[backoffKey] = {
        backoffUntil: Date.now() + delay,
        attempt: nextAttempt,
        lastGoodResponse: state.lastGoodResponse,
      };
      notifyBackoff(backoffKey, Date.now() + delay);
    }
    throw err;
  }
};

export const apiGet = <T = any>(path: string) => apiRequest<T>(path, { method: 'GET' });
export const apiPost = <T = any>(path: string, body?: any) => apiRequest<T>(path, { method: 'POST', body });
export const apiPut = <T = any>(path: string, body?: any) => apiRequest<T>(path, { method: 'PUT', body });
export const apiDelete = <T = any>(path: string) => apiRequest<T>(path, { method: 'DELETE' });
