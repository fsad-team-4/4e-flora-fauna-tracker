const sequelize = require('../config/database');
const User = require('./User');
const ResidentReport = require('./ResidentReport');
const CaseStatusLog = require('./CaseStatusLog');
const GreeneryRecord = require('./GreeneryRecord');
const AlertRule = require('./AlertRule');
const NotificationLog = require('./NotificationLog');
const RodentAssessment = require('./RodentAssessment');
const FaunaSighting = require('./FaunaSighting');
const MetricSnapshot = require('./MetricSnapshot');
const WorkOrder = require('./WorkOrder');
const WorkOrderEvent = require('./WorkOrderEvent');
// SIMULATED RATSENSE pilot readings - never read by any real-metric service
const SensorReading = require('./SensorReading');

User.hasMany(ResidentReport, { foreignKey: 'reported_by' });
ResidentReport.belongsTo(User, { as: 'reporter', foreignKey: 'reported_by' });

User.hasMany(FaunaSighting, { foreignKey: 'reported_by' });
FaunaSighting.belongsTo(User, { as: 'reporter', foreignKey: 'reported_by' });

ResidentReport.hasMany(CaseStatusLog, { foreignKey: 'report_id' });
CaseStatusLog.belongsTo(ResidentReport, { foreignKey: 'report_id' });

CaseStatusLog.belongsTo(User, { as: 'changer', foreignKey: 'changed_by' });

User.hasMany(GreeneryRecord, { foreignKey: 'recorded_by' });
GreeneryRecord.belongsTo(User, { as: 'recorder', foreignKey: 'recorded_by' });
AlertRule.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
NotificationLog.belongsTo(AlertRule, { as: 'rule', foreignKey: 'rule_id' });

// A work order consolidates several rodent assessments into one contractor call-out.
WorkOrder.hasMany(RodentAssessment, { foreignKey: 'work_order_id', as: 'assessments' });
RodentAssessment.belongsTo(WorkOrder, { foreignKey: 'work_order_id', as: 'workOrder' });

// Append-only stage log: the source of truth for the work order pipeline.
WorkOrder.hasMany(WorkOrderEvent, { foreignKey: 'work_order_id', as: 'events' });
WorkOrderEvent.belongsTo(WorkOrder, { foreignKey: 'work_order_id' });

// The officer who filed an assessment, so the queue can name the reporter.
RodentAssessment.belongsTo(User, { as: 'assessor', foreignKey: 'assessed_by' });

module.exports = {
  sequelize,
  User,
  ResidentReport,
  CaseStatusLog,
  GreeneryRecord,
  AlertRule,
  NotificationLog,
  RodentAssessment,
  FaunaSighting,
  MetricSnapshot,
  WorkOrder,
  WorkOrderEvent,
  SensorReading,
};
