// angelyn
// fake data that pretends to come from Shernell/Renee/Klemens tables
// when teammates ship their real tables, replace each function body with actual queries
// keeping the function signatures the same so the rest of m4 doesnt have to change
//
// note: cases use createdAt (not reported_at) to match klemens' ResidentReport model
// so the field name lines up when we swap mock data for the real query later
//
// dates are generated relative to "now" on every call so the estate always looks
// live in a demo (recent sightings, cases opened this week, "last seen" in hours).

function hoursAgo(n) {
  const d = new Date();
  d.setMinutes(d.getMinutes() - Math.round(n * 60));
  return d.toISOString();
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function getFloraRecords() {
  return [
    { id: 1, species: 'Bougainvillea', location: 'Block 123', block_number: 'Block 123', health_status: 'critical', last_inspected: daysAgo(3) },
    { id: 2, species: 'Frangipani', location: 'Block 456', block_number: 'Block 456', health_status: 'at_risk', last_inspected: daysAgo(5) },
    { id: 3, species: 'Hibiscus', location: 'Block 789', block_number: 'Block 789', health_status: 'healthy', last_inspected: daysAgo(6) },
    { id: 4, species: 'Ixora', location: 'Block 234', block_number: 'Block 234', health_status: 'at_risk', last_inspected: daysAgo(4) },
    { id: 5, species: 'Lantana', location: 'Block 567', block_number: 'Block 567', health_status: 'healthy', last_inspected: daysAgo(8) },
    { id: 6, species: 'Heliconia', location: 'Block 890', block_number: 'Block 890', health_status: 'critical', last_inspected: daysAgo(2) },
    { id: 7, species: 'Bird of Paradise', location: 'Block 345', block_number: 'Block 345', health_status: 'healthy', last_inspected: daysAgo(9) }
  ];
}

function getFaunaSightings() {
  return [
    { id: 1, species: 'cat', block_number: 'Block 123', floor: 'L5', behaviour: 'defecating', createdAt: hoursAgo(2) },
    { id: 2, species: 'cat', block_number: 'Block 123', floor: 'L3', behaviour: 'roaming', createdAt: hoursAgo(20) },
    { id: 3, species: 'pigeon', block_number: 'Block 456', floor: 'L12', behaviour: 'roosting', createdAt: hoursAgo(5) },
    { id: 4, species: 'pigeon', block_number: 'Block 456', floor: 'L12', behaviour: 'feeding', createdAt: daysAgo(1) },
    { id: 5, species: 'pigeon', block_number: 'Block 456', floor: 'L8', behaviour: 'roosting', createdAt: daysAgo(2) },
    { id: 6, species: 'cat', block_number: 'Block 123', floor: 'L1', behaviour: 'urinating', createdAt: daysAgo(1) },
    { id: 7, species: 'cat', block_number: 'Block 789', floor: 'Ground', behaviour: 'feeding', createdAt: daysAgo(1) }
  ];
}

function getCases() {
  return [
    { id: 1, category: 'community_cat', block_number: 'Block 123', title: 'Cat keeps coming up to L5', status: 'open', createdAt: hoursAgo(0.3) },
    { id: 2, category: 'pigeon', block_number: 'Block 456', title: 'Pigeon feeding at void deck', status: 'in_progress', createdAt: hoursAgo(2) },
    { id: 3, category: 'flora_health', block_number: 'Block 123', title: 'Bougainvillea looking sick', status: 'open', createdAt: hoursAgo(20) },
    { id: 4, category: 'pest', block_number: 'Block 234', title: 'Rodent sighting near garden', status: 'resolved', createdAt: daysAgo(4) },
    { id: 5, category: 'community_cat', block_number: 'Block 123', title: 'Cat litter at staircase', status: 'open', createdAt: daysAgo(1) },
    { id: 6, category: 'flora_health', block_number: 'Block 567', title: 'Dry patch on grass', status: 'in_progress', createdAt: daysAgo(2) },
    { id: 7, category: 'pigeon', block_number: 'Block 456', title: 'Bird droppings on Block 456 corridor', status: 'open', createdAt: hoursAgo(6) }
  ];
}

module.exports = { getFloraRecords, getFaunaSightings, getCases };
