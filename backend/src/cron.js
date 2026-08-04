// angelyn
// cron scheduler for the weekly estate health summary
// starts when the server boots, fires every monday at 8am SGT

const cron = require('node-cron');
const { sendWeeklySummary } = require('./services/weeklySummary');
const { captureSnapshot } = require('./services/metricsSnapshot');
const { recomputeOutcomes } = require('./services/rodentSla');

let job = null;
let snapshotJob = null;
let outcomeJob = null;

function startCronJobs() {
  // capture a metric snapshot on boot so there's always a "today" row to diff
  // against, then daily just after midnight to build the trend history.
  captureSnapshot().catch(e => console.error('[cron] snapshot on boot failed:', e.message));
  snapshotJob = cron.schedule('5 0 * * *', async () => {
    try {
      await captureSnapshot();
      console.log('[cron] daily metric snapshot captured');
    } catch (e) {
      console.error('[cron] metric snapshot failed:', e.message);
    }
  });

  // Rodent SLA breaches and the 30-day recurrence question. Runs on boot so an
  // existing database gets its targets back-filled immediately, then nightly at
  // 00:20 - after the snapshot at 00:05, since both walk the same rows.
  //
  // Idempotent by construction (see recomputeOutcomes), so a double run is a no-op
  // and a missed night is caught up by the next one.
  const logOutcomes = (r) => {
    if (r.targetsBackfilled || r.breachesStamped || r.recurrenceResolved) {
      console.log(`[cron] rodent outcomes: ${r.targetsBackfilled} target(s) back-filled, `
        + `${r.breachesStamped} breach(es) stamped, ${r.recurrenceResolved} recurrence window(s) closed`);
    }
  };
  recomputeOutcomes()
    .then(logOutcomes)
    .catch(e => console.error('[cron] rodent outcomes on boot failed:', e.message));
  outcomeJob = cron.schedule('20 0 * * *', async () => {
    try {
      logOutcomes(await recomputeOutcomes());
    } catch (e) {
      console.error('[cron] rodent outcomes failed:', e.message);
    }
  });

  // 0 0 * * 1 = monday midnight UTC = 8am SGT
  // override with CRON_SCHEDULE env var for local testing (e.g. */2 * * * *)
  const schedule = process.env.CRON_SCHEDULE || '0 0 * * 1';

  if (!cron.validate(schedule)) {
    console.error(`[cron] invalid schedule "${schedule}" - weekly summary cron not started`);
    return;
  }

  job = cron.schedule(schedule, async () => {
    console.log(`[cron] weekly summary triggered at ${new Date().toISOString()}`);
    try {
      const result = await sendWeeklySummary(null);
      console.log(`[cron] done - sent to ${result.sentCount}/${result.recipientCount} (${result.generatedBy}, ${result.emailMode})`);
    } catch (e) {
      console.error('[cron] weekly summary failed:', e.message);
    }
  });

  console.log(`[cron] weekly summary scheduled (${schedule})`);
}

function stopCronJobs() {
  if (job) {
    job.stop();
    job = null;
  }
  if (snapshotJob) {
    snapshotJob.stop();
    snapshotJob = null;
  }
  if (outcomeJob) {
    outcomeJob.stop();
    outcomeJob = null;
  }
}

module.exports = { startCronJobs, stopCronJobs };
