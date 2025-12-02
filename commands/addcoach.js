// commands/addcoach.js
const { SlashCommandBuilder, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const db = require('../database/database');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addcoach')
    .setDescription('Adds a new coach to the system.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  async execute(interaction) {
    try {
      // Create the modal
      const modal = new ModalBuilder()
        .setCustomId('addCoachModal')
        .setTitle('Add a New Coach');

      // Create the text input components
      const userIdInput = new TextInputBuilder()
        .setCustomId('coachUserId')
        .setLabel("Coach's Discord User ID")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const descriptionInput = new TextInputBuilder()
        .setCustomId('coachDescription')
        .setLabel("Bio / Description")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

      // Add inputs to the modal
      const firstActionRow = new ActionRowBuilder().addComponents(userIdInput);
      const secondActionRow = new ActionRowBuilder().addComponents(descriptionInput);
      modal.addComponents(firstActionRow, secondActionRow);

      // Show the modal to the user
      await interaction.showModal(modal);

      // --- Modal Submission Handling ---
      const submitted = await interaction.awaitModalSubmit({
        time: 60000, // 1 minute
        filter: i => i.customId === 'addCoachModal' && i.user.id === interaction.user.id,
      }).catch(error => {
        // This will run if the user doesn't submit the modal in time
        logger.warn(`Add coach modal timed out for ${interaction.user.tag}`);
        return null;
      });

      if (submitted) {
        await submitted.deferReply({ ephemeral: true });

        const discordId = submitted.fields.getTextInputValue('coachUserId');
        const description = submitted.fields.getTextInputValue('coachDescription');

        // Fetch the user to get their name
        const user = await interaction.client.users.fetch(discordId).catch(() => null);

        if (!user) {
          return submitted.editReply({ content: 'Could not find a Discord user with that ID. Please check the ID and try again.' });
        }

        // Check if the coach already exists
        const existingCoach = await db.get('SELECT * FROM coaches WHERE discord_id = ?', [discordId]);
        if (existingCoach) {
          return submitted.editReply({ content: 'This user is already registered as a coach.' });
        }

        // Add the coach to the database
        await db.run(
          'INSERT INTO coaches (name, description, discord_id) VALUES (?, ?, ?)',
          [user.tag, description, discordId]
        );

        logger.info(`New coach added by ${submitted.user.tag}: <@${user.id}> (${discordId})`);
        await submitted.editReply({ content: `Successfully added <@${user.id}> as a new coach.` });
      }

    } catch (error) {
      logger.error('Error executing addcoach command:', error);
      // Use a generic error message for the user
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'There was an error processing your request.', ephemeral: true });
      } else {
        await interaction.followUp({ content: 'There was an error processing your request.', ephemeral: true });
      }
    }
  },
};
