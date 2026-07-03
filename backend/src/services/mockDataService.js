// angelyn
// fake data that pretends to come from M1/M2/M3 tables
// when teammates ship their real tables, replace each function body with actual SQL queries
// keeping the function signatures the same so the rest of m4 doesnt have to change
//
// note: block field is included on everything so we can do zone filtering
// for welfare partners

function getFloraRecords() {
  return [
    { id: 1, species: 'Bougainvillea', location: 'Block 123', block: 'Block 123', health_status: 'critical', last_inspected: '2026-05-15' },
    { id: 2, species: 'Frangipani', location: 'Block 456', block: 'Block 456', health_status: 'at-risk', last_inspected: '2026-05-18' },
    { id: 3, species: 'Hibiscus', location: 'Block 789', block: 'Block 789', health_status: 'healthy', last_inspected: '2026-05-19' },
    { id: 4, species: 'Ixora', location: 'Block 234', block: 'Block 234', health_status: 'at-risk', last_inspected: '2026-05-17' },
    { id: 5, species: 'Lantana', location: 'Block 567', block: 'Block 567', health_status: 'healthy', last_inspected: '2026-05-20' },
    { id: 6, species: 'Heliconia', location: 'Block 890', block: 'Block 890', health_status: 'critical', last_inspected: '2026-05-14' },
    { id: 7, species: 'Bird of Paradise', location: 'Block 345', block: 'Block 345', health_status: 'healthy', last_inspected: '2026-05-21' }
  ];
}

function getFaunaSightings() {
  return [
    { id: 1, animal_type: 'cat', block: 'Block 123', floor: 'L5', behaviour: 'defecating', date: '2026-05-20' },
    { id: 2, animal_type: 'cat', block: 'Block 123', floor: 'L3', behaviour: 'roaming', date: '2026-05-19' },
    { id: 3, animal_type: 'pigeon', block: 'Block 456', floor: 'L12', behaviour: 'roosting', date: '2026-05-20' },
    { id: 4, animal_type: 'pigeon', block: 'Block 456', floor: 'L12', behaviour: 'feeding', date: '2026-05-19' },
    { id: 5, animal_type: 'pigeon', block: 'Block 456', floor: 'L8', behaviour: 'roosting', date: '2026-05-18' },
    { id: 6, animal_type: 'cat', block: 'Block 123', floor: 'L1', behaviour: 'urinating', date: '2026-05-17' },
    { id: 7, animal_type: 'cat', block: 'Block 789', floor: 'Ground', behaviour: 'feeding', date: '2026-05-20' }
  ];
}

function getCases() {
  return [
    { id: 1, category: 'community_cat', block: 'Block 123', title: 'Cat keeps coming up to L5', status: 'open', reported_at: '2026-05-20' },
    { id: 2, category: 'pigeon', block: 'Block 456', title: 'Pigeon feeding at void deck', status: 'in_progress', reported_at: '2026-05-19' },
    { id: 3, category: 'flora_health', block: 'Block 123', title: 'Bougainvillea looking sick', status: 'open', reported_at: '2026-05-18' },
    { id: 4, category: 'pest', block: 'Block 234', title: 'Rodent sighting near garden', status: 'resolved', reported_at: '2026-05-15' },
    { id: 5, category: 'community_cat', block: 'Block 123', title: 'Cat litter at staircase', status: 'open', reported_at: '2026-05-17' },
    { id: 6, category: 'flora_health', block: 'Block 567', title: 'Dry patch on grass', status: 'in_progress', reported_at: '2026-05-16' },
    { id: 7, category: 'pigeon', block: 'Block 456', title: 'Bird droppings on Block 456 corridor', status: 'open', reported_at: '2026-05-19' }
  ];
}

module.exports = { getFloraRecords, getFaunaSightings, getCases };
