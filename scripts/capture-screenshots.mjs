import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const OUTPUT_DIR = path.resolve('docs/qa/evidence');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: 'desktop-wide', width: 1440, height: 900 },
  { name: 'desktop-narrow', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
];

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  for (const vp of VIEWPORTS) {
    console.log(`Setting viewport: ${vp.name} (${vp.width}x${vp.height})`);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(400);

    const filePath = path.join(OUTPUT_DIR, `${vp.name}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    console.log(`Saved screenshot: ${filePath}`);
  }

  // Capture Swap on Desktop Wide
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('nav.desktop-nav button:has-text("Swap")').click();
  await page.waitForTimeout(800);
  const swapDesktopPath = path.join(OUTPUT_DIR, 'swap-feature-desktop.png');
  await page.screenshot({ path: swapDesktopPath });

  // Capture Swap on Mobile
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  const swapMobilePath = path.join(OUTPUT_DIR, 'swap-feature-mobile.png');
  await page.screenshot({ path: swapMobilePath });
  console.log(`Saved screenshot: ${swapMobilePath}`);

  await browser.close();
  console.log('All screenshots captured successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
