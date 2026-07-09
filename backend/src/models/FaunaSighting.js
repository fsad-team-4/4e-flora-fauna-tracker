const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FaunaSighting = sequelize.define('FaunaSighting', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  species: {
    type: DataTypes.ENUM('cat', 'pigeon', 'crow', 'mynah', 'other'),
    allowNull: false,
    // SQLite stores ENUM as TEXT with no value check - enforce it here too
    validate: {
      isIn: [['cat', 'pigeon', 'crow', 'mynah', 'other']],
    },
  },
  block_number: {
    type: DataTypes.STRING,
    // Nullable: a fauna report may omit the block; the sighting is still created
    // and hotspot grouping files it under 'Unknown'.
    allowNull: true,
  },
  floor_level: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  behaviour_tags: {
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
  photo_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
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

module.exports = FaunaSighting;
