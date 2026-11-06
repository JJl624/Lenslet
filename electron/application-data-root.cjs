const { statSync } = require('node:fs');
const path = require('node:path');

function applicationDataRoot(documents) {
  const current = path.join(documents, 'LensletData');
  const previous = path.join(documents, 'MoyuData');
  const isDirectory = folder => statSync(folder, {throwIfNoEntry: false})?.isDirectory();
  // Preserve vault and runtime paths stored as absolute paths in existing profiles.
  return !isDirectory(current) && isDirectory(previous) ? previous : current;
}

module.exports = { applicationDataRoot };
