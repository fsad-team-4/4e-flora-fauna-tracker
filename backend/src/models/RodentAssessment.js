// angelyn
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RodentAssessment = sequelize.define('RodentAssessment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  block_number: {
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
  image_url: {
    type: DataTypes.STRING,
    allowNull: true,
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
  // Escalation-queue state. An assessment with escalate_to_contractor = true is
  // "pending" until an officer either consolidates it into a work order
  // (work_order_id set) or dismisses it (escalation_status = 'dismissed'). Both
  // paths remove it from the queue; the fields below are the decision audit.
  work_order_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  escalation_status: {
    // null = pending review, 'dismissed' = reviewed and not actioned
    type: DataTypes.STRING,
    allowNull: true,
  },
  escalation_note: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  escalation_decided_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  escalation_decided_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
});

module.exports = RodentAssessment;
