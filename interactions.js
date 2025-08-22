const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const utils = require('./utils');
const fs = require('fs-extra');
const path = require('path');
const { nanoid } = require('nanoid');

let _refreshStarted = false;

function startAutoRefresh(client) {
  if (_refreshStarted) return;
  _refreshStarted = true;
  setInterval(async ()=>{
    try{
      const panels = utils.loadPanels();
      // refresh apply panels
      for (const p of (panels.apply||[])){
        const ch = await client.channels.fetch(p.channelId).catch(()=>null);
        if (!ch) continue;
        const msg = await ch.messages.fetch(p.messageId).catch(()=>null);
        if (!msg) continue;
        // rebuild embed
        const enabled = (p.meta && p.meta.enabled) || [];
        const buttons = [];
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
        const row = new ActionRowBuilder();
        for (const s of enabled) {
          const sec = utils.loadSection(s);
          if (!sec || !sec.open) continue;
          buttons.push(`${sec.emoji || ''} ${sec.name || s}`);
          const btn = new ButtonBuilder().setCustomId(`apply_button:${s}:0`).setLabel(sec.name||s).setStyle(ButtonStyle.Primary);
          const emojiToSet = utils.parseEmoji(sec.emoji);
          // only set emoji for custom emoji objects; unicode emoji is shown in the label
          const guild = ch && ch.guild ? ch.guild : null;
          if (emojiToSet && typeof emojiToSet === 'object' && utils.isEmojiAccessible(emojiToSet, guild)) {
            try { btn.setEmoji(emojiToSet); } catch(e){}
          }
          row.addComponents(btn);
        }
        const mainMsgTemplate = utils.getMainMessage() || `We are announcing the opening of applications for these sections:\n{applys}`;
        const mainMsg = mainMsgTemplate.replace('{applys}', buttons.length ? buttons.join('\n') : 'None');
        const embed = new EmbedBuilder().setTitle('MT Community').setDescription(mainMsg).setColor('Blue');
        await msg.edit({ embeds: [embed], components: row.components.length ? [row] : [] }).catch(()=>{});
      }

      // refresh ahelp panels
      for (const p of (panels.ahelp||[])){
        const ch = await client.channels.fetch(p.channelId).catch(()=>null);
        if (!ch) continue;
        const msg = await ch.messages.fetch(p.messageId).catch(()=>null);
        if (!msg) continue;
        const sections = utils.listSections();
        const counts = sections.map(s=> {
          const d = utils.loadSection(s) || {};
          return `**${d.name || s}** - ${ ((d.applications||[]).length) } applicants`;
        }).join('\n') || 'No sections';
        const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
        const embed = new EmbedBuilder().setTitle('MT Community').setDescription(`Sections: ${sections.length}\n\n${counts}`).setColor('Blue');
        const select = new StringSelectMenuBuilder().setCustomId('ahelp_main_select').setPlaceholder('Manage application system').addOptions([
          { label: 'Edit Message', value: 'ahelp_edit_message' },
          { label: 'Sections', value: 'ahelp_sections' },
          { label: 'Add Section', value: 'ahelp_add_section' }
        ]);
        const row = new ActionRowBuilder().addComponents(select);
        await msg.edit({ embeds: [embed], components: [row] }).catch(()=>{});
      }
    }catch(e){
      // swallow refresh errors
    }
  }, 7000);
}

module.exports = (client) => async (interaction) => {
  // start auto-refresh on first interaction registration
  startAutoRefresh(client);
  // universal handler for buttons and select menus
  if (interaction.isButton()) {
    const [type, section, id] = interaction.customId.split(':');
    if (type === 'apply_button') {
      // open modal for this section
      const sectionData = utils.loadSection(section);
      if (!sectionData) return interaction.reply({ content: 'Section not found.', ephemeral: true });

      // check blacklist
      const black = sectionData.blacklist || [];
      if (black.includes(interaction.user.id)) return interaction.reply({ content: 'You are blacklisted for this section.', ephemeral: true });

      // check role
      const approvedRoleIds = sectionData.approvedRoles || [];
      const guildMember = await interaction.guild.members.fetch(interaction.user.id);
      if (approvedRoleIds.some(r => guildMember.roles.cache.has(r))) {
        return interaction.reply({ content: 'You already have the role for this section.', ephemeral: true });
      }

      // cooldown (3 days) check
      const apps = sectionData.applications || [];
      const last = apps.filter(a => a.userId === interaction.user.id).sort((a,b)=>b.time-a.time)[0];
      const now = Date.now();
      if (last && last.status !== 'Rejected' && now - last.time < 3*24*60*60*1000) {
        return interaction.reply({ content: 'You can only apply once every 3 days or after a rejection.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId(`apply_modal:${section}:${nanoid(6)}`)
        .setTitle(`Apply - ${section}`);

      sectionData.questions = sectionData.questions || [];
      for (let i=0;i<sectionData.questions.length && i<5;i++) {
        const q = sectionData.questions[i];
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId(`q_${i+1}`).setLabel(`${i+1}. ${q}`).setStyle(TextInputStyle.Paragraph).setRequired(true)
          )
        );
      }

      await interaction.showModal(modal);
      return;
    }

    if (type === 'app_approve' || type === 'app_reject' || type === 'app_blacklist' || type === 'app_unblack') {
      // manage application message
      const appId = id;
      // load section and application
      const sectionData = utils.loadSection(section);
      if (!sectionData) return interaction.reply({ content: 'Section data missing.', ephemeral: true });
      const app = (sectionData.applications||[]).find(a=>a.id===appId);
      if (!app) return interaction.reply({ content: 'Application not found.', ephemeral: true });

      // permission check: only reviewer roles or administrators
      const reviewerRoles = sectionData.reviewerRoles || [];
      const memb = await interaction.guild.members.fetch(interaction.user.id);
      if (!memb.permissions.has('Administrator') && !reviewerRoles.some(r=>memb.roles.cache.has(r))) {
        return interaction.reply({ content: 'You don\'t have permission.', ephemeral: true });
      }

      if (type === 'app_approve') {
        app.status = 'Accepted';
        app.timeDecision = Date.now();
        sectionData.applications = sectionData.applications.map(a=> a.id===app.id?app:a);
        try { utils.saveSection(section, sectionData); } catch(e){ console.error('Failed to save section on approve', e); }
        // assign roles
        const approvedRoles = sectionData.approvedRoles||[];
        const guild = interaction.guild;
        const member = await guild.members.fetch(app.userId).catch(()=>null);
        if (member) {
          for (const r of approvedRoles) {
            try{ await member.roles.add(r); } catch(e){}
          }
          try{ await member.send({ embeds: [new EmbedBuilder().setTitle('MT Community').setDescription(`Your application for ${section} was accepted.`).setColor('Green')] }); }catch(e){}
        }
        // edit original application message
        try{
          const msg = await interaction.message.fetch();
          // update Status field and color, keep blacklist button
          const base = EmbedBuilder.from(msg.embeds[0]);
          const fields = (base.data && base.data.fields) ? base.data.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline })) : [];
          const newFields = fields.map(f => f.name === 'Status' ? { name: 'Status', value: 'Accepted', inline: true } : f);
          base.setFields(newFields);
          base.setColor('Green');
          base.setFooter({ text: 'Accepted' });
          // rebuild components: keep blacklist/unblack button depending on blacklist state
          const isBlack = (sectionData.blacklist||[]).includes(app.userId);
          const blackBtn = isBlack
            ? new ButtonBuilder().setCustomId(`app_unblack:${section}:${app.id}`).setLabel('Unblacklist').setStyle(ButtonStyle.Secondary)
            : new ButtonBuilder().setCustomId(`app_blacklist:${section}:${app.id}`).setLabel('Blacklist').setStyle(ButtonStyle.Secondary);
          await msg.edit({ embeds: [base], components: [new ActionRowBuilder().addComponents(blackBtn)] });
        }catch(e){ console.error('Failed to edit application message on approve', e); }
        return interaction.reply({ content: 'Application accepted.', ephemeral: true });
      }

      if (type === 'app_reject') {
        app.status = 'Rejected';
        app.timeDecision = Date.now();
        sectionData.applications = sectionData.applications.map(a=> a.id===app.id?app:a);
        try { utils.saveSection(section, sectionData); } catch(e){ console.error('Failed to save section on reject', e); }
        const guild = interaction.guild;
        const member = await guild.members.fetch(app.userId).catch(()=>null);
        if (member) {
          try{ await member.send({ embeds: [new EmbedBuilder().setTitle('MT Community').setDescription(`Your application for ${section} was rejected.`).setColor('Red')] }); }catch(e){}
        }
        try{
          const msg = await interaction.message.fetch();
          const base = EmbedBuilder.from(msg.embeds[0]);
          const fields = (base.data && base.data.fields) ? base.data.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline })) : [];
          const newFields = fields.map(f => f.name === 'Status' ? { name: 'Status', value: 'Rejected', inline: true } : f);
          base.setFields(newFields);
          base.setColor('Red');
          base.setFooter({ text: 'Rejected' });
          // keep blacklist/unblack button
          const isBlack = (sectionData.blacklist||[]).includes(app.userId);
          const blackBtn = isBlack
            ? new ButtonBuilder().setCustomId(`app_unblack:${section}:${app.id}`).setLabel('Unblacklist').setStyle(ButtonStyle.Secondary)
            : new ButtonBuilder().setCustomId(`app_blacklist:${section}:${app.id}`).setLabel('Blacklist').setStyle(ButtonStyle.Secondary);
          await msg.edit({ embeds: [base], components: [new ActionRowBuilder().addComponents(blackBtn)] });
        }catch(e){ console.error('Failed to edit application message on reject', e); }
        return interaction.reply({ content: 'Application rejected.', ephemeral: true });
      }

      if (type === 'app_blacklist') {
        app.status = 'Blacklisted';
        sectionData.blacklist = sectionData.blacklist||[];
        if (!sectionData.blacklist.includes(app.userId)) sectionData.blacklist.push(app.userId);
        sectionData.applications = sectionData.applications.map(a=> a.id===app.id?app:a);
        try { utils.saveSection(section, sectionData); } catch(e){ console.error('Failed to save section on blacklist', e); }
        const guild = interaction.guild;
        const member = await guild.members.fetch(app.userId).catch(()=>null);
        if (member) {
          try{ await member.send({ embeds: [new EmbedBuilder().setTitle('MT Community').setDescription(`You were blacklisted from ${section} applications.`).setColor('#000000')] }); }catch(e){}
        }
        try{
          const msg = await interaction.message.fetch();
          const base = EmbedBuilder.from(msg.embeds[0]);
          const fields = (base.data && base.data.fields) ? base.data.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline })) : [];
          const newFields = fields.map(f => f.name === 'Status' ? { name: 'Status', value: 'Blacklisted', inline: true } : f);
          base.setFields(newFields);
          base.setColor('#000000');
          base.setFooter({ text: 'Blacklisted' });
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`app_unblack:${section}:${app.id}`).setLabel('Unblacklist').setStyle(ButtonStyle.Secondary)
          );
          await msg.edit({ embeds: [base], components: [row] });
        }catch(e){ console.error('Failed to edit application message on blacklist', e); }
        return interaction.reply({ content: 'User blacklisted for this section.', ephemeral: true });
      }

      if (type === 'app_unblack') {
        sectionData.blacklist = (sectionData.blacklist||[]).filter(id=>id!==app.userId);
        app.status = 'Rejected';
        sectionData.applications = sectionData.applications.map(a=> a.id===app.id?app:a);
        try { utils.saveSection(section, sectionData); } catch(e){ console.error('Failed to save section on unblack', e); }
        try{
          const msg = await interaction.message.fetch();
          const base = EmbedBuilder.from(msg.embeds[0]);
          const fields = (base.data && base.data.fields) ? base.data.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline })) : [];
          const newFields = fields.map(f => f.name === 'Status' ? { name: 'Status', value: 'Rejected', inline: true } : f);
          base.setFields(newFields);
          base.setColor('Red');
          base.setFooter({ text: 'Rejected' });
          // show blacklist button again
          const blackBtn = new ButtonBuilder().setCustomId(`app_blacklist:${section}:${app.id}`).setLabel('Blacklist').setStyle(ButtonStyle.Secondary);
          await msg.edit({ embeds: [base], components: [new ActionRowBuilder().addComponents(blackBtn)] });
        }catch(e){ console.error('Failed to edit application message on unblack', e); }
        return interaction.reply({ content: 'User unblacklisted.', ephemeral: true });
      }
    }
  }

  if (interaction.isModalSubmit()) {
    // parse custom id: apply_modal:Section:nonce
    const parts = interaction.customId.split(':');
    if (parts[0] !== 'apply_modal') return;
    const section = parts[1];
    const sectionData = utils.loadSection(section);
    if (!sectionData) return interaction.reply({ content: 'Section missing.', ephemeral: true });

    // build answers
    const answers = [];
    sectionData.questions = sectionData.questions||[];
    for (let i=0;i<sectionData.questions.length;i++){
      const key = `q_${i+1}`;
      const val = interaction.fields.getTextInputValue(key);
      answers.push({ q: sectionData.questions[i], a: val });
    }

    const app = {
      id: nanoid(8),
      userId: interaction.user.id,
      username: `${interaction.user.tag}`,
      answers,
      time: Date.now(),
      status: 'Pending'
    };

    sectionData.applications = sectionData.applications||[];
    sectionData.applications.push(app);
    utils.saveSection(section, sectionData);

    // send application to applications channel
    const ch = await interaction.guild.channels.fetch(sectionData.channel).catch(()=>null);
    const embed = new EmbedBuilder()
      .setTitle('MT Community')
      .setDescription(`Application for ${section}`)
      .setColor('#ADD8E6')
      .addFields(
        { name: 'Applicant', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
        { name: 'Status', value: 'Pending', inline: true },
        { name: 'Submitted', value: new Date(app.time).toUTCString(), inline: false }
      );

    for (const ans of answers) {
      embed.addFields({ name: ans.q, value: ans.a || 'No answer', inline: false });
    }

    // build moderator buttons with safe emoji handling
    const approveBtn = new ButtonBuilder().setCustomId(`app_approve:${section}:${app.id}`).setLabel('Approve').setStyle(ButtonStyle.Success);
    const rejectBtn = new ButtonBuilder().setCustomId(`app_reject:${section}:${app.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger);
    const blackBtn = new ButtonBuilder().setCustomId(`app_blacklist:${section}:${app.id}`).setLabel('Blacklist').setStyle(ButtonStyle.Secondary);
    try{
      const secEmoji = utils.parseEmoji(sectionData.emoji || '');
      if (secEmoji && typeof secEmoji === 'string') {
        // optionally set emoji on buttons
      } else if (secEmoji && secEmoji.id) {
        // leave moderator buttons without custom emoji to avoid permissions issues
      }
    }catch(e){}
    const row = new ActionRowBuilder().addComponents(approveBtn, rejectBtn, blackBtn);

    if (!ch) {
      return interaction.reply({ content: 'Applications channel not configured or not found for this section.', ephemeral: true });
    }
    try{
      await ch.send({ embeds: [embed], components: [row] });
    }catch(err){
      console.error('Failed to send application to section channel:', err);
      return interaction.reply({ content: 'Failed to deliver application to the section channel. Please notify staff.', ephemeral: true });
    }

    await interaction.reply({ content: 'Application submitted.', ephemeral: true });
    return;
  }

  if (interaction.isSelectMenu()) {
    // placeholder for ahelp select menus
    const val = interaction.values[0];
    // only administrators allowed
    if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: 'No permission.', ephemeral: true });
    if (val === 'ahelp_edit_message') {
      await interaction.reply({ content: 'Please send the new main application message content in this channel. Use {applys} where the active sections should appear.', ephemeral: true });
      // wait for next message by the same user in the channel
      const filter = m => m.author.id === interaction.user.id;
      const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(()=>null);
      const msg = collected && collected.first();
      if (!msg) return interaction.followUp({ content: 'No message received. Operation cancelled.', ephemeral: true });
      utils.setMainMessage(msg.content);
      return interaction.followUp({ content: 'Main application message saved.', ephemeral: true });
    }

    if (val === 'ahelp_add_section') {
      await interaction.reply({ content: 'Please send the new section name (this will be used as file name and key).', ephemeral: true });
      const filter = m => m.author.id === interaction.user.id;
      const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(()=>null);
      const msg = collected && collected.first();
      if (!msg) return interaction.followUp({ content: 'No response. Cancelled.', ephemeral: true });
  let name = msg.content.trim();
  if (!name) return interaction.followUp({ content: 'Invalid name.', ephemeral: true });
  // sanitize name for filename
  name = name.replace(/[\\/\\?%*:|"<>]/g, '').slice(0, 60);
  const file = utils.getSectionFile(name);
      if (fs.existsSync(file)) return interaction.followUp({ content: 'Section already exists.', ephemeral: true });
      const data = { name, key: name, emoji: '', channel: '', reviewerRoles: [], approvedRoles: [], questions: [], open: true, applications: [], blacklist: [] };
      utils.saveSection(name, data);
      return interaction.followUp({ content: `Section ${name} created. Use ahelp -> Sections to configure it.`, ephemeral: true });
    }

    if (val === 'ahelp_sections') {
      // present a list of sections to choose from via select
      const sections = utils.listSections();
      if (!sections.length) return interaction.reply({ content: 'No sections available.', ephemeral: true });
      const options = sections.map(s=>({ label: s, value: `ahelp_section:${s}` }));
      const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
      const sel = new StringSelectMenuBuilder().setCustomId('ahelp_sections_list').setPlaceholder('Select section to manage').addOptions(options.slice(0,25));
      const row = new ActionRowBuilder().addComponents(sel);
      await interaction.reply({ content: 'Select a section to manage:', components: [row], ephemeral: true });
      return;
    }

    if (val.startsWith('ahelp_section:')) {
      const section = val.split(':')[1];
      const data = utils.loadSection(section);
      if (!data) return interaction.reply({ content: 'Section not found.', ephemeral: true });
      // build detail embed
      const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
      const embed = new EmbedBuilder().setTitle('MT Community').setDescription(`Section: **${data.name}**\nOpen: ${data.open ? 'Yes' : 'No'}\nQuestions: ${data.questions.length}\nReviewer Roles: ${data.reviewerRoles.join(', ') || 'None'}\nApproved Roles: ${data.approvedRoles.join(', ') || 'None'}\nChannel: <#${data.channel || 'none'}>\nApplicants: ${(data.applications||[]).length}`).setColor('Blue');
      const options = [
        { label: data.open ? 'Disable' : 'Enable', value: `ahelp_section_toggle:${section}` },
        { label: 'Edit Questions', value: `ahelp_section_q:${section}` },
        { label: 'Edit Emoji', value: `ahelp_section_emoji:${section}` },
        { label: 'Edit Roles', value: `ahelp_section_roles:${section}` },
        { label: 'Edit Channel', value: `ahelp_section_channel:${section}` },
        { label: 'Delete Section', value: `ahelp_section_delete:${section}` },
        { label: 'Back', value: 'ahelp_back' }
      ];
      const sel = new StringSelectMenuBuilder().setCustomId('ahelp_section_detail').setPlaceholder('Section actions').addOptions(options.slice(0,25));
      const row = new ActionRowBuilder().addComponents(sel);
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
    if (interaction.customId === 'ahelp_sections_list') return; // handled above
    if (interaction.customId === 'ahelp_section_detail') {
      const val0 = interaction.values[0];
      if (val0 === 'ahelp_back') return interaction.update({ content: 'Returning...', embeds: [], components: [], ephemeral: true });
      const [cmd, section] = val0.split(':');
      const data = utils.loadSection(section);
      if (!data) return interaction.reply({ content: 'Section not found.', ephemeral: true });
      // toggle
      if (cmd === 'ahelp_section_toggle') {
        data.open = !data.open;
        utils.saveSection(section, data);
        return interaction.update({ content: `Section ${section} is now ${data.open ? 'open' : 'closed'}.`, embeds: [], components: [], ephemeral: true });
      }
      if (cmd === 'ahelp_section_delete') {
        // confirm via message
        await interaction.reply({ content: `Type DELETE to confirm deletion of section ${section}`, ephemeral: true });
        const filter = m => m.author.id === interaction.user.id;
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000 }).catch(()=>null);
        const msg = collected && collected.first();
  if (!msg || msg.content !== 'DELETE') return interaction.followUp({ content: 'Cancelled.', ephemeral: true });
  const ok = utils.deleteSection(section);
  if (!ok) return interaction.followUp({ content: 'Failed to delete section file. Check permissions.', ephemeral: true });
  return interaction.followUp({ content: `Section ${section} deleted.`, ephemeral: true });
      }
      if (cmd === 'ahelp_section_channel') {
        await interaction.reply({ content: 'Please mention the new channel (e.g. #applications).', ephemeral: true });
        const filter = m => m.author.id === interaction.user.id;
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(()=>null);
        const msg = collected && collected.first();
        if (!msg) return interaction.followUp({ content: 'Cancelled.', ephemeral: true });
        const chMatch = msg.content.match(/<#(\d+)>/);
        const chId = chMatch ? chMatch[1] : msg.content.trim();
        // validate channel exists in guild
        try{
          const chObj = await interaction.guild.channels.fetch(chId).catch(()=>null);
          if (!chObj) return interaction.followUp({ content: 'Channel not found in this server.', ephemeral: true });
          data.channel = chId;
          utils.saveSection(section, data);
          return interaction.followUp({ content: `Channel updated for ${section}.`, ephemeral: true });
        }catch(e){
          return interaction.followUp({ content: 'Failed to validate channel.', ephemeral: true });
        }
      }
      if (cmd === 'ahelp_section_emoji') {
        await interaction.reply({ content: 'Send the new emoji (unicode or custom like <a:name:id> or <:name:id>).', ephemeral: true });
        const filter = m => m.author.id === interaction.user.id;
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(()=>null);
        const msg = collected && collected.first();
        if (!msg) return interaction.followUp({ content: 'No input. Cancelled.', ephemeral: true });
        const raw = msg.content.trim();
        const parsed = utils.parseEmoji(raw);
        if (!parsed) return interaction.followUp({ content: 'Invalid emoji format or unsupported emoji.', ephemeral: true });
        data.emoji = raw;
        utils.saveSection(section, data);
        return interaction.followUp({ content: 'Emoji updated.', ephemeral: true });
      }
      if (cmd === 'ahelp_section_q') {
        // present options: add/remove/edit
        const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
        const opts = [
          { label: 'Add Question', value: `ahelp_section_q_add:${section}` },
          { label: 'Remove Question', value: `ahelp_section_q_remove:${section}` },
          { label: 'Edit Question', value: `ahelp_section_q_edit:${section}` },
          { label: 'Back', value: 'ahelp_back' }
        ];
        const sel = new StringSelectMenuBuilder().setCustomId('ahelp_section_q_ops').setPlaceholder('Question ops').addOptions(opts);
        const row = new ActionRowBuilder().addComponents(sel);
        return interaction.update({ content: 'Choose question operation:', embeds: [], components: [row], ephemeral: true });
      }
      if (cmd === 'ahelp_section_roles') {
        const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
        const opts = [
          { label: 'Add Reviewer Role', value: `ahelp_section_role_add_rev:${section}` },
          { label: 'Remove Reviewer Role', value: `ahelp_section_role_remove_rev:${section}` },
          { label: 'Add Approved Role', value: `ahelp_section_role_add_acc:${section}` },
          { label: 'Remove Approved Role', value: `ahelp_section_role_remove_acc:${section}` },
          { label: 'Back', value: 'ahelp_back' }
        ];
        const sel = new StringSelectMenuBuilder().setCustomId('ahelp_section_roles_ops').setPlaceholder('Roles ops').addOptions(opts);
        const row = new ActionRowBuilder().addComponents(sel);
        return interaction.update({ content: 'Choose roles operation:', embeds: [], components: [row], ephemeral: true });
      }
      return interaction.reply({ content: 'Unhandled section action.', ephemeral: true });
    }
    // question ops selection
    if (interaction.customId === 'ahelp_section_q_ops') {
      const val0 = interaction.values[0];
      const [cmd2, section] = val0.split(':');
      const data = utils.loadSection(section);
      if (!data) return interaction.update({ content: 'Section not found.', embeds: [], components: [], ephemeral: true });
      if (cmd2 === 'ahelp_section_q_add') {
        if ((data.questions||[]).length >= 5) return interaction.update({ content: 'Cannot add more than 5 questions.', ephemeral: true });
        await interaction.reply({ content: 'Send the new question text in chat.', ephemeral: true });
        const filter = m => m.author.id === interaction.user.id;
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(()=>null);
        const msg = collected && collected.first();
        if (!msg) return interaction.followUp({ content: 'No input. Cancelled.', ephemeral: true });
        data.questions = data.questions || [];
        data.questions.push(msg.content.trim());
        utils.saveSection(section, data);
        return interaction.followUp({ content: 'Question added.', ephemeral: true });
      }
      if (cmd2 === 'ahelp_section_q_remove') {
        if (!(data.questions||[]).length) return interaction.update({ content: 'No questions to remove.', ephemeral: true });
        const list = (data.questions||[]).map((q,i)=>`${i+1}. ${q}`).join('\n');
        await interaction.reply({ content: `Current questions:\n${list}\nSend the ID number to remove.`, ephemeral: true });
        const filter = m => m.author.id === interaction.user.id;
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(()=>null);
        const msg = collected && collected.first();
        if (!msg) return interaction.followUp({ content: 'No input. Cancelled.', ephemeral: true });
        const id = parseInt(msg.content.trim());
        if (isNaN(id) || id < 1 || id > data.questions.length) return interaction.followUp({ content: 'Invalid ID.', ephemeral: true });
        data.questions.splice(id-1,1);
        utils.saveSection(section, data);
        return interaction.followUp({ content: 'Question removed.', ephemeral: true });
      }
      if (cmd2 === 'ahelp_section_q_edit') {
        if (!(data.questions||[]).length) return interaction.update({ content: 'No questions to edit.', ephemeral: true });
        const list = (data.questions||[]).map((q,i)=>`${i+1}. ${q}`).join('\n');
        await interaction.reply({ content: `Current questions:\n${list}\nSend the ID number to edit.`, ephemeral: true });
        const filter = m => m.author.id === interaction.user.id;
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(()=>null);
        const msg = collected && collected.first();
        if (!msg) return interaction.followUp({ content: 'No input. Cancelled.', ephemeral: true });
        const id = parseInt(msg.content.trim());
        if (isNaN(id) || id < 1 || id > data.questions.length) return interaction.followUp({ content: 'Invalid ID.', ephemeral: true });
        await interaction.followUp({ content: 'Send the new question text.', ephemeral: true });
        const collected2 = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(()=>null);
        const msg2 = collected2 && collected2.first();
        if (!msg2) return interaction.followUp({ content: 'No input. Cancelled.', ephemeral: true });
        data.questions[id-1] = msg2.content.trim();
        utils.saveSection(section, data);
        return interaction.followUp({ content: 'Question updated.', ephemeral: true });
      }
      return interaction.update({ content: 'Unknown question action.', ephemeral: true });
    }

    // role ops selection
    if (interaction.customId === 'ahelp_section_roles_ops') {
      const val0 = interaction.values[0];
      const [cmd2, section] = val0.split(':');
      const data = utils.loadSection(section);
      if (!data) return interaction.update({ content: 'Section not found.', ephemeral: true });
      const filter = m => m.author.id === interaction.user.id;
      if (cmd2 === 'ahelp_section_role_add_rev') {
        await interaction.reply({ content: 'Mention the role to add as reviewer (or send role ID).', ephemeral: true });
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(()=>null);
        const msg = collected && collected.first();
        if (!msg) return interaction.followUp({ content: 'No input. Cancelled.', ephemeral: true });
        const match = msg.content.match(/<@&?(\d+)>/);
        const rid = match ? match[1] : msg.content.trim();
        // validate role exists
        try{
          const roleObj = await interaction.guild.roles.fetch(rid).catch(()=>null);
          if (!roleObj) return interaction.followUp({ content: 'Role not found in this server.', ephemeral: true });
          data.reviewerRoles = data.reviewerRoles || [];
          if (!data.reviewerRoles.includes(rid)) data.reviewerRoles.push(rid);
          utils.saveSection(section, data);
          return interaction.followUp({ content: 'Reviewer role added.', ephemeral: true });
        }catch(e){
          return interaction.followUp({ content: 'Failed to validate role.', ephemeral: true });
        }
      }
      if (cmd2 === 'ahelp_section_role_remove_rev') {
        await interaction.reply({ content: 'Mention the reviewer role to remove (or send role ID).', ephemeral: true });
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(()=>null);
        const msg = collected && collected.first();
        if (!msg) return interaction.followUp({ content: 'No input. Cancelled.', ephemeral: true });
        const match = msg.content.match(/<@&?(\d+)>/);
        const rid = match ? match[1] : msg.content.trim();
        data.reviewerRoles = (data.reviewerRoles||[]).filter(r=>r!==rid);
        utils.saveSection(section, data);
        return interaction.followUp({ content: 'Reviewer role removed.', ephemeral: true });
      }
      if (cmd2 === 'ahelp_section_role_add_acc') {
        await interaction.reply({ content: 'Mention the approved role to add (or send role ID).', ephemeral: true });
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(()=>null);
        const msg = collected && collected.first();
        if (!msg) return interaction.followUp({ content: 'No input. Cancelled.', ephemeral: true });
        const match = msg.content.match(/<@&?(\d+)>/);
        const rid = match ? match[1] : msg.content.trim();
        // validate role exists
        try{
          const roleObj = await interaction.guild.roles.fetch(rid).catch(()=>null);
          if (!roleObj) return interaction.followUp({ content: 'Role not found in this server.', ephemeral: true });
          data.approvedRoles = data.approvedRoles || [];
          if (!data.approvedRoles.includes(rid)) data.approvedRoles.push(rid);
          utils.saveSection(section, data);
          return interaction.followUp({ content: 'Approved role added.', ephemeral: true });
        }catch(e){
          return interaction.followUp({ content: 'Failed to validate role.', ephemeral: true });
        }
      }
      if (cmd2 === 'ahelp_section_role_remove_acc') {
        await interaction.reply({ content: 'Mention the approved role to remove (or send role ID).', ephemeral: true });
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(()=>null);
        const msg = collected && collected.first();
        if (!msg) return interaction.followUp({ content: 'No input. Cancelled.', ephemeral: true });
        const match = msg.content.match(/<@&?(\d+)>/);
        const rid = match ? match[1] : msg.content.trim();
        data.approvedRoles = (data.approvedRoles||[]).filter(r=>r!==rid);
        utils.saveSection(section, data);
        return interaction.followUp({ content: 'Approved role removed.', ephemeral: true });
      }
      return interaction.update({ content: 'Unknown roles action.', ephemeral: true });
    }
    return;
  }
};
