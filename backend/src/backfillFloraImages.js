// shernell
// One-off maintenance script: backfills image_url for GreeneryRecord rows
// seeded without a photo (image_url IS NULL). Rows that already have an
// image_url (e.g. manually uploaded via the app) are never touched.
//
// For each distinct species missing a photo, fetches one thumbnail from
// Wikipedia's public REST summary API and bulk-updates every matching
// record in one query, so it's one API call per species, not per record.
//
// Run with:  node src/backfillFloraImages.js
require('dotenv').config();
const { sequelize, GreeneryRecord } = require('./models');

const WIKI_SUMMARY_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const REQUEST_DELAY_MS = 1000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 2000;

// Wikipedia's API etiquette requires a descriptive User-Agent with a contact
// identifier so requests aren't mistaken for abuse and rate-limited/blocked.
const USER_AGENT = 'FloraFaunaTracker-Backfill/1.0 (https://github.com/fsad-team-4/4e-flora-fauna-tracker; contact: hoshernell@gmail.com)';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchThumbnailOnce(species) {
  const url = WIKI_SUMMARY_URL + encodeURIComponent(species.replace(/ /g, '_'));
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });

  // 404 means Wikipedia genuinely has no page for this species - not an error.
  if (res.status === 404) return null;

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return data?.thumbnail?.source || data?.originalimage?.source || null;
}

async function fetchThumbnail(species) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchThumbnailOnce(species);
    } catch (err) {
      const isLastAttempt = attempt === MAX_RETRIES;
      if (isLastAttempt) throw err;
      const backoff = RETRY_BACKOFF_MS * (attempt + 1);
      console.warn(`  ${species}: attempt ${attempt + 1} failed (${err.message}), retrying in ${backoff}ms...`);
      await sleep(backoff);
    }
  }
}

async function backfill() {
  await sequelize.sync();

  const missing = await GreeneryRecord.findAll({
    where: { image_url: null },
    attributes: ['id', 'species'],
  });

  const idsBySpecies = new Map();
  for (const record of missing) {
    if (!idsBySpecies.has(record.species)) idsBySpecies.set(record.species, []);
    idsBySpecies.get(record.species).push(record.id);
  }

  console.log(`Found ${missing.length} record(s) missing image_url across ${idsBySpecies.size} distinct species.`);

  let updatedSpecies = 0;
  let updatedRecords = 0;
  let notFoundSpecies = 0;
  let failedSpecies = 0;

  for (const [species, ids] of idsBySpecies) {
    let imageUrl = null;
    let fetchFailed = false;
    try {
      imageUrl = await fetchThumbnail(species);
    } catch (err) {
      fetchFailed = true;
      console.error(`  ${species}: fetch failed - ${err.message}`);
    }

    if (imageUrl) {
      await GreeneryRecord.update(
        { image_url: imageUrl },
        { where: { id: ids } }
      );
      updatedSpecies += 1;
      updatedRecords += ids.length;
      console.log(`  OK    ${species} (${ids.length} record${ids.length === 1 ? '' : 's'}) -> ${imageUrl}`);
    } else if (fetchFailed) {
      failedSpecies += 1;
    } else {
      notFoundSpecies += 1;
      console.log(`  MISS  ${species}: no image found`);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`\nBackfill complete: ${updatedRecords} record(s) updated across ${updatedSpecies} species, ${notFoundSpecies} species had no image found, ${failedSpecies} species failed after retries (re-run the script to retry these).`);

  await sequelize.close();
}

backfill().catch(err => {
  console.error('Flora image backfill failed:', err);
  process.exit(1);
});
