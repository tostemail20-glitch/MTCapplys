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
    if (!fs.existsSync(panelsFile)) return { apply: [], ahelp: [], mainMessage: '' };
    const raw = fs.readJsonSync(panelsFile);
    // support both legacy array shape and object shape
    if (Array.isArray(raw)) {
      const obj = { apply: [], ahelp: [], mainMessage: '' };
      for (const p of raw) {
        if (p && p.type && (p.type === 'apply' || p.type === 'ahelp')) {
          obj[p.type].push({ channelId: p.channelId, messageId: p.messageId, meta: p.meta || {} });
        }
      }
      return obj;
    }
    // if object, ensure expected keys exist
    raw.apply = raw.apply || [];
    raw.ahelp = raw.ahelp || [];
    raw.mainMessage = raw.mainMessage || '';
    return raw;
  } catch (e) {
    console.error('loadPanels error', e && e.message);
    return { apply: [], ahelp: [], mainMessage: '' };
  }
}

function savePanels(panels) {
  try {
    // normalize to object shape
    const out = { apply: [], ahelp: [], mainMessage: '' };
    if (Array.isArray(panels)) {
      for (const p of panels) {
        if (!p || !p.type) continue;
        if (p.type === 'apply' || p.type === 'ahelp') out[p.type].push({ channelId: p.channelId, messageId: p.messageId, meta: p.meta || {} });
      }
    } else if (typeof panels === 'object' && panels !== null) {
      out.apply = panels.apply || [];
      out.ahelp = panels.ahelp || [];
      out.mainMessage = panels.mainMessage || '';
    }
    fs.writeJsonSync(panelsFile, out, { spaces: 2 });
  } catch (e) {
    console.error('savePanels error', e && e.message);
    throw e;
  }
}

function registerPanel(type, channelId, messageId, meta) {
  const panels = loadPanels();
  if (!panels[type]) panels[type] = [];
  // avoid duplicates by messageId
  if (!panels[type].some(p => p.messageId === messageId)) {
    panels[type].push({ channelId, messageId, meta: meta || {} });
  }
  savePanels(panels);
}

function unregisterPanelByMessage(channelId, messageId) {
  const panels = loadPanels();
  for (const k of Object.keys(panels)) {
    if (!Array.isArray(panels[k])) continue;
    panels[k] = panels[k].filter(p => !(p.channelId === channelId && p.messageId === messageId));
  }
  savePanels(panels);
}

function getMainMessage() {
  const p = loadPanels();
  return (p && p.mainMessage) ? p.mainMessage : null;
}

function setMainMessage(text) {
  const panels = loadPanels();
  panels.mainMessage = text || '';
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
