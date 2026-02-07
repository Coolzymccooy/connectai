
import jwt from 'jsonwebtoken';

// Define User Roles
export const UserRole = {
  ADMIN: 'ADMIN',
  SUPERVISOR: 'SUPERVISOR',
  AGENT: 'AGENT',
  ANALYST: 'ANALYST'
};

const AUTH_MODE = process.env.AUTH_MODE || 'dev'; // dev | strict
const AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || '';
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || 'default-tenant';

const verifyToken = async (token) => {
  if (!AUTH_JWT_SECRET) return null;
  try {
    const payload = jwt.verify(token, AUTH_JWT_SECRET);
    if (!payload || typeof payload !== 'object') return null;
    return {
      uid: payload.sub || payload.uid || payload.userId,
      email: payload.email,
      role: payload.role || UserRole.AGENT,
      tenantId: payload.tenantId || DEFAULT_TENANT_ID,
      name: payload.name,
    };
  } catch {
    return null;
  }
};

/**
 * Middleware to authenticate requests.
 */
export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const tenantHeader = req.headers['x-tenant-id'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (AUTH_MODE === 'strict') {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    req.user = {
      uid: 'dev-1',
      role: UserRole.ADMIN,
      tenantId: (tenantHeader || DEFAULT_TENANT_ID).toString(),
      name: 'Dev Admin',
    };
    req.tenantId = req.user.tenantId;
    return next();
  }

  const token = authHeader.split(' ')[1];
  const user = await verifyToken(token);

  if (!user) {
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }

  req.user = user;
  req.tenantId = user.tenantId || DEFAULT_TENANT_ID;
  next();
};

/**
 * Middleware factory to authorize specific roles.
 */
export const authorize = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden: Requires one of [${allowedRoles.join(', ')}]` });
    }

    next();
  };
};
