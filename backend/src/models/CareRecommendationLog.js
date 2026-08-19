const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CareRecommendationLog = sequelize.define('CareRecommendationLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  greenery_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'GreeneryRecords', key: 'id' },
  },
  recommendation: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  source: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  changed_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Users', key: 'id' },
  },
});

module.exports = CareRecommendationLog;
