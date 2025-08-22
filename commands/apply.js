const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const utils = require('../utils');
const fs = require('fs-extra');
const path = require('path');

module.exports = {
  name: 'apply',
  description: 'Post application panel',
  async execute(client, message, args) {
    if (!message.member.permissions.has('Administrator')) return message.reply({ content: 'No permission.', ephemeral: true });
    if (args.length === 0) return message.reply({ content: 'Specify sections to enable, or "all".', ephemeral: true });

    const allSections = utils.listSections();
    let enabled = [];
    // map provided args to actual section filenames (case-insensitive, substring)
    if (args[0].toLowerCase() === 'all') {
      // include only sections that exist and are open
      enabled = allSections.filter(s => {
        const sec = utils.loadSection(s);
        return sec && sec.open;
      });
    } else {
      const lowerSections = allSections.map(s => s.toLowerCase());
      for (const a of args) {
        const needle = a.toLowerCase();
        // exact match first
        const exactIdx = lowerSections.indexOf(needle);
        if (exactIdx !== -1) {
          if (!enabled.includes(allSections[exactIdx])) enabled.push(allSections[exactIdx]);
          continue;
        }
        // relaxed substring match: normalize section names (remove punctuation) before matching
        const found = allSections.find(s => {
          const normalized = s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
          return normalized.includes(needle) || s.toLowerCase().includes(needle);
        });
        if (found && !enabled.includes(found)) enabled.push(found);
      }
    }

    if (!enabled.length) {
      console.error('apply: no enabled sections found for args', args, 'allSections=', allSections);
      return message.reply({ content: 'No matching sections found for the provided names.', ephemeral: true });
    }

    // build buttons and applys list
    const buttons = [];
    const buttonsRow = new ActionRowBuilder();
    for (const s of enabled.slice(0,5)) {
      const sec = utils.loadSection(s);
      if (!sec) continue;
      if (!sec.open) continue;
        buttons.push(`${sec.emoji || ''} ${sec.name || s}`);
        const btn = new ButtonBuilder().setCustomId(`apply_button:${s}:0`).setLabel(sec.name || s).setStyle(ButtonStyle.Primary);
        // only use unicode emoji strings; skip custom emojis to avoid cross-guild issues
        try {
          const parsed = utils.parseEmoji(sec.emoji || '');
          if (parsed && utils.isEmojiAccessible(parsed, message.guild)) btn.setEmoji(parsed);
        } catch (e) { console.warn('apply: setEmoji failed', e && e.message); }
        buttonsRow.addComponents(btn);
    }

    const mainMsgTemplate = utils.getMainMessage() || `We are announcing the opening of applications for these sections:\n{applys}`;
    const mainMsg = mainMsgTemplate.replace('{applys}', buttons.length ? buttons.join('\n') : 'None');

    const embed = new EmbedBuilder()
      .setTitle('MT Community')
      .setDescription(mainMsg)
      .setColor('#3498DB')
      .setThumbnail(message.guild.iconURL());

  const components = buttonsRow.components.length ? [buttonsRow] : [];
      let sent;
      try {
        console.log('apply: sending panel', { enabled, buttonsCount: buttons.length, componentsCount: components.length });
        sent = await message.channel.send({ embeds: [embed], components });
        console.log('apply: send success, messageId=', sent.id);
      } catch (err) {
        console.error('Failed to send apply panel', err);
        return message.reply({ content: 'Failed to post application panel (invalid emoji or components).', ephemeral: true });
      }
  // register only the enabled section keys (so auto-refresh can rebuild correctly)
  utils.registerPanel('apply', sent.channel.id, sent.id, { enabled });
  }
};
