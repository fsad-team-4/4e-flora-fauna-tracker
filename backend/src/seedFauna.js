// renee
// Fauna sightings seed for the M2 hotspots module: populates FaunaSighting with a
// realistic spread across several blocks so the Hotspots map, the per-block risk
// level, the AI summary and the alert email draft all have believable data.
//
// Idempotent for its own data only: it deletes the FaunaSighting rows for the
// blocks listed below and re-inserts them, so re-running gives the same state. It
// never touches Users, reports, flora or any other table.
//
// Standalone - does not import from or depend on seed.js or seedFlora.js. It does
// NOT create users; run `npm run seed` first for the demo accounts.
//
// Run with:  npm run seed:fauna   (from backend/)
require('dotenv').config();
const { sequelize, User, FaunaSighting } = require('./models');

// The sightings are attributed to the demo field officer created by seed.js.
// This script never creates or modifies users - if the account is missing it
// tells the runner to seed first and exits.
const REPORTER_EMAIL = 'staff@emservices.com.sg';

// n days ago as a real Date - keeps every sighting inside the default 30-day
// hotspot window so the seeded blocks actually appear on the Hotspots page.
function daysAgo(n, hour = 11) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

// Real Singapore estate coordinates, one anchor per block (Ang Mo Kio, Toa Payoh,
// Bedok, Clementi, Yishun). Each sighting is nudged a few metres off its block
// anchor so pins stay individually clickable instead of stacking exactly.
const BLOCKS = [
  {
    // 9 sightings -> urgent by volume alone (>= 8), no aggressive tag needed.
    block_number: 'Block 123',
    anchor: [1.3691, 103.8454], // Ang Mo Kio Ave 3
    sightings: [
      { species: 'cat', floor_level: 'Void deck', behaviour_tags: ['feeding'], notes: 'Resident feeding three community cats at the void deck bench every evening. Leftover food left on the floor overnight.', days: 1 },
      { species: 'cat', floor_level: 'Void deck', behaviour_tags: ['feeding'], notes: 'Same feeding spot as the earlier case. Cats now waiting at the bench from around 6pm.', days: 3 },
      { species: 'cat', floor_level: '2nd', behaviour_tags: [], notes: 'Cat resting on the corridor windowsill. No complaint raised, logged for the record.', days: 4 },
      // Notes mention droppings but the tag was never applied - drives the untagged-mention hint.
      { species: 'pigeon', floor_level: '12th', behaviour_tags: [], notes: 'Pigeons roosting on the corridor ledge. Droppings building up along the parapet and on two air-con ledges below.', days: 5 },
      { species: 'pigeon', floor_level: '12th', behaviour_tags: ['droppings'], notes: 'Corridor ledge soiled again one week after the last wash. Cleaning contractor notified.', days: 8 },
      { species: 'pigeon', floor_level: 'Roof', behaviour_tags: ['droppings'], notes: 'Flock of roughly fifteen pigeons on the rooftop water tank platform.', days: 11 },
      { species: 'mynah', floor_level: 'Carpark', behaviour_tags: ['feeding'], notes: 'Mynahs scavenging around the bin centre. Bin lids not closing fully.', days: 13 },
      { species: 'crow', floor_level: 'Carpark', behaviour_tags: [], notes: 'Crows picking at refuse bags left beside the bin centre before collection.', days: 16 },
      { species: 'other', floor_level: 'Ground', behaviour_tags: [], notes: 'Monitor lizard seen crossing the grass verge towards the drain. Moved off on its own.', days: 21 },
    ],
  },
  {
    // 5 sightings -> monitor by volume (4-7). Also carries a nesting tag.
    block_number: 'Block 456',
    anchor: [1.3343, 103.8563], // Toa Payoh Lorong 4
    sightings: [
      { species: 'crow', floor_level: 'Roof', behaviour_tags: ['nesting'], notes: 'Crow nest on the rooftop antenna mount. Pair actively defending the area during the day.', days: 2 },
      { species: 'crow', floor_level: 'Roof', behaviour_tags: ['nesting'], notes: 'Second nest confirmed on the adjacent mast. Tree pruning around the block scheduled.', days: 6 },
      { species: 'crow', floor_level: 'Carpark', behaviour_tags: [], notes: 'Crows perching on lamp posts above the carpark. Bonnets of two cars soiled.', days: 9 },
      { species: 'mynah', floor_level: '3rd', behaviour_tags: [], notes: 'Mynah pair going in and out of the corridor false ceiling gap. Possible nesting inside the void.', days: 12 },
      { species: 'cat', floor_level: 'Void deck', behaviour_tags: [], notes: 'Community cat sleeping under the staircase. Ear-tipped, appears sterilised.', days: 18 },
    ],
  },
  {
    // 3 sightings but one is tagged aggressive -> urgent via the behaviour path,
    // not volume. This is the case the risk rules exist to catch.
    block_number: 'Block 789',
    anchor: [1.3236, 103.9273], // Bedok North Ave 1
    sightings: [
      { species: 'crow', floor_level: 'Ground', behaviour_tags: ['aggressive', 'nesting'], notes: 'Crows swooping at residents on the footpath below the nesting tree. Two residents reported being struck. Signage put up and route diverted.', days: 1 },
      { species: 'crow', floor_level: 'Ground', behaviour_tags: ['aggressive'], notes: 'Further swooping reported at the same footpath during the morning walk to the MRT.', days: 4 },
      { species: 'other', floor_level: 'Ground', behaviour_tags: [], notes: 'Stray dog seen near the fitness corner. AVS informed.', days: 10 },
    ],
  },
  {
    // 2 sightings, one nesting tag -> monitor via the behaviour path despite the
    // low volume.
    block_number: 'Block 890',
    anchor: [1.3151, 103.7649], // Clementi Ave 4
    sightings: [
      { species: 'pigeon', floor_level: '7th', behaviour_tags: ['nesting'], notes: 'Pigeons nesting behind the corridor riser panel. Nest material visible through the gap.', days: 7 },
      { species: 'pigeon', floor_level: '7th', behaviour_tags: [], notes: 'Bird netting quoted for the riser opening. Awaiting approval.', days: 15 },
    ],
  },
  {
    // 2 sightings, no severity tags -> routine.
    block_number: 'Block 234',
    anchor: [1.4294, 103.8353], // Yishun Ring Road
    sightings: [
      { species: 'cat', floor_level: 'Void deck', behaviour_tags: [], notes: 'Single community cat at the void deck. Healthy, ear-tipped, no complaints.', days: 14 },
      // Notes mention nesting but the tag was never applied - the second untagged-mention case.
      { species: 'mynah', floor_level: 'Ground', behaviour_tags: [], notes: 'Mynahs gathering in the roadside tree at dusk. Possible nesting in the canopy, to confirm on the next round.', days: 23 },
    ],
  },
];

// Mirrors the risk rules in faunaController.aggregateBlock so the summary printed
// here matches what the API will report for the seeded data.
function riskLevelFor(sightings) {
  const tags = sightings.flatMap(s => s.behaviour_tags);
  if (sightings.length >= 8 || tags.includes('aggressive')) return 'urgent';
  if (sightings.length >= 4 || tags.includes('nesting')) return 'monitor';
  return 'routine';
}

async function seed() {
  await sequelize.sync();

  const reporter = await User.findOne({ where: { email: REPORTER_EMAIL } });
  if (!reporter) {
    console.log(`No user found with email ${REPORTER_EMAIL}.`);
    console.log('The fauna seed attributes every sighting to that demo account and does not create users.');
    console.log('Run `npm run seed` first, then re-run `npm run seed:fauna`.');
    await sequelize.close();
    return;
  }

  // Clear only the blocks this script owns, so re-running never duplicates and
  // sightings a teammate added under other blocks are left alone.
  const blockNumbers = BLOCKS.map(b => b.block_number);
  const removed = await FaunaSighting.destroy({ where: { block_number: blockNumbers } });

  const rows = [];
  for (const block of BLOCKS) {
    block.sightings.forEach((s, i) => {
      const createdAt = daysAgo(s.days, 9 + (i % 8));
      rows.push({
        species: s.species,
        block_number: block.block_number,
        floor_level: s.floor_level,
        behaviour_tags: s.behaviour_tags,
        // spread the pins a few metres apart around the block anchor
        gps_lat: +(block.anchor[0] + i * 0.00035).toFixed(6),
        gps_lng: +(block.anchor[1] + ((i % 3) - 1) * 0.00035).toFixed(6),
        notes: s.notes,
        status: 'open',
        reported_by: reporter.id,
        createdAt,
        updatedAt: createdAt,
      });
    });
  }

  await FaunaSighting.bulkCreate(rows, {
    validate: true,
    silent: true, // keep our provided createdAt instead of stamping "now"
  });

  console.log(`Fauna seed complete: ${rows.length} sightings created across ${BLOCKS.length} blocks (${removed} previously seeded rows cleared).`);
  console.log('');
  console.log('Block            Sightings  Risk level');
  for (const block of BLOCKS) {
    const level = riskLevelFor(block.sightings);
    console.log(`${block.block_number.padEnd(16)} ${String(block.sightings.length).padEnd(10)} ${level}`);
  }

  const bySpecies = {};
  for (const r of rows) {
    bySpecies[r.species] = (bySpecies[r.species] || 0) + 1;
  }
  console.log('');
  console.log(`By species: ${Object.entries(bySpecies).map(([sp, n]) => `${sp}: ${n}`).join(', ')}`);
  console.log(`Sightings attributed to ${REPORTER_EMAIL} (user id ${reporter.id}).`);

  await sequelize.close();
}

seed().catch(err => {
  console.error('Fauna seed failed:', err);
  process.exit(1);
});
