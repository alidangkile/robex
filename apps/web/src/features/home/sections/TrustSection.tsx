import React from 'react';

const ShieldIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></svg>);
const AlertIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>);
const CheckIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 12l3 3 5-6" /></svg>);

const ITEMS = [
  { icon: <ShieldIcon />, title: 'Non-custodial', body: 'Your keys, your assets. Private keys never leave your browser or wallet, and Robex never takes custody of your tokens.' },
  { icon: <AlertIcon />, title: 'Risk in plain words', body: 'Price impact, slippage and approval warnings are designed to be explained before you sign.' },
  { icon: <CheckIcon />, title: 'Transparent on-chain', body: 'Transactions are designed to be verifiable on the explorer. Stock Token multipliers are normalized in one place.' },
];

export function TrustSection() {
  return (
    <section className="rx-section" aria-labelledby="rx-trust-title">
      <div className="rx-sh">
        <h2 id="rx-trust-title">Built for trust,<br />not for hype.</h2>
        <p>Robex never holds your funds. Signing stays in your own wallet.</p>
      </div>
      <div className="rx-trust">
        {ITEMS.map((it) => (
          <div className="rx-tr" key={it.title}>
            <div className="rx-ico">{it.icon}</div>
            <h3>{it.title}</h3>
            <p>{it.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
