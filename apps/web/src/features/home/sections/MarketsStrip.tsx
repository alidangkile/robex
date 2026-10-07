import React from 'react';
import { EXAMPLE_DATA_LABEL, EXAMPLE_MARKETS } from './exampleData.js';
import { TokenDot } from './TokenDot.js';

export function MarketsStrip() {
  return (
    <section className="rx-section" id="markets" aria-labelledby="rx-markets-title">
      <div className="rx-sh">
        <h2 id="rx-markets-title">Explore Robinhood Chain</h2>
        <span className="rx-tag" data-testid="example-data-label">{EXAMPLE_DATA_LABEL}</span>
      </div>
      <div className="rx-market">
        {EXAMPLE_MARKETS.map((m) => (
          <div className="rx-mk" key={m.pair}>
            <div className="rx-pair">
              <span className="rx-dots"><TokenDot {...m.base} /><TokenDot {...m.quote} /></span>
              {m.pair}
            </div>
            <div className="rx-px num">{m.price}</div>
            <div className="rx-row"><span>{m.metricLabel}</span><span className={`num rx-${m.trend}`}>{m.metric}</span></div>
            <div className="rx-row"><span>TVL</span><span className="num">{m.tvl}</span></div>
          </div>
        ))}
      </div>
    </section>
  );
}
