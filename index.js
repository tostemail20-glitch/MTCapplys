const { Client, GatewayIntentBits, Partials, Collection, REST, Routes } = require('discord.js');
const fs = require('fs-extra');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
fs.ensureDirSync(dataDir);

const config = {
  prefix: '+',
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

client.commands = new Collection();

// load commands
const commandsPath = path.join(__dirname, 'commands');
fs.ensureDirSync(commandsPath);
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  client.commands.set(cmd.name, cmd);
}

// utils
client.utils = require('./utils');

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// message handler for prefix commands
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.content.startsWith(config.prefix)) return;

  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const cmd = client.commands.get(command);
  if (!cmd) return;
  try {
    await cmd.execute(client, message, args, config);
  } catch (err) {
    console.error(err);
    message.reply({ content: 'An error occurred while running that command.', ephemeral: true });
  }
});

// interaction handler (handle buttons, selects and modal submits)
client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isButton() || interaction.isSelectMenu() || interaction.isModalSubmit()) {
      const handler = require('./interactions')(client);
      await handler(interaction);
    }
  } catch (err) {
    console.error('Interaction error', err);
  }
});

// login: prefer a hardcoded token if provided, otherwise fall back to the BOT_TOKEN env var.
// NOTE: Do NOT commit your real token to source control if this repository is public.
// To use a hardcoded token (not recommended), paste it below between the quotes.
// It's safer to export BOT_TOKEN in your environment instead of committing a token here.
client.login('MTM3NTU4Mzk2MTY3NzU2NjAwMg.Gc5Kdx.clJ6w1Q2QtLRlynO5fAYUATORUiVNz_xX7Hr3U');
