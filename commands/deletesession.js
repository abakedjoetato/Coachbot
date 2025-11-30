// commands/deletesession.js
const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../database/database');
const logger = require('../utils/logger');

const SESSIONS_PER_PAGE = 5;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deletesession')
        .setDescription('Permanently deletes a coaching session.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const now = new Date().toISOString();
            const sessions = await db.all(
                `SELECT s.id, s.datetime, s.title, s.isClaimed, s.claimedBy, s.guildScheduledEventId, c.name as coachName
                 FROM sessions s
                 LEFT JOIN coaches c ON s.claimedCoach = c.id
                 WHERE s.datetime > ?
                 ORDER BY s.datetime ASC`,
                [now]
            );

            if (!sessions || sessions.length === 0) {
                return interaction.editReply({ content: 'There are no upcoming sessions to delete.' });
            }

            let currentPage = 0;
            const totalPages = Math.ceil(sessions.length / SESSIONS_PER_PAGE);

            const generateEmbed = (page) => {
                const start = page * SESSIONS_PER_PAGE;
                const end = start + SESSIONS_PER_PAGE;
                const currentSessions = sessions.slice(start, end);

                const embed = new EmbedBuilder()
                    .setTitle('Delete a Session')
                    .setDescription('Select a session from the dropdown menu to permanently delete it.')
                    .setColor(0xE74C3C) // Red
                    .setFooter({ text: `Page ${page + 1} of ${totalPages}` });

                currentSessions.forEach(session => {
                    const sessionDate = new Date(session.datetime);
                    const dateString = sessionDate.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' });
                    let status = session.isClaimed ? `Claimed by <@${session.claimedBy}> with ${session.coachName}` : 'Unclaimed';
                    embed.addFields({
                        name: `ID: ${session.id} | ${session.title}`,
                        value: `**When:** ${dateString}\n**Status:** ${status}\n`,
                    });
                });

                return embed;
            };

            const generateComponents = (page) => {
                const start = page * SESSIONS_PER_PAGE;
                const end = start + SESSIONS_PER_PAGE;
                const currentSessions = sessions.slice(start, end);
                const components = [];

                if (currentSessions.length > 0) {
                    const sessionOptions = currentSessions.map(session => ({
                        label: `ID: ${session.id} - ${session.title.slice(0, 80)}`,
                        value: session.id.toString(),
                    }));
                    const sessionSelectMenu = new StringSelectMenuBuilder()
                        .setCustomId('delete_session_select')
                        .setPlaceholder('Select a session to delete')
                        .addOptions(sessionOptions);
                    components.push(new ActionRowBuilder().addComponents(sessionSelectMenu));
                }

                const buttonRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('prev_page').setLabel('Previous').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
                    new ButtonBuilder().setCustomId('next_page').setLabel('Next').setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
                );
                components.push(buttonRow);
                return components;
            };

            const message = await interaction.editReply({
                embeds: [generateEmbed(currentPage)],
                components: generateComponents(currentPage),
            });

            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 300000, // 5 minutes
            });

            collector.on('collect', async i => {
                if (i.isButton()) {
                    if (i.customId === 'prev_page') currentPage--;
                    if (i.customId === 'next_page') currentPage++;

                    if (i.customId.startsWith('confirm_delete')) {
                        const sessionIdToDelete = i.customId.split('_')[2];
                        const sessionToDelete = sessions.find(s => s.id.toString() === sessionIdToDelete);

                        await db.run('DELETE FROM sessions WHERE id = ?', [sessionIdToDelete]);

                        if (sessionToDelete.guildScheduledEventId) {
                            try {
                                const event = await interaction.guild.scheduledEvents.fetch(sessionToDelete.guildScheduledEventId);
                                await event.delete();
                            } catch (error) {
                                logger.warn(`Could not delete scheduled event ${sessionToDelete.guildScheduledEventId}. It might have been already deleted.`);
                            }
                        }

                        logger.info(`Session ${sessionIdToDelete} deleted by ${interaction.user.tag}.`);
                        await i.update({ content: `✅ Successfully deleted session **"${sessionToDelete.title}"**.`, embeds: [], components: [] });
                        return collector.stop();
                    }

                    if (i.customId === 'cancel_delete') {
                        await i.update({ embeds: [generateEmbed(currentPage)], components: generateComponents(currentPage) });
                        return;
                    }

                     await i.update({ embeds: [generateEmbed(currentPage)], components: generateComponents(currentPage) });
                }

                if (i.isStringSelectMenu()) {
                    const sessionIdToDelete = i.values[0];
                    const session = sessions.find(s => s.id.toString() === sessionIdToDelete);

                    const confirmButton = new ButtonBuilder().setCustomId(`confirm_delete_${sessionIdToDelete}`).setLabel('Confirm Delete').setStyle(ButtonStyle.Danger);
                    const cancelButton = new ButtonBuilder().setCustomId('cancel_delete').setLabel('Cancel').setStyle(ButtonStyle.Secondary);
                    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

                    await i.update({
                        content: `Are you sure you want to permanently delete the session **"${session.title}"**? This action cannot be undone.`,
                        embeds: [],
                        components: [row],
                    });
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    interaction.editReply({ content: 'Command timed out.', components: [] });
                }
            });

        } catch (error) {
            logger.error('Error in /deletesession command:', error);
            await interaction.editReply({ content: 'An unexpected error occurred. Please try again later.' });
        }
    },
};
