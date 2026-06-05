const path = require('path');
const { Sequelize } = require('sequelize');

// Use DATABASE_URL if set (e.g. Neon/Postgres in production),
// otherwise default to a local SQLite file for dev.
let sequelize;
if (process.env.DATABASE_URL === 'sqlite::memory:') {
  // In-memory SQLite (used by tests). Configured explicitly to avoid the
  // Node URL-parsing deprecation warning that the URI form triggers.
  sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
} else if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL);
} else {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '../../database.sqlite'),
    logging: false,
  });
}

module.exports = sequelize;
