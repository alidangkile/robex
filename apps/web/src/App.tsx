import React, { useState } from 'react';
import { Header, type NavTab } from './components/Header.js';
import { MobileNav } from './components/MobileNav.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { WalletProvider } from './wallet/wallet-context.js';
import { HomePage } from './features/home/HomePage.js';
import { SwapPage } from './features/swap/SwapPage.js';
import { PoolPage } from './features/pool/PoolPage.js';
import { EarnPage } from './features/earn/EarnPage.js';
import { PortfolioPage } from './features/portfolio/PortfolioPage.js';

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('home');

  return (
    <ErrorBoundary>
      <WalletProvider>
        <div className="app-container">
          <Header activeTab={activeTab} onSelectTab={setActiveTab} />
          <main className="main-content">
            {activeTab === 'home' && <HomePage onNavigate={setActiveTab} />}
            {activeTab === 'swap' && <SwapPage />}
            {activeTab === 'pool' && <PoolPage />}
            {activeTab === 'earn' && <EarnPage />}
            {activeTab === 'portfolio' && <PortfolioPage />}
          </main>
          <MobileNav activeTab={activeTab} onSelectTab={setActiveTab} />
        </div>
      </WalletProvider>
    </ErrorBoundary>
  );
}
