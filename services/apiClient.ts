const parseJson = async (response: Response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

const request = async (method: string, path: string, body?: any) => {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await parseJson(res);
  if (!res.ok) {
    const message = (data as any)?.error || res.statusText;
    throw new Error(message);
  }
  return data;
};

export const apiGet = (path: string) => request('GET', path);
export const apiPost = (path: string, body?: any) => request('POST', path, body);
export const apiPut = (path: string, body?: any) => request('PUT', path, body);
export const apiDelete = (path: string) => request('DELETE', path);
