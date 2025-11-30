// commands/viewunclaimedsessions.js
const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const db = require('../database/database');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('viewunclaimedsessions')
    .setDescription('Views all available (unclaimed) coaching sessions.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const now = new Date().toISOString();
      const unclaimedSessions = await db.all(
        `SELECT s.datetime, s.title, s.availableCoaches
         FROM sessions s
         WHERE s.isClaimed = 0 AND s.datetime > ?
         ORDER BY s.datetime ASC`,
        [now]
      );

      if (!unclaimedSessions || unclaimedSessions.length === 0) {
        return interaction.editReply({ content: 'There are no upcoming unclaimed sessions.' });
      }

      const coaches = await db.all('SELECT id, name FROM coaches');
      const coachMap = new Map(coaches.map(c => [c.id.toString(), c.name]));

      const embed = new EmbedBuilder()
        .setTitle('Upcoming Unclaimed Sessions')
        .setColor(0xE67E22) // Orange
        .setTimestamp();

      let description = '';
      for (const session of unclaimedSessions) {
          const sessionDate = new Date(session.datetime);
          const dateString = sessionDate.toLocaleString('en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              hour: 'numeric', minute: '2-digit', timeZone: 'UTC', hour12: true
          });

          const availableCoachIds = JSON.parse(session.availableCoaches);
          const availableCoachNames = availableCoachIds.map(id => coachMap.get(id) || 'Unknown Coach').join(', ');

          description += `**${session.title}**\n`;
          description += `**When:** ${dateString}\n`;
          description += `**Available Coaches:** ${availableCoachNames}\n\n`;
      }

      if (description.length > 4096) {
        description = description.substring(0, 4000) + '... \n\n*Too many sessions to display.*';
      }
      embed.setDescription(description);

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error('Error executing viewunclaimedsessions command:', error);
      await interaction.editReply({ content: 'An error occurred while fetching unclaimed sessions.' });
    }
  },
};
