// angelyn
// A WorkOrder is the human-approved outcome of reviewing the escalation queue.
// The rodent AI only ever RECOMMENDS escalation (escalate_to_contractor); a work
// order is never created automatically. An officer reviews the pending
// escalations for a block, consolidates them, and approves - satisfying the
// brief's hard constraint that a paid contractor call-out always has a human in
// the loop and that multiple complaints are consolidated before dispatch.
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const WorkOrder = sequelize.define('WorkOrder', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  block_number: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // 'rodent' today; the same queue/approval flow extends to cats (Cat Welfare
  // Society) and birds (ACRES) without a schema change.
  animal_type: {
    type: DataTypes.STRING,
    defaultValue: 'rodent',
  },
  target_agency: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // the RodentAssessment ids consolidated into this single call-out
  assessment_ids: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  consolidated_count: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  // highest risk among the consolidated assessments
  risk_level: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  status: {
    // 'open' once approved/raised, 'closed' once the contractor has completed
    type: DataTypes.STRING,
    defaultValue: 'open',
    validate: { isIn: [['open', 'closed']] },
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // audit: who approved the call-out and when (createdAt is the approval time).
  // Names are denormalised so the queue UI needs no user-table join.
  approved_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  approved_by_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // dispatch is optional and independent of approval: an officer can raise a
  // work order without emailing the contractor yet.
  dispatched_to: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  dispatched_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  email_status: {
    // 'sent' | 'failed' | null (not dispatched)
    type: DataTypes.STRING,
    allowNull: true,
  },
  closed_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  closed_by_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  closed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
});

module.exports = WorkOrder;
