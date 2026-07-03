// angelyn
// horticulture handbook content + claude query logic
// handbook is stored as a text constant for the poc
// good enough for a demo - a production version would store this in a db
// and allow admins to update it without redeploying

const Anthropic = require('@anthropic-ai/sdk');

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

function hasApiKey() {
  return client !== null;
}

// ─── handbook content ───────────────────────────────────────────────────────
// written to cover the specific topics that came up in the week 3 client meeting:
// dry soil, fungal infections, pest issues, seasonal care, community gardens
// keeping it realistic so claude's answers are actually useful to field officers

const HANDBOOK_CONTENT = `
TOWN COUNCIL ESTATE HORTICULTURE HANDBOOK
Version 2.1 | Estate Management Services

---

SECTION 1: COMMON ESTATE PLANT SPECIES

1.1 Bougainvillea (Bougainvillea spectabilis)
- Characteristics: Woody climbing shrub, thorned stems, vibrant pink/purple bracts
- Preferred conditions: Full sun, well-drained soil, moderate watering
- Common locations: Fence lines, boundary walls, trellises
- Health notes: Hardy species but susceptible to root rot in waterlogged soil. Yellowing of leaves often indicates overwatering or nitrogen deficiency. Sparse flowering may indicate insufficient sunlight.
- Lifespan: 15-20 years under good maintenance conditions

1.2 Frangipani (Plumeria obtusa)
- Characteristics: Small tree or large shrub, fragrant white/yellow flowers
- Preferred conditions: Full sun to partial shade, well-drained soil
- Common locations: Estate gardens, void deck surroundings, common green areas
- Health notes: Susceptible to frangipani rust (orange powdery spots on leaves). Stem rot at base indicates fungal infection - treat immediately. Leaf drop in dry season is normal and not a cause for concern.
- Lifespan: 20+ years

1.3 Hibiscus (Hibiscus rosa-sinensis)
- Characteristics: Evergreen shrub, large brightly coloured flowers
- Preferred conditions: Full sun, regular watering, rich soil
- Common locations: Roadside verges, common green planting beds
- Health notes: Attracts aphids and mealy bugs, especially in dry conditions. Yellowing leaves with green veins suggest iron chlorosis - treat with iron chelate fertiliser. Wilting despite adequate water may indicate root fungus.
- Lifespan: 10-15 years

1.4 Ixora (Ixora coccinea)
- Characteristics: Compact shrub, clusters of small red/orange/pink flowers
- Preferred conditions: Partial shade to full sun, acidic well-drained soil
- Common locations: Planting borders, low hedges
- Health notes: Sensitive to alkaline soil - yellowing leaves between green veins (interveinal chlorosis) indicates pH too high. Apply acidifying fertiliser. Does not recover well from severe pruning - prune lightly and regularly instead.
- Lifespan: 10-20 years

1.5 Heliconia (Heliconia psittacorum)
- Characteristics: Tropical perennial, dramatic orange and yellow flower bracts
- Preferred conditions: Full sun to partial shade, moist well-drained soil, high humidity
- Common locations: Estate garden focal points, cluster planting beds
- Health notes: Highly susceptible to dry conditions - wilting and browning leaf edges are early warning signs of drought stress. Fungal leaf spot (brown circular patches) appears in overcrowded plantings with poor air circulation. Address early before it spreads to neighbouring plants.
- Lifespan: Perennial, regrows from rhizomes if base maintained

1.6 Lantana (Lantana camara)
- Characteristics: Flowering shrub, multi-coloured small flower clusters
- Preferred conditions: Full sun, drought-tolerant, minimal maintenance
- Common locations: Slopes, difficult-to-water areas
- Health notes: One of the hardiest estate species. Main risk is root rot from prolonged waterlogging. Can become invasive if left unpruned - keep contained to designated planting zones.
- Lifespan: 5-10 years

1.7 Bird of Paradise (Strelitzia reginae)
- Characteristics: Clumping perennial, distinctive orange and blue flowers
- Preferred conditions: Full sun, well-drained soil, moderate watering
- Common locations: Feature planting beds, estate entrances
- Health notes: Very slow to establish (2-3 years before flowering). Root division every 5 years prevents overcrowding. Brown leaf tips indicate fluoride sensitivity - use rainwater or let tap water stand overnight before irrigation.

---

SECTION 2: HEALTH STATUS GUIDELINES

Field officers should classify each plant inspection using the following criteria:

HEALTHY
- Foliage is vibrant, appropriate colour for species
- No visible pest damage or fungal growth
- Soil moisture appropriate for species requirements
- Growth rate within expected range

AT-RISK (requires monitoring and action within 7 days)
- Early discolouration or yellowing of leaves (less than 30% of canopy)
- Minor pest presence (aphids, mealy bugs) on less than 20% of plant surface
- Soil visibly dry but plant not yet wilting
- Small patches of fungal spots (less than 5cm diameter) on leaves
- Recent transplant stress (wilting within 2 weeks of installation)

CRITICAL (requires immediate action, escalate same day)
- Wilting or leaf drop exceeding 40% of canopy
- Visible stem rot or base rot
- Fungal infection spreading across multiple stems or to neighbouring plants
- Severe pest infestation covering more than 30% of plant surface
- Complete soil desiccation with plant unable to recover after watering
- Physical damage to root zone (soil compaction, residents planting nearby)

---

SECTION 3: COMMON DISEASES AND TREATMENTS

3.1 Fungal Infections
General signs: Brown or black patches on leaves, powdery or fuzzy growth on stems, wilting despite adequate water, soft/discoloured tissue at base.
Treatment steps:
1. Remove and bag all infected leaves and stems. Do not compost.
2. Apply copper-based fungicide (Kocide) to affected and surrounding plants.
3. Improve drainage around plant base if waterlogging contributed.
4. Reduce canopy density of surrounding plants to improve airflow.
5. Monitor weekly. If spread continues after 14 days, flag for contractor review.
Prevention: Avoid overhead watering. Water at base in morning. Maintain spacing between plants.

3.2 Frangipani Rust
Signs: Orange powdery pustules on underside of leaves. Leaves may curl and drop early.
Treatment: Remove affected leaves immediately. Apply sulfur-based fungicide. This species-specific rust does not spread to other plant species.

3.3 Root Rot
Signs: Yellowing and wilting despite regular watering. Stem base soft and discoloured brown or black. Foul smell from soil.
Treatment: Improve drainage immediately. Remove worst-affected roots if accessible. Apply Trichoderma-based biocontrol to soil. Do not overwater during recovery. In severe cases, replacement may be more effective than treatment.

3.4 Aphid and Mealy Bug Infestations
Signs: Sticky residue on leaves, white cottony deposits at stem joints, yellowing leaves.
Treatment: Spray with diluted neem oil solution (2ml per litre water) in the morning. Repeat weekly for 3 weeks. Avoid chemical pesticides near drain outlets and waterways.

3.5 Iron Chlorosis (Yellowing with green veins)
Signs: Young leaves turn yellow but leaf veins remain green. Older leaves affected later.
Treatment: Apply iron chelate fertiliser to soil. Check soil pH - most estate species require pH 5.5 to 6.5. If pH is too high (alkaline), apply soil acidifier before iron treatment.

---

SECTION 4: SEASONAL CARE GUIDELINES

4.1 Dry Season (February to April, June to August)
- Increase watering frequency for moisture-sensitive species (Heliconia, Hibiscus, Ixora)
- Priority species for daily checks: Heliconia, newly installed plants, any plant previously flagged as At-Risk
- Do not fertilise during peak dry periods - it stresses already drought-affected plants
- Check irrigation systems are functioning at the start of each dry season

4.2 Wet Season (November to January, April to May)
- Reduce irrigation frequency - do not water if natural rainfall in last 24 hours exceeds 10mm
- Inspect drainage around planting beds after heavy rain - waterlogging within 48 hours is unacceptable
- Peak period for fungal infections - inspect underside of leaves during rounds
- Fallen debris from heavy rain should be cleared within 24 hours to prevent pest harbouring

4.3 Year-Round Maintenance
- Pruning: Light pruning after flowering season. Never remove more than one-third of canopy at once.
- Fertilisation: Apply slow-release granular fertiliser at start of each quarter (January, April, July, October)
- Mulching: 5-7cm of mulch around base of each plant. Keep mulch 10cm away from stem.

---

SECTION 5: PEST MANAGEMENT AND COMMUNITY GARDENS

5.1 Rodent Attraction and Prevention
Rodents are attracted to dense plantings, fruit-bearing plants, and improperly managed community gardens. Key prevention measures:
- Remove fallen fruit from fruit-bearing plants within 24 hours
- Report any resident-installed plants in estate common areas immediately - these often create unmanaged feeding environments
- Dense overgrown areas should be cleared on a 3-month cycle to remove rodent harbourage
- If rodent signs are found near a planting bed, do not attempt treatment independently - escalate to the pest management contractor

5.2 Community Garden Concerns
Resident-planted community gardens create several downstream risks:
- Territorial behaviour by residents can restrict access for pest treatment - document all access refusals and escalate to manager
- Irregular watering and improper composting attract mosquitoes and rodents
- Residents who fence off areas must be advised to allow estate staff access for monthly inspections
- Mosquito breeding risk: any container holding water within or adjacent to community garden must be removed or covered

5.3 Insect Attraction from Fruit-Bearing Plants
Fruit-bearing plants attract insects and in turn attract higher-level pests (birds, rodents, community cats).
Management:
- Identify fruit-bearing species during quarterly inspection rounds
- Increase monitoring frequency to weekly during fruiting season
- If insect infestation is observed, remove fruit immediately and treat with neem oil
- Advise residents against planting fruit-bearing species in common areas

5.4 Pigeon Roosting Near Greenery
Pigeon droppings are highly acidic and damage plant foliage and soil quality over time. If pigeon roosting is identified in or near a planting bed:
- Log the sighting with specific block and floor level in the fauna monitoring system
- Check for active feeding sources nearby (residents feeding birds from unit windows)
- Apply bird deterrent spikes to roosting structures if approved by the manager
- Do not attempt to remove nesting materials without manager approval

---

SECTION 6: REPORTING AND ESCALATION PROCEDURES

6.1 When to self-treat
Field officers may self-treat the following without manager approval:
- Minor pest presence (neem oil application)
- Routine watering adjustments
- Light pruning of dead or damaged branches
- Application of pre-approved fertilisers

6.2 When to escalate to manager
Escalate any of the following on the same day:
- Plant in Critical status
- Fungal infection showing signs of spread to neighbouring plants
- Root rot confirmed at base of any specimen plant or heritage-adjacent planting
- Resident obstruction preventing required treatment
- Damage to estate plants by residents (illegal planting, physical damage, excessive watering)

6.3 When to call the contractor
- Infestation exceeding self-treatment scope
- Tree work of any kind (do not attempt independently)
- Chemical pesticide applications near waterways
- Any plant requiring removal and replacement
`;

// ─── claude query ─────────────────────────────────────────────────────────
// the system prompt is the key design decision here.
// "only use the handbook" prevents claude from mixing in outside horticultural
// knowledge that might contradict the estate's actual procedures.
// "say so if the answer isn't there" is equally important - better to say
// "not in the handbook" than to silently invent a plausible answer.

async function queryHandbook(question, conversationHistory = []) {
  if (!client) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  if (!question || !question.trim()) {
    throw new Error('question cannot be empty');
  }

  const systemPrompt = `You are a horticulture handbook assistant for Town Council estate management staff in Singapore. Your role is to help field officers and managers answer practical questions about plant care, disease identification, pest management, and escalation procedures.

Answer questions using ONLY the information in the handbook provided below. Do not draw on outside knowledge. If the handbook does not contain enough information to answer the question, say so clearly and suggest the staff member contact their supervisor or the horticulture contractor.

Keep answers practical and action-oriented. Field officers need to know what to do, not just what is happening. Use plain language. If a treatment involves multiple steps, list them clearly.

Do not recommend actions that contradict the handbook's escalation procedures (for example, do not suggest self-treating something the handbook says requires contractor involvement).

HANDBOOK:
${HANDBOOK_CONTENT}`;

  // include conversation history so staff can ask follow-up questions
  // without repeating context
  const messages = [
    ...conversationHistory,
    { role: 'user', content: question.trim() }
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: systemPrompt,
    messages
  });

  const answer = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();

  return { answer, question: question.trim() };
}

module.exports = { queryHandbook, hasApiKey, HANDBOOK_CONTENT };
