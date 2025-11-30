// utils/sessionManager.js
const { EmbedBuilder } = require('discord.js');
const db = require('../database/database');
const logger = require('./logger');

let isUpdating = false;

async function buildSessionListEmbed() {
    const now = new Date().toISOString();
    const sessions = await db.all(
        `SELECT s.id, s.datetime, s.title, s.availableCoaches
         FROM sessions s
         WHERE s.isClaimed = 0 AND s.datetime > ?
         ORDER BY s.datetime ASC
         LIMIT 25`, // Embeds have a field limit
        [now]
    );

    const coaches = await db.all('SELECT id, name FROM coaches');
    const coachMap = new Map(coaches.map(c => [c.id.toString(), c.name]));

    const embed = new EmbedBuilder()
        .setTitle('Available Coaching Sessions')
        .setColor(0x3498DB)
        .setTimestamp()
        .setFooter({ text: 'Last updated' });

    if (!sessions || sessions.length === 0) {
        embed.setDescription('There are no available sessions right now. Please check back later!');
    } else {
        let description = 'Use the `/sessions` command to browse and claim a session.\n\n';
        for (const session of sessions) {
            const sessionDate = new Date(session.datetime);
            const dateString = sessionDate.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', hour12: true });
            const availableCoachIds = JSON.parse(session.availableCoaches);
            const availableCoachNames = availableCoachIds.map(id => coachMap.get(id) || 'Unknown').join(', ');

            description += `**${session.title}**\n`;
            description += `*${dateString}*\n`;
            description += `Coaches: ${availableCoachNames}\n\n`;
        }
        embed.setDescription(description);
    }

    return embed;
}

async function updateSessionList(client) {
    if (isUpdating) {
        logger.info('Session list update already in progress. Skipping.');
        return;
    }
    isUpdating = true;

    try {
        const channelIdSetting = await db.get("SELECT value FROM settings WHERE key = 'sessionsChannelId'");
        const messageIdSetting = await db.get("SELECT value FROM settings WHERE key = 'sessionListMessageId'");

        const channelId = channelIdSetting?.value;
        let messageId = messageIdSetting?.value;

        if (!channelId) {
            // logger.info('Session list channel not configured. Skipping update.');
            return;
        }

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) {
            logger.error(`Could not find the configured sessions channel with ID: ${channelId}`);
            return;
        }

        const embed = await buildSessionListEmbed();
        let message;

        if (messageId) {
            message = await channel.messages.fetch(messageId).catch(() => null);
        }

        if (message) {
            // Edit existing message
            await message.edit({ embeds: [embed] });
            // logger.info('Successfully updated the session list message.');
        } else {
            // Post new message and save its ID
            const newMessage = await channel.send({ embeds: [embed] });
            await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('sessionListMessageId', ?)", [newMessage.id]);
            logger.info(`Posted new session list message and saved its ID: ${newMessage.id}`);
        }
    } catch (error) {
        logger.error('Failed to update session list:', error);
    } finally {
        isUpdating = false;
    }
}

function startSessionUpdater(client) {
    // Run once on startup, then every 20 minutes
    setTimeout(() => updateSessionList(client), 5000); // Initial delay to ensure client is ready
    setInterval(() => updateSessionList(client), 20 * 60 * 1000); // 20 minutes
}

module.exports = {
    startSessionUpdater,
    updateSessionList
};
