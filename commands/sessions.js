// commands/sessions.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
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

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000, // 5 minutes
            filter: i => i.user.id === interaction.user.id
        });

        collector.on('collect', async i => {
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

        collector.on('end', () => {
            interaction.editReply({ components: [] }).catch(err => logger.warn('Could not edit reply on collector end, message may have been deleted.', err));
        });

    } catch (error) {
        logger.error('Error executing /sessions command:', error);
        await interaction.editReply({ content: 'An error occurred while fetching sessions.' });
    }
  },
};
