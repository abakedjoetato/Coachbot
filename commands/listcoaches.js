// commands/listcoaches.js
const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const db = require('../database/database');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('listcoaches')
    .setDescription('Displays a list of all registered coaches.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const coaches = await db.all('SELECT name, description, discord_id FROM coaches ORDER BY name ASC');

      if (!coaches || coaches.length === 0) {
        return interaction.editReply({ content: 'There are no coaches registered in the system.' });
      }

      const embed = new EmbedBuilder()
        .setTitle('Registered Coaches')
        .setColor(0x0099FF)
        .setTimestamp();

      let description = '';
      coaches.forEach(coach => {
        // We use <@USER_ID> to create a user mention
        description += `**${coach.name}** (<@${coach.discord_id}>)\n`;
        if (coach.description) {
          description += `*${coach.description}*\n`;
        }
        description += '\n'; // Add a blank line for spacing
      });

      embed.setDescription(description);

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error('Error executing listcoaches command:', error);
      await interaction.editReply({ content: 'An error occurred while fetching the list of coaches.' });
    }
  },
};
