// commands/help.js
const { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, ComponentType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Displays a list of commands and provides detailed help.'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const { commandsData } = interaction.client;

        // --- Initial Embed and Component Setup ---
        const mainEmbed = new EmbedBuilder()
            .setTitle('Help System')
            .setDescription('Please select a command from the dropdown menu below to get more information about it. Commands marked with 🔒 are for administrators only.')
            .setColor(0x5865F2); // Discord Blurple

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_menu_select')
            .setPlaceholder('Choose a command...')
            .addOptions(
                commandsData.map(cmd => {
                    const isAdmin = (cmd.default_member_permissions === '0'); // '0' means admin permissions
                    return {
                        label: `/${cmd.name}`,
                        description: cmd.description.slice(0, 100),
                        value: cmd.name,
                        emoji: isAdmin ? '🔒' : undefined
                    };
                })
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const message = await interaction.editReply({
            embeds: [mainEmbed],
            components: [row]
        });

        // --- Collector for the select menu ---
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 300000, // 5 minutes
            filter: i => i.user.id === interaction.user.id && i.customId === 'help_menu_select'
        });

        collector.on('collect', async i => {
            const selectedCommandName = i.values[0];
            const command = commandsData.find(cmd => cmd.name === selectedCommandName);

            if (!command) {
                await i.update({ content: 'Could not find details for that command.', components: [] });
                return;
            }

            const helpEmbed = new EmbedBuilder()
                .setTitle(`Help for: /${command.name}`)
                .setColor(0x57F287)
                .setDescription(command.description);

            if (command.options && command.options.length > 0) {
                let optionsString = command.options.map(opt => {
                    return `\`${opt.name}\`: ${opt.description} ${opt.required ? '**(Required)**' : ''}`;
                }).join('\n');
                helpEmbed.addFields({ name: 'Options', value: optionsString });
            }

            // Go back button (optional but nice UX)
            // For now, we will just update the message. A back button adds more complexity.
            await i.update({ embeds: [helpEmbed], components: [row] }); // Keep the menu available
        });

        collector.on('end', () => {
             interaction.editReply({ components: [] }).catch(() => {});
        });


    } catch (error) {
        logger.error('Error executing help command:', error);
        await interaction.editReply({ content: 'An error occurred while trying to display help information.' });
    }
  },
};
