/**
 * Scheduler — runs daily seat allocation at the configured time.
 *
 * WHY POLLING INSTEAD OF setTimeout?
 * setTimeout with long delays (hours) is unreliable in Node.js:
 *  - It drifts over time
 *  - It is completely lost if the server restarts
 *  - It can fire early on some systems
 *
 * This implementation uses a 60-second polling loop instead.
 * Every minute it checks: "should allocation have run by now today?"
 * If yes and it hasn't run yet, it runs immediately.
 * This means:
 *  - Server restarts are safe — the check runs within 60s of coming back up
 *  - If the server was down at 3:30pm it catches up within a minute of restart
 *  - No timer drift
 */

const { runAllocation } = require('./allocation');

let pollTimer = null;
let lastCheckedDate = null;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function shouldRunNow() {
  const now = new Date();
  const hour = parseInt(process.env.ALLOCATION_HOUR || '15');
  const minute = parseInt(process.env.ALLOCATION_MINUTE || '30');

  // Only run on weekdays (Mon–Fri). Remove this check if you run on weekends.
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  // Has the allocation time passed today?
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = hour * 60 + minute;
  return nowMinutes >= targetMinutes;
}

async function runCheck() {
  const today = todayStr();

  // Avoid re-triggering every minute after allocation has already run
  if (lastCheckedDate === today + '_ran') return;

  if (!shouldRunNow()) return;

  console.log('[Scheduler] Allocation window reached — checking if allocation has run today...');

  try {
    const result = await runAllocation();

    if (result.alreadyRun) {
      console.log('[Scheduler] Allocation already ran today, skipping.');
    } else {
      console.log(`[Scheduler] Allocation complete. ${result.allocations.length} seat(s) assigned.`);
    }

    // Mark as ran for today so we don't re-trigger every minute after 3:30pm
    lastCheckedDate = today + '_ran';
  } catch (err) {
    console.error('[Scheduler] Allocation failed:', err.message);
    // Don't set lastCheckedDate so it retries next minute
  }
}

function startScheduler() {
  const hour = parseInt(process.env.ALLOCATION_HOUR || '15');
  const minute = parseInt(process.env.ALLOCATION_MINUTE || '30');

  console.log(`[Scheduler] Started — allocation runs daily at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} on weekdays`);
  console.log('[Scheduler] Polling every 60 seconds');

  // Run an immediate check on startup in case the server restarted after
  // the allocation window and today's allocation was missed
  runCheck().catch((err) => console.error('[Scheduler] Startup check failed:', err.message));

  // Then poll every 60 seconds
  pollTimer = setInterval(() => {
    runCheck().catch((err) => console.error('[Scheduler] Poll check failed:', err.message));
  }, 60 * 1000);
}

function stopScheduler() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('[Scheduler] Stopped.');
  }
}

module.exports = { startScheduler, stopScheduler };