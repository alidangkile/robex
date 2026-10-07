import React, { Suspense, lazy } from 'react';
import type { NavTab } from '../../components/Header.js';
import { useWallet } from '../../wallet/wallet-context.js';
import { StaticHero } from './sections/StaticHero.js';
import { MarketsStrip } from './sections/MarketsStrip.js';
import { FeatureBlocks } from './sections/FeatureBlocks.js';
import { TrustSection } from './sections/TrustSection.js';
import { ConnectCta } from './sections/ConnectCta.js';
import { ConnectedHome } from './sections/ConnectedHome.js';
import { HomeFooter } from './sections/HomeFooter.js';
import './home.css';

const Hero3D = lazy(() => import('./hero/Hero3D.js'));

interface HomePageProps {
  onNavigate: (tab: NavTab) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { state, account } = useWallet();
  const hasAccount =
    !!account && (state === 'CONNECTED' || state === 'WRONG_NETWORK' || state === 'UNSUPPORTED_NETWORK');

  return (
    <div className="rx-home">
      {hasAccount ? (
        <>
          <ConnectedHome onNavigate={onNavigate} />
          {state !== 'CONNECTED' && <ConnectCta compact />}
        </>
      ) : (
        <>
          <Suspense fallback={<StaticHero onLaunchSwap={() => onNavigate('swap')} />}>
            <Hero3D onLaunchSwap={() => onNavigate('swap')} />
          </Suspense>
          <MarketsStrip />
          <FeatureBlocks onNavigate={onNavigate} />
          <TrustSection />
          <ConnectCta />
        </>
      )}
      <HomeFooter />
    </div>
  );
}
