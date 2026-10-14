import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const OUT_DIR = path.resolve('docs/qa/evidence/issue-45');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404 || res.status === 200) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function main() {
  console.log('[capture] Starting Vite dev server with VITE_ENABLE_MOCK_WALLET=true...');
  const devProcess = spawn('npx', ['vite', '--port', '5173'], {
    cwd: path.resolve('apps/web'),
    env: { ...process.env, VITE_ENABLE_MOCK_WALLET: 'true', VITE_API_URL: 'http://localhost:5173' },
    shell: true,
    stdio: 'pipe',
  });

  devProcess.stderr.on('data', (d) => process.stderr.write(d));

  try {
    await waitForServer('http://localhost:5173');
    console.log('[capture] Vite dev server is running on http://localhost:5173');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', (msg) => console.log('[browser console]', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.error('[browser error]', err));

    // Mock API quote route
    await page.route('**/api/v1/quote*', async (route) => {
      console.log('[capture] Intercepted quote route:', route.request().url());
      const url = new URL(route.request().url());
      const amountIn = url.searchParams.get('amountIn') || '50000000000000';
      const blockSec = Math.floor(Date.now() / 1000);
      const quotedAt = blockSec * 1000;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          quote: {
            id: 'v4-testnet-live-quote',
            source: { id: 'uniswap-v4-eth-usdg', name: 'Uniswap v4', type: 'UNISWAP_V4' },
            chainId: 46630,
            tokenIn: '0x0000000000000000000000000000000000000000',
            amountIn,
            expectedAmountOut: '1122',
            minimumAmountOut: '1116',
            priceImpactPercent: 0.04,
            priceImpactPercentExact: '0.0400',
            risk: 'normal',
            slippageBps: 50,
            poolFeePips: 3000,
            referenceAmountOut: '1123',
            referenceRate: '2251.616202',
            blockNumber: '130884439',
            blockHash: '0xba68078cd40540f60f2fc104d9006020190cf63abb5d03a713ad396fb170f034',
            blockTimestamp: String(blockSec),
            quotedAt,
            expiresAt: quotedAt + 20_000,
            remainingMs: 20_000,
            tokenInSymbol: 'ETH',
            tokenOutSymbol: 'USDG',
            tokenInDecimals: 18,
            tokenOutDecimals: 6,
            limitations: ['Testnet USDG has no monetary value.'],
            capWei: '100000000000000',
          },
        }),
      });
    });

    console.log('[capture] Navigating to page...');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);

    // Navigate to Swap tab
    console.log('[capture] Navigating to Swap tab...');
    const launchSwapBtn = page.locator('button:has-text("Launch Swap"), header button:has-text("Swap")').first();
    await launchSwapBtn.click();
    await page.waitForTimeout(500);

    // Connect Dev Mock Wallet
    console.log('[capture] Connecting Dev Mock Wallet...');
    const connectBtn = page.locator('header button:has-text("Connect Wallet"), main button:has-text("Connect Wallet")').first();
    await connectBtn.click();
    await page.waitForTimeout(400);

    const mockModalBtn = page.locator('.modal-content button:has-text("Dev Mock Wallet")');
    await mockModalBtn.click();
    await page.waitForTimeout(800);

    // 1. Idle in balance line
    console.log('[capture] State 1: Idle in balance line...');
    for (const vp of [{ name: 'desktop', w: 1280, h: 900 }, { name: 'mobile', w: 360, h: 800 }]) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.waitForTimeout(300);
      const file = path.join(OUT_DIR, `${vp.w}-idle-balance-line.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`[capture] Saved: ${file}`);
    }

    // 2. Perform Swap to get Confirmed Panel
    console.log('[capture] Entering amount and executing swap...');
    await page.setViewportSize({ width: 1280, height: 900 });
    const payInput = page.locator('input[aria-label="You pay ETH"]');
    await payInput.fill('0.00005');
    await page.waitForTimeout(800);

    const swapBtn = page.locator('button[data-testid="swap-execution"]');
    await swapBtn.waitFor({ state: 'visible' });
    await swapBtn.click();
    await page.waitForTimeout(1200);

    // Confirmed panel should now be visible
    await page.locator('[data-testid="actual-received"]').waitFor({ state: 'visible' });

    // 2. Idle in confirmed panel (mock wallet)
    console.log('[capture] State 2: Idle in confirmed panel...');
    for (const vp of [{ name: 'desktop', w: 1280, h: 900 }, { name: 'mobile', w: 360, h: 800 }]) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.evaluate(() => {
        document.querySelector('[data-testid="swap-result"]')?.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(300);
      const file = path.join(OUT_DIR, `${vp.w}-idle-confirmed-panel.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`[capture] Saved: ${file}`);
    }

    // 3. Click Add USDG to wallet in confirmed panel -> triggers 'added'
    console.log('[capture] State 3: Added state...');
    await page.setViewportSize({ width: 1280, height: 900 });
    const addBtnInResult = page.locator('[data-testid="swap-result"] [data-testid="add-usdg-button"]');
    await addBtnInResult.click();
    await page.waitForTimeout(500);

    for (const vp of [{ name: 'desktop', w: 1280, h: 900 }, { name: 'mobile', w: 360, h: 800 }]) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.waitForTimeout(300);
      const file = path.join(OUT_DIR, `${vp.w}-added.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`[capture] Saved: ${file}`);
    }

    // 4. Unsupported state: stub watchUsdgAsset to return 'unsupported'
    console.log('[capture] State 4: Unsupported state...');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);

    const swapTabAfterReload = page.locator('button:has-text("Launch Swap"), header button:has-text("Swap")').first();
    await swapTabAfterReload.click();
    await page.waitForTimeout(500);

    // Connect wallet again after reload
    await page.locator('header button:has-text("Connect Wallet"), main button:has-text("Connect Wallet")').first().click();
    await page.waitForTimeout(400);
    await page.locator('.modal-content button:has-text("Dev Mock Wallet")').click();
    await page.waitForTimeout(800);

    // Stub watchUsdgAsset to return 'unsupported'
    await page.evaluate(() => {
      if (window.__robexWallet?.adapter) {
        window.__robexWallet.adapter.watchUsdgAsset = async () => 'unsupported';
      }
    });

    const addBtnBalance = page.locator('[data-testid="usdg-balance-line"] [data-testid="add-usdg-button"]');
    await addBtnBalance.click();
    await page.waitForTimeout(500);

    for (const vp of [{ name: 'desktop', w: 1280, h: 900 }, { name: 'mobile', w: 360, h: 800 }]) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.waitForTimeout(300);
      const file = path.join(OUT_DIR, `${vp.w}-unsupported.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`[capture] Saved: ${file}`);
    }

    await browser.close();
    console.log('[capture] All screenshots captured successfully in', OUT_DIR);
  } finally {
    devProcess.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('[capture] Failed:', err);
  process.exit(1);
});
