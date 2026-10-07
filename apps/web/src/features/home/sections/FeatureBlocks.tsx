import React from 'react';
import type { NavTab } from '../../../components/Header.js';
import { EarnIcon, PoolIcon, SwapIcon } from '../../../components/icons.js';
import { TokenDot } from './TokenDot.js';

export function FeatureBlocks({ onNavigate }: { onNavigate: (tab: NavTab) => void }) {
  return (
    <section className="rx-section" aria-labelledby="rx-feat-title">
      <div className="rx-sh">
        <h2 id="rx-feat-title">One clear action.<br />Depth when you need it.</h2>
        <p>Swap is the first step. Liquidity and yield are planned, with risks meant to stay visible.</p>
      </div>
      <div className="rx-feat">
        <div className="rx-fb rx-fb-big">
          <div className="rx-ico"><SwapIcon /></div>
          <h3>Swap</h3>
          <p>Designed to show the route, minimum received and price impact before you sign.</p>
          <div className="rx-swapcard" aria-label="Sample swap (example data)">
            <span className="rx-tag rx-tag-inline">EXAMPLE QUOTE · NOT LIVE</span>
            <div className="rx-field"><div><small>You pay</small><b className="num">1.00</b></div><span className="rx-tok"><TokenDot sym="ETH" color="#9AA8FF" />ETH</span></div>
            <div className="rx-flip" aria-hidden="true">↓</div>
            <div className="rx-field"><div><small>You receive (est.)</small><b className="num">3,401.85</b></div><span className="rx-tok"><TokenDot sym="USD" color="#7FD8C9" />USDC</span></div>
            <div className="rx-quote"><span>Price impact</span><span className="num rx-up">0.08%</span></div>
            <div className="rx-quote"><span>Min. received (0.5% slippage)</span><span className="num">3,384.84 USDC</span></div>
            <button className="btn btn-primary rx-btn-block" onClick={() => onNavigate('swap')}>Go to Swap</button>
          </div>
        </div>
        <div className="rx-fb">
          <div className="rx-ico"><PoolIcon /></div>
          <h3>Pool</h3>
          <p>Planned support for full-range and concentrated liquidity, including share, fees and impermanent-loss risk.</p>
          <button className="btn btn-secondary" onClick={() => onNavigate('pool')}>Explore Pools</button>
        </div>
        <div className="rx-fb">
          <div className="rx-ico"><EarnIcon /></div>
          <h3>Earn</h3>
          <p>Yield is planned. APR, its source and lock terms will be shown as estimates when staking is enabled.</p>
          <button className="btn btn-secondary" onClick={() => onNavigate('earn')}>View Earn</button>
        </div>
      </div>
    </section>
  );
}
