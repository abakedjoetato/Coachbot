// utils/pruneManager.js
const db = require('../database/database');
const logger = require('./logger');

const PRUNE_INTERVAL_DAYS = 7;
const ONE_WEEK_IN_MS = PRUNE_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

async function pruneOldSessions() {
    try {
        logger.info(`Pruning sessions older than ${PRUNE_INTERVAL_DAYS} days...`);

        const result = await db.run(
            `DELETE FROM sessions WHERE datetime < datetime('now', '-${PRUNE_INTERVAL_DAYS} days')`
        );

        if (result.changes > 0) {
            logger.info(`Successfully pruned ${result.changes} old session(s).`);
        } else {
            logger.info('No old sessions to prune.');
        }

    } catch (error) {
        logger.error('Failed to prune old sessions:', error);
    }
}

function startPruner() {
    // Run once on startup, then every week
    pruneOldSessions();
    setInterval(pruneOldSessions, ONE_WEEK_IN_MS);
}

module.exports = {
    startPruner
};
