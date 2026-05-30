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

// Also update version strings in README.md
const readmePath = path.join(__dirname, '../README.md');
if (fs.existsSync(readmePath)) {
  let readme = fs.readFileSync(readmePath, 'utf8');
  readme = readme.replace(/release-v\d+\.\d+\.\d+/g, `release-v${newVersion}`);
  readme = readme.replace(/Void-\d+\.\d+\.\d+/g, `Void-${newVersion}`);
  readme = readme.replace(/void-desktop_\d+\.\d+\.\d+/g, `void-desktop_${newVersion}`);
  fs.writeFileSync(readmePath, readme, 'utf8');
  console.log(`Updated README.md to version v${newVersion}`);
}

// Also update version strings in docs/index.html
const indexHtmlPath = path.join(__dirname, '../docs/index.html');
if (fs.existsSync(indexHtmlPath)) {
  let html = fs.readFileSync(indexHtmlPath, 'utf8');
  html = html.replace(/download\/v\d+\.\d+\.\d+/g, `download/v${newVersion}`);
  html = html.replace(/Void-\d+\.\d+\.\d+/g, `Void-${newVersion}`);
  html = html.replace(/void-desktop_\d+\.\d+\.\d+/g, `void-desktop_${newVersion}`);
  fs.writeFileSync(indexHtmlPath, html, 'utf8');
  console.log(`Updated docs/index.html to version v${newVersion}`);
}

