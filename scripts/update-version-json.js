const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');

const newVersion = pkg.version;
const docsDir = path.join(__dirname, '../docs');
const updateJsonPath = path.join(docsDir, 'update.json');

if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

const updateData = {
  version: newVersion,
  platforms: {
    "win32-x64": `https://github.com/duhruh/void/releases/download/v${newVersion}/Void-${newVersion}.exe`,
    "darwin-x64": `https://github.com/duhruh/void/releases/download/v${newVersion}/Void-${newVersion}.dmg`,
    "linux-x64": `https://github.com/duhruh/void/releases/download/v${newVersion}/Void-${newVersion}.AppImage`
  }
};

fs.writeFileSync(updateJsonPath, JSON.stringify(updateData, null, 2));
console.log(`Updated docs/update.json to version v${newVersion}`);
