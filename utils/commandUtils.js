// utils/commandUtils.js
const { StringSelectMenuBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const logger = require('./logger');

async function promptForDuration(interaction, interactionId) {
    // ... (rest of the function is unchanged)
}

async function promptForDate(interaction, interactionId) {
    try {
        const today = new Date();
        const yearOptions = Array.from({ length: 2 }, (_, i) => ({ label: (today.getFullYear() + i).toString(), value: `year_${today.getFullYear() + i}` }));
        const monthOptions = Array.from({ length: 12 }, (_, i) => ({ label: new Date(0, i).toLocaleString('en', { month: 'long' }), value: `month_${i}` }));
        const yearMenu = new StringSelectMenuBuilder().setCustomId(`year_${interactionId}`).setPlaceholder('Select Year').addOptions(yearOptions);
        const monthMenu = new StringSelectMenuBuilder().setCustomId(`month_${interactionId}`).setPlaceholder('Select Month').addOptions(monthOptions);
        await interaction.editReply({ content: 'Step 2: Please select the date for the session.', components: [new ActionRowBuilder().addComponents(yearMenu), new ActionRowBuilder().addComponents(monthMenu)] });

        let selectedYear, selectedMonth;
        let lastInteraction;
        const dateCollector = interaction.channel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id && (i.customId === `year_${interactionId}` || i.customId === `month_${interactionId}`), time: 120000 });

        await new Promise((resolve, reject) => {
            dateCollector.on('collect', async i => {
                lastInteraction = i;
                if (i.customId.startsWith('year')) {
                    selectedYear = parseInt(i.values[0].split('_')[1], 10);
                }
                if (i.customId.startsWith('month')) {
                    selectedMonth = parseInt(i.values[0].split('_')[1], 10);
                }
                await i.deferUpdate();
                if (selectedYear && selectedMonth !== undefined) {
                    dateCollector.stop();
                    resolve();
                }
            });
            dateCollector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    reject(new Error('Date selection timed out.'));
                }
            });
        });

        const modal = new ModalBuilder().setCustomId(`day_modal_${interactionId}`).setTitle('Enter the Day');
        const dayInput = new TextInputBuilder().setCustomId('day').setLabel('Day of the month (e.g., 1, 15, 31)').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(dayInput));
        await lastInteraction.showModal(modal);
        const submittedModal = await lastInteraction.awaitModalSubmit({ filter: i => i.customId === `day_modal_${interactionId}` && i.user.id === interaction.user.id, time: 60000 }).catch(() => null);

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
    } catch (error) {
        logger.error({ msg: 'Error in promptForDate', error, interactionId });
        interaction.editReply({ content: 'An error occurred during date selection. Please try again.', components: [] });
        return null;
    }
}

async function promptForTime(interaction, interactionId) {
    // ... (rest of the function is unchanged)
}

async function promptForTitle(interaction, interactionId) {
    // ... (rest of the function is unchanged)
}

async function promptForCoaches(interaction, interactionId, coaches) {
    // ... (rest of the function is unchanged)
}

module.exports = {
    promptForDuration,
    promptForDate,
    promptForTime,
    promptForTitle,
    promptForCoaches,
};
