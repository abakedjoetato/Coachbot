// database/database.js
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const logger = require('../utils/logger');

const dbPath = path.join(__dirname, 'coaching.db');
let db;

async function openDb() {
  if (db) return db;
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    logger.info('Successfully connected to the SQLite database.');
    return db;
  } catch (error) {
    logger.error('Error connecting to the database:', error);
    process.exit(1);
  }
}

async function closeDb() {
  if (db) {
    await db.close();
    db = null;
    logger.info('Database connection closed.');
  }
}

module.exports = {
  openDb,
  closeDb,
  get: (query, params) => db.get(query, params),
  all: (query, params) => db.all(query, params),
  run: (query, params) => db.run(query, params),
};
