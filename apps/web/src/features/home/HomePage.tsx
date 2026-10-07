import React, { Suspense, lazy } from 'react';
import type { NavTab } from '../../components/Header.js';
import { useWallet } from '../../wallet/wallet-context.js';
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
  const { state } = useWallet();
  const connected = state === 'CONNECTED';

  return (
    <div className="rx-home">
      <Suspense fallback={<div className="rx-hero-placeholder rx-hero-placeholder-full" />}>
        <Hero3D onLaunchSwap={() => onNavigate('swap')} />
      </Suspense>
      <div className="rx-home-body">
        {connected ? (
          <ConnectedHome onNavigate={onNavigate} />
        ) : (
          <>
            <MarketsStrip />
            <FeatureBlocks onNavigate={onNavigate} />
            <TrustSection />
            <ConnectCta />
          </>
        )}
        <HomeFooter />
      </div>
    </div>
  );
}
