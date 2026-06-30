const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { staffRepo, sessionsRepo } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const staff = await staffRepo.findByUsername(username);
    if (!staff) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = bcrypt.compareSync(password, staff.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    if (staff.isBlocked) {
      return res.status(403).json({
        error: `Your booking access is currently suspended. Reason: ${staff.blockReason || 'Contact admin'}`,
      });
    }

    const secret = process.env.JWT_SECRET || 'dev-secret';
    const token = jwt.sign({ id: staff.id }, secret, { expiresIn: '12h' });

    // Single-session enforcement: this overwrites any previous session row
    // for this staff member, so a previously issued token stops validating.
    await sessionsRepo.set(staff.id, token);

    return res.json({
      token,
      user: {
        id: staff.id,
        name: staff.name,
        username: staff.username,
        department: staff.department,
        isAdmin: staff.isAdmin,
        isNewStaff: staff.isNewStaff,
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    return res.status(500).json({ error: 'Login failed, please try again' });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  await sessionsRepo.remove(req.user.id);
  return res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const s = req.user;
  return res.json({
    id: s.id,
    name: s.name,
    username: s.username,
    department: s.department,
    isAdmin: s.isAdmin,
    isNewStaff: s.isNewStaff,
    daysSinceLastSeat: s.daysSinceLastSeat,
    totalTrips: s.totalTrips,
  });
});

module.exports = router;
