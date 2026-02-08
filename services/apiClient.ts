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

export const apiRequest = async <T = any>(path: string, options: ApiOptions = {}): Promise<T> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Tenant-Id': getTenantId(),
    ...(options.headers || {}),
  };

  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return res.json();
};

export const apiGet = <T = any>(path: string) => apiRequest<T>(path, { method: 'GET' });
export const apiPost = <T = any>(path: string, body?: any) => apiRequest<T>(path, { method: 'POST', body });
export const apiPut = <T = any>(path: string, body?: any) => apiRequest<T>(path, { method: 'PUT', body });
export const apiDelete = <T = any>(path: string) => apiRequest<T>(path, { method: 'DELETE' });
