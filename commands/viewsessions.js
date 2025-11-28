// commands/viewsessions.js
const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const db = require('../database/database');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('viewsessions')
    .setDescription('Views all currently claimed coaching sessions.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const now = new Date().toISOString();
      const claimedSessions = await db.all(
        `SELECT s.datetime, s.title, s.claimedBy, c.name as coachName
         FROM sessions s
         JOIN coaches c ON s.claimedCoach = c.id
         WHERE s.isClaimed = 1 AND s.datetime > ?
         ORDER BY s.datetime ASC`,
        [now]
      );

      if (!claimedSessions || claimedSessions.length === 0) {
        return interaction.editReply({ content: 'There are no upcoming claimed sessions.' });
      }

      const embed = new EmbedBuilder()
        .setTitle('Upcoming Claimed Sessions')
        .setColor(0x57F287) // Green
        .setTimestamp();

      let description = '';
      for (const session of claimedSessions) {
          const sessionDate = new Date(session.datetime);
          // Format to a user-friendly string, e.g., "Saturday, December 25, 2025 6:00 PM UTC"
          const dateString = sessionDate.toLocaleString('en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              hour: 'numeric', minute: '2-digit', timeZone: 'UTC', hour12: true
          });
          description += `**${session.title}**\n`;
          description += `**When:** ${dateString}\n`;
          description += `**Coach:** ${session.coachName}\n`;
          description += `**Claimed by:** <@${session.claimedBy}>\n\n`;
      }

      if (description.length > 4096) {
        description = description.substring(0, 4000) + '... \n\n*Too many sessions to display.*';
      }
      embed.setDescription(description);

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error('Error executing viewsessions command:', error);
      await interaction.editReply({ content: 'An error occurred while fetching claimed sessions.' });
    }
  },
};
