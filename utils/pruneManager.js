// utils/pruneManager.js
const db = require('../database/database');
const logger = require('./logger');

const PRUNE_INTERVAL_DAYS = 7;
const ONE_WEEK_IN_MS = PRUNE_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

async function pruneOldSessions() {
    try {
        const oneWeekAgo = new Date(Date.now() - ONE_WEEK_IN_MS);
        const oneWeekAgoISO = oneWeekAgo.toISOString();

        logger.info(`Pruning sessions that ended before ${oneWeekAgoISO}...`);

        const result = await db.run(
            `DELETE FROM sessions WHERE datetime < ?`,
            [oneWeekAgoISO]
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
