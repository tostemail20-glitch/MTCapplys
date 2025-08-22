const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const utils = require('../utils');

module.exports = {
  name: 'ahelp',
  description: 'Application system helper panel',
  async execute(client, message) {
    if (!message.member.permissions.has('Administrator')) return message.reply({ content: 'No permission.', ephemeral: true });

    const sections = utils.listSections();
    const counts = sections.map(s=> {
      const d = utils.loadSection(s);
      return `**${d.name || s}** - ${ (d.applications||[]).length } applicants`;
    }).join('\n') || 'No sections';

    const embed = new EmbedBuilder()
      .setTitle('MT Community')
      .setDescription(`Sections: ${sections.length}\n\n${counts}`)
      .setColor('Blue')
      .setThumbnail(message.guild.iconURL());

    const select = new StringSelectMenuBuilder()
      .setCustomId('ahelp_main_select')
      .setPlaceholder('Manage application system')
      .addOptions([
        { label: 'Edit Message', value: 'ahelp_edit_message' },
        { label: 'Sections', value: 'ahelp_sections' },
        { label: 'Add Section', value: 'ahelp_add_section' }
      ]);

    const row = new ActionRowBuilder().addComponents(select);

    const sent = await message.channel.send({ embeds: [embed], components: [row] });
    utils.registerPanel('ahelp', sent.channel.id, sent.id, {});
    await message.reply({ content: 'ahelp panel sent.', ephemeral: true });
  }
};
