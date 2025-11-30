// commands/mysessions.js
const { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType } = require('discord.js');
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

      const message = await interaction.editReply({ embeds: [embed], components });

      if (cancellableSessions.length === 0) return;

      const collector = message.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          time: 120000, // 2 minutes
          filter: i => i.user.id === interaction.user.id && i.customId === 'cancel_session_select'
      });

      collector.on('collect', async i => {
          const sessionIdToCancel = i.values[0];

          const modal = new ModalBuilder()
              .setCustomId(`cancel_modal_${sessionIdToCancel}`)
              .setTitle('Cancel Session');

          const reasonInput = new TextInputBuilder()
              .setCustomId('cancellation_reason')
              .setLabel("Please provide a reason for cancelling")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
          await i.showModal(modal);

          const submitted = await i.awaitModalSubmit({
              time: 120000,
              filter: submitInteraction => submitInteraction.customId === `cancel_modal_${sessionIdToCancel}` && submitInteraction.user.id === i.user.id,
          }).catch(() => null);

          if (submitted) {
              await submitted.deferReply({ ephemeral: true });
              const reason = submitted.fields.getTextInputValue('cancellation_reason');

              const sessionToCancel = await db.get('SELECT * FROM sessions WHERE id = ?', [sessionIdToCancel]);
              const coach = await db.get('SELECT * FROM coaches WHERE id = ?', [sessionToCancel.claimedCoach]);

              // Update the database
              await db.run(
                  'UPDATE sessions SET isClaimed = 0, claimedBy = NULL, claimedCoach = NULL WHERE id = ?',
                  [sessionIdToCancel]
              );

              // Re-create the Guild Scheduled Event
              if (sessionToCancel.guildScheduledEventId) {
                  try {
                      const event = await interaction.guild.scheduledEvents.fetch(sessionToCancel.guildScheduledEventId);
                      await event.delete();
                  } catch (eventError) {
                      logger.error(`Failed to delete scheduled event ${sessionToCancel.guildScheduledEventId}:`, eventError);
                  }
              }

              try {
                  const newEvent = await interaction.guild.scheduledEvents.create({
                      name: sessionToCancel.title,
                      scheduledStartTime: sessionToCancel.datetime,
                      scheduledEndTime: new Date(new Date(sessionToCancel.datetime).getTime() + sessionToCancel.duration_minutes * 60000),
                      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
                      entityType: GuildScheduledEventEntityType.External,
                      entityMetadata: { location: '1-on-1 Coaching' }
                  });
                  await db.run('UPDATE sessions SET guildScheduledEventId = ? WHERE id = ?', [newEvent.id, sessionIdToCancel]);
              } catch (eventError) {
                  logger.error(`Failed to create new scheduled event for session ${sessionIdToCancel}:`, eventError);
              }

              // Notify the coach
              try {
                  const coachUser = await interaction.client.users.fetch(coach.discord_id);
                  await coachUser.send(`**Session Cancelled:** A user has cancelled their session titled "${sessionToCancel.title}" scheduled for ${new Date(sessionToCancel.datetime).toUTCString()}. Reason: ${reason}`);
              } catch (dmError) {
                  logger.error(`Failed to DM coach ${coach.name} about cancellation:`, dmError);
              }

              // Notify the cancellations channel
              const channelIdSetting = await db.get("SELECT value FROM settings WHERE key = 'cancellationsChannelId'");
              if (channelIdSetting && channelIdSetting.value) {
                  try {
                      const cancellationsChannel = await interaction.client.channels.fetch(channelIdSetting.value);
                      await cancellationsChannel.send({
                          embeds: [
                              new EmbedBuilder()
                                  .setTitle('Session Cancellation')
                                  .setDescription(`A session has been cancelled by <@${interaction.user.id}>.`)
                                  .addFields(
                                      { name: 'Session', value: sessionToCancel.title, inline: true },
                                      { name: 'Coach', value: coach.name, inline: true },
                                      { name: 'Original Time', value: new Date(sessionToCancel.datetime).toUTCString(), inline: false },
                                      { name: 'Reason', value: reason, inline: false }
                                  )
                                  .setColor(0xE74C3C)
                                  .setTimestamp()
                          ]
                      });
                  } catch (channelError) {
                      logger.error('Failed to send cancellation notice to channel:', channelError);
                  }
              }

              await submitted.editReply({ content: 'Your session has been successfully cancelled.', components: [] });
          }
      });

      collector.on('end', () => {
          interaction.editReply({ components: [] }).catch(() => {});
      });

    } catch (error) {
      logger.error('Error executing mysessions command:', error);
      await interaction.editReply({ content: 'An error occurred while fetching your sessions.' });
    }
  },
};
