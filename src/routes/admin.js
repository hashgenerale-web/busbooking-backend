const express = require('express');
const bcrypt = require('bcryptjs');
const {
  staffRepo, routesRepo, registrationsRepo, allocationsRepo,
  sessionsRepo, auditRepo, todayStr,
} = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { runAllocation, buildTransparencyReport } = require('../services/allocation');

const router = express.Router();
router.use(requireAuth, requireAdmin);

function audit(req, action, targetId, detail) {
  // Fire-and-forget so a logging failure never blocks the admin action itself
  auditRepo.log(req.user.id, action, targetId, detail).catch((e) => console.error('[Audit] log failed:', e));
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const today = todayStr();
    const [activeRoutes, todayRegs, todayAllocs, allStaff, sessions, report] = await Promise.all([
      routesRepo.findActive(),
      registrationsRepo.findActiveByDate(today),
      allocationsRepo.findByDate(today),
      staffRepo.findAll(),
      sessionsRepo.findAll(),
      buildTransparencyReport(today),
    ]);

    const totalSeats = activeRoutes.reduce((s, r) => s + r.capacity, 0);
    const blocked = allStaff.filter((s) => s.isBlocked);
    const staffById = new Map(allStaff.map((s) => [s.id, s]));

    const routeBreakdown = activeRoutes.map((r) => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity,
      registered: todayRegs.filter((reg) => reg.routeId === r.id).length,
      allocated: todayAllocs.filter((a) => a.routeId === r.id).length,
    }));

    return res.json({
      today,
      registeredCount: todayRegs.length,
      totalSeats,
      allocatedCount: todayAllocs.length,
      unmetCount: Math.max(0, todayRegs.length - totalSeats),
      blockedCount: blocked.length,
      allocationRun: todayAllocs.length > 0,
      routeBreakdown,
      transparencyReport: report,
      activeSessions: sessions.map((s) => ({
        staffId: s.staffId,
        name: staffById.get(s.staffId)?.name || 'Unknown',
        lastSeen: s.lastSeen,
      })),
    });
  } catch (err) {
    console.error('[Admin] dashboard error:', err);
    return res.status(500).json({ error: 'Could not load dashboard' });
  }
});

// ─── Manual allocation trigger ────────────────────────────────────────────────
router.post('/allocate', async (req, res) => {
  try {
    const result = await runAllocation();
    audit(req, 'manual_allocation', null, result.alreadyRun ? 'Already run' : `${result.allocations.length} seats assigned`);
    return res.json(result);
  } catch (err) {
    console.error('[Admin] allocate error:', err);
    return res.status(500).json({ error: 'Allocation failed' });
  }
});

// ─── Reset today ──────────────────────────────────────────────────────────────
router.post('/reset-today', async (req, res) => {
  try {
    const today = todayStr();
    await Promise.all([
      registrationsRepo.deleteByDate(today),
      allocationsRepo.deleteByDate(today),
    ]);
    audit(req, 'reset_today', null, today);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] reset error:', err);
    return res.status(500).json({ error: 'Could not reset today' });
  }
});

// ─── Staff management ─────────────────────────────────────────────────────────
router.get('/staff', async (req, res) => {
  try {
    const staff = await staffRepo.findAll();
    return res.json(staff.map(({ passwordHash, ...rest }) => rest)); // never expose hashes
  } catch (err) {
    console.error('[Admin] list staff error:', err);
    return res.status(500).json({ error: 'Could not load staff' });
  }
});

router.post('/staff', async (req, res) => {
  try {
    const { name, username, department, password, isAdmin, isNewStaff } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ error: 'name, username, password required' });
    }
    const existing = await staffRepo.findByUsername(username);
    if (existing) return res.status(400).json({ error: 'Username already exists' });

    const staff = await staffRepo.create({
      name,
      username,
      department,
      passwordHash: bcrypt.hashSync(password, 10),
      isAdmin: isAdmin || false,
      isNewStaff: isNewStaff || false,
      newStaffUntil: isNewStaff ? new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) : null,
    });
    audit(req, 'add_staff', staff.id, `Added ${name}`);
    return res.status(201).json({ ok: true, id: staff.id });
  } catch (err) {
    console.error('[Admin] add staff error:', err);
    return res.status(500).json({ error: 'Could not add staff' });
  }
});

router.patch('/staff/:id', async (req, res) => {
  try {
    const patch = {};
    ['name', 'department', 'isAdmin', 'isNewStaff'].forEach((k) => {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    });
    if (req.body.password) patch.passwordHash = bcrypt.hashSync(req.body.password, 10);

    const staff = await staffRepo.update(req.params.id, patch);
    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    audit(req, 'edit_staff', staff.id, `Edited ${staff.name}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] edit staff error:', err);
    return res.status(500).json({ error: 'Could not update staff' });
  }
});

router.delete('/staff/:id', async (req, res) => {
  try {
    const staff = await staffRepo.findById(req.params.id);
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    if (staff.isAdmin) return res.status(400).json({ error: 'Cannot delete admin' });

    await staffRepo.remove(req.params.id);
    await sessionsRepo.remove(req.params.id);
    audit(req, 'delete_staff', req.params.id, `Deleted ${staff.name}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] delete staff error:', err);
    return res.status(500).json({ error: 'Could not delete staff' });
  }
});

// ─── Block / unblock (leave, remote, suspension) ──────────────────────────────
router.post('/staff/:id/block', async (req, res) => {
  try {
    const { reason, until } = req.body;
    const staff = await staffRepo.block(req.params.id, reason, until);
    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    await sessionsRepo.remove(staff.id); // force logout
    audit(req, 'block_staff', staff.id, `Blocked: ${reason}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] block staff error:', err);
    return res.status(500).json({ error: 'Could not suspend staff' });
  }
});

router.post('/staff/:id/unblock', async (req, res) => {
  try {
    const staff = await staffRepo.unblock(req.params.id);
    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    audit(req, 'unblock_staff', staff.id, `Unblocked ${staff.name}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] unblock staff error:', err);
    return res.status(500).json({ error: 'Could not restore staff access' });
  }
});

// ─── Routes management ────────────────────────────────────────────────────────
router.get('/routes', async (req, res) => {
  try {
    return res.json(await routesRepo.findAll());
  } catch (err) {
    console.error('[Admin] list routes error:', err);
    return res.status(500).json({ error: 'Could not load routes' });
  }
});

router.post('/routes', async (req, res) => {
  try {
    const { name, description, stops, capacity } = req.body;
    if (!name || !capacity) return res.status(400).json({ error: 'name and capacity required' });

    const route = await routesRepo.create({ name, description, stops, capacity: parseInt(capacity) });
    audit(req, 'add_route', route.id, `Added route: ${name}`);
    return res.status(201).json(route);
  } catch (err) {
    console.error('[Admin] add route error:', err);
    return res.status(500).json({ error: 'Could not add route' });
  }
});

router.patch('/routes/:id', async (req, res) => {
  try {
    const patch = {};
    ['name', 'description', 'stops', 'capacity', 'isActive'].forEach((k) => {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    });
    const route = await routesRepo.update(req.params.id, patch);
    if (!route) return res.status(404).json({ error: 'Route not found' });

    audit(req, 'edit_route', route.id, `Edited route: ${route.name}`);
    return res.json({ ok: true, route });
  } catch (err) {
    console.error('[Admin] edit route error:', err);
    return res.status(500).json({ error: 'Could not update route' });
  }
});

router.delete('/routes/:id', async (req, res) => {
  try {
    const route = await routesRepo.findById(req.params.id);
    if (!route) return res.status(404).json({ error: 'Route not found' });

    await routesRepo.remove(req.params.id);
    audit(req, 'delete_route', req.params.id, `Deleted route: ${route.name}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] delete route error:', err);
    return res.status(500).json({ error: 'Could not delete route' });
  }
});

// ─── Sessions ─────────────────────────────────────────────────────────────────
router.get('/sessions', async (req, res) => {
  try {
    const [sessions, allStaff] = await Promise.all([sessionsRepo.findAll(), staffRepo.findAll()]);
    const staffById = new Map(allStaff.map((s) => [s.id, s]));
    return res.json(sessions.map((s) => ({
      staffId: s.staffId,
      name: staffById.get(s.staffId)?.name || 'Unknown',
      lastSeen: s.lastSeen,
      createdAt: s.createdAt,
    })));
  } catch (err) {
    console.error('[Admin] sessions error:', err);
    return res.status(500).json({ error: 'Could not load sessions' });
  }
});

router.post('/sessions/force-logout-all', async (req, res) => {
  try {
    const before = await sessionsRepo.count();
    await sessionsRepo.removeAllExcept(req.user.id);
    audit(req, 'force_logout_all', null, `Logged out ${Math.max(0, before - 1)} sessions`);
    return res.json({ ok: true, count: Math.max(0, before - 1) });
  } catch (err) {
    console.error('[Admin] force logout all error:', err);
    return res.status(500).json({ error: 'Could not force logout' });
  }
});

router.delete('/sessions/:staffId', async (req, res) => {
  try {
    await sessionsRepo.remove(req.params.staffId);
    audit(req, 'force_logout_user', req.params.staffId, '');
    return res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] force logout user error:', err);
    return res.status(500).json({ error: 'Could not force logout' });
  }
});

// ─── Audit log ────────────────────────────────────────────────────────────────
router.get('/audit', async (req, res) => {
  try {
    return res.json(await auditRepo.recent(100));
  } catch (err) {
    console.error('[Admin] audit log error:', err);
    return res.status(500).json({ error: 'Could not load audit log' });
  }
});

// ─── Manual booking ───────────────────────────────────────────────────────────
router.post('/manual-booking', async (req, res) => {
  try {
    const { staffId, routeId, date } = req.body;
    const day = date || todayStr();

    const [staff, route] = await Promise.all([staffRepo.findById(staffId), routesRepo.findById(routeId)]);
    if (!staff || !route) return res.status(400).json({ error: 'Invalid staff or route' });

    // Remove existing allocation for that staff on that day, then check capacity
    await allocationsRepo.deleteByStaffAndDate(staffId, day);
    const existingOnRoute = (await allocationsRepo.findByDate(day)).filter((a) => a.routeId === routeId);
    if (existingOnRoute.length >= route.capacity) {
      return res.status(400).json({ error: 'Route is fully booked for this date' });
    }

    const seatNum = String(existingOnRoute.length + 1).padStart(2, '0');
    const [alloc] = await allocationsRepo.bulkCreate([{ staffId, routeId, seatNumber: seatNum, date: day }]);

    audit(req, 'manual_booking', staffId, `Manual seat ${seatNum} on ${route.name} for ${staff.name}`);
    return res.json({ ok: true, allocation: alloc });
  } catch (err) {
    console.error('[Admin] manual booking error:', err);
    return res.status(500).json({ error: 'Could not complete manual booking' });
  }
});

// ─── History export ───────────────────────────────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const { from, to } = req.query;
    const [allocs, allStaff, allRoutes] = await Promise.all([
      allocationsRepo.findInRange(from || null, to || null),
      staffRepo.findAll(),
      routesRepo.findAll(),
    ]);
    const staffById = new Map(allStaff.map((s) => [s.id, s]));
    const routeById = new Map(allRoutes.map((r) => [r.id, r]));

    return res.json(allocs.map((a) => ({
      date: a.date,
      seat: a.seatNumber,
      staffName: staffById.get(a.staffId)?.name || 'Unknown',
      department: staffById.get(a.staffId)?.department || '-',
      route: routeById.get(a.routeId)?.name || 'Unknown',
      allocatedAt: a.allocatedAt,
    })));
  } catch (err) {
    console.error('[Admin] history error:', err);
    return res.status(500).json({ error: 'Could not load history' });
  }
});

module.exports = router;
