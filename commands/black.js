const utils = require('../utils');

module.exports = {
  name: 'black',
  description: 'Blacklist or unblacklist a user for a section or all',
  async execute(client, message, args) {
  if (!message.member.permissions.has('Administrator')) return message.reply({ content: 'No permission.' });
  if (args.length < 2) return message.reply({ content: 'Usage: +black [user] [section/all]' });

    const userMention = args[0];
    const section = args[1];
    const idMatch = userMention.match(/^<@!?(\d+)>$/);
    const userId = idMatch ? idMatch[1] : null;
  if (!userId) return message.reply({ content: 'Invalid user mention.' });

    const sections = section === 'all' ? utils.listSections() : [section];
    for (const s of sections) {
      const data = utils.loadSection(s);
      if (!data) continue;
      data.blacklist = data.blacklist||[];
      if (data.blacklist.includes(userId)) {
        data.blacklist = data.blacklist.filter(id=>id!==userId);
  await message.channel.send({ content: `Removed blacklist for ${userId} in ${s}` });
      } else {
        data.blacklist.push(userId);
  await message.channel.send({ content: `Added blacklist for ${userId} in ${s}` });
      }
      utils.saveSection(s, data);
    }

  await message.reply({ content: 'Operation completed.' });
  }
};
