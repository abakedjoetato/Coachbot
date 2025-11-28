// commands/createsession.js
const { SlashCommandBuilder, PermissionsBitField, StringSelectMenuBuilder, ActionRowBuilder, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType } = require('discord.js');
const db = require('../database/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

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

        // --- Step 1: Duration ---
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
        await durationSelection.deferUpdate();

        // --- Step 2: Date (Year, Month, Day) ---
        const today = new Date();
        const yearOptions = Array.from({ length: 2 }, (_, i) => ({ label: (today.getFullYear() + i).toString(), value: (today.getFullYear() + i).toString() }));
        const monthOptions = Array.from({ length: 12 }, (_, i) => ({ label: new Date(0, i).toLocaleString('en', { month: 'long' }), value: (i).toString() }));
        const yearMenu = new StringSelectMenuBuilder().setCustomId(`year_${interactionId}`).setPlaceholder('Select Year').addOptions(yearOptions);
        const monthMenu = new StringSelectMenuBuilder().setCustomId(`month_${interactionId}`).setPlaceholder('Select Month').addOptions(monthOptions);
        await interaction.editReply({ content: 'Step 2: Please select the date for the session.', components: [new ActionRowBuilder().addComponents(yearMenu), new ActionRowBuilder().addComponents(monthMenu)] });

        let selectedYear, selectedMonth;
        const dateCollector = interaction.channel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id && i.customId.endsWith(interactionId), time: 120000 });

        await new Promise((resolve, reject) => {
            dateCollector.on('collect', async i => {
                if (i.customId.startsWith('year')) selectedYear = parseInt(i.values[0], 10);
                if (i.customId.startsWith('month')) selectedMonth = parseInt(i.values[0], 10);
                await i.deferUpdate();
                if (selectedYear && selectedMonth !== undefined) dateCollector.stop();
            });
            dateCollector.on('end', collected => collected.size > 0 ? resolve() : reject(new Error('Date selection timed out.')));
        });

        sessionData.year = selectedYear;
        sessionData.month = selectedMonth;

        const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        const dayOptions = Array.from({ length: daysInMonth }, (_, i) => ({ label: (i + 1).toString(), value: (i + 1).toString() }));
        const dayMenu = new StringSelectMenuBuilder().setCustomId(`day_${interactionId}`).setPlaceholder('Select Day').addOptions(dayOptions.slice(0,25));
        const dayMenu2 = daysInMonth > 25 ? new StringSelectMenuBuilder().setCustomId(`day2_${interactionId}`).setPlaceholder('...').addOptions(dayOptions.slice(25)) : null;
        const dayComponents = [new ActionRowBuilder().addComponents(dayMenu)];
        if (dayMenu2) dayComponents.push(new ActionRowBuilder().addComponents(dayMenu2));

        await interaction.editReply({ content: 'Please select the day.', components: dayComponents });
        const daySelection = await interaction.channel.awaitMessageComponent({ filter: i => (i.customId === `day_${interactionId}` || i.customId === `day2_${interactionId}`) && i.user.id === interaction.user.id, time: 60000 });
        sessionData.day = parseInt(daySelection.values[0], 10);
        await daySelection.deferUpdate();

        // --- Step 3: Time (Hour, Minute) ---
        const hourOptions = Array.from({ length: 24 }, (_, i) => ({ label: `${i.toString().padStart(2, '0')}:00 UTC`, value: i.toString() }));
        const minuteOptions = [{label: '00', value: '0'}, {label: '15', value: '15'}, {label: '30', value: '30'}, {label: '45', value: '45'}];
        const hourMenu = new StringSelectMenuBuilder().setCustomId(`hour_${interactionId}`).setPlaceholder('Select Hour (UTC)').addOptions(hourOptions);
        const minuteMenu = new StringSelectMenuBuilder().setCustomId(`minute_${interactionId}`).setPlaceholder('Select Minute (UTC)').addOptions(minuteOptions);
        await interaction.editReply({ content: 'Step 3: Please select the time for the session (in UTC).', components: [new ActionRowBuilder().addComponents(hourMenu), new ActionRowBuilder().addComponents(minuteMenu)]});

        let selectedHour, selectedMinute;
        const timeCollector = interaction.channel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id && i.customId.endsWith(interactionId), time: 120000 });

        await new Promise((resolve, reject) => {
            timeCollector.on('collect', async i => {
                if (i.customId.startsWith('hour')) selectedHour = parseInt(i.values[0], 10);
                if (i.customId.startsWith('minute')) selectedMinute = parseInt(i.values[0], 10);
                await i.deferUpdate();
                if (selectedHour !== undefined && selectedMinute !== undefined) timeCollector.stop();
            });
            timeCollector.on('end', collected => collected.size > 0 ? resolve() : reject(new Error('Time selection timed out.')));
        });

        sessionData.hour = selectedHour;
        sessionData.minute = selectedMinute;

        // --- Step 4: Title Modal ---
        const modal = new ModalBuilder().setCustomId(`title_modal_${interactionId}`).setTitle('Session Title');
        const titleInput = new TextInputBuilder().setCustomId('title').setLabel('Session Title (Optional)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('1-on-1 Coaching Session');
        modal.addComponents(new ActionRowBuilder().addComponents(titleInput));
        await interaction.showModal(modal);
        const submittedModal = await interaction.awaitModalSubmit({ filter: i => i.customId === `title_modal_${interactionId}` && i.user.id === interaction.user.id, time: 60000 });
        sessionData.title = submittedModal.fields.getTextInputValue('title') || '1-on-1 Coaching Session';
        await submittedModal.deferUpdate();

        // --- Step 5: Coach Selection ---
        const coachMenu = new StringSelectMenuBuilder().setCustomId(`coach_select_${interactionId}`).setPlaceholder('Assign one or more coaches').setMinValues(1).setMaxValues(coaches.length).addOptions(coaches.map(c => ({ label: c.name, value: c.id.toString() })));
        await interaction.editReply({ content: 'Step 4: Please assign coaches for this session.', components: [new ActionRowBuilder().addComponents(coachMenu)] });
        const coachSelection = await interaction.channel.awaitMessageComponent({ filter: i => i.customId === `coach_select_${interactionId}` && i.user.id === interaction.user.id, time: 60000 });
        sessionData.selectedCoachIds = coachSelection.values;
        await coachSelection.deferUpdate();

        // --- Finalization ---
        const sessionDateTime = new Date(Date.UTC(sessionData.year, sessionData.month, sessionData.day, sessionData.hour, sessionData.minute));

        // Validate that the selected date is in the future
        if (sessionDateTime < new Date()) {
            throw new Error('The selected session date and time are in the past. Please select a future time.');
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
        logger.error('Error in /createsession command:', error);
        // Avoid leaking implementation details to the user
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An unexpected error occurred during session creation.', ephemeral: true });
        } else {
            await interaction.editReply({ content: 'An unexpected error occurred. Please try again.', components: [] });
        }
    }
  },
};
