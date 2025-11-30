// commands/set-sessions-channel.js
const { SlashCommandBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const db = require('../database/database');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-sessions-channel')
    .setDescription('Sets the channel where available coaching sessions are posted.')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel to post session listings in.')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText) // Ensure it's a text channel
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator), // Admin only
  async execute(interaction) {
    try {
      const channel = interaction.options.getChannel('channel');

      const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
      const permissions = channel.permissionsFor(botMember);

      if (!permissions.has(PermissionsBitField.Flags.ViewChannel) || !permissions.has(PermissionsBitField.Flags.SendMessages) || !permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return interaction.reply({
            content: "I don't have the necessary permissions in that channel. Please grant me `View Channel`, `Send Messages`, and `Manage Messages` permissions and try again.",
            ephemeral: true,
        });
      }

      await db.run(
        "INSERT INTO settings (key, value) VALUES ('sessionsChannelId', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [channel.id]
      );

      logger.info(`Sessions channel set to #${channel.name} (${channel.id}) by ${interaction.user.tag}`);

      await interaction.reply({
        content: `Successfully set the available sessions channel to ${channel}.`,
        ephemeral: true,
      });
    } catch (error) {
      logger.error('Error setting sessions channel:', error);
      await interaction.reply({
        content: 'There was an error while trying to set the sessions channel. Please try again later.',
        ephemeral: true,
      });
    }
  },
};
