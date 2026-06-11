const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CaseStatusLog = sequelize.define('CaseStatusLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  report_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'ResidentReports', key: 'id' },
  },
  old_status: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  new_status: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  changed_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Users', key: 'id' },
  },
});

module.exports = CaseStatusLog;
