const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function convert() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const assetsDir = path.resolve(__dirname, '../src/assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  
  for (const name of ['light', 'dark']) {
    const svgPath = path.join(assetsDir, `${name}.svg`);
    if (!fs.existsSync(svgPath)) {
      console.error(`SVG not found: ${svgPath}`);
      continue;
    }
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    
    // Load SVG in browser
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
          svg { width: 100vw; height: 100vh; display: block; }
        </style>
      </head>
      <body>
        ${svgContent}
      </body>
      </html>
    `);
    
    // Generate 16x16 PNG for System Tray
    await page.setViewportSize({ width: 16, height: 16 });
    const png16Path = path.join(assetsDir, `${name}_16.png`);
    await page.screenshot({
      path: png16Path,
      omitBackground: true,
      type: 'png'
    });
    console.log(`Generated ${png16Path}`);

    // Generate 256x256 PNG for BrowserWindow Taskbar/Window Icon
    await page.setViewportSize({ width: 256, height: 256 });
    const png256Path = path.join(assetsDir, `${name}_256.png`);
    await page.screenshot({
      path: png256Path,
      omitBackground: true,
      type: 'png'
    });
    console.log(`Generated ${png256Path}`);
  }
  
  await browser.close();
}

convert().catch(console.error);
