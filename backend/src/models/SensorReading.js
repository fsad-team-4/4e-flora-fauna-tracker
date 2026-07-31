// angelyn
// RATSENSE sensor reading - SIMULATED PILOT DATA.
//
// The client's brief describes an existing pilot with smart sensors and cameras
// monitoring rodent activity. This table prototypes that integration so the
// regional surface has a genuinely continuous field to interpolate. It does NOT
// contain real readings and must never be presented as if it does.
//
// WHY A SEPARATE TABLE AT ALL: officer-reported assessments are DISCRETE events.
// The space between two reports has no true value, so interpolating them would
// fabricate data. A grid of fixed sensors sampling continuously IS a field, and
// interpolating between those samples is what a weather map legitimately does.
// Keeping the two in separate tables is what stops the distinction eroding.
//
// is_simulated IS LOAD-BEARING, NOT DECORATIVE:
//   - it is NOT NULL and defaults to true, so a row cannot quietly become "real"
//   - every API response carrying this data echoes it, so the UI can label it
//   - no service that computes a real metric may read this table at all
//     (asserted by backend/tests/angelyn/simulatedDataIsolation.test.js)
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LOCATION_TYPES = ['refuse_chute', 'bin_centre', 'fnb_unit', 'void_deck'];

const SensorReading = sequelize.define('SensorReading', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  // Stable across readings: a sensor is a fixed device, so many readings share
  // one sensor_id and one position.
  sensor_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  lat: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  lng: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  location_type: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { isIn: [LOCATION_TYPES] },
  },
  town_council: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  // The reading itself. Unitless activity index in this prototype (a real
  // RATSENSE feed would carry its own vendor units).
  activity_level: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  recorded_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  // NOT NULL with no default-to-false path: any row in this table is simulated
  // until an actual vendor integration writes rows that are not.
  is_simulated: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
}, {
  indexes: [
    { fields: ['sensor_id'] },
    { fields: ['recorded_at'] },
  ],
});

module.exports = SensorReading;
module.exports.LOCATION_TYPES = LOCATION_TYPES;
