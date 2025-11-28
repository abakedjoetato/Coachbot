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

        try {
            await interaction.deferReply({ ephemeral: true });

            const coaches = await db.all('SELECT id, name FROM coaches');
            if (!coaches || coaches.length === 0) {
                return interaction.editReply({ content: 'You must add at least one coach before creating a session. Use `/addcoach`.' });
            }

            const duration = await promptForDuration(interaction, interactionId);
            if (duration === null) return;

            const date = await promptForDate(interaction, interactionId);
            if (date === null) return;

            const time = await promptForTime(interaction, interactionId);
            if (time === null) return;

            const title = await promptForTitle(interaction, interactionId);
            if (title === null) return;

            const selectedCoachIds = await promptForCoaches(interaction, interactionId, coaches);
            if (selectedCoachIds === null) return;

            const sessionDateTime = new Date(Date.UTC(date.year, date.month, date.day, time.hour, time.minute));

            if (sessionDateTime < new Date()) {
                logger.warn(`User ${interaction.user.tag} attempted to create a session in the past for ${sessionDateTime.toISOString()}`);
                return interaction.editReply({ content: 'You cannot create a session in the past. Please start over and select a future date and time.', components: [] });
            }

            const event = await interaction.guild.scheduledEvents.create({
                name: title,
                scheduledStartTime: sessionDateTime,
                scheduledEndTime: new Date(sessionDateTime.getTime() + duration * 60000),
                privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
                entityType: GuildScheduledEventEntityType.External,
                entityMetadata: { location: '1-on-1 Coaching' }
            });

            await db.run(
                `INSERT INTO sessions (datetime, duration_minutes, title, availableCoaches, guildScheduledEventId) VALUES (?, ?, ?, ?, ?)`,
                [sessionDateTime.toISOString(), duration, title, JSON.stringify(selectedCoachIds), event.id]
            );

            logger.info(`Session created by ${interaction.user.tag}: ${title} at ${sessionDateTime.toISOString()}`);
            await interaction.editReply({ content: '✅ Successfully created the new coaching session and scheduled the event!', components: [] });

        } catch (error) {
            logger.error('Error in /createsession command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An unexpected error occurred during session creation.', ephemeral: true });
            } else {
                await interaction.editReply({ content: 'An unexpected error occurred. Please try again.', components: [] });
            }
        }
    },
};
