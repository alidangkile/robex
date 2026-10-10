# Home 3D Hero Scroll-Gap Fix Verification (fix/home-hero-scroll-gap)

Base: origin/main @ 21b7255. Server: `vite preview` (production build). Browser: Chromium headless, SwiftShader WebGL. State: Disconnected.

## Problem
The hero was pinned for 260vh (160vh of scroll). The headline/CTA faded out completely between 70% and 100% of the pin, and the hero then
scrolled away for another full viewport with only the sphere on the right, which left a long empty band on the left side.

## Change (hero.css, heroScene.ts only)
- Pin height 260vh -> 150vh desktop, 140vh mobile (<860px), i.e. 50vh / 40vh of pinned scroll instead of 160vh.
- Morph + camera push-in finish at 85% of the pin (`power1.inOut`), so the end state is reached before unpinning.
- Copy stays at full opacity until 85%, then eases back to opacity 0.6 / y -24px; it never disappears, so it scrolls away together with the sphere.
- ScrollTrigger scrub 1 -> 0.6 (less lag on a shorter pin).
- Unchanged: reduced-motion / no-WebGL StaticHero fallback, mobile geometry/pixel-ratio settings, cleanup, Hero3D.tsx.

## Measurements
| viewport | hero height (before -> after) | pinned scroll (before -> after) | copy opacity top/mid/end/after-hero | overflow (scrollWidth <= innerWidth) |
|---|---|---|---|---|
| 1440x900 | 2340 -> 1350 px | 1440 -> 450 px | 1 / 1 / 0.6 / 0.6 | PASS (1440) |
| 1024x768 | 1997 -> 1152 px | 1229 -> 384 px | 1 / 1 / 0.6 / 0.6 | PASS (1024) |
| 768x1024 | 2662 -> 1434 px | 1638 -> 410 px | 1 / 1 / 0.6 / 0.6 | PASS (768) |
| 375x812 | 2111 -> 1137 px | 1299 -> 325 px | 1 / 1 / 0.6 / 0.6 | PASS (375) |

Before the fix, copy opacity at end/after-hero was 0 on every viewport. Overflow checked at top, mid, end and after-hero on each viewport. No page errors.

## Checks
typecheck: pass · lint: pass · test: 67/67 pass (10 files) · build: pass (heroScene chunk 175.18 kB gzip, unchanged)

## Screenshots
- ui-hero-gapfix-1440-mid.png: mid-pin, copy + CTA fully visible, sphere morphing.
- ui-hero-gapfix-1440-after.png: just after the hero, copy still visible while the markets strip scrolls in.
- ui-hero-gapfix-375-mid.png: mobile mid-pin.
