
// Define User Roles
export const UserRole = {
  ADMIN: 'ADMIN',
  SUPERVISOR: 'SUPERVISOR',
  AGENT: 'AGENT',
  ANALYST: 'ANALYST'
};

// Mock Token Verification
const verifyToken = async (token) => {
  if (token === 'dev-admin-token') return { uid: 'admin-1', email: 'admin@connectai.com', role: UserRole.ADMIN };
  if (token === 'dev-agent-token') return { uid: 'agent-1', email: 'agent@connectai.com', role: UserRole.AGENT };
  return null; // Invalid
};

/**
 * Middleware to authenticate requests.
 */
export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // For demo purposes, we allow unauthenticated requests to proceed as 'GUEST' or fail.
    // Let's fail for strict mode.
    // return res.status(401).json({ error: 'Unauthorized: No token provided' });
    
    // DEV MODE BYPASS:
    req.user = { uid: 'dev-1', role: UserRole.ADMIN }; 
    return next();
  }

  const token = authHeader.split(' ')[1];
  const user = await verifyToken(token);

  if (!user) {
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }

  req.user = user;
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
