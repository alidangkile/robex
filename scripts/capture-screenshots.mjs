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

  // 1. Capture Disconnected state across 4 viewports
  for (const vp of VIEWPORTS) {
    console.log(`Setting viewport: ${vp.name} (${vp.width}x${vp.height}) - Disconnected`);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(300);

    const filePath = path.join(OUTPUT_DIR, `${vp.name}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    console.log(`Saved screenshot: ${filePath}`);
  }

  // 2. Connect Dev Mock Wallet via modal
  console.log('Opening wallet modal and connecting Dev Mock Wallet...');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('header button:has-text("Connect Wallet")').click();
  await page.waitForTimeout(400);

  // Click the Dev Mock Wallet option specifically inside modal
  await page.locator('.modal-content button:has-text("Dev Mock Wallet")').click();
  await page.waitForTimeout(600);

  // 3. Capture Connected state on Desktop Wide, Tablet, and Mobile
  const connectedViewports = [
    { name: 'desktop-wide-connected', width: 1440, height: 900 },
    { name: 'tablet-connected', width: 768, height: 1024 },
    { name: 'mobile-connected', width: 375, height: 812 },
  ];

  for (const cvp of connectedViewports) {
    console.log(`Setting viewport: ${cvp.name} (${cvp.width}x${cvp.height}) - Connected`);
    await page.setViewportSize({ width: cvp.width, height: cvp.height });
    await page.waitForTimeout(400);

    const overflowInfo = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
    }));
    console.log(`Viewport ${cvp.name}: innerWidth=${overflowInfo.innerWidth}, scrollWidth=${overflowInfo.scrollWidth}`);
    if (overflowInfo.scrollWidth > overflowInfo.innerWidth) {
      console.error(`WARNING: Overflow detected on ${cvp.name}! scrollWidth (${overflowInfo.scrollWidth}) > innerWidth (${overflowInfo.innerWidth})`);
    }

    const filePath = path.join(OUTPUT_DIR, `${cvp.name}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    console.log(`Saved screenshot: ${filePath}`);
  }

  // 4. Capture Swap Page with active formatted quote
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('nav.desktop-nav button:has-text("Swap")').click();
  await page.waitForTimeout(800);
  const swapDesktopPath = path.join(OUTPUT_DIR, 'swap-feature-desktop.png');
  await page.screenshot({ path: swapDesktopPath });
  console.log(`Saved screenshot: ${swapDesktopPath}`);

  // 5. Capture Swap Page on Mobile
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
