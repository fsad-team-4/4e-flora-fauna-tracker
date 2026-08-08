// klemens
// Flora catalog seed - supports the AI querying system (M3) and Shernell's
// handbook browse view (M1). Standalone, does not touch seed.js.
// horticulture catalog (shrubs, estate trees, palms, groundcovers) so the flora
// list, detail pages and the AI querying system have believable data to work with.
//
// Idempotent and non-destructive: records are findOrCreate'd on { species,
// location_zone }, so re-running never duplicates and never touches records a
// teammate may have added. It does NOT clear any table.
//
// Standalone - does not import from or depend on seed.js.
//
// Run with:  npm run seed:flora   (from backend/)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, User, GreeneryRecord } = require('./models');

// recorded_by is a required FK, so the seed guarantees a field_officer account exists.
// Keyed on email: if the account already exists it is reused untouched.
// Same env var and fallback as seed.js, so both seeds produce the same password
// and it can be set from the environment when seeding a deployed database.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'local-demo-only';
const SEED_USER = {
  email: 'staff@emservices.com.sg',
  name: 'Estate Officer',
  role: 'field_officer',
  password: DEMO_PASSWORD,
};

// n days ago as a real Date - spreads last_inspected_at across the last ~60 days
function daysAgo(n, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

// Realistic Town Council estate planting palette. health_notes are written as
// inspection findings (symptoms, hazards, maintenance burden) because the AI
// querying system reasons over this text. care_recommendation is intentionally
// omitted - it is generated on demand by the AI care endpoint.
const GREENERY = [
  // --- shrubs and flowering bushes ---
  {
    species: 'Bougainvillea glabra',
    common_name: 'Bougainvillea',
    location_zone: 'Block 123',
    health_status: 'critical',
    health_notes: 'Severe dieback on two thirds of the plant after prolonged waterlogging at the base; bracts dropped and stems blackening near soil line. Suspected root rot - drainage of the planter bed needs rectification before replanting.',
    plant_family: 'Nyctaginaceae',
    site_suitability: 'Full sun; fence lines, road dividers and raised planters with sharp drainage',
    color: 'Magenta-pink bracts',
    max_height_at_maturity: 4.5,
    last_inspected_at: daysAgo(2),
  },
  {
    species: 'Plumeria rubra',
    common_name: 'Frangipani',
    location_zone: 'Block 456',
    health_status: 'at_risk',
    health_notes: 'Orange pustules of frangipani rust on the underside of most leaves, with early premature leaf drop. Fallen infected leaves accumulating on the void deck edge; needs prompt removal to slow spread to the healthy specimen at Block 789.',
    plant_family: 'Apocynaceae',
    site_suitability: 'Full sun; feature planting near block entrances, drought tolerant once established',
    color: 'Pink-red flowers',
    max_height_at_maturity: 6,
    last_inspected_at: daysAgo(5),
  },
  {
    species: 'Plumeria obtusa',
    common_name: 'Singapore Frangipani',
    location_zone: 'Block 789',
    health_status: 'healthy',
    health_notes: 'Full canopy, heavy fragrant flowering. Milky sap is a mild skin irritant - avoid siting fallen-flower play areas for children; sweep flowers weekly as they turn slippery when decomposing on smooth pavement.',
    plant_family: 'Apocynaceae',
    site_suitability: 'Full sun; entrance features and courtyard focal points',
    color: 'White flowers with yellow centre',
    max_height_at_maturity: 7,
    last_inspected_at: daysAgo(20),
  },
  {
    species: 'Hibiscus rosa-sinensis',
    common_name: 'Hibiscus',
    location_zone: 'Block 234',
    health_status: 'at_risk',
    health_notes: 'Heavy mealybug infestation on new shoots with sooty mould developing on lower leaves; flower buds aborting before opening. Ant trails farming the mealybugs observed - treat both or the infestation will rebound.',
    plant_family: 'Malvaceae',
    site_suitability: 'Full sun to light shade; low hedging and colour beds along footpaths',
    color: 'Red flowers',
    max_height_at_maturity: 3,
    last_inspected_at: daysAgo(4),
  },
  {
    species: 'Ixora coccinea',
    common_name: 'Ixora',
    location_zone: 'Block 456',
    health_status: 'at_risk',
    health_notes: 'Interveinal yellowing (iron chlorosis) across the hedge run, likely from alkaline runoff off the adjacent concrete apron; flowering sparse this quarter. Soil pH test recommended before feeding.',
    plant_family: 'Rubiaceae',
    site_suitability: 'Full sun; formal low hedges and mass colour beds, prefers slightly acidic soil',
    color: 'Scarlet flower clusters',
    max_height_at_maturity: 2,
    last_inspected_at: daysAgo(9),
  },
  {
    species: 'Ixora chinensis',
    common_name: 'Chinese Ixora',
    location_zone: 'Playground B',
    health_status: 'healthy',
    health_notes: 'Dense, compact hedge screening the playground perimeter. Attracts butterflies and sunbirds; trim after each flowering flush (roughly every 8 weeks) to keep sightlines to the play equipment open.',
    plant_family: 'Rubiaceae',
    site_suitability: 'Full sun; playground and footpath edging',
    color: 'Orange-red flower clusters',
    max_height_at_maturity: 1.5,
    last_inspected_at: daysAgo(25),
  },
  {
    species: 'Lantana camara',
    common_name: 'Lantana',
    location_zone: 'Community Garden',
    health_status: 'healthy',
    health_notes: 'Strong butterfly draw for the community garden. Unripe green berries are toxic if ingested - keep pruned back from the childcare walking route and deadhead regularly to limit berry set. Self-seeds aggressively into neighbouring beds.',
    plant_family: 'Verbenaceae',
    site_suitability: 'Full sun; butterfly gardens and dry sunny borders, avoid edges of childcare routes',
    color: 'Orange-yellow flower heads',
    max_height_at_maturity: 1.5,
    last_inspected_at: daysAgo(15),
  },
  {
    species: 'Heliconia psittacorum',
    common_name: 'Heliconia',
    location_zone: 'Block 890',
    health_status: 'critical',
    health_notes: 'Clump collapsing - rhizome rot after the bed stayed waterlogged for two weeks; foul smell at soil level and stems detaching at the base. Upright flower bracts also holding stagnant water, a mosquito breeding risk flagged under NEA guidelines. Bed needs lifting and drainage works.',
    plant_family: 'Heliconiaceae',
    site_suitability: 'Light shade; sheltered beds beside void decks, needs moist but free-draining soil',
    color: 'Orange-red bracts',
    max_height_at_maturity: 1.5,
    last_inspected_at: daysAgo(1),
  },
  {
    species: 'Strelitzia reginae',
    common_name: 'Bird of Paradise',
    location_zone: 'Block 123',
    health_status: 'healthy',
    health_notes: 'Established clump flowering reliably at the block entrance feature bed. Leaf edges show minor wind tatter from the corridor draught but no pest or disease pressure. Divide the clump within 2 years before it outgrows the planter.',
    plant_family: 'Strelitziaceae',
    site_suitability: 'Full sun to light shade; entrance feature beds and planters',
    color: 'Orange and blue flowers',
    max_height_at_maturity: 1.8,
    last_inspected_at: daysAgo(30),
  },
  {
    species: 'Codiaeum variegatum',
    common_name: 'Croton',
    location_zone: 'Block 567',
    health_status: 'at_risk',
    health_notes: 'Drought stress on the west-facing wall bed - lower leaves dropping and colour fading to dull green. Reflected afternoon heat off the wall is drying the bed faster than the irrigation rounds allow; needs mulching or a revised watering schedule.',
    plant_family: 'Euphorbiaceae',
    site_suitability: 'Full sun to part shade; colour foliage borders, avoid hot reflective west walls without irrigation',
    color: 'Variegated yellow-red-green foliage',
    max_height_at_maturity: 2.5,
    last_inspected_at: daysAgo(7),
  },
  {
    species: 'Cordyline fruticosa',
    common_name: 'Ti Plant',
    location_zone: 'Void Deck 234',
    health_status: 'healthy',
    health_notes: 'Good colour retention in the shaded void deck planter. Occasional snail grazing on lower leaves after rain - bait stations in place. Low maintenance; remove spent lower leaves quarterly.',
    plant_family: 'Asparagaceae',
    site_suitability: 'Part shade; void deck planters and building shadow lines',
    color: 'Burgundy-pink foliage',
    max_height_at_maturity: 3,
    last_inspected_at: daysAgo(38),
  },
  {
    species: 'Syzygium myrtifolium',
    common_name: 'Red Lip (Kelat hedge)',
    location_zone: 'Jogging Path',
    health_status: 'healthy',
    health_notes: 'Dense formal hedge along the jogging path with strong red new flush. High maintenance burden: needs machine trimming every 6 weeks or it encroaches onto the 1.5 m path width. No pest pressure observed.',
    plant_family: 'Myrtaceae',
    site_suitability: 'Full sun; formal clipped hedging along paths and roads',
    color: 'Red new foliage over green',
    max_height_at_maturity: 4,
    last_inspected_at: daysAgo(18),
  },

  // --- estate trees ---
  {
    species: 'Samanea saman',
    common_name: 'Rain Tree',
    location_zone: 'Carpark B',
    health_status: 'at_risk',
    health_notes: 'Mature specimen with a large horizontal limb overhanging carpark lots 12-18. Deadwood visible in the upper crown after the recent dry spell, and epiphytic fig growth adding load at the main fork. Crown inspection and deadwood removal needed before the monsoon season.',
    plant_family: 'Fabaceae',
    site_suitability: 'Full sun; large open lawns and carpark perimeters, needs wide rooting space',
    color: 'Pink powder-puff flowers',
    max_height_at_maturity: 25,
    last_inspected_at: daysAgo(3),
  },
  {
    species: 'Pterocarpus indicus',
    common_name: 'Angsana',
    location_zone: 'Block 789',
    health_status: 'critical',
    health_notes: 'Wilting and yellowing over half the crown with dark staining in exposed sapwood - symptoms consistent with Angsana wilt (Fusarium). Species has a known history of sudden limb failure; tree stands within falling distance of the covered walkway. Arborist assessment and possible removal required urgently.',
    plant_family: 'Fabaceae',
    site_suitability: 'Full sun; roadside and open green verges, historically overplanted and wilt-prone',
    color: 'Yellow flowers',
    max_height_at_maturity: 30,
    last_inspected_at: daysAgo(1),
  },
  {
    species: 'Fagraea fragrans',
    common_name: 'Tembusu',
    location_zone: 'Block 456',
    health_status: 'healthy',
    health_notes: 'Slow-growing, structurally sound native with the typical deeply fissured bark. Strong evening fragrance during flowering months draws residents; fruiting attracts bats at dusk, which some residents have raised feedback about. No intervention needed.',
    plant_family: 'Gentianaceae',
    site_suitability: 'Full sun; long-lived heritage-grade planting for open lawns, very wind-firm',
    color: 'Cream-yellow fragrant flowers',
    max_height_at_maturity: 25,
    last_inspected_at: daysAgo(42),
  },
  {
    species: 'Peltophorum pterocarpum',
    common_name: 'Yellow Flame',
    location_zone: 'Block 890',
    health_status: 'healthy',
    health_notes: 'Good canopy shading the block frontage. Seasonal caterpillar defoliation episode recorded last quarter - crown recovered fully. Fine leaflets and spent flowers create a heavy litter load on the drains below; drain clearing needed after each flowering peak.',
    plant_family: 'Fabaceae',
    site_suitability: 'Full sun; roadside shade planting, tolerant of compacted urban soil',
    color: 'Yellow flower sprays',
    max_height_at_maturity: 20,
    last_inspected_at: daysAgo(28),
  },
  {
    species: 'Mangifera indica',
    common_name: 'Mango',
    location_zone: 'Carpark A',
    health_status: 'at_risk',
    health_notes: 'Fruiting heavily directly over parked vehicles - fallen fruit has already dented one bonnet (case logged) and rotting drop is attracting rodents and fruit flies to the bin point. Recommend pre-emptive fruit removal each season or crown reduction away from the parking lots.',
    plant_family: 'Anacardiaceae',
    site_suitability: 'Full sun; open lawns well clear of vehicles and walkways due to heavy fruit drop',
    color: 'Green-yellow fruit, cream flower panicles',
    max_height_at_maturity: 20,
    last_inspected_at: daysAgo(6),
  },
  {
    species: 'Syzygium grande',
    common_name: 'Sea Apple',
    location_zone: 'Block 123',
    health_status: 'at_risk',
    health_notes: 'Heavy fruit drop staining the footpath below and creating a slip hazard when crushed - two resident complaints this month. Crown otherwise healthy and wind-firm. Consider weekly path washing during fruiting or crown lifting over the walkway.',
    plant_family: 'Myrtaceae',
    site_suitability: 'Full sun; coastal-tolerant roadside planting, avoid siting directly over footpaths',
    color: 'White puff flowers, green fruit',
    max_height_at_maturity: 30,
    last_inspected_at: daysAgo(8),
  },
  {
    species: 'Tabebuia rosea',
    common_name: 'Trumpet Tree',
    location_zone: 'Jogging Path',
    health_status: 'healthy',
    health_notes: 'Structurally sound; produced a strong mass-flowering display after the last dry spell ("Singapore sakura"), heavily photographed by residents. Petal fall carpets the jogging path for about a week after flowering - sweep to prevent slippery buildup in rain.',
    plant_family: 'Bignoniaceae',
    site_suitability: 'Full sun; avenue and path planting, flowers best after a dry period',
    color: 'Pale pink trumpet flowers',
    max_height_at_maturity: 25,
    last_inspected_at: daysAgo(33),
  },
  {
    species: 'Xanthostemon chrysanthus',
    common_name: 'Golden Penda',
    location_zone: 'Playground A',
    health_status: 'healthy',
    health_notes: 'Compact crown well suited to the playground edge - no significant fruit or branch drop risk, which is why it was selected for this location. Golden flower flushes attract bees; monitor during flowering and keep signage up near the play equipment.',
    plant_family: 'Myrtaceae',
    site_suitability: 'Full sun; small-space planting near playgrounds and walkways, low drop risk',
    color: 'Golden-yellow flowers',
    max_height_at_maturity: 12,
    last_inspected_at: daysAgo(22),
  },
  {
    species: 'Terminalia catappa',
    common_name: 'Sea Almond',
    location_zone: 'Fitness Corner',
    health_status: 'at_risk',
    health_notes: 'Characteristic pagoda-tiered crown but branches are brittle - minor branch shed onto the fitness equipment recorded after the last storm. Large leathery leaves drop in bulk during the biannual leaf change, clogging the adjacent drain gratings within days.',
    plant_family: 'Combretaceae',
    site_suitability: 'Full sun; coastal and open areas, keep set back from equipment due to brittle branching',
    color: 'Leaves turn red before falling',
    max_height_at_maturity: 25,
    last_inspected_at: daysAgo(10),
  },
  {
    species: 'Cinnamomum iners',
    common_name: 'Wild Cinnamon',
    location_zone: 'Block 567',
    health_status: 'healthy',
    health_notes: 'Healthy native with attractive pink new flush. Dense evergreen crown gives year-round shade with low litter. Berries attract bulbuls and starlings - some droppings on the path bench below, relocate the bench or accept periodic washing.',
    plant_family: 'Lauraceae',
    site_suitability: 'Full sun to part shade; reliable low-maintenance shade tree for block surrounds',
    color: 'Pink-red new leaves',
    max_height_at_maturity: 15,
    last_inspected_at: daysAgo(47),
  },
  {
    species: 'Cassia fistula',
    common_name: 'Golden Shower',
    location_zone: 'Block 234',
    health_status: 'healthy',
    health_notes: 'Spectacular pendulous yellow flowering this season. Long hard seed pods (up to 60 cm) drop over several months and the pulp is mildly toxic if ingested - collect pods promptly given the kindergarten drop-off route passes underneath.',
    plant_family: 'Fabaceae',
    site_suitability: 'Full sun; feature avenue planting, manage pod drop near child-heavy routes',
    color: 'Golden-yellow hanging flower chains',
    max_height_at_maturity: 15,
    last_inspected_at: daysAgo(36),
  },
  {
    species: 'Delonix regia',
    common_name: 'Flame of the Forest',
    location_zone: 'Carpark A',
    health_status: 'at_risk',
    health_notes: 'Aggressive surface roots lifting and cracking the carpark kerb and two pavement slabs - trip hazard reported by the town council inspector. Crown healthy, but root pruning near a mature Delonix risks destabilising it; engineering solution (root bridge or resurfacing) preferred over cutting.',
    plant_family: 'Fabaceae',
    site_suitability: 'Full sun; large open lawns only - surface roots damage nearby pavement and kerbs',
    color: 'Flame-red flowers',
    max_height_at_maturity: 18,
    last_inspected_at: daysAgo(14),
  },
  {
    species: 'Filicium decipiens',
    common_name: 'Fern Tree',
    location_zone: 'Block 890',
    health_status: 'healthy',
    health_notes: 'Neat dome of glossy fern-like foliage giving dense shade over the seating cluster. Very low drop risk and litter load - one of the lowest-maintenance trees on this sector. No action needed beyond routine annual inspection.',
    plant_family: 'Sapindaceae',
    site_suitability: 'Full sun; compact shade tree for seating areas and narrow verges',
    color: 'Glossy dark green foliage',
    max_height_at_maturity: 15,
    last_inspected_at: daysAgo(52),
  },

  // --- palms ---
  {
    species: 'Cocos nucifera',
    common_name: 'Coconut Palm',
    location_zone: 'Playground A',
    health_status: 'critical',
    health_notes: 'Mature palm leaning about 12 degrees toward the playground with a developing crack at the trunk base; nuts up to 2 kg hang directly above the sand pit fall zone. Falling-nut strike risk to children is unacceptable at this location - immediate de-nutting done as interim measure, removal or transplanting assessment required.',
    plant_family: 'Arecaceae',
    site_suitability: 'Full sun; coastal or open lawn ONLY, never over playgrounds, paths or parking due to nut drop',
    color: 'Green fronds, green-brown nuts',
    max_height_at_maturity: 20,
    last_inspected_at: daysAgo(2),
  },
  {
    species: 'Roystonea regia',
    common_name: 'Royal Palm',
    location_zone: 'Block 123',
    health_status: 'healthy',
    health_notes: 'Stately avenue specimen with clean smooth trunk. Shed fronds weigh 10-15 kg each and drop without warning - the drop zone crosses a minor footpath, so keep the scheduled frond removal at 3-month intervals rather than waiting for natural shed.',
    plant_family: 'Arecaceae',
    site_suitability: 'Full sun; formal avenue planting, manage frond drop zone over paths',
    color: 'Grey-white trunk, deep green crown',
    max_height_at_maturity: 25,
    last_inspected_at: daysAgo(16),
  },
  {
    species: 'Ptychosperma macarthurii',
    common_name: 'MacArthur Palm',
    location_zone: 'Void Deck 234',
    health_status: 'healthy',
    health_notes: 'Clustering palm doing well in the semi-shaded void deck edge planter. Red fruit clusters attract pink-necked green pigeons; droppings on the void deck floor below increase during fruiting - schedule extra washing those weeks.',
    plant_family: 'Arecaceae',
    site_suitability: 'Part shade; void deck edges and courtyard clusters, compact footprint',
    color: 'Green fronds, red fruit clusters',
    max_height_at_maturity: 8,
    last_inspected_at: daysAgo(40),
  },
  {
    species: 'Dypsis lutescens',
    common_name: 'Yellow Cane Palm',
    location_zone: 'Block 567',
    health_status: 'at_risk',
    health_notes: 'Scale insects along the frond midribs with sooty mould blackening the lower fronds; clump vigour declining and two canes have died back. Infestation likely spread from the neighbouring privately-kept corridor plants - treat and advise residents.',
    plant_family: 'Arecaceae',
    site_suitability: 'Light shade; screening clusters beside block entrances',
    color: 'Yellow-green canes and fronds',
    max_height_at_maturity: 8,
    last_inspected_at: daysAgo(11),
  },

  // --- groundcovers and turf ---
  {
    species: 'Arachis pintoi',
    common_name: 'Pinto Peanut',
    location_zone: 'Community Garden',
    health_status: 'healthy',
    health_notes: 'Excellent living mulch under the community garden fruit trees - fixing nitrogen and suppressing weeds, has cut hand-weeding time roughly in half for the gardening group. Contain the runners at the plot borders quarterly.',
    plant_family: 'Fabaceae',
    site_suitability: 'Full sun to part shade; groundcover under trees and on gentle slopes',
    color: 'Yellow pea flowers over green mat',
    max_height_at_maturity: 0.2,
    last_inspected_at: daysAgo(24),
  },
  {
    species: 'Sphagneticola trilobata',
    common_name: 'Wedelia',
    location_zone: 'Playground B',
    health_status: 'at_risk',
    health_notes: 'Spreading beyond its bed into the perimeter drain and rooting through the gratings - listed as invasive, and clogged gratings caused ponding after the last heavy rain. Monthly hard edging is not holding it; recommend replacing this run with a clumping groundcover.',
    plant_family: 'Asteraceae',
    site_suitability: 'Full sun; hardy slope cover, but invasive - keep well away from drains and open beds',
    color: 'Yellow daisy flowers',
    max_height_at_maturity: 0.3,
    last_inspected_at: daysAgo(13),
  },
  {
    species: 'Zoysia matrella',
    common_name: 'Manila Grass',
    location_zone: 'Fitness Corner',
    health_status: 'healthy',
    health_notes: 'Turf holding up under moderate foot traffic, but two bare patches forming along the desire line between the fitness corner and the bus stop. Returf the worn strip or install a stepping-stone path before the patches spread and turn to mud in the wet season.',
    plant_family: 'Poaceae',
    site_suitability: 'Full sun; hard-wearing lawn turf for activity areas',
    color: 'Fine-bladed deep green turf',
    max_height_at_maturity: 0.1,
    last_inspected_at: daysAgo(19),
  },
];

async function seed() {
  await sequelize.sync();

  // ensure a field_officer account exists to own the records; never overwrites an
  // existing user with this email
  const [staff] = await User.findOrCreate({
    where: { email: SEED_USER.email },
    defaults: {
      name: SEED_USER.name,
      role: SEED_USER.role,
      password_hash: await bcrypt.hash(SEED_USER.password, 10),
    },
  });

  let createdCount = 0;
  let existingCount = 0;
  for (const g of GREENERY) {
    const [, created] = await GreeneryRecord.findOrCreate({
      where: { species: g.species, location_zone: g.location_zone },
      defaults: { ...g, recorded_by: staff.id },
    });
    if (created) createdCount += 1;
    else existingCount += 1;
  }

  console.log(`Flora seed complete: ${createdCount} greenery records created, ${existingCount} already existed (${GREENERY.length} total in catalog).`);
  console.log(`Records attributed to ${SEED_USER.email} (user id ${staff.id}).`);

  await sequelize.close();
}

seed().catch(err => {
  console.error('Flora seed failed:', err);
  process.exit(1);
});
