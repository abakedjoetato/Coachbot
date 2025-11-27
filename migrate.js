// migrate.js
const fs = require('fs').promises;
const path = require('path');
const db = require('./database/database');
const logger = require('./utils/logger');

const migrationsDir = path.join(__dirname, 'database', 'migrations');

async function migrate() {
  const client = await db.openDb();

  try {
    // 1. Create migrations table if it doesn't exist
    await client.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Get list of already run migrations
    const ranMigrations = await client.all('SELECT name FROM migrations');
    const ranMigrationNames = ranMigrations.map(m => m.name);
    logger.info(`Already ran migrations: ${ranMigrationNames.join(', ') || 'None'}`);

    // 3. Get list of migration files
    const migrationFiles = (await fs.readdir(migrationsDir))
      .filter(file => file.endsWith('.sql'))
      .sort();

    // 4. Run migrations that haven't been run yet
    for (const file of migrationFiles) {
      if (!ranMigrationNames.includes(file)) {
        logger.info(`Running migration: ${file}`);
        const sql = await fs.readFile(path.join(migrationsDir, file), 'utf-8');

        // Use `exec` for multi-statement SQL files
        await client.exec(sql);

        // Record the migration
        await client.run('INSERT INTO migrations (name) VALUES (?)', file);
        logger.info(`Successfully ran and recorded migration: ${file}`);
      }
    }

    logger.info('Database migration process completed successfully.');
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await db.closeDb();
  }
}

migrate();
