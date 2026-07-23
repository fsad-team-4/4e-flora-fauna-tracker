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
  // full message kept so a failed dispatch can actually be re-sent (not just
  // re-flagged). subject + body are what nodemailer needs to retry.
  subject: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // failure reason, kept separate from message_preview so the preview can show
  // the message while the reason drives the failure UI.
  error_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // what the dispatch was about, so the log links back to its origin (audit +
  // team coordination). e.g. source_type 'work_order', source_id '12'.
  source_type: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  source_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // 'urgent' | 'watch' | 'info' - decides whether a failed dispatch auto-escalates
  severity: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // links a resend attempt back to the original failed dispatch (audit trail)
  retry_of: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // set on the ORIGINAL failed row once a resend succeeds, so the failure banner
  // counts only unresolved failures.
  resolved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // close-the-loop: an officer confirms the notification was acted on
  acknowledged_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  acknowledged_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  acknowledged_by_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
});

module.exports = NotificationLog;
