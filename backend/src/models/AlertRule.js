// angelyn
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AlertRule = sequelize.define('AlertRule', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  trigger_type: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [['flora_critical', 'fauna_hotspot', 'new_case_urgent', 'weekly_summary']],
    },
  },
  threshold: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  recipients: {
    // comma-separated emails - easier to query than a JSON array
    type: DataTypes.TEXT,
    allowNull: false,
  },
  channel: {
    type: DataTypes.STRING,
    defaultValue: 'email',
    validate: {
      isIn: [['email', 'sms', 'both']],
    },
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  created_by: {
    // FK to User.id - enforced at DB level via the belongsTo association in models/index.js
    type: DataTypes.INTEGER,
    allowNull: true,
  },
});

module.exports = AlertRule;
