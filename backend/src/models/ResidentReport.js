const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ResidentReport = sequelize.define('ResidentReport', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  category: {
    type: DataTypes.ENUM('flora_health', 'community_cat', 'pigeon', 'pest', 'other'),
    allowNull: false,
    // SQLite stores ENUM as TEXT with no value check - enforce it here too
    validate: {
      isIn: [['flora_health', 'community_cat', 'pigeon', 'pest', 'other']],
    },
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  photo_urls: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
  },
  gps_lat: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  gps_lng: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  block_number: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  floor_level: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('open', 'in_progress', 'resolved'),
    allowNull: false,
    defaultValue: 'open',
    validate: {
      isIn: [['open', 'in_progress', 'resolved']],
    },
  },
  reported_by: {
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

module.exports = ResidentReport;
