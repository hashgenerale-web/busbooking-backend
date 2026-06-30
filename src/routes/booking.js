const express = require('express');
const { routesRepo, registrationsRepo, allocationsRepo, todayStr } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { buildTransparencyReport } = require('../services/allocation');

const router = express.Router();

function getWindowTimes() {
  const now = new Date();
  const closeHour = parseInt(process.env.REGISTRATION_CLOSE_HOUR || '15');
  const closeMinute = parseInt(process.env.REGISTRATION_CLOSE_MINUTE || '30');
  const withdrawHour = parseInt(process.env.WITHDRAWAL_DEADLINE_HOUR || '14');
  const openHour = parseInt(process.env.REGISTRATION_OPEN_HOUR || '9');

  const openTime = new Date(); openTime.setHours(openHour, 0, 0, 0);
  const closeTime = new Date(); closeTime.setHours(closeHour, closeMinute, 0, 0);
  const withdrawTime = new Date(); withdrawTime.setHours(withdrawHour, 0, 0, 0);

  return {
    now, openTime, closeTime, withdrawTime,
    isOpen: now >= openTime && now < closeTime,
    canWithdraw: now < withdrawTime,
    isAllocated: now >= closeTime,
  };
}

// GET /api/booking/status — today's booking window status + user's result
router.get('/status', requireAuth, async (req, res) => {
  try {
    const today = todayStr();
    const { isOpen, canWithdraw, isAllocated } = getWindowTimes();

    const [activeRoutes, todayRegs, todayAllocs] = await Promise.all([
      routesRepo.findActive(),
      registrationsRepo.findActiveByDate(today),
      allocationsRepo.findByDate(today),
    ]);

    const totalSeats = activeRoutes.reduce((s, r) => s + r.capacity, 0);
    const myReg = todayRegs.find((r) => r.staffId === req.user.id);
    const myAlloc = todayAllocs.find((a) => a.staffId === req.user.id);

    let myResult = null;
    if (myAlloc) {
      const route = activeRoutes.find((r) => r.id === myAlloc.routeId);
      myResult = { seat: myAlloc.seatNumber, route: route ? route.name : 'Unknown' };
    } else if (myReg && isAllocated) {
      myResult = { seat: 'NA', route: null };
    }

    const report = isAllocated ? await buildTransparencyReport(today) : null;

    return res.json({
      isOpen,
      isAllocated,
      canWithdraw,
      registeredCount: todayRegs.length,
      totalSeats,
      myRegistration: myReg ? { routeId: myReg.routeId, registeredAt: myReg.registeredAt } : null,
      myResult,
      transparencyReport: report,
      routes: activeRoutes.map((r) => ({ id: r.id, name: r.name, stops: r.stops, capacity: r.capacity })),
      daysSinceLastSeat: req.user.daysSinceLastSeat,
    });
  } catch (err) {
    console.error('[Booking] status error:', err);
    return res.status(500).json({ error: 'Could not load booking status' });
  }
});

// POST /api/booking/register — idempotent: duplicate calls are safe
router.post('/register', requireAuth, async (req, res) => {
  try {
    const { routeId } = req.body;
    const today = todayStr();
    const { isOpen } = getWindowTimes();

    if (!isOpen) {
      return res.status(400).json({ error: 'Registration window is not open' });
    }
    if (req.user.isBlocked) {
      return res.status(403).json({ error: 'Your booking access has been suspended' });
    }

    const route = await routesRepo.findById(routeId);
    if (!route || !route.isActive) {
      return res.status(400).json({ error: 'Invalid or inactive route' });
    }

    // Idempotency check #1 — fast path, avoids hitting the DB constraint
    const existing = await registrationsRepo.findActiveForStaffOnDate(req.user.id, today);
    if (existing) {
      return res.json({ ok: true, message: 'Already registered', registration: existing });
    }

    // Idempotency check #2 — the unique partial index in Postgres
    // (uniq_active_registration) is the real source of truth. If two
    // requests race past the check above at the exact same millisecond,
    // the database itself rejects the second insert rather than the
    // application — this is what actually prevents double-booking under
    // concurrent load, not the JS check.
    try {
      const reg = await registrationsRepo.create({ staffId: req.user.id, routeId, date: today });
      return res.json({ ok: true, message: 'Registered successfully', registration: reg });
    } catch (err) {
      if (err.code === '23505') { // unique_violation
        const reg = await registrationsRepo.findActiveForStaffOnDate(req.user.id, today);
        return res.json({ ok: true, message: 'Already registered', registration: reg });
      }
      throw err;
    }
  } catch (err) {
    console.error('[Booking] register error:', err);
    return res.status(500).json({ error: 'Could not complete registration, please try again' });
  }
});

// POST /api/booking/withdraw
router.post('/withdraw', requireAuth, async (req, res) => {
  try {
    const today = todayStr();
    const { canWithdraw } = getWindowTimes();

    if (!canWithdraw) {
      return res.status(400).json({ error: 'Withdrawal deadline has passed' });
    }

    const reg = await registrationsRepo.findActiveForStaffOnDate(req.user.id, today);
    if (!reg) return res.status(400).json({ error: 'No active registration found for today' });

    await registrationsRepo.withdraw(reg.id);
    return res.json({ ok: true, message: 'Registration withdrawn' });
  } catch (err) {
    console.error('[Booking] withdraw error:', err);
    return res.status(500).json({ error: 'Could not withdraw registration' });
  }
});

// GET /api/booking/history
router.get('/history', requireAuth, async (req, res) => {
  try {
    const allocs = await allocationsRepo.findForStaffHistory(req.user.id, 30);
    const routes = await routesRepo.findAll();
    const routeById = new Map(routes.map((r) => [r.id, r]));
    return res.json(allocs.map((a) => ({
      date: a.date,
      seat: a.seatNumber,
      route: routeById.get(a.routeId)?.name || 'Unknown',
    })));
  } catch (err) {
    console.error('[Booking] history error:', err);
    return res.status(500).json({ error: 'Could not load history' });
  }
});

module.exports = router;
