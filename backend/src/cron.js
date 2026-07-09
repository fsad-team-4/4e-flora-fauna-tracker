// angelyn
// cron scheduler for the weekly estate health summary
// starts when the server boots, fires every monday at 8am SGT

const cron = require('node-cron');
const { sendWeeklySummary } = require('./services/weeklySummary');
const { captureSnapshot } = require('./services/metricsSnapshot');

let job = null;
let snapshotJob = null;

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
}

module.exports = { startCronJobs, stopCronJobs };
