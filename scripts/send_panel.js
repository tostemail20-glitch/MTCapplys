// send_panel.js
// Usage: BOT_TOKEN=token node scripts/send_panel.js <channelId>
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const utils = require('../utils');

console.log('scripts/send_panel.js starting...');
const channelId = process.argv[2];
if (!channelId) {
  console.error('Usage: node scripts/send_panel.js <channelId>');
  process.exit(1);
}

if (!process.env.BOT_TOKEN) {
  console.error('BOT_TOKEN not set');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

process.on('unhandledRejection', (r) => console.error('Unhandled Rejection', r));
process.on('uncaughtException', (err) => console.error('Uncaught Exception', err));

client.on('warn', console.warn);
client.on('error', console.error);

client.once('ready', async () => {
  console.log('Client ready as', client.user && client.user.tag ? client.user.tag : client.user);
  try {
    const allSections = utils.listSections();
    const enabled = allSections.filter(s => {
      const sec = utils.loadSection(s);
      return sec && sec.open;
    });

    const buttons = [];
    const row = new ActionRowBuilder();
    for (const s of enabled.slice(0, 5)) {
      const sec = utils.loadSection(s);
      if (!sec) continue;
      buttons.push(`${sec.emoji || ''} ${sec.name || s}`);
      const btn = new ButtonBuilder().setCustomId(`apply_button:${s}:0`).setLabel(sec.name || s).setStyle(ButtonStyle.Primary);
      try {
        const parsed = utils.parseEmoji(sec.emoji || '');
        if (parsed && utils.isEmojiAccessible(parsed, ch.guild)) btn.setEmoji(parsed);
      } catch (e) {
        console.warn('Failed to parse emoji for section', s, e && e.message);
      }
      row.addComponents(btn);
    }

    const mainMsgTemplate = utils.getMainMessage() || `We are announcing the opening of applications for these sections:\n{applys}`;
    const mainMsg = mainMsgTemplate.replace('{applys}', buttons.length ? buttons.join('\n') : 'None');

    const embed = new EmbedBuilder().setTitle('MT Community').setDescription(mainMsg).setColor('Blue');

    const ch = await client.channels.fetch(channelId).catch((err) => {
      console.error('Failed to fetch channel', err && err.message);
      return null;
    });
    if (!ch) {
      console.error('Channel not found or bot cannot access it');
      process.exit(1);
    }
  await ch.send({ embeds: [embed], components: row.components.length ? [row] : [] }).catch(e => { throw e; });
  } catch (e) {
    console.error('Failed to send panel', e && e.stack ? e.stack : e);
  } finally {
    setTimeout(() => client.destroy(), 1500);
  }
});

client.login(process.env.BOT_TOKEN).catch(err => {
  console.error('Login failed', err && err.message ? err.message : err);
  process.exit(1);
});
