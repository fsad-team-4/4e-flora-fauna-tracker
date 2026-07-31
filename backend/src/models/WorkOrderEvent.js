// angelyn
// Append-only stage log for a work order - the "parcel scan" record.
//
// The client's analogy is package tracking, and that only earns trust because
// every state shown is a scan that actually happened. So this table is the source
// of truth for the pipeline: one row per stage change, each carrying WHEN it
// happened and WHO moved it. Nothing here is ever inferred from a later stage,
// and rows are never updated or deleted - a correction is another row.
//
// WorkOrder keeps denormalised <stage>_at / <stage>_by columns as a read cache so
// the queue can sort and filter without an aggregate per row; this table is what
// those columns are derived from, and the two are written in the same operation.
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const WorkOrderEvent = sequelize.define('WorkOrderEvent', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  work_order_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  // the stage this event moved the order INTO
  stage: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  // Explicit event time. Deliberately separate from createdAt: a stage can be
  // logged after the fact (a contractor phones in Monday's attendance on Tuesday),
  // and the honest record is when it HAPPENED plus when it was recorded.
  at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  // Actor is required. A stage with no attributable human is not a stage we show.
  actor_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  actor_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  note: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
});

module.exports = WorkOrderEvent;
