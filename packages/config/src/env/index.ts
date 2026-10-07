export interface RobexEnvConfig {
  nodeEnv: 'development' | 'test' | 'production';
  robexEnv: 'testnet' | 'mainnet';
  apiPort: number;
  apiHost: string;
  defaultChainId: number;
}

export function parseAndValidateEnv(env: Record<string, string | undefined> = process.env): RobexEnvConfig {
  const nodeEnv = (env.NODE_ENV || 'development') as 'development' | 'test' | 'production';
  const robexEnv = (env.ROBEX_ENV || 'testnet') as 'testnet' | 'mainnet';
  const apiPort = env.API_PORT ? parseInt(env.API_PORT, 10) : 3001;
  const apiHost = env.API_HOST || '127.0.0.1';
  const defaultChainId = env.VITE_DEFAULT_CHAIN_ID
    ? parseInt(env.VITE_DEFAULT_CHAIN_ID, 10)
    : 46630;

  if (isNaN(apiPort) || apiPort <= 0 || apiPort > 65535) {
    throw new Error(`Invalid API_PORT configuration: ${env.API_PORT}`);
  }

  if (isNaN(defaultChainId)) {
    throw new Error(`Invalid defaultChainId configuration: ${env.VITE_DEFAULT_CHAIN_ID}`);
  }

  return {
    nodeEnv,
    robexEnv,
    apiPort,
    apiHost,
    defaultChainId,
  };
}
