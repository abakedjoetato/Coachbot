// index.js
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { openDb } = require('./database/database');

// Validate environment variables
const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Error: Missing required environment variables. Please check your .env file.');
  process.exit(1);
}

(async () => {
  // Connect to the database
  await openDb();

  // Create a new client instance
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildScheduledEvents] });

  // Command handling
  client.commands = new Collection();
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);
      if ('data' in command && 'execute' in command) {
          client.commands.set(command.data.name, command);
      } else {
          console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
      }
  }

  const { startSessionUpdater } = require('./utils/sessionManager');
  const { startPruner } = require('./utils/pruneManager');

  // Event handling
  const eventsPath = path.join(__dirname, 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

  for (const file of eventFiles) {
      const filePath = path.join(eventsPath, file);
      const event = require(filePath);
      if (event.once) {
          client.once(event.name, (...args) => event.execute(...args));
      } else {
          client.on(event.name, (...args) => event.execute(...args));
      }
  }

  // Log in to Discord with your client's token
  client.login(DISCORD_TOKEN);
})();
