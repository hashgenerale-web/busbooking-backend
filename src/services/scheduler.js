const { runAllocation } = require('./allocation');

let schedulerTimer = null;

function msUntilTime(hour, minute) {
  const now = new Date();
  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  return target - now;
}

function startScheduler() {
  const hour = parseInt(process.env.ALLOCATION_HOUR || '15');
  const minute = parseInt(process.env.ALLOCATION_MINUTE || '30');

  function schedule() {
    const delay = msUntilTime(hour, minute);
    console.log(`[Scheduler] Allocation will run in ${Math.round(delay / 60000)} minutes`);
    schedulerTimer = setTimeout(async () => {
      console.log('[Scheduler] Running daily seat allocation...');
      try {
        const result = await runAllocation();
        if (result.alreadyRun) {
          console.log('[Scheduler] Allocation already ran today, skipping.');
        } else {
          console.log(`[Scheduler] Allocation complete. ${result.allocations.length} seats assigned.`);
        }
      } catch (err) {
        console.error('[Scheduler] Allocation failed:', err);
      }
      schedule();
    }, delay);
  }

  schedule();
}

function stopScheduler() {
  if (schedulerTimer) clearTimeout(schedulerTimer);
}

module.exports = { startScheduler, stopScheduler };
