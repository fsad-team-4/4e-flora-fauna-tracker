// angelyn
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Root-cause taxonomy. `likely_cause` is the AI's free-text sentence and stays
 * exactly as it is - it is evidence, and rewriting it into a category would lose
 * what the officer and the model actually said. This is a SEPARATE, officer-set
 * field: a closed vocabulary is what makes "how many blocks are bin_overflow"
 * answerable, and it is what an enforcement brief needs to cite.
 *
 * `unknown` is a real, selectable answer, not a default-when-empty. Null means
 * nobody has classified the report yet; `unknown` means someone looked and could
 * not tell. Collapsing the two would quietly turn "unreviewed" into a finding.
 */
const ROOT_CAUSES = [
  'bin_overflow',
  'food_waste',
  'structural_gap',
  'external_food_source',
  'vegetation',
  'drain_ingress',
  'unknown',
];

/**
 * How an assessment actually ended. `false_alarm` is deliberately in the same
 * enum rather than being a separate flag - it is a legitimate outcome, and keeping
 * it here means "resolved" counts can always be split by what resolution meant.
 */
const RESOLUTION_TYPES = ['sealed', 'baited', 'sanitation_enforced', 'false_alarm'];

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
  // Reported field position. Column names/types match Renee's FaunaSighting so
  // the two modules agree. Nullable and staying that way: ~34 existing rows have
  // no recorded position and never will, and an officer with no signal must still
  // be able to file - absence of a coordinate is real data, not a gap to fill.
  gps_lat: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  gps_lng: {
    type: DataTypes.FLOAT,
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
  // -- root cause -----------------------------------------------------------
  // Officer-set classification, separate from the AI's free-text `likely_cause`
  // above. Nullable: null = not yet classified, 'unknown' = classified as
  // undeterminable. See ROOT_CAUSES.
  root_cause: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isIn: [ROOT_CAUSES],
    },
  },

  // -- outcome --------------------------------------------------------------
  // What closed this assessment, and when. Both null until an officer resolves it;
  // `resolution_type` without `resolved_at` is meaningless, so the route sets them
  // together or not at all.
  resolved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  resolution_type: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isIn: [RESOLUTION_TYPES],
    },
  },
  /**
   * Did the same block report again within 30 days of this one being resolved?
   * This is the measure of whether the fix HELD - the single most useful outcome
   * signal on the page.
   *
   * THREE-STATE, and the null is load-bearing:
   *   true  - a later report at this block landed inside the 30-day window
   *   false - the full 30 days elapsed with no further report
   *   null  - not resolved yet, OR resolved less than 30 days ago
   * "No recurrence yet" is not "no recurrence", so an open window stays null
   * rather than being reported as a clean result it has not earned.
   */
  recurrence_within_30d: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
  },
  // When the nightly job last evaluated the field above, so the UI can say how
  // fresh the answer is instead of implying it is live.
  recurrence_checked_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  // -- SLA ------------------------------------------------------------------
  // Derived on create from risk_level + createdAt (see services/rodentSla.js).
  // Stored rather than computed on read so that a later change to the target
  // table cannot silently restate history: a report is judged against the target
  // that applied when it was filed.
  sla_target_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Stamped by the nightly job the first time a still-unresolved assessment is
  // found past its target. Kept as a timestamp, not a boolean, so "how long
  // overdue" is answerable and the breach is not silently recomputed away.
  sla_breached_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  // -- provenance -----------------------------------------------------------
  // Set when an assessment was raised off a sensor alert rather than an officer
  // walking past. Nullable and unconstrained by a FK on purpose: the sensor
  // surface is SIMULATED pilot data (see services/sensorSurface.js) and has no
  // table of its own, so this records the claimed trigger without pretending
  // there is a real row to join to.
  triggering_sensor_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // Prior reports at this block in the 7 days BEFORE this one was filed - the
  // figure the AI was given as recurrence context. Persisted because it was
  // previously computed at create time, returned once in the POST response, and
  // then thrown away, so the list could never show it. Frozen at create time by
  // design: it is what the model saw, not a live count.
  prior_count: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  is_deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
});

module.exports = RodentAssessment;
module.exports.ROOT_CAUSES = ROOT_CAUSES;
module.exports.RESOLUTION_TYPES = RESOLUTION_TYPES;
