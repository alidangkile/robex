# 3D Hero Verification (feat/home-3d-hero-v2)

Base: origin/main @ 200a4e9 (PR #7 merged). Hero ported from df7b960 (feat/ui-refresh).
State: Disconnected. Server: `vite preview` (production build). Browser: Chromium headless, SwiftShader WebGL.

## Checks
- typecheck: pass · lint: pass · test: 64/64 pass (10 files; wallet/network tests unchanged) · build: pass

## Bundle (gzip)
| chunk | size | gzip | loaded |
|---|---|---|---|
| index.js | 195.94 kB | 60.07 kB | always |
| Hero3D.js | 2.15 kB | 0.97 kB | Home only (React.lazy) |
| Hero3D.css | 2.33 kB | 0.97 kB | Home only |
| heroScene.js (three + gsap) | 637.20 kB | 175.17 kB | Home, WebGL + motion only |

## Overflow (scrollWidth <= innerWidth)
| viewport | hero | top | mid-scroll | result |
|---|---|---|---|---|
| 1440x900 | 3D (canvas) | 1440 | 1440 | PASS |
| 1024x768 | 3D (canvas) | 1024 | 1024 | PASS |
| 768x1024 | 3D (canvas) | 768 | 768 | PASS |
| 375x812 | 3D (canvas) | 375 | 375 | PASS |
| 1440x900 reduced-motion | StaticHero (no canvas) | 1440 | — | PASS |

No page errors logged.

## Fallbacks
- Suspense fallback while Hero3D chunk loads: StaticHero.
- prefers-reduced-motion or no WebGL: StaticHero; three/gsap never downloaded.

## Screenshots
ui-hero3d-{1440,1024,768,375}-{top,mid}.png, ui-hero3d-1440-reduced-motion.png
