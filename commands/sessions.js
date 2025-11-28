// commands/sessions.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder } = require('discord.js');
const db = require('../database/database');
const logger = require('../utils/logger');

const SESSIONS_PER_PAGE = 5;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sessions')
    .setDescription('Displays available coaching sessions.'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const now = new Date().toISOString();
        const sessions = await db.all(
            `SELECT s.id, s.datetime, s.title, s.availableCoaches
             FROM sessions s
             WHERE s.isClaimed = 0 AND s.datetime > ?
             ORDER BY s.datetime ASC`,
            [now]
        );

        if (!sessions || sessions.length === 0) {
            return interaction.editReply({ content: 'There are currently no available coaching sessions. Please check back later!' });
        }

        const coaches = await db.all('SELECT id, name FROM coaches');
        const coachMap = new Map(coaches.map(c => [c.id.toString(), c.name]));

        let currentPage = 0;
        const totalPages = Math.ceil(sessions.length / SESSIONS_PER_PAGE);

        const generateEmbed = (page) => {
            const start = page * SESSIONS_PER_PAGE;
            const end = start + SESSIONS_PER_PAGE;
            const currentSessions = sessions.slice(start, end);

            const embed = new EmbedBuilder()
                .setTitle('Available Coaching Sessions')
                .setColor(0x3498DB) // Blue
                .setFooter({ text: `Page ${page + 1} of ${totalPages}` });

            let description = 'Select a session from the dropdown below to claim it.\n\n';
            currentSessions.forEach(session => {
                const sessionDate = new Date(session.datetime);
                const dateString = sessionDate.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', hour12: true });
                const availableCoachIds = JSON.parse(session.availableCoaches);
                const availableCoachNames = availableCoachIds.map(id => coachMap.get(id) || 'Unknown').join(', ');

                description += `**ID: ${session.id} | ${session.title}**\n`;
                description += `*${dateString}*\n`;
                description += `Coaches: ${availableCoachNames}\n\n`;
            });
            embed.setDescription(description);

            return embed;
        };

        const generateComponents = (page) => {
            const start = page * SESSIONS_PER_PAGE;
            const end = start + SESSIONS_PER_PAGE;
            const currentSessions = sessions.slice(start, end);

            const components = [];

            // Add session selection dropdown
            if (currentSessions.length > 0) {
                const sessionOptions = currentSessions.map(session => ({
                    label: `ID: ${session.id} - ${session.title}`,
                    description: new Date(session.datetime).toLocaleString('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }),
                    value: session.id.toString(),
                }));
                const sessionSelectMenu = new StringSelectMenuBuilder()
                    .setCustomId('claim_session_select')
                    .setPlaceholder('Select a session to claim')
                    .addOptions(sessionOptions);
                components.push(new ActionRowBuilder().addComponents(sessionSelectMenu));
            }

            // Add pagination buttons
            const buttonRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('prev_page')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('next_page')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page >= totalPages - 1)
            );
            components.push(buttonRow);

            return components;
        };

        const message = await interaction.editReply({
            embeds: [generateEmbed(currentPage)],
            components: generateComponents(currentPage),
            fetchReply: true
        });

        const buttonCollector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000, // 5 minutes
            filter: i => i.user.id === interaction.user.id
        });

        const selectCollector = message.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 300000,
            filter: i => i.user.id === interaction.user.id && i.customId === 'claim_session_select'
        });

        selectCollector.on('collect', async i => {
            const sessionId = i.values[0];
            const session = await db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);

            if (!session || session.isClaimed) {
                return i.update({ content: 'This session is no longer available.', components: [] });
            }

            const availableCoachIds = JSON.parse(session.availableCoaches);
            const availableCoaches = await db.all(
                `SELECT id, name FROM coaches WHERE id IN (${availableCoachIds.map(() => '?').join(',')})`,
                availableCoachIds
            );

            const coachSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`coach_select_${sessionId}`)
                .setPlaceholder('Select your preferred coach')
                .addOptions(availableCoaches.map(c => ({ label: c.name, value: c.id.toString() })));

            await i.update({
                content: `You have selected "${session.title}". Please choose a coach from the list below to finalize your claim.`,
                embeds: [],
                components: [new ActionRowBuilder().addComponents(coachSelectMenu)],
            });

            const coachSelection = await message.awaitMessageComponent({
                filter: coachInteraction => coachInteraction.customId === `coach_select_${sessionId}` && coachInteraction.user.id === i.user.id,
                time: 60000,
            }).catch(() => null);

            if (coachSelection) {
                const coachId = coachSelection.values[0];
                const result = await db.run(
                    'UPDATE sessions SET isClaimed = 1, claimedBy = ?, claimedCoach = ? WHERE id = ? AND isClaimed = 0',
                    [i.user.id, coachId, sessionId]
                );

                if (result.changes === 0) {
                    return coachSelection.update({ content: 'This session was claimed by another user just before you. Please try another session.', components: [] });
                }

                if (session.guildScheduledEventId) {
                    try {
                        await interaction.guild.scheduledEvents.delete(session.guildScheduledEventId);
                    } catch (error) {
                        logger.error(`Failed to delete scheduled event ${session.guildScheduledEventId} for session ${sessionId}:`, error);
                    }
                }

                logger.info(`Session ${sessionId} claimed by ${i.user.tag} with coach ${coachId}`);
                await coachSelection.update({ content: '✅ You have successfully claimed the session! You will be contacted by the coach shortly with more details.', components: [] });
            } else {
                await i.followUp({ content: 'You did not select a coach in time. The session has not been claimed.', ephemeral: true });
            }
        });

        buttonCollector.on('collect', async i => {
            if (i.customId === 'next_page') {
                currentPage++;
            } else if (i.customId === 'prev_page') {
                currentPage--;
            }
            await i.update({
                embeds: [generateEmbed(currentPage)],
                components: generateComponents(currentPage)
            });
        });

        buttonCollector.on('end', () => {
            interaction.editReply({ components: [] }).catch(err => logger.warn('Could not edit reply on collector end, message may have been deleted.', err));
        });

        selectCollector.on('end', () => {
            interaction.editReply({ components: [] }).catch(err => logger.warn('Could not edit reply on collector end, message may have been deleted.', err));
        });

    } catch (error) {
        logger.error('Error executing /sessions command:', error);
        await interaction.editReply({ content: 'An error occurred while fetching sessions.' });
    }
  },
};
