const fs = require('fs-extra');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
fs.ensureDirSync(dataDir);

const panelsFile = path.join(dataDir, 'panels.json');

function listSections() {
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && f !== 'panels.json');
  return files.map(f => f.replace(/\.json$/, ''));
}

function getSectionFile(name) {
  return path.join(dataDir, `${name}.json`);
}

function loadSection(name) {
  try {
    const file = getSectionFile(name);
    if (!fs.existsSync(file)) return null;
    return fs.readJsonSync(file);
  } catch (e) {
    console.error('loadSection error', name, e && e.message);
    return null;
  }
}

function saveSection(name, data) {
  try {
    const file = getSectionFile(name);
    fs.writeJsonSync(file, data, { spaces: 2 });
    return true;
  } catch (e) {
    console.error('saveSection error', name, e && e.message);
    throw e;
  }
}

function deleteSection(name) {
  try {
    const file = getSectionFile(name);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    // remove any panels referencing this section
    const panels = loadPanels();
    const changed = panels.filter(p => {
      if (!p.meta || !p.meta.enabled) return true;
      p.meta.enabled = (p.meta.enabled || []).filter(s => s !== name);
      return true;
    });
    savePanels(panels);
    return true;
  } catch (e) {
    console.error('deleteSection error', name, e && e.message);
    return false;
  }
}

function loadPanels() {
  try {
    if (!fs.existsSync(panelsFile)) return [];
    return fs.readJsonSync(panelsFile);
  } catch (e) {
    console.error('loadPanels error', e && e.message);
    return [];
  }
}

function savePanels(panels) {
  try {
    fs.writeJsonSync(panelsFile, panels, { spaces: 2 });
  } catch (e) {
    console.error('savePanels error', e && e.message);
    throw e;
  }
}

function registerPanel(type, channelId, messageId, meta) {
  const panels = loadPanels();
  panels.push({ type, channelId, messageId, meta: meta || {} });
  savePanels(panels);
}

function unregisterPanelByMessage(channelId, messageId) {
  const panels = loadPanels().filter(p => !(p.channelId === channelId && p.messageId === messageId));
  savePanels(panels);
}

function getMainMessage() {
  const p = loadPanels().find(x => x.type === 'apply' && x.meta && x.meta.mainMessage);
  return p && p.meta && p.meta.mainMessage;
}

function setMainMessage(text) {
  const panels = loadPanels();
  let p = panels.find(x => x.type === 'apply');
  if (!p) {
    p = { type: 'apply', channelId: null, messageId: null, meta: {} };
    panels.push(p);
  }
  p.meta = p.meta || {};
  p.meta.mainMessage = text;
  savePanels(panels);
}

// parse emoji strings. returns either a unicode string or an object { id, name }
function parseEmoji(raw) {
  if (!raw) return null;
  raw = String(raw).trim();
  // custom emoji syntax: <a:name:id> or <:name:id>
  const m = raw.match(/^<(a)?:([a-zA-Z0-9_~]+):(\d+)>$/);
  if (m) {
    return { id: m[3], name: m[2], animated: !!m[1] };
  }
  // otherwise assume unicode emoji (or plain text)
  return raw;
}

function isEmojiAccessible(parsed, guild) {
  if (!parsed) return false;
  if (typeof parsed === 'string') return true;
  if (!guild) return false;
  try {
    return !!(guild.emojis && guild.emojis.cache && guild.emojis.cache.has(parsed.id));
  } catch (e) {
    return false;
  }
}

module.exports = {
  listSections,
  getSectionFile,
  loadSection,
  saveSection,
  deleteSection,
  loadPanels,
  savePanels,
  registerPanel,
  unregisterPanelByMessage,
  getMainMessage,
  setMainMessage,
  parseEmoji,
  isEmojiAccessible
};
