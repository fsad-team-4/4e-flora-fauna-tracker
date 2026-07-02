// angelyn
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RodentAssessment = sequelize.define('RodentAssessment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  block: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  floor_level: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  observations: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  risk_level: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isIn: [['low', 'medium', 'high', 'critical']],
    },
  },
  likely_cause: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  signs_identified: {
    // Sequelize stores JSON as TEXT for SQLite, proper JSON for Postgres
    type: DataTypes.JSON,
    allowNull: true,
  },
  immediate_actions: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  escalate_to_contractor: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  escalation_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  follow_up_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  assessed_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
});

module.exports = RodentAssessment;
