// events/interactionCreate.js
const { Events, StringSelectMenuBuilder, ActionRowBuilder, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType } = require('discord.js');
const logger = require('../utils/logger');
const db = require('../database/database');

async function handleSessionClaim(interaction) {
    const sessionId = interaction.values[0];
    await interaction.deferUpdate();

    try {
        const session = await db.get('SELECT * FROM sessions WHERE id = ? AND isClaimed = 0', [sessionId]);

        if (!session) {
            return interaction.followUp({ content: 'This session is no longer available or has already been claimed.', ephemeral: true });
        }

        const availableCoachIds = JSON.parse(session.availableCoaches);
        let selectedCoachId;

        if (availableCoachIds.length === 1) {
            selectedCoachId = availableCoachIds[0];
        } else {
            // Prompt user to select a coach
            const coaches = await db.all(`SELECT id, name FROM coaches WHERE id IN (${availableCoachIds.join(',')})`);
            const coachSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`coach_choice_${sessionId}`)
                .setPlaceholder('Choose your coach for this session')
                .addOptions(coaches.map(c => ({ label: c.name, value: c.id.toString() })));

            const row = new ActionRowBuilder().addComponents(coachSelectMenu);
            await interaction.editReply({ content: 'This session has multiple available coaches. Please choose one:', components: [row] });

            const coachChoice = await interaction.channel.awaitMessageComponent({
                componentType: ComponentType.StringSelect,
                filter: i => i.user.id === interaction.user.id && i.customId === `coach_choice_${sessionId}`,
                time: 60000,
            }).catch(() => null);

            if (!coachChoice) {
                return interaction.editReply({ content: 'You did not select a coach in time. The session has not been claimed.', components: [] });
            }
            selectedCoachId = coachChoice.values[0];
            await coachChoice.deferUpdate();
        }

        // Finalize the claim
        const result = await db.run(
            'UPDATE sessions SET isClaimed = 1, claimedBy = ?, claimedCoach = ? WHERE id = ? AND isClaimed = 0',
            [interaction.user.id, selectedCoachId, sessionId]
        );

        if (result.changes === 0) {
             return interaction.editReply({ content: 'Sorry, someone else just claimed this session. Please select another.', components: [] });
        }

        // Delete the Guild Scheduled Event
        if (session.guildScheduledEventId) {
            const event = await interaction.guild.scheduledEvents.fetch(session.guildScheduledEventId).catch(() => null);
            if (event) await event.delete();
        }

        // Send DMs
        const coach = await db.get('SELECT discord_id, name FROM coaches WHERE id = ?', [selectedCoachId]);
        const user = interaction.user;
        const sessionDate = new Date(session.datetime).toLocaleString('en-US', { timeZone: 'UTC' });

        const coachDm = `Your coaching session on ${sessionDate} has been claimed by ${user.tag}.`;
        const userDm = `You have successfully claimed the coaching session with ${coach.name} on ${sessionDate}.`;

        await interaction.client.users.send(coach.discord_id, coachDm).catch(err => logger.error(`Failed to DM coach ${coach.discord_id}`, err));
        await user.send(userDm).catch(err => logger.error(`Failed to DM user ${user.id}`, err));

        logger.info(`Session ${sessionId} claimed by ${user.tag} with coach ${coach.name}`);
        await interaction.editReply({ content: 'Session successfully claimed! You will receive a confirmation DM shortly.', components: [] });

    } catch (error) {
        logger.error('Error handling session claim:', error);
        await interaction.followUp({ content: 'There was a server error while trying to claim the session.', ephemeral: true });
    }
}

const CANCELLATION_WINDOW_HOURS = 48;

async function handleSessionCancel(interaction) {
    const sessionId = interaction.values[0];
    await interaction.deferUpdate();

    try {
        const session = await db.get(
            `SELECT s.*, c.name as coachName, c.discord_id as coachDiscordId
            FROM sessions s JOIN coaches c ON s.claimedCoach = c.id
            WHERE s.id = ? AND s.claimedBy = ?`,
            [sessionId, interaction.user.id]
        );

        if (!session) {
            return interaction.followUp({ content: 'This session could not be found or does not belong to you.', ephemeral: true });
        }

        const sessionDate = new Date(session.datetime);
        const hoursUntil = (sessionDate.getTime() - new Date().getTime()) / (1000 * 60 * 60);

        if (hoursUntil <= CANCELLATION_WINDOW_HOURS) {
            // Show confirmation modal with warning
            const modal = new ModalBuilder()
                .setCustomId(`cancel_confirm_${sessionId}`)
                .setTitle('Confirm Cancellation');
            const confirmInput = new TextInputBuilder()
                .setCustomId('confirm_text')
                .setLabel('Type "CANCEL" to confirm (no refunds)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(confirmInput));
            await interaction.showModal(modal);

            const submitted = await interaction.awaitModalSubmit({ time: 60000, filter: i => i.customId === `cancel_confirm_${sessionId}` }).catch(() => null);
            if (!submitted || submitted.fields.getTextInputValue('confirm_text').toUpperCase() !== 'CANCEL') {
                return submitted?.deferUpdate(); // Just close the modal on timeout or wrong input
            }
            await submitted.deferUpdate(); // Acknowledge modal submission
        }

        // Proceed with cancellation
        // 1. Set session back to unclaimed
        await db.run(
            'UPDATE sessions SET isClaimed = 0, claimedBy = NULL, claimedCoach = NULL WHERE id = ?',
            [sessionId]
        );

        // 2. Create a new Guild Scheduled Event for the now-available slot
        const newEvt = await interaction.guild.scheduledEvents.create({
            name: session.title,
            scheduledStartTime: session.datetime,
            scheduledEndTime: new Date(sessionDate.getTime() + session.duration_minutes * 60000),
            privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
            entityType: GuildScheduledEventEntityType.External,
            entityMetadata: { location: '1-on-1 Coaching' }
        }).catch(err => logger.error('Failed to create new scheduled event on cancellation:', err));

        // 3. Update the session with the new event ID
        if(newEvt) {
            await db.run('UPDATE sessions SET guildScheduledEventId = ? WHERE id = ?', [newEvt.id, sessionId]);
        }

        // 4. Send notifications
        const user = interaction.user;
        const coach = { name: session.coachName, id: session.coachDiscordId };
        const sessionDateString = sessionDate.toLocaleString('en-US', { timeZone: 'UTC' });

        const cancellationMessage = `The session "${session.title}" on ${sessionDateString} with coach ${coach.name} has been cancelled by ${user.tag}.`;

        // User DM
        await user.send(`You have successfully cancelled your session: "${session.title}" with ${coach.name}.`).catch(err => logger.error('Failed to DM user on cancellation', err));
        // Coach DM
        await interaction.client.users.send(coach.id, `Your session "${session.title}" with ${user.tag} has been cancelled. It is now available for others to claim.`).catch(err => logger.error('Failed to DM coach on cancellation', err));

        // Channel Notification
        const settings = await db.get("SELECT value FROM settings WHERE key = 'cancellationsChannelId'");
        if (settings && settings.value) {
            const channel = await interaction.client.channels.fetch(settings.value).catch(() => null);
            if (channel) {
                await channel.send(`${cancellationMessage} <@${coach.id}>`);
            }
        }

        logger.info(`Session ${sessionId} cancelled by ${user.tag}`);
        await interaction.editReply({ content: 'Your session has been cancelled and is now available for others.', components: [] });

    } catch (error) {
        logger.error('Error handling session cancellation:', error);
        await interaction.followUp({ content: 'An error occurred while trying to cancel the session.', ephemeral: true });
    }
}


module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'claim_session_select') {
                return handleSessionClaim(interaction);
            }
            if (interaction.customId === 'cancel_session_select') {
                return handleSessionCancel(interaction);
            }
        }

		if (!interaction.isChatInputCommand()) return;

		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			logger.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		try {
			await command.execute(interaction);
		} catch (error) {
			logger.error(`Error executing ${interaction.commandName}`, error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
			} else {
				await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
			}
		}
	},
};
