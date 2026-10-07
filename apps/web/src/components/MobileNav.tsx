import React from 'react';
import type { NavTab } from './Header.js';
import { EarnIcon, PoolIcon, PortfolioIcon, SwapIcon } from './icons.js';

interface MobileNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export function MobileNav({ activeTab, onSelectTab }: MobileNavProps) {
  const tabs: { id: NavTab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: 'swap', label: 'Swap', icon: SwapIcon },
    { id: 'pool', label: 'Pool', icon: PoolIcon },
    { id: 'earn', label: 'Earn', icon: EarnIcon },
    { id: 'portfolio', label: 'Portfolio', icon: PortfolioIcon },
  ];

  return (
    <nav className="mobile-nav" aria-label="Mobile Navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`mobile-nav-link ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onSelectTab(tab.id)}
          aria-current={activeTab === tab.id ? 'page' : undefined}
        >
          <span className="mobile-nav-icon">
            <tab.icon size={20} />
          </span>
          <span className="mobile-nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
