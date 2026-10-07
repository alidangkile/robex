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

async function checkOverflow(page, label) {
  const info = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  const overflow = info.scrollWidth > info.innerWidth ? info.scrollWidth - info.innerWidth : 0;
  console.log(`[MEASUREMENT] ${label}: innerWidth=${info.innerWidth}px, scrollWidth=${info.scrollWidth}px (overflow=${overflow}px)`);
  if (overflow > 0) {
    throw new Error(`OVERFLOW ERROR on ${label}: scrollWidth (${info.scrollWidth}) > innerWidth (${info.innerWidth}) by ${overflow}px`);
  }
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // 1. Capture Disconnected state across 4 viewports
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(300);
    await checkOverflow(page, `${vp.name}-disconnected`);

    const filePath = path.join(OUTPUT_DIR, `${vp.name}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    console.log(`Saved screenshot: ${filePath}`);
  }

  // 2. Connect Dev Mock Wallet via modal
  console.log('Connecting Dev Mock Wallet...');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('header button:has-text("Connect Wallet")').click();
  await page.waitForTimeout(400);

  await page.locator('.modal-content button:has-text("Dev Mock Wallet")').click();
  await page.waitForTimeout(600);

  // 3. Capture Connected state across 4 viewports (Explicit DEV MOCK simulation)
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(300);
    await checkOverflow(page, `${vp.name}-connected`);

    const filePath = path.join(OUTPUT_DIR, `${vp.name}-connected.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    console.log(`Saved screenshot: ${filePath}`);
  }

  // 4. Trigger Wrong Network state (Robinhood Mainnet Chain ID 46600)
  console.log('Switching to Wrong Network (Chain ID 46600 - Robinhood Mainnet)...');
  await page.evaluate(() => {
    window.__robexWallet?.switchChain(46600);
  });
  await page.waitForTimeout(600);

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(300);
    await checkOverflow(page, `${vp.name}-wrong-network`);

    const filePath = path.join(OUTPUT_DIR, `${vp.name}-wrong-network.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    console.log(`Saved screenshot: ${filePath}`);
  }

  // 5. Trigger Unsupported Network state (Chain ID 1 - Ethereum Mainnet)
  console.log('Switching to Unsupported Network (Chain ID 1)...');
  await page.evaluate(() => {
    window.__robexWallet?.switchChain(1);
  });
  await page.waitForTimeout(600);

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(300);
    await checkOverflow(page, `${vp.name}-unsupported-network`);

    const filePath = path.join(OUTPUT_DIR, `${vp.name}-unsupported-network.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    console.log(`Saved screenshot: ${filePath}`);
  }

  // 6. Test Switch Network recovery via UI button back to testnet
  console.log('Testing Switch Network recovery via UI button...');
  await page.locator('.network-banner-btn').first().click();
  await page.waitForTimeout(600);

  // 7. Capture Swap Page with active formatted quote
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('nav.desktop-nav button:has-text("Swap")').click();
  await page.waitForTimeout(800);
  const swapDesktopPath = path.join(OUTPUT_DIR, 'swap-feature-desktop.png');
  await page.screenshot({ path: swapDesktopPath });
  console.log(`Saved screenshot: ${swapDesktopPath}`);

  // 8. Capture Swap Page on Mobile
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  const swapMobilePath = path.join(OUTPUT_DIR, 'swap-feature-mobile.png');
  await page.screenshot({ path: swapMobilePath });
  console.log(`Saved screenshot: ${swapMobilePath}`);

  await browser.close();
  console.log('All Plan 002 screenshots and DOM measurements recaptured successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
