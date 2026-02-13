export type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
};

const getTenantId = () => {
  return (
    localStorage.getItem('connectai_tenant_id') ||
    (import.meta.env as any).VITE_TENANT_ID ||
    (import.meta.env as any).VITE_DEFAULT_TENANT_ID ||
    'connectai-main'
  );
};

const getAuthToken = () => {
  return localStorage.getItem('connectai_auth_token') || '';
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const shouldRetryPath = (path: string) => {
  return (
    path.startsWith('/crm') ||
    path.startsWith('/api/crm') ||
    path.startsWith('/marketing') ||
    path.startsWith('/api/marketing') ||
    path.startsWith('/integrations') ||
    path.startsWith('/api/integrations') ||
    path.startsWith('/oauth') ||
    path.startsWith('/api/oauth')
  );
};

export const apiRequest = async <T = any>(path: string, options: ApiOptions = {}): Promise<T> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Tenant-Id': getTenantId(),
    ...(options.headers || {}),
  };

  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const method = options.method || 'GET';
  const maxAttempts = shouldRetryPath(path) ? 3 : 1;
  let attempt = 0;
  let lastError: any = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const res = await fetch(path, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!res.ok) {
        const text = await res.text();
        const retryable = res.status >= 500 || res.status === 429 || res.status === 408;
        if (retryable && attempt < maxAttempts) {
          const backoff = 300 * Math.pow(2, attempt - 1);
          await sleep(backoff);
          continue;
        }
        throw new Error(text || `Request failed: ${res.status}`);
      }

      return res.json();
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts) break;
      const backoff = 300 * Math.pow(2, attempt - 1);
      await sleep(backoff);
    }
  }

  throw lastError || new Error('Request failed');
};

export const apiGet = <T = any>(path: string) => apiRequest<T>(path, { method: 'GET' });
export const apiPost = <T = any>(path: string, body?: any) => apiRequest<T>(path, { method: 'POST', body });
export const apiPut = <T = any>(path: string, body?: any) => apiRequest<T>(path, { method: 'PUT', body });
export const apiDelete = <T = any>(path: string) => apiRequest<T>(path, { method: 'DELETE' });
