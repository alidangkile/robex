import { parseAndValidateEnv, getActiveNetworkConfig } from '@robex/config';
import { createApp } from './app.js';

const env = parseAndValidateEnv();
const activeNetwork = getActiveNetworkConfig();
const app = createApp();

app.listen(env.apiPort, env.apiHost, () => {
  console.log(`[robex-api] Server listening on http://${env.apiHost}:${env.apiPort}`);
  console.log(`[robex-api] Active network: ${activeNetwork.chainName} (Chain ID: ${activeNetwork.chainId})`);
});
