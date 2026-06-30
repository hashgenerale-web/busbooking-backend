const jwt = require('jsonwebtoken');
const { staffRepo, sessionsRepo } = require('../db');

async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');

    // Enforce single-session: token must match what's stored for this user
    const session = await sessionsRepo.get(payload.id);
    if (!session || session.token !== token) {
      return res.status(401).json({ error: 'Session expired or signed in elsewhere' });
    }

    // Fire-and-forget last-seen update; don't block the request on it
    sessionsRepo.touch(payload.id).catch(() => {});

    const staff = await staffRepo.findById(payload.id);
    if (!staff) return res.status(401).json({ error: 'User not found' });

    req.user = staff;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.error('[Auth] Unexpected error:', err);
    return res.status(500).json({ error: 'Authentication check failed' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
