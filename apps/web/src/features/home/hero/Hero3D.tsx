import React, { useEffect, useRef, useState } from 'react';
import { StaticHero } from '../sections/StaticHero.js';
import './hero.css';

interface Hero3DProps {
  onLaunchSwap: () => void;
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function Hero3D({ onLaunchSwap }: Hero3DProps) {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [reduceMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  const [glOK] = useState(() => typeof window !== 'undefined' && hasWebGL());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!glOK || !canvasRef.current || !rootRef.current) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    import('./heroScene.js')
      .then(({ mountHeroScene }) => {
        if (cancelled || !canvasRef.current || !rootRef.current) return;
        cleanup = mountHeroScene({
          canvas: canvasRef.current,
          trigger: rootRef.current,
          copy: copyRef.current,
          hint: hintRef.current,
          reduceMotion,
        });
        setReady(true);
      })
      .catch(() => setReady(false));
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [glOK, reduceMotion]);

  // Reduced motion or no WebGL: use the existing static hero as the fallback.
  if (reduceMotion || !glOK) return <StaticHero onLaunchSwap={onLaunchSwap} />;

  const cls = ['rx-hero', reduceMotion ? 'rx-hero--static' : '', glOK ? '' : 'rx-hero--nogl', ready ? 'is-ready' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <section ref={rootRef} className={cls} aria-label="Robex introduction">
      <div className="rx-hero__inner">
        {glOK && <canvas ref={canvasRef} className="rx-hero__canvas" aria-hidden="true" />}
        <div className="rx-hero__fallback" aria-hidden="true" />
        <div ref={copyRef} className="rx-hero__copy">
          <div className="rx-hero__eyebrow rx-reveal">Non-custodial · Robinhood Chain Testnet</div>
          <h1 className="rx-hero__title">
            <span className="rx-reveal">Trade on-chain.</span>
            <span className="rx-reveal"><em>Keep your keys.</em></span>
          </h1>
          <p className="rx-hero__lead rx-reveal">
            Designed for swap and liquidity from your own wallet. No custody, no sign-ups.
          </p>
          <div className="rx-hero__actions rx-reveal">
            <button type="button" className="btn btn-primary rx-hero__cta" onClick={onLaunchSwap}>
              Launch Swap <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
        {!reduceMotion && (
          <div ref={hintRef} className="rx-hero__hint" aria-hidden="true">Scroll</div>
        )}
      </div>
    </section>
  );
}
