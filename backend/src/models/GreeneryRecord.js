const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GreeneryRecord = sequelize.define('GreeneryRecord', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  species: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  common_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  location_zone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  location: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  health_status: {
    type: DataTypes.ENUM('healthy', 'at_risk', 'critical'),
    allowNull: false,
    defaultValue: 'healthy',
    // SQLite stores ENUM as TEXT with no value check - enforce it here too
    validate: {
      isIn: [['healthy', 'at_risk', 'critical']],
    },
  },
  health_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  plant_family: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  site_suitability: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  color: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  max_height_at_maturity: {
    type: DataTypes.FLOAT, // metres
    allowNull: true,
  },
  care_recommendation: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  image_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  last_inspected_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  recorded_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Users', key: 'id' },
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
});

module.exports = GreeneryRecord;
