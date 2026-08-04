const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ZoneAssignment = sequelize.define('ZoneAssignment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Users', key: 'id' },
  },
  block_number: {
    type: DataTypes.STRING,
    allowNull: false,
  },
});

module.exports = ZoneAssignment;
