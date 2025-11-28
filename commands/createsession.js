// commands/createsession.js
const { SlashCommandBuilder, PermissionsBitField, GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType } = require('discord.js');
const db = require('../database/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const {
    promptForDuration,
    promptForDate,
    promptForTime,
    promptForTitle,
    promptForCoaches,
} = require('../utils/commandUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('createsession')
        .setDescription('Creates a new coaching session slot (interactive setup).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        const interactionId = uuidv4();
        const sessionData = {};

        try {
            await interaction.deferReply({ ephemeral: true });

            const coaches = await db.all('SELECT id, name FROM coaches');
            if (!coaches || coaches.length === 0) {
                return interaction.editReply({ content: 'You must add at least one coach before creating a session. Use `/addcoach`.' });
            }

            sessionData.duration = await promptForDuration(interaction, interactionId);
            if (sessionData.duration === null) return;

            const date = await promptForDate(interaction, interactionId);
            if (date === null) return;
            sessionData.date = date;

            sessionData.time = await promptForTime(interaction, interactionId);
            if (sessionData.time === null) return;

            sessionData.title = await promptForTitle(interaction, interactionId);
            if (sessionData.title === null) return;

            sessionData.selectedCoachIds = await promptForCoaches(interaction, interactionId, coaches);
            if (sessionData.selectedCoachIds === null) return;

            const sessionDateTime = new Date(Date.UTC(sessionData.date.year, sessionData.date.month, sessionData.date.day, sessionData.time.hour, sessionData.time.minute));

            if (sessionDateTime < new Date()) {
                logger.warn(`User ${interaction.user.tag} attempted to create a session in the past for ${sessionDateTime.toISOString()}`);
                return interaction.editReply({ content: 'You cannot create a session in the past. Please start over and select a future date and time.', components: [] });
            }

            const event = await interaction.guild.scheduledEvents.create({
                name: sessionData.title,
                scheduledStartTime: sessionDateTime,
                scheduledEndTime: new Date(sessionDateTime.getTime() + sessionData.duration * 60000),
                privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
                entityType: GuildScheduledEventEntityType.External,
                entityMetadata: { location: '1-on-1 Coaching' }
            });

            await db.run(
                `INSERT INTO sessions (datetime, duration_minutes, title, availableCoaches, guildScheduledEventId) VALUES (?, ?, ?, ?, ?)`,
                [sessionDateTime.toISOString(), sessionData.duration, sessionData.title, JSON.stringify(sessionData.selectedCoachIds), event.id]
            );

            logger.info(`Session created by ${interaction.user.tag}: ${sessionData.title} at ${sessionDateTime.toISOString()}`);
            await interaction.editReply({ content: '✅ Successfully created the new coaching session and scheduled the event!', components: [] });

        } catch (error) {
            logger.error({
                msg: 'Error in /createsession command',
                error,
                user: interaction.user.tag,
                guild: interaction.guild.id,
            });
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An unexpected error occurred during session creation.', ephemeral: true });
            } else {
                await interaction.editReply({ content: 'An unexpected error occurred. The error has been logged. Please try again.', components: [] });
            }
        }
    },
};
