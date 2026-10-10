// Evidence capture for Plan 003B Amendment 1 (B5). Read-only: no signing, no transactions.
// Usage: API on $API (default http://localhost:3101), web on $WEB (default http://localhost:5183)
// started with VITE_ENABLE_MOCK_WALLET=true. Writes PNGs + measurements.json to $OUT.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const WEB = process.env.WEB ?? 'http://localhost:5183';
const OUT = path.resolve(process.env.OUT ?? 'docs/qa/evidence/003b-stage-b/amendment-1');
fs.mkdirSync(OUT, { recursive: true });
const results = [];

async function measure(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const vw = doc.clientWidth;
    let leaf = 0;
    for (const el of document.querySelectorAll('[data-testid="swap-root"] *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 0.5) leaf += 1;
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: vw, leafOverflow: leaf };
  });
}

async function info(page) {
  return page.evaluate(() => {
    const t = (id) => document.querySelector(`[data-testid="${id}"]`)?.textContent ?? null;
    const details = document.querySelector('[data-testid="quote-details"]');
    let block = null;
    if (details) {
      for (const row of details.children) {
        if (row.firstChild?.textContent === 'Block') block = row.lastChild?.textContent ?? null;
      }
    }
    return {
      receive: t('quote-receive'),
      error: t('quote-error'),
      blocked: t('quote-block'),
      slippageWarning: t('slippage-warning'),
      strongUnderInput: t('slippage-strong-warning'),
      strongInDetails: t('quote-slippage-strong-warning'),
      balanceLine: t('balance-line'),
      balanceButtonsDisabled: [25, 50, 75, 100].map((p) => document.querySelector(`[data-testid="balance-fill-${p}"]`)?.disabled ?? null),
      block,
    };
  });
}

async function shot(page, name, widths, source, note = '') {
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: w <= 400 ? 844 : 900 });
    await page.waitForTimeout(250);
    const file = `${w}-${name}.png`;
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    const m = await measure(page);
    const i = await info(page);
    results.push({ file, width: w, state: name, source, note, ...m, ...i });
    console.log(file, JSON.stringify({ ...m, receive: i.receive, block: i.block }));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function setAmount(page, value) {
  await page.fill('[aria-label="You pay ETH"]', value);
}

async function waitSettled(page) {
  await page.waitForFunction(() => {
    const r = document.querySelector('[data-testid="quote-receive"]')?.textContent;
    return r && r !== 'Calculating...';
  }, null, { timeout: 30000 });
}

// Retries transient public-RPC errors (QA F-02, not fixed here) by pressing Refresh.
async function liveQuote(page) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await waitSettled(page);
    if (await page.locator('[data-testid="quote-details"]').count()) return true;
    if (await page.locator('[data-testid="quote-block"]').count()) return false;
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Refresh quote' }).click();
    await page.waitForTimeout(400);
  }
  throw new Error('no live quote after retries');
}

async function setCustom(page, value) {
  if (await page.locator('[data-testid="custom-slippage-toggle"]').count()) {
    await page.click('[data-testid="custom-slippage-toggle"]');
  }
  await page.fill('[data-testid="custom-slippage-input"]', value);
}

async function gotoSwap(page) {
  await page.goto(WEB, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.locator('nav.desktop-nav button:has-text("Swap")').click();
  await page.waitForSelector('[data-testid="swap-root"]');
}

async function connectMock(page) {
  await page.locator('header button:has-text("Connect Wallet")').click();
  await page.waitForTimeout(300);
  await page.locator('.modal-content button:has-text("Dev Mock Wallet")').click();
  await page.waitForTimeout(600);
}

async function setMockBalance(page, mode) {
  await page.evaluate(async (m) => {
    const w = window.__robexWallet;
    const a = w.adapter;
    if (m === 'loading') a.balanceSource = () => new Promise(() => {});
    else if (m === 'error') a.balanceSource = async () => { throw new Error('mock read error'); };
    else a.balanceSource = async () => m;
    await w.switchChain(46630); // chain invalidation re-reads the balance
  }, mode);
  await page.waitForTimeout(400);
}

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// Disconnected, real API + real RPC
await gotoSwap(page);
await shot(page, 'disconnected-empty', [1440, 390], 'no request');
await setAmount(page, '0.0000005');
await liveQuote(page);
await shot(page, 'disconnected-live', [1440, 1100, 768, 390], 'real RPC');

for (const [value, label] of [['0', 'custom-0'], ['1.01', 'custom-1.01'], ['4.99', 'custom-4.99'], ['5', 'custom-5'], ['50', 'custom-50']]) {
  await setCustom(page, value);
  await page.waitForTimeout(500);
  await liveQuote(page);
  const widths = value === '5' || value === '50' ? [1440, 390, 360] : [1440, 390];
  await shot(page, `disconnected-${label}`, widths, 'real RPC');
}
await page.click('[data-testid="slippage-preset-0.5"]');

await setAmount(page, '0.0001');
await page.waitForTimeout(400);
await liveQuote(page);
await shot(page, 'disconnected-blocked-0.0001', [1440, 390], 'real RPC');

await setAmount(page, '0.0000005');
await page.waitForTimeout(400);
await liveQuote(page);
await page.waitForFunction(() => document.querySelector('[data-testid="quote-receive"]')?.textContent === 'Expired', null, { timeout: 30000 });
await shot(page, 'disconnected-expired', [1440, 390], 'real RPC, waited past 20 s');

// FUTURE_BLOCK from the API: fixture response (cannot be forced on a synced clock)
await page.route('**/api/v1/quote?**', (route) => route.fulfill({
  status: 400,
  contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*' },
  body: JSON.stringify({ error: { code: 'QUOTE_ERROR', message: 'The pinned chain block timestamp is ahead of the quote clock. No quote is available.', details: { reason: 'FUTURE_BLOCK' } } }),
}));
await setAmount(page, '0.0000004');
await page.waitForTimeout(600);
await waitSettled(page);
await shot(page, 'disconnected-future-block', [1440, 390], 'fixture (intercepted API response)');
await page.unroute('**/api/v1/quote?**');

// Mock wallet (DEV ONLY), balance quick-fill
await setAmount(page, '');
await connectMock(page);
await setMockBalance(page, '200000000000000');
await shot(page, 'mock-wallet-balance', [1440, 1100, 768, 390, 360], 'mock wallet fixture balance 0.0002 ETH');
await setMockBalance(page, '0');
await shot(page, 'mock-wallet-balance-zero', [1440, 390], 'mock wallet fixture balance 0');
await setMockBalance(page, 'loading');
await shot(page, 'mock-wallet-balance-loading', [1440, 390], 'mock wallet, read never resolves');
await setMockBalance(page, 'error');
await shot(page, 'mock-wallet-balance-error', [1440, 390], 'mock wallet, read rejects');
await setMockBalance(page, '200000000000000');
await page.click('[data-testid="balance-fill-100"]');
await page.waitForTimeout(400);
await shot(page, 'mock-wallet-max-over-limit', [1440, 390], 'mock fixture; no request sent');
await page.click('[data-testid="balance-fill-25"]');
await page.waitForTimeout(400);
await liveQuote(page);
await shot(page, 'mock-wallet-25pct-range-cap', [1440, 390], 'mock fixture balance; quote from real RPC');
await page.evaluate(async () => { await window.__robexWallet.switchChain(46600); });
await page.waitForTimeout(500);
await shot(page, 'mock-wallet-wrong-network', [1440, 390], 'mock wallet switchChain(46600); buttons hidden');

fs.writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify(results, null, 2));
await browser.close();
const bad = results.filter((r) => r.scrollWidth > r.clientWidth || r.leafOverflow > 0);
console.log(`shots=${results.length} overflow=${bad.length}`);
if (bad.length) { console.log(JSON.stringify(bad, null, 2)); process.exit(1); }
