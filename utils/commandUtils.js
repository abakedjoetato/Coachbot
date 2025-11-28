// utils/commandUtils.js
const { StringSelectMenuBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

async function promptForDuration(interaction, interactionId) {
    const durationOptions = [
        { label: '30 Minutes', value: '30' },
        { label: '45 Minutes', value: '45' },
        { label: '60 Minutes', value: '60' },
        { label: '90 Minutes', value: '90' },
    ];
    const durationMenu = new StringSelectMenuBuilder().setCustomId(`duration_${interactionId}`).setPlaceholder('Select Session Duration').addOptions(durationOptions);
    await interaction.editReply({ content: 'Step 1: Please select the session duration.', components: [new ActionRowBuilder().addComponents(durationMenu)] });
    const durationSelection = await interaction.channel.awaitMessageComponent({ filter: i => i.customId === `duration_${interactionId}` && i.user.id === interaction.user.id, time: 60000 }).catch(() => null);
    if (!durationSelection) {
        interaction.editReply({ content: 'You did not make a selection in time. Please start over.', components: [] });
        return null;
    }
    await durationSelection.deferUpdate();
    return parseInt(durationSelection.values[0], 10);
}

async function promptForDate(interaction, interactionId) {
    const today = new Date();
    const yearOptions = Array.from({ length: 2 }, (_, i) => ({ label: (today.getFullYear() + i).toString(), value: (today.getFullYear() + i).toString() }));
    const monthOptions = Array.from({ length: 12 }, (_, i) => ({ label: new Date(0, i).toLocaleString('en', { month: 'long' }), value: (i).toString() }));
    const yearMenu = new StringSelectMenuBuilder().setCustomId(`year_${interactionId}`).setPlaceholder('Select Year').addOptions(yearOptions);
    const monthMenu = new StringSelectMenuBuilder().setCustomId(`month_${interactionId}`).setPlaceholder('Select Month').addOptions(monthOptions);
    await interaction.editReply({ content: 'Step 2: Please select the date for the session.', components: [new ActionRowBuilder().addComponents(yearMenu), new ActionRowBuilder().addComponents(monthMenu)] });

    let selectedYear, selectedMonth;
    const dateCollector = interaction.channel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id && i.customId.endsWith(interactionId), time: 120000 });

    try {
        await new Promise((resolve, reject) => {
            dateCollector.on('collect', async i => {
                if (i.customId.startsWith('year')) selectedYear = parseInt(i.values[0], 10);
                if (i.customId.startsWith('month')) selectedMonth = parseInt(i.values[0], 10);
                await i.deferUpdate();
                if (selectedYear && selectedMonth !== undefined) dateCollector.stop();
            });
            dateCollector.on('end', (collected, reason) => {
                if (reason === 'time') reject(new Error('Date selection timed out.'));
                else resolve();
            });
        });
    } catch (error) {
        interaction.editReply({ content: 'You did not make a selection in time. Please start over.', components: [] });
        return null;
    }

    const modal = new ModalBuilder().setCustomId(`day_modal_${interactionId}`).setTitle('Enter the Day');
    const dayInput = new TextInputBuilder().setCustomId('day').setLabel('Day of the month (e.g., 1, 15, 31)').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(dayInput));
    await interaction.showModal(modal);
    const submittedModal = await interaction.awaitModalSubmit({ filter: i => i.customId === `day_modal_${interactionId}` && i.user.id === interaction.user.id, time: 60000 }).catch(() => null);

    if (!submittedModal) {
        interaction.editReply({ content: 'You did not make a selection in time. Please start over.', components: [] });
        return null;
    }

    const day = parseInt(submittedModal.fields.getTextInputValue('day'), 10);
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

    if (isNaN(day) || day < 1 || day > daysInMonth) {
        submittedModal.reply({ content: `Invalid day. Please enter a number between 1 and ${daysInMonth}.`, ephemeral: true });
        return null;
    }

    await submittedModal.deferUpdate();
    return { year: selectedYear, month: selectedMonth, day };
}

async function promptForTime(interaction, interactionId) {
    const hourOptions = Array.from({ length: 24 }, (_, i) => ({ label: `${i.toString().padStart(2, '0')}:00 UTC`, value: i.toString() }));
    const minuteOptions = [{ label: '00', value: '0' }, { label: '15', value: '15' }, { label: '30', value: '30' }, { label: '45', value: '45' }];
    const hourMenu = new StringSelectMenuBuilder().setCustomId(`hour_${interactionId}`).setPlaceholder('Select Hour (UTC)').addOptions(hourOptions);
    const minuteMenu = new StringSelectMenuBuilder().setCustomId(`minute_${interactionId}`).setPlaceholder('Select Minute (UTC)').addOptions(minuteOptions);
    await interaction.editReply({ content: 'Step 3: Please select the time for the session (in UTC).', components: [new ActionRowBuilder().addComponents(hourMenu), new ActionRowBuilder().addComponents(minuteMenu)] });

    let selectedHour, selectedMinute;
    const timeCollector = interaction.channel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id && i.customId.endsWith(interactionId), time: 120000 });

    try {
        await new Promise((resolve, reject) => {
            timeCollector.on('collect', async i => {
                if (i.customId.startsWith('hour')) selectedHour = parseInt(i.values[0], 10);
                if (i.customId.startsWith('minute')) selectedMinute = parseInt(i.values[0], 10);
                await i.deferUpdate();
                if (selectedHour !== undefined && selectedMinute !== undefined) timeCollector.stop();
            });
            timeCollector.on('end', (collected, reason) => {
                if (reason === 'time') reject(new Error('Time selection timed out.'));
                else resolve();
            });
        });
    } catch (error) {
        interaction.editReply({ content: 'You did not make a selection in time. Please start over.', components: [] });
        return null;
    }
    return { hour: selectedHour, minute: selectedMinute };
}

async function promptForTitle(interaction, interactionId) {
    const modal = new ModalBuilder().setCustomId(`title_modal_${interactionId}`).setTitle('Step 4: Session Title');
    const titleInput = new TextInputBuilder().setCustomId('title').setLabel('Session Title (Optional)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('1-on-1 Coaching Session');
    modal.addComponents(new ActionRowBuilder().addComponents(titleInput));
    await interaction.showModal(modal);
    const submittedModal = await interaction.awaitModalSubmit({ filter: i => i.customId === `title_modal_${interactionId}` && i.user.id === interaction.user.id, time: 60000 }).catch(() => null);

    if (!submittedModal) {
        interaction.editReply({ content: 'You did not make a selection in time. Please start over.', components: [] });
        return null;
    }
    await submittedModal.deferUpdate();
    return submittedModal.fields.getTextInputValue('title') || '1-on-1 Coaching Session';
}

async function promptForCoaches(interaction, interactionId, coaches) {
    const coachMenu = new StringSelectMenuBuilder().setCustomId(`coach_select_${interactionId}`).setPlaceholder('Assign one or more coaches').setMinValues(1).setMaxValues(coaches.length).addOptions(coaches.map(c => ({ label: c.name, value: c.id.toString() })));
    await interaction.editReply({ content: 'Step 5: Please assign coaches for this session.', components: [new ActionRowBuilder().addComponents(coachMenu)] });
    const coachSelection = await interaction.channel.awaitMessageComponent({ filter: i => i.customId === `coach_select_${interactionId}` && i.user.id === interaction.user.id, time: 60000 }).catch(() => null);

    if (!coachSelection) {
        interaction.editReply({ content: 'You did not make a selection in time. Please start over.', components: [] });
        return null;
    }
    await coachSelection.deferUpdate();
    return coachSelection.values;
}

module.exports = {
    promptForDuration,
    promptForDate,
    promptForTime,
    promptForTitle,
    promptForCoaches,
};
