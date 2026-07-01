const sequelize = require('../config/database');
const User = require('./User');
const ResidentReport = require('./ResidentReport');
const CaseStatusLog = require('./CaseStatusLog');
const GreeneryRecord = require('./GreeneryRecord');

User.hasMany(ResidentReport, { foreignKey: 'reported_by' });
ResidentReport.belongsTo(User, { as: 'reporter', foreignKey: 'reported_by' });

ResidentReport.hasMany(CaseStatusLog, { foreignKey: 'report_id' });
CaseStatusLog.belongsTo(ResidentReport, { foreignKey: 'report_id' });

CaseStatusLog.belongsTo(User, { as: 'changer', foreignKey: 'changed_by' });

User.hasMany(GreeneryRecord, { foreignKey: 'recorded_by' });
GreeneryRecord.belongsTo(User, { as: 'recorder', foreignKey: 'recorded_by' });

module.exports = {
  sequelize,
  User,
  ResidentReport,
  CaseStatusLog,
  GreeneryRecord,
};
