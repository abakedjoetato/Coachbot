// commands/set-cancellations-channel.js
const { SlashCommandBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const db = require('../database/database');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-cancellations-channel')
    .setDescription('Sets the channel for session cancellation notifications.')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel to send cancellation notices to.')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator), // Admin only
  async execute(interaction) {
    try {
      const channel = interaction.options.getChannel('channel');

      const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
      const permissions = channel.permissionsFor(botMember);

      if (!permissions.has(PermissionsBitField.Flags.ViewChannel) || !permissions.has(PermissionsBitField.Flags.SendMessages)) {
        return interaction.reply({
            content: "I don't have the necessary permissions to view or send messages in that channel. Please grant me `View Channel` and `Send Messages` permissions and try again.",
            ephemeral: true,
        });
      }

      await db.run(
        "INSERT INTO settings (key, value) VALUES ('cancellationsChannelId', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [channel.id]
      );

      logger.info(`Cancellations channel set to #${channel.name} (${channel.id}) by ${interaction.user.tag}`);

      await interaction.reply({
        content: `Successfully set the cancellations channel to ${channel}.`,
        ephemeral: true,
      });
    } catch (error) {
      logger.error('Error setting cancellations channel:', error);
      await interaction.reply({
        content: 'There was an error while trying to set the cancellations channel. Please try again later.',
        ephemeral: true,
      });
    }
  },
};
