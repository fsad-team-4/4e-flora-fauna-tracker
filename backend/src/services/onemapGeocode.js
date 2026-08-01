// angelyn
// OneMap geocoding for estate block addresses.
//
// ==================== READ THIS BEFORE LOOSENING THE GUARD =================
// OneMap's search does NOT fail safely on a partial address. It always returns
// its best fuzzy match, and for a bare block number that match is confidently
// wrong. Measured against the live API:
//
//   "846 Yishun Ring Road" -> 846 YISHUN RING ROAD          (correct)
//   "Block 350"            -> 143 POTONG PASIR AVENUE 2     (WRONG)
//   "Block 23"             -> 501 OLD CHOA CHU KANG ROAD    (WRONG)
//   "350"                  -> 45 hits, first is ANCHORVALE  (arbitrary)
//
// "Block 350" exists in dozens of towns, so there is no correct answer to give.
// A coordinate written from one of those responses is indistinguishable from a
// real one, and this map is used to send contractors to addresses.
//
// So this module accepts a result ONLY when the returned BLK_NO matches the
// block number in the query AND the query carried a street name. Everything
// else returns { matched: false, reason }, and the caller records nothing.
// A geocode that cannot be verified is not a geocode.
//
// It also NEVER writes gps_lat/gps_lng. Those are the officer's reported
// position; a looked-up block centroid is a different claim and belongs in its
// own field, so the map can tell the two apart.
// ===========================================================================
const ONEMAP_SEARCH = 'https://www.onemap.gov.sg/api/common/elastic/search';

// Words that are estate shorthand, not part of the road name OneMap indexes.
const BLOCK_PREFIX = /^\s*(block|blk|bulk)\s*/i;

/**
 * Pull the block number out of an estate string.
 * "Blk 79 Toa Payoh Lor 4" -> "79";  "Block 128" -> "128"
 */
function blockNumberOf(raw) {
  const m = String(raw || '').replace(BLOCK_PREFIX, '').trim().match(/^(\d+[A-Za-z]?)\b/);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Does the string name a street at all?
 *
 * This is the gate that stops "Block 128" ever reaching the API. After removing
 * the block prefix and the leading number, anything left that contains letters
 * is treated as a road name. "Block 128" leaves nothing; "128 Lorong 1 Toa
 * Payoh" leaves "Lorong 1 Toa Payoh".
 */
function streetPartOf(raw) {
  const rest = String(raw || '').replace(BLOCK_PREFIX, '').trim().replace(/^\d+[A-Za-z]?\b/, '').trim();
  return /[A-Za-z]/.test(rest) ? rest : null;
}

// Estate shorthand OneMap does not index. Expanded, not stripped: dropping
// "Lor" loses the road entirely, which turns a resolvable address into a bare
// number and puts it right back in the unverifiable bucket.
const ABBREV = [
  [/\bLor\b/gi, 'Lorong'],
  [/\bJln\b/gi, 'Jalan'],
  [/\bAve\b/gi, 'Avenue'],
  [/\bRd\b/gi, 'Road'],
  [/\bSt\b/gi, 'Street'],
  [/\bCl\b/gi, 'Close'],
  [/\bCres\b/gi, 'Crescent'],
  [/\bDr\b/gi, 'Drive'],
  [/\bTg\b/gi, 'Tanjong'],
  [/\bUpp\b/gi, 'Upper'],
];

function normalise(raw) {
  const blk = blockNumberOf(raw);
  const street = streetPartOf(raw);
  if (!blk || !street) return null;
  const expanded = ABBREV.reduce((s, [re, full]) => s.replace(re, full), street);
  return { blk, query: `${blk} ${expanded}`.replace(/\s+/g, ' ').trim() };
}

/**
 * Geocode one estate block string.
 *
 * @returns {Promise<{matched:boolean, lat?:number, lng?:number, address?:string,
 *                    postal?:string, reason?:string, source:string}>}
 */
async function geocodeBlock(raw, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const source = 'onemap';
  const parsed = normalise(raw);
  if (!parsed) {
    // The common case in this dataset, and the one that must never be guessed.
    return { matched: false, source, reason: 'no street name in the block string - cannot be verified' };
  }

  let data;
  try {
    const url = `${ONEMAP_SEARCH}?searchVal=${encodeURIComponent(parsed.query)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { matched: false, source, reason: `OneMap returned HTTP ${res.status}` };
    data = await res.json();
  } catch (e) {
    return { matched: false, source, reason: `OneMap unreachable: ${String(e.message || e).slice(0, 80)}` };
  }

  const results = Array.isArray(data?.results) ? data.results : [];
  if (results.length === 0) return { matched: false, source, reason: 'no OneMap result' };

  // THE GUARD. Accept only a result whose block number is the one we asked for.
  // Without this, "350 Something Road" happily resolves to block 143 elsewhere.
  const hit = results.find(r => String(r.BLK_NO || '').toUpperCase() === parsed.blk);
  if (!hit) {
    return {
      matched: false,
      source,
      reason: `OneMap's best match was block ${results[0].BLK_NO || '?'}, not ${parsed.blk}`,
    };
  }

  const lat = Number(hit.LATITUDE);
  const lng = Number(hit.LONGITUDE);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { matched: false, source, reason: 'OneMap result carried no usable coordinate' };
  }

  return {
    matched: true,
    source,
    lat,
    lng,
    address: `${hit.BLK_NO} ${hit.ROAD_NAME}`.trim(),
    postal: hit.POSTAL && hit.POSTAL !== 'NIL' ? hit.POSTAL : null,
    // Block-level, not the observed spot. The caller must surface this - it is
    // the difference between "the officer stood here" and "this block is here".
    precision: 'block',
  };
}

module.exports = { geocodeBlock, normalise, blockNumberOf, streetPartOf };
