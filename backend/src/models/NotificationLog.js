// angelyn
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const NotificationLog = sequelize.define('NotificationLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  rule_id: {
    // nullable - set to null if the rule gets deleted later
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  channel: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  recipient: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    // 'sent' or 'failed'
    type: DataTypes.STRING,
    allowNull: true,
  },
  message_preview: {
    // first 200 chars of the message body - for the log UI
    type: DataTypes.TEXT,
    allowNull: true,
  },
});

module.exports = NotificationLog;
