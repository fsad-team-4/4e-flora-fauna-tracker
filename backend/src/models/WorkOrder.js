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
  // Current pipeline stage. Every value here is backed by a WorkOrderEvent row
  // with a real timestamp and actor - see STAGES in services/workOrderStages.js.
  // Replaces the old open/closed pair; 'raised' is the former 'open'.
  status: {
    type: DataTypes.STRING,
    defaultValue: 'raised',
    validate: { isIn: [['raised', 'dispatched', 'scheduled', 'in_progress', 'resolved', 'closed']] },
  },
  // Contractor attendance date. NEVER estimated, predicted or defaulted - it is
  // only ever written from a human's input or a contractor's reply. Null means
  // "date not yet confirmed", which is what the UI must say.
  scheduled_for: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Which town council owns this item. Free text, nullable: a row with no
  // recorded council renders as "not recorded" rather than defaulting to one.
  town_council: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // Optional link back to Klemens' resident reports (M3). Nullable by design -
  // the rodent path has no resident on it, so an unlinked order simply sends no
  // resident email rather than inventing a recipient.
  resident_report_ids: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  // Cloudinary secure_urls for site evidence. Uploaded server-side only.
  photo_urls: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
  },
  // AI-drafted contractor briefing. Stored as a DRAFT: a human reviews and sends,
  // nothing is auto-dispatched from this field.
  vendor_briefing: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  vendor_briefing_at: {
    type: DataTypes.DATE,
    allowNull: true,
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
  dispatched_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  dispatched_by_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // scheduled / in_progress / resolved stage cache. Each pairs a timestamp with
  // the actor who recorded it; a null timestamp renders as "not yet", never as
  // done and never inferred from a later stage having a value.
  scheduled_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  scheduled_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  scheduled_by_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  in_progress_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  in_progress_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  in_progress_by_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  resolved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  resolved_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  resolved_by_name: {
    type: DataTypes.STRING,
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
