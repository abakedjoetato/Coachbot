// commands/mysessions.js
const { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../database/database');
const logger = require('../utils/logger');

const CANCELLATION_WINDOW_HOURS = 48;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mysessions')
    .setDescription('View and manage your upcoming coaching sessions.'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const now = new Date();
      const userSessions = await db.all(
        `SELECT s.id, s.datetime, s.title, c.name as coachName
         FROM sessions s
         JOIN coaches c ON s.claimedCoach = c.id
         WHERE s.claimedBy = ? AND datetime(s.datetime) > datetime(?)
         ORDER BY s.datetime ASC`,
        [interaction.user.id, now.toISOString()]
      );

      if (!userSessions || userSessions.length === 0) {
        return interaction.editReply({ content: "You don't have any upcoming sessions." });
      }

      const embed = new EmbedBuilder()
        .setTitle('Your Upcoming Sessions')
        .setColor(0x3498DB);

      let description = "Here are your scheduled sessions. To cancel a session, select it from the dropdown below.\n\n";
      const cancellableSessions = [];

      userSessions.forEach(session => {
        const sessionDate = new Date(session.datetime);
        const hoursUntil = (sessionDate.getTime() - now.getTime()) / (1000 * 60 * 60);

        description += `**${session.title}** with **${session.coachName}**\n`;
        description += `*${sessionDate.toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'short' })}*\n`;

        if (hoursUntil > CANCELLATION_WINDOW_HOURS) {
            description += `(Cancellable)\n\n`;
            cancellableSessions.push({
                label: `${session.title.slice(0, 80)}`,
                description: `With ${session.coachName} on ${sessionDate.toLocaleDateString()}`,
                value: session.id.toString()
            });
        } else {
            description += `(Cannot be cancelled within ${CANCELLATION_WINDOW_HOURS} hours)\n\n`;
        }
      });
      embed.setDescription(description);

      const components = [];
      if (cancellableSessions.length > 0) {
          const selectMenu = new StringSelectMenuBuilder()
              .setCustomId('cancel_session_select')
              .setPlaceholder('Select a session to cancel')
              .addOptions(cancellableSessions);
          components.push(new ActionRowBuilder().addComponents(selectMenu));
      }

      await interaction.editReply({ embeds: [embed], components });

    } catch (error) {
      logger.error('Error executing mysessions command:', error);
      await interaction.editReply({ content: 'An error occurred while fetching your sessions.' });
    }
  },
};
