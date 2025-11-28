// commands/removecoach.js
const { SlashCommandBuilder, PermissionsBitField, StringSelectMenuBuilder, ActionRowBuilder, ComponentType } = require('discord.js');
const db = require('../database/database');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removecoach')
    .setDescription('Removes a coach from the system.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const coaches = await db.all('SELECT id, name, discord_id FROM coaches');

      if (!coaches || coaches.length === 0) {
        return interaction.editReply({ content: 'There are no coaches to remove.' });
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('removeCoachSelect')
        .setPlaceholder('Select a coach to remove')
        .addOptions(
          coaches.map(coach => ({
            label: coach.name,
            description: `ID: ${coach.discord_id}`,
            value: coach.id.toString(),
          }))
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const message = await interaction.editReply({
        content: 'Please select a coach to remove. **Note:** A coach cannot be removed if they are assigned to any future sessions.',
        components: [row],
      });

      // --- Collector for the select menu ---
      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60000, // 1 minute
        filter: i => i.user.id === interaction.user.id && i.customId === 'removeCoachSelect',
      });

      collector.on('collect', async i => {
        const coachIdToRemove = i.values[0];

        // Check if the coach is assigned to ANY future sessions (claimed or unclaimed)
        const now = new Date().toISOString();
        const assignedSession = await db.get(
            `SELECT id FROM sessions
             WHERE datetime > ?
             AND (
                claimedCoach = ?
                OR (isClaimed = 0 AND availableCoaches LIKE '%"' || ? || '"%')
             )
             LIMIT 1`,
            [now, coachIdToRemove, coachIdToRemove]
        );

        if (assignedSession) {
            logger.warn(`Attempted to remove coach ${coachIdToRemove} who is assigned to future session ${assignedSession.id}.`);
            await i.update({
                content: 'This coach cannot be removed because they are assigned to at least one upcoming session (either claimed or unclaimed). Please reassign or delete those sessions first.',
                components: [],
            });
            return;
        }

        // Remove the coach
        const result = await db.run('DELETE FROM coaches WHERE id = ?', [coachIdToRemove]);

        if (result.changes > 0) {
          const removedCoach = coaches.find(c => c.id.toString() === coachIdToRemove);
          logger.info(`Coach ${removedCoach.name} removed by ${i.user.tag}.`);
          await i.update({ content: `Successfully removed coach: ${removedCoach.name}.`, components: [] });
        } else {
            await i.update({ content: 'Failed to remove the coach. They may have already been removed.', components: []});
        }
      });

      collector.on('end', collected => {
        if (collected.size === 0) {
          interaction.editReply({ content: 'No coach selected. The removal process has been cancelled.', components: [] });
        }
      });

    } catch (error) {
      logger.error('Error executing removecoach command:', error);
      interaction.editReply({ content: 'An error occurred while trying to remove a coach. Please check the logs.' });
    }
  },
};
