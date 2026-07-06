const sequelize = require('../config/database');
const User = require('./User');
const ResidentReport = require('./ResidentReport');
const CaseStatusLog = require('./CaseStatusLog');
const AlertRule = require('./AlertRule');
const NotificationLog = require('./NotificationLog');
const RodentAssessment = require('./RodentAssessment');
const FaunaSighting = require('./FaunaSighting');

User.hasMany(ResidentReport, { foreignKey: 'reported_by' });
ResidentReport.belongsTo(User, { as: 'reporter', foreignKey: 'reported_by' });

User.hasMany(FaunaSighting, { foreignKey: 'reported_by' });
FaunaSighting.belongsTo(User, { as: 'reporter', foreignKey: 'reported_by' });

ResidentReport.hasMany(CaseStatusLog, { foreignKey: 'report_id' });
CaseStatusLog.belongsTo(ResidentReport, { foreignKey: 'report_id' });

CaseStatusLog.belongsTo(User, { as: 'changer', foreignKey: 'changed_by' });

AlertRule.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
NotificationLog.belongsTo(AlertRule, { as: 'rule', foreignKey: 'rule_id' });

module.exports = {
  sequelize,
  User,
  ResidentReport,
  CaseStatusLog,
  AlertRule,
  NotificationLog,
  RodentAssessment,
  FaunaSighting,
};
