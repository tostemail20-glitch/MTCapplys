const fs = require('fs-extra');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
fs.ensureDirSync(dataDir);

const PANELS_FILE = path.join(dataDir, 'panels.json');

function getSectionFile(name) {
  return path.join(dataDir, `${name}.json`);
}

function listSections() {
  try {
    return fs.readdirSync(dataDir)
      .filter(f => f.endsWith('.json') && f !== 'panels.json')
      .map(f => f.replace(/\.json$/, ''));
  } catch (e) {
    return [];
  }
}

function loadSection(name) {
  const file = getSectionFile(name);
  if (!fs.existsSync(file)) return null;
  try {
    return fs.readJsonSync(file);
  } catch (e) {
    return null;
  }
}

function saveSection(name, data) {
  const file = getSectionFile(name);
  fs.writeJsonSync(file, data, { spaces: 2 });
}

function loadPanels() {
  if (!fs.existsSync(PANELS_FILE)) return { panels: [], mainMessage: '' };
  try {
    return fs.readJsonSync(PANELS_FILE);
  } catch (e) {
    return { panels: [], mainMessage: '' };
  }
}

function savePanels(obj) {
  fs.writeJsonSync(PANELS_FILE, obj, { spaces: 2 });
}

function registerPanel(type, channelId, messageId, meta = {}) {
  const p = loadPanels();
  p.panels = p.panels || [];
  // avoid duplicates
  const exists = p.panels.find(x => x.messageId === messageId);
  if (!exists) p.panels.push({ type, channelId, messageId, meta });
  savePanels(p);
}

function unregisterPanelByMessage(messageId) {
  const p = loadPanels();
  p.panels = (p.panels || []).filter(x => x.messageId !== messageId);
  savePanels(p);
}

function setMainMessage(content) {
  const p = loadPanels();
  p.mainMessage = content || '';
  savePanels(p);
}

function getMainMessage() {
  return loadPanels().mainMessage || '';
}

function deleteSection(name) {
  const file = getSectionFile(name);
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    // also remove any panels that referenced this section
    const panels = loadPanels();
    panels.panels = (panels.panels || []).filter(p => {
      const m = p.meta || {};
      return m.section !== name && m.sectionName !== name;
    });
    savePanels(panels);
    return true;
  } catch (e) {
    return false;
  }
}

// Simple emoji parser: return unicode string or { id, name }
function parseEmoji(raw) {
  if (!raw) return null;
  // custom emoji format: <:name:id> or <a:name:id>
  const m = raw.match(/<(a?):([a-zA-Z0-9_]+):(\d+)>/);
  if (m) return { id: m[3], name: m[2], animated: !!m[1] };
  return raw;
}

function isEmojiAccessible(emoji, guild) {
  if (!emoji) return false;
  if (typeof emoji === 'string') return true; // unicode
  if (!guild) return false;
  try {
    return Boolean(guild.emojis && guild.emojis.cache && guild.emojis.cache.has(emoji.id));
  } catch (e) {
    return false;
  }
}

module.exports = {
  getSectionFile,
  listSections,
  loadSection,
  saveSection,
  loadPanels,
  savePanels,
  registerPanel,
  unregisterPanelByMessage,
  setMainMessage,
  getMainMessage,
  deleteSection,
  parseEmoji,
  isEmojiAccessible,
};
