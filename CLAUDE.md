# XPortl · Project Notes for Claude

AR social network PWA preparing for angel-investor pitch.

---

## Stack (brief)

React 19 · Vite 6 · Supabase · A-Frame + AR.js · vite-plugin-pwa · Vercel.
Multi-entry: `/` (marketing LP, `index.html`) · `/app` (React app, `app.html`) · `/godmode` (admin).
Styles: inline JSX style objects (not Tailwind). LP uses Instrument Serif + Geist + JetBrains Mono.

Supabase schema lives in `migration_*.sql` files at repo root (not in `supabase/migrations/`). Apply via Supabase Dashboard SQL Editor — there is no Supabase CLI / linked project.

## Deployment

Primary domain: `https://xportl.com/` (apex, NO www — `www.xportl.com` 308-redirects to apex). Auto-deploy from `main` branch on Vercel.

Before finishing any code change, ALWAYS: `npm run lint`, `npm run build`, then commit + push. Vercel handles the rest. The user has a standing rule about this in auto-memory.

## CSP

- `index.html` (LP): strict — `script-src 'self' 'unsafe-inline'`. No external CDN except Google Fonts.
- `app.html` (PWA): permissive — has `unsafe-eval` (A-Frame, TFJS, NSFW.js), allows aframe.io, unpkg, jsdelivr, supabase.

## Debugging on mobile

`https://xportl.com/app?debug=1` activates Eruda (in-app mobile console). Persisted via sessionStorage. `?debug=0` clears. Pre-filters console to "XPortl" logs. Code-split so production traffic never loads it.

Log namespaces in use:
- `[XPortl Scan]` — nearby capsule discovery (App.jsx)
- `[XPortl Publish]` — capsule creation flow (App.jsx handleLeaveTrace)
- `[XPortl GPS]` — geolocation fix events (useGeolocation.js)
- `[XPortl Place]` — smart placement math (App.jsx smartPlaceCoord)
- `[XPortl Vitals]` — web-vitals metric capture (dev only)
- `[XPortl Debug]` — Eruda bootstrap

## Key architectural rules (hard constraints)

1. **Capsules render ONLY at real GPS coordinates** — never at synthetic screen positions. ARScene consumes lat/lng straight from the capsule row. Do not add "fake" fallbacks that show capsules before a GPS fix lands.
2. **AR camera uses `videoTexture: false`** + native `<video>` element with `object-fit: cover`. Do NOT switch to WebGL texture binding — we lose native HEIF/HDR and sharpness.
3. **Capsule GPS guard on publish** — 8s retry window (App.jsx:waitForGpsFix). If still no fix, block with clear message. Never publish at a stale/null coordinate.
4. **Locked capsules excluded from "N portais" badge** — NearbyOverlay filters with `isCapsuleLocked(c)` (services/capsules).

## Supabase tables (read-only summary — confirm in SQL editor if critical)

- `capsules` — moderation_status field; only `null | 'active'` renders.
- `user_profiles` — has `xp` for level calc; ECA minor restrictions computed client-side from profile.
- `error_events` — client error ingest (RLS: anon INSERT, no public SELECT).
- `web_vitals_events` — real-user LCP/CLS/INP/FCP/TTFB (same RLS pattern, **migration 006 applied 2026-04-21**).
- RPCs: `get_nearby_capsules(lat, lng, radius_m)` with Haversine, `check_rate_limit`, `check_restricted_zone`.

## Open issues / WIP (as of 2026-04-23)

### ✅ RESOLVED — capsules not appearing at home
Root cause: GPS watcher was never re-armed on reload. Fix in commit d974adb (2026-04-21).

### ✅ RESOLVED — empório publish GPS error
Fix in commit 2627f33 (2026-04-21): 8s polling window + hint + error differentiation.

### ✅ RESOLVED — a11y + dead links (commit 887e66f, 2026-04-23)
Live QA battery found and fixed:
- LP footer pointed to `/TERMOS_DE_USO.md` and `/POLITICA_DE_PRIVACIDADE.md` (dead `.md` links) → now `/termos` and `/privacidade`.
- `aria-hidden="true"` on nav `.links` (focusable children) → removed.
- `--paper-40` contrast `rgba(244,239,230,0.40)` → `0.56` (fixes WCAG AA on 21 elements).
- Step section `<h4>` → `<h3>` (fixes heading-order after `<h2>`).
- `user-scalable=no` removed from `app.html` viewport meta.
- `role="main"` added to `#root` in `app.html` (landmark for axe).

### SEO — complete, awaiting signals
- Google Search Console verified (`xportl.com` apex). Sitemap submitted, 3 URLs discovered, priority indexing requested 2026-04-21.
- FAQPage schema validated via Rich Results Test — 6 Q&A eligible for rich results.
- Web-vitals table live but **no field data yet**. User should visit site to seed first metrics. Query: `select metric_name, value, rating from web_vitals_events order by captured_at desc limit 20;`
- **Bing Webmaster Tools**: not yet imported. Low priority (~3% BR search share). Prompt was prepared but not executed.

### Live QA baseline (2026-04-23, post-fix)
- Lighthouse Core Web Vitals mobile: LCP 0.5s · FCP 0.5s · CLS 0 · TBT 0ms (100/100)
- Lighthouse SEO: 100
- Lighthouse a11y `/`: 92 pre-fix → expected ~98-100 post-fix
- Console errors on `/`, `/app`, `/termos`, `/privacidade`, `/p/:id`: **0**
- Share preview `/p/:id` verified via crawler UA (curl): 200 + proper og/twitter tags. Playwright shows login because PWA SW intercepts — crawlers bypass SW, so it works in the wild.

### Deferred (post-pitch)
- `migration_016_notifications.sql`
- Rate-limit on `user_events` / `web_vitals_events` / `error_events`
- Cascade delete in `requestAccountDeletion`
- Clean `sitemap.xml` (remove dead refs)
- RLS on `restricted_zones`
- Remove `EMERGENCY_LOGIN_SECRET` from Vercel env

## Branding notes (for the pitch)

Tone: field-journal editorial / indie-luxury. NOT generic SaaS landing page. Serif headlines, monospace meta-text, cyan + plum + ember palette. The LP avoids fake metrics ("10K users!") — all copy is honest about early-access status.

## What the user does NOT want (learned from feedback)

- Don't render capsules at fake screen positions — only real GPS.
- Don't rebuild AR camera with WebGL videoTexture — native video element is the choice.
- Don't skip the commit+push+deploy cycle after a code change.
- Don't add `aggregateRating` to schema until there are real ratings (schema manipulation penalty).

## Quick commands

```bash
npm run dev                    # vite dev server
npm run build                  # production build
npm run lint                   # ESLint on src/
npm run og:generate            # regen public/og-image.png from SVG
```

## Auto-memory location

More detailed context in `C:\Users\bibla\.claude\projects\C--Users-bibla-Desktop-Projetos-xplore\memory\MEMORY.md`.
