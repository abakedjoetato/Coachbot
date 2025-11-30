// commands/createsession.js
const { SlashCommandBuilder, PermissionsBitField, StringSelectMenuBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType } = require('discord.js');
const db = require('../database/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const timezones = require('../utils/timezones');
const moment = require('moment-timezone');

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

            // Step 1: Duration
            const durationOptions = [
                { label: '30 Minutes', value: '30' },
                { label: '45 Minutes', value: '45' },
                { label: '60 Minutes', value: '60' },
                { label: '90 Minutes', value: '90' },
            ];
            const durationMenu = new StringSelectMenuBuilder().setCustomId(`duration_${interactionId}`).setPlaceholder('Select Session Duration').addOptions(durationOptions);
            await interaction.editReply({ content: 'Step 1: Please select the session duration.', components: [new ActionRowBuilder().addComponents(durationMenu)] });

            const durationSelection = await interaction.channel.awaitMessageComponent({ filter: i => i.customId === `duration_${interactionId}` && i.user.id === interaction.user.id, time: 60000 });
            sessionData.duration = parseInt(durationSelection.values[0], 10);

            // Step 2: Date
            const today = new Date();
            const yearOptions = Array.from({ length: 2 }, (_, i) => ({ label: (today.getFullYear() + i).toString(), value: (today.getFullYear() + i).toString() }));
            const monthOptions = Array.from({ length: 12 }, (_, i) => ({ label: new Date(0, i).toLocaleString('en', { month: 'long' }), value: i.toString() }));
            const yearMenu = new StringSelectMenuBuilder().setCustomId(`year_${interactionId}`).setPlaceholder('Select Year').addOptions(yearOptions);
            const monthMenu = new StringSelectMenuBuilder().setCustomId(`month_${interactionId}`).setPlaceholder('Select Month').addOptions(monthOptions);
            await durationSelection.update({ content: 'Step 2: Please select the date for the session.', components: [new ActionRowBuilder().addComponents(yearMenu), new ActionRowBuilder().addComponents(monthMenu)] });

            let selectedYear, selectedMonth;
            const dateCollector = interaction.channel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id && (i.customId === `year_${interactionId}` || i.customId === `month_${interactionId}`), time: 120000 });

            const collectedDateInteraction = await new Promise((resolve) => {
                dateCollector.on('collect', async i => {
                    if (i.customId.startsWith('year')) {
                        selectedYear = parseInt(i.values[0], 10);
                    }
                    if (i.customId.startsWith('month')) {
                        selectedMonth = parseInt(i.values[0], 10);
                    }
                    i.deferUpdate();
                    if (selectedYear && selectedMonth !== undefined) {
                        dateCollector.stop();
                        resolve(i);
                    }
                });
                dateCollector.on('end', (collected, reason) => {
                    if (reason === 'time') {
                        resolve(null);
                    }
                });
            });

            if (!collectedDateInteraction) {
                return interaction.editReply({ content: 'You did not make a selection in time. Please start over.', components: [] });
            }

            const modal = new ModalBuilder().setCustomId(`day_modal_${interactionId}`).setTitle('Enter the Day');
            const dayInput = new TextInputBuilder().setCustomId('day').setLabel('Day of the month (e.g., 1, 15, 31)').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(dayInput));
            await collectedDateInteraction.showModal(modal);
            const submittedModal = await collectedDateInteraction.awaitModalSubmit({ filter: i => i.customId === `day_modal_${interactionId}` && i.user.id === interaction.user.id, time: 60000 });

            const day = parseInt(submittedModal.fields.getTextInputValue('day'), 10);
            const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
            if (isNaN(day) || day < 1 || day > daysInMonth) {
                return submittedModal.reply({ content: `Invalid day. Please enter a number between 1 and ${daysInMonth}.`, ephemeral: true });
            }
            sessionData.date = { year: selectedYear, month: selectedMonth, day };

            // Step 3: Timezone
            const timezoneMenu = new StringSelectMenuBuilder().setCustomId(`timezone_${interactionId}`).setPlaceholder('Select your timezone').addOptions(timezones.slice(0, 25));
            const timezoneMenu2 = new StringSelectMenuBuilder().setCustomId(`timezone2_${interactionId}`).setPlaceholder('...').addOptions(timezones.slice(25, 50));
            await submittedModal.update({ content: 'Step 3: Please select your timezone.', components: [new ActionRowBuilder().addComponents(timezoneMenu), new ActionRowBuilder().addComponents(timezoneMenu2)] });

            const timezoneSelection = await interaction.channel.awaitMessageComponent({ filter: i => (i.customId === `timezone_${interactionId}` || i.customId === `timezone2_${interactionId}`) && i.user.id === interaction.user.id, time: 60000 });
            sessionData.timezone = timezoneSelection.values[0];

            // Step 4: Time
            const hourOptions = Array.from({ length: 24 }, (_, i) => ({ label: `${i.toString().padStart(2, '0')}:00`, value: i.toString() }));
            const minuteOptions = [{ label: '00', value: '0' }, { label: '15', value: '15' }, { label: '30', value: '30' }, { label: '45', value: '45' }];
            const hourMenu = new StringSelectMenuBuilder().setCustomId(`hour_${interactionId}`).setPlaceholder('Select Hour').addOptions(hourOptions);
            const minuteMenu = new StringSelectMenuBuilder().setCustomId(`minute_${interactionId}`).setPlaceholder('Select Minute').addOptions(minuteOptions);
            await timezoneSelection.update({ content: 'Step 4: Please select the time for the session.', components: [new ActionRowBuilder().addComponents(hourMenu), new ActionRowBuilder().addComponents(minuteMenu)] });

            let selectedHour, selectedMinute;
            const timeCollector = interaction.channel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id && (i.customId === `hour_${interactionId}` || i.customId === `minute_${interactionId}`), time: 120000 });

            const collectedTimeInteraction = await new Promise((resolve) => {
                timeCollector.on('collect', async i => {
                    if (i.customId.startsWith('hour')) {
                        selectedHour = parseInt(i.values[0], 10);
                    }
                    if (i.customId.startsWith('minute')) {
                        selectedMinute = parseInt(i.values[0], 10);
                    }
                    i.deferUpdate();
                    if (selectedHour !== undefined && selectedMinute !== undefined) {
                        timeCollector.stop();
                        resolve(i);
                    }
                });
                timeCollector.on('end', (collected, reason) => {
                    if (reason === 'time') {
                        resolve(null);
                    }
                });
            });

            if (!collectedTimeInteraction) {
                return interaction.editReply({ content: 'You did not make a selection in time. Please start over.', components: [] });
            }
            sessionData.time = { hour: selectedHour, minute: selectedMinute };

            // Step 5: Title
            const titleModal = new ModalBuilder().setCustomId(`title_modal_${interactionId}`).setTitle('Session Title');
            const titleInput = new TextInputBuilder().setCustomId('title').setLabel('Session Title (Optional)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('1-on-1 Coaching Session');
            titleModal.addComponents(new ActionRowBuilder().addComponents(titleInput));
            await collectedTimeInteraction.showModal(titleModal);
            const submittedTitleModal = await collectedTimeInteraction.awaitModalSubmit({ filter: i => i.customId === `title_modal_${interactionId}` && i.user.id === interaction.user.id, time: 60000 });
            sessionData.title = submittedTitleModal.fields.getTextInputValue('title') || '1-on-1 Coaching Session';

            // Step 6: Coaches
            const coachMenu = new StringSelectMenuBuilder().setCustomId(`coach_select_${interactionId}`).setPlaceholder('Assign one or more coaches').setMinValues(1).setMaxValues(coaches.length).addOptions(coaches.map(c => ({ label: c.name, value: c.id.toString() })));
            await submittedTitleModal.update({ content: 'Step 6: Please assign coaches for this session.', components: [new ActionRowBuilder().addComponents(coachMenu)] });

            const coachSelection = await interaction.channel.awaitMessageComponent({ filter: i => i.customId === `coach_select_${interactionId}` && i.user.id === interaction.user.id, time: 60000 });
            sessionData.selectedCoachIds = coachSelection.values;

            // Finalization
            const sessionDateTime = moment.tz({
                year: sessionData.date.year,
                month: sessionData.date.month,
                day: sessionData.date.day,
                hour: sessionData.time.hour,
                minute: sessionData.time.minute
            }, sessionData.timezone).utc();

            if (sessionDateTime.isBefore(moment())) {
                logger.warn(`User ${interaction.user.tag} attempted to create a session in the past for ${sessionDateTime.toISOString()}`);
                return coachSelection.update({ content: 'You cannot create a session in the past. Please start over and select a future date and time.', components: [] });
            }

            const event = await interaction.guild.scheduledEvents.create({
                name: sessionData.title,
                scheduledStartTime: sessionDateTime.toDate(),
                scheduledEndTime: new Date(sessionDateTime.valueOf() + sessionData.duration * 60000),
                privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
                entityType: GuildScheduledEventEntityType.External,
                entityMetadata: { location: '1-on-1 Coaching' }
            });

            await db.run(
                `INSERT INTO sessions (datetime, duration_minutes, title, availableCoaches, guildScheduledEventId) VALUES (?, ?, ?, ?, ?)`,
                [sessionDateTime.toISOString(), sessionData.duration, sessionData.title, JSON.stringify(sessionData.selectedCoachIds), event.id]
            );

            logger.info(`Session created by ${interaction.user.tag}: ${sessionData.title} at ${sessionDateTime.toISOString()}`);
            await coachSelection.update({ content: '✅ Successfully created the new coaching session and scheduled the event!', components: [] });

        } catch (error) {
            logger.error({ msg: 'Error in /createsession command', error, user: interaction.user.tag, guild: interaction.guild.id });
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An unexpected error occurred during session creation.', ephemeral: true });
            } else {
                await interaction.editReply({ content: 'An unexpected error occurred. The error has been logged. Please try again.', components: [] });
            }
        }
    },
};
