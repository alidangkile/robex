import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'apps', 'web', 'dist');
const assetsDir = path.join(distDir, 'assets');

if (!fs.existsSync(distDir)) {
  console.error(`[verify:dist] ERROR: Production build directory does not exist: ${distDir}`);
  console.error('[verify:dist] Run "npm run build" before verifying dist.');
  process.exit(1);
}

if (!fs.existsSync(assetsDir)) {
  console.error(`[verify:dist] ERROR: Assets directory does not exist: ${assetsDir}`);
  process.exit(1);
}

const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
if (jsFiles.length === 0) {
  console.error(`[verify:dist] ERROR: No JavaScript bundle files found in ${assetsDir}`);
  process.exit(1);
}

const PROHIBITED_STRINGS = [
  '0x000000000000000000000000000000000000000000000000000000000000f4ce',
  'DISABLED_IN_PRODUCTION',
  'VITE_ENABLE_MOCK_WALLET',
  '13350000000000000000',
  'FAKE_MOCK',
];

let failed = false;

for (const file of jsFiles) {
  const filePath = path.join(assetsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  for (const needle of PROHIBITED_STRINGS) {
    if (content.includes(needle)) {
      console.error(`[verify:dist] ERROR: Prohibited artifact "${needle}" found in ${file}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error('[verify:dist] Build verification failed: mock wallet artifacts leaked into production bundle.');
  process.exit(1);
}

console.log(`[verify:dist] SUCCESS: All mock wallet artifacts strictly excluded. Checked ${jsFiles.length} JS files.`);
process.exit(0);
