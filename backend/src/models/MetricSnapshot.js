// angelyn
// one row per day: a point-in-time capture of the estate's headline metrics.
// the dashboard diffs today's row against yesterday / last week to show real
// trend arrows (instead of fabricated deltas). written daily by the cron job.
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MetricSnapshot = sequelize.define('MetricSnapshot', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  // calendar day the snapshot represents (YYYY-MM-DD), unique so capture is idempotent
  snapshot_date: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  open_cases: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  critical_flora: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  at_risk_flora: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  active_hotspots: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  total_sightings: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  risk_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
});

module.exports = MetricSnapshot;
