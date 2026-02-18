export const normalizeEmail = (value?: string): string => (value || '').trim().toLowerCase();

export const normalizeName = (value?: string): string =>
  (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

export interface IdentitySource {
  id?: string | null;
  email?: string | null;
  name?: string | null;
}

export const buildIdentityKey = ({ id, email, name }: IdentitySource): string => {
  const normalizedEmail = normalizeEmail(email || undefined);
  if (normalizedEmail) return `email:${normalizedEmail}`;
  const normalizedId = String(id || '').trim();
  if (normalizedId) return `id:${normalizedId}`;
  const normalizedName = normalizeName(name || undefined);
  if (normalizedName) return `name:${normalizedName}`;
  return 'unknown';
};

const hashIdentity = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const buildPeerId = (identityKey: string): string => {
  const normalized = String(identityKey || '').trim().toLowerCase();
  const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42) || 'peer';
  return `connectai-peer-${slug}-${hashIdentity(normalized || 'peer')}`;
};
