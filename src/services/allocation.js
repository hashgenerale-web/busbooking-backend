const { staffRepo, routesRepo, registrationsRepo, allocationsRepo, todayStr } = require('../db');

/**
 * Allocation algorithm (rotation / priority-score based)
 *
 * Priority order:
 *  1. New staff (within their priority window)
 *  2. Highest daysSinceLastSeat (most days missed = highest priority)
 *  3. Tie-break: random shuffle (fair lottery)
 *
 * Process:
 *  - Get today's registrations (not withdrawn, staff not blocked)
 *  - Split by route preference
 *  - For each route, rank candidates by priority and assign seats
 *  - Staff who don't get a seat get daysSinceLastSeat incremented
 *  - Staff who get a seat get daysSinceLastSeat reset to 0
 */
async function runAllocation() {
  const today = todayStr();

  // Prevent double allocation
  const existingAlloc = await allocationsRepo.findByDate(today);
  if (existingAlloc.length > 0) {
    return { alreadyRun: true, allocations: existingAlloc };
  }

  const todayRegs = await registrationsRepo.findActiveByDate(today);
  if (todayRegs.length === 0) {
    return { alreadyRun: false, allocations: [] };
  }

  const [activeRoutes, allStaff] = await Promise.all([
    routesRepo.findActive(),
    staffRepo.findAll(),
  ]);
  const staffById = new Map(allStaff.map((s) => [s.id, s]));

  const newAllocations = [];
  const priorityUpdates = []; // batched write at the end

  for (const route of activeRoutes) {
    const routeRegs = todayRegs.filter((r) => r.routeId === route.id);
    const candidates = routeRegs
      .map((reg) => {
        const staff = staffById.get(reg.staffId);
        if (!staff || staff.isBlocked) return null;
        return { reg, staff };
      })
      .filter(Boolean);

    // Sort by priority
    candidates.sort((a, b) => {
      const aNew = isNewStaff(a.staff) ? 1 : 0;
      const bNew = isNewStaff(b.staff) ? 1 : 0;
      if (bNew !== aNew) return bNew - aNew;
      if (b.staff.daysSinceLastSeat !== a.staff.daysSinceLastSeat) {
        return b.staff.daysSinceLastSeat - a.staff.daysSinceLastSeat;
      }
      return Math.random() - 0.5;
    });

    const seats = route.capacity;
    candidates.forEach((c, idx) => {
      if (idx < seats) {
        newAllocations.push({
          staffId: c.staff.id,
          routeId: route.id,
          seatNumber: String(idx + 1).padStart(2, '0'),
          date: today,
        });
        priorityUpdates.push({
          id: c.staff.id,
          daysSinceLastSeat: 0,
          totalTrips: (c.staff.totalTrips || 0) + 1,
        });
      } else {
        priorityUpdates.push({
          id: c.staff.id,
          daysSinceLastSeat: (c.staff.daysSinceLastSeat || 0) + 1,
          totalTrips: c.staff.totalTrips || 0,
        });
      }
    });
  }

  const [inserted] = await Promise.all([
    allocationsRepo.bulkCreate(newAllocations),
    staffRepo.bulkUpdatePriority(priorityUpdates),
    staffRepo.unblockExpired(today),
  ]);

  return { alreadyRun: false, allocations: inserted };
}

function isNewStaff(staff) {
  if (!staff.isNewStaff) return false;
  if (!staff.newStaffUntil) return false;
  return staff.newStaffUntil >= todayStr();
}

/**
 * Build the full transparency report for a given date.
 * Returns every registered staff member with their seat (or NA).
 */
async function buildTransparencyReport(date) {
  const day = date || todayStr();
  const [regs, allocs, allStaff, allRoutes] = await Promise.all([
    registrationsRepo.findActiveByDate(day),
    allocationsRepo.findByDate(day),
    staffRepo.findAll(),
    routesRepo.findAll(),
  ]);
  const staffById = new Map(allStaff.map((s) => [s.id, s]));
  const routeById = new Map(allRoutes.map((r) => [r.id, r]));

  return regs
    .map((reg) => {
      const staff = staffById.get(reg.staffId);
      const route = routeById.get(reg.routeId);
      const alloc = allocs.find((a) => a.staffId === reg.staffId);
      return {
        staffId: reg.staffId,
        name: staff ? staff.name : 'Unknown',
        department: staff ? staff.department : '-',
        route: route ? route.name : 'Unknown',
        seat: alloc ? alloc.seatNumber : 'NA',
        priorityScore: staff ? staff.daysSinceLastSeat : 0,
        isNewStaff: staff ? isNewStaff(staff) : false,
        registeredAt: reg.registeredAt,
      };
    })
    .sort((a, b) => {
      if (a.seat === 'NA' && b.seat !== 'NA') return 1;
      if (a.seat !== 'NA' && b.seat === 'NA') return -1;
      if (a.seat !== 'NA' && b.seat !== 'NA') return a.seat.localeCompare(b.seat);
      return b.priorityScore - a.priorityScore;
    });
}

module.exports = { runAllocation, buildTransparencyReport, isNewStaff };
