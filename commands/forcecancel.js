// commands/forcecancel.js
const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType } = require('discord.js');
const db = require('../database/database');
const logger = require('../utils/logger');
const moment = require('moment-timezone');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('forcecancel')
        .setDescription('Forcefully cancels a claimed session, making it available again.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const now = new Date().toISOString();
            const claimedSessions = await db.all(
                `SELECT s.id, s.datetime, s.title, s.claimedBy, s.guildScheduledEventId, s.duration_minutes, c.name as coachName, c.discord_id as coachDiscordId
                 FROM sessions s
                 JOIN coaches c ON s.claimedCoach = c.id
                 WHERE s.isClaimed = 1 AND s.datetime > ?
                 ORDER BY s.datetime ASC`,
                [now]
            );

            if (!claimedSessions || claimedSessions.length === 0) {
                return interaction.editReply({ content: 'There are no upcoming claimed sessions to cancel.' });
            }

            const sessionOptions = claimedSessions.map(session => {
                const sessionDate = new Date(session.datetime);
                return {
                    label: `ID: ${session.id} - ${session.title.slice(0, 50)}`,
                    description: `With ${session.coachName}, claimed by ${session.claimedBy}`,
                    value: session.id.toString(),
                };
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('force_cancel_select')
                .setPlaceholder('Select a session to forcefully cancel')
                .addOptions(sessionOptions.slice(0, 25));

            await interaction.editReply({
                content: 'Select a claimed session to cancel. The user and coach will be notified.',
                components: [new ActionRowBuilder().addComponents(selectMenu)],
            });

            const collector = interaction.channel.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id && i.customId === 'force_cancel_select',
                time: 120000, // 2 minutes
            });

            collector.on('collect', async i => {
                const sessionId = i.values[0];
                const session = claimedSessions.find(s => s.id.toString() === sessionId);

                const modal = new ModalBuilder().setCustomId(`force_cancel_modal_${sessionId}`).setTitle('Reason for Cancellation');
                const reasonInput = new TextInputBuilder().setCustomId('cancellation_reason').setLabel('Reason for cancellation').setStyle(TextInputStyle.Paragraph).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                await i.showModal(modal);

                const submittedModal = await i.awaitModalSubmit({
                    filter: mi => mi.customId === `force_cancel_modal_${sessionId}` && mi.user.id === i.user.id,
                    time: 120000,
                }).catch(() => null);

                if (!submittedModal) {
                    return interaction.editReply({ content: 'Modal timed out. Please start over.', components: [] });
                }

                await submittedModal.deferUpdate();
                const reason = submittedModal.fields.getTextInputValue('cancellation_reason');

                // 1. Update session in DB
                await db.run('UPDATE sessions SET isClaimed = 0, claimedBy = NULL, claimedCoach = NULL WHERE id = ?', [sessionId]);

                // 2. Re-create Guild Scheduled Event
                try {
                    if (session.guildScheduledEventId) {
                        await interaction.guild.scheduledEvents.delete(session.guildScheduledEventId);
                    }
                } catch (error) {
                    logger.warn(`Could not delete old scheduled event ${session.guildScheduledEventId}. It might have been already deleted.`);
                }

                const newEvent = await interaction.guild.scheduledEvents.create({
                    name: session.title,
                    scheduledStartTime: session.datetime,
                    scheduledEndTime: moment(session.datetime).add(session.duration_minutes, 'minutes').toDate(),
                    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
                    entityType: GuildScheduledEventEntityType.External,
                    entityMetadata: { location: '1-on-1 Coaching' }
                });
                await db.run('UPDATE sessions SET guildScheduledEventId = ? WHERE id = ?', [newEvent.id, sessionId]);

                // 3. Notify user and coach
                const originalUser = await interaction.client.users.fetch(session.claimedBy);
                const coach = await interaction.client.users.fetch(session.coachDiscordId);
                const sessionDateString = new Date(session.datetime).toUTCString();

                const userMessage = `Your session **"${session.title}"** on **${sessionDateString}** has been cancelled by an administrator. Reason: ${reason}`;
                const coachMessage = `The session **"${session.title}"** on **${sessionDateString}** with **${originalUser.tag}** has been cancelled by an administrator. The session is now available for others to claim. Reason: ${reason}`;

                try { await originalUser.send(userMessage); } catch (e) { logger.error(`Failed to DM user ${session.claimedBy}`); }
                try { await coach.send(coachMessage); } catch (e) { logger.error(`Failed to DM coach ${session.coachDiscordId}`); }

                // 4. Notify cancellations channel
                const channelIdSetting = await db.get("SELECT value FROM settings WHERE key = 'cancellationsChannelId'");
                if (channelIdSetting && channelIdSetting.value) {
                    const channel = await interaction.client.channels.fetch(channelIdSetting.value);
                    const embed = new EmbedBuilder()
                        .setTitle('Admin Forced Cancellation')
                        .setDescription(`A session has been forcefully cancelled by <@${interaction.user.id}>.`)
                        .addFields(
                            { name: 'Session', value: session.title, inline: true },
                            { name: 'Original User', value: `<@${session.claimedBy}>`, inline: true },
                            { name: 'Coach', value: `<@${session.coachDiscordId}>`, inline: true },
                            { name: 'Reason', value: reason }
                        )
                        .setColor(0xE74C3C)
                        .setTimestamp();
                    await channel.send({ embeds: [embed] });
                }

                logger.info(`Session ${sessionId} force-cancelled by ${interaction.user.tag}.`);
                await interaction.editReply({ content: `✅ Successfully cancelled the session. **${originalUser.tag}** and **${coach.tag}** have been notified.`, components: [] });
                collector.stop();
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    interaction.editReply({ content: 'Command timed out.', components: [] });
                }
            });

        } catch (error) {
            logger.error('Error in /forcecancel command:', error);
            await interaction.editReply({ content: 'An unexpected error occurred. Please try again later.' });
        }
    },
};
