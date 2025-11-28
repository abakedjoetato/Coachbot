// events/ready.js
const { Events } = require('discord.js');
const logger = require('../utils/logger');
const { startSessionUpdater } = require('../utils/sessionManager');
const { startPruner } = require('../utils/pruneManager');

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
		logger.info(`Ready! Logged in as ${client.user.tag}`);

        // Start background tasks
        startSessionUpdater(client);
        startPruner();
	},
};
