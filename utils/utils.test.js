const utils = require('./index');

console.log('Running utils/utils.test.js');

const expected = [
  'listSections', 'loadSection', 'saveSection', 'parseEmoji', 'isEmojiAccessible',
  'loadPanels', 'savePanels', 'registerPanel', 'deleteSection'
];

const missing = expected.filter(k => typeof utils[k] !== 'function');
if (missing.length) {
  console.error('Missing expected utils functions:', missing);
  process.exit(1);
}

console.log('All expected utils functions present.');
process.exit(0);
