// events/interactionCreate.js
const { Events } = require('discord.js');
const logger = require('../utils/logger');
const timezones = require('../utils/timezones');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (interaction.isAutocomplete()) {
			if (interaction.commandName === 'createsession') {
				const focusedValue = interaction.options.getFocused();
				const filtered = timezones.filter(choice => choice.label.toLowerCase().includes(focusedValue.toLowerCase()));
				await interaction.respond(
					filtered.slice(0, 25).map(choice => ({ name: choice.label, value: choice.value })),
				);
			}
		}

		if (!interaction.isChatInputCommand()) return;

		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			logger.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		try {
			await command.execute(interaction);
		} catch (error) {
			logger.error(`Error executing ${interaction.commandName}`, error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
			} else {
				await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
			}
		}
	},
};
