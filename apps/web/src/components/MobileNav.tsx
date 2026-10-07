import React from 'react';
import type { NavTab } from './Header.js';

interface MobileNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export function MobileNav({ activeTab, onSelectTab }: MobileNavProps) {
  const tabs: { id: NavTab; label: string; icon: string }[] = [
    { id: 'home', label: 'Home', icon: '⌂' },
    { id: 'swap', label: 'Swap', icon: '⇄' },
    { id: 'pool', label: 'Pool', icon: '◎' },
    { id: 'earn', label: 'Earn', icon: '↗' },
    { id: 'portfolio', label: 'Portfolio', icon: '◫' },
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
          <span style={{ fontSize: '18px', lineHeight: 1 }}>{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
