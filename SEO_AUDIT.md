# Laska On-Page SEO + Conversion Audit

**Site:** playlaska.com — niche board-game site (online play + Lasker heritage content).
**Strategic frame:** search demand for "Lasca/Laska" is small but high-intent. The game is
(1) own 100% of existing rules/Lasker demand, (2) use heritage content as link-earning assets.
Pure on-page tweaks won't manufacture demand — crawlability + the cornerstone "how to play"
page are the leverage points.

**Owner:** `seo-discoverability-engineer` agent owns Phase 0/1/5, the static `<head>`, routing,
robots/sitemap, and Core Web Vitals.

**Priority key:** 🔴 P0 = blocks ranking/indexing · 🟠 P1 = high leverage · 🟡 P2 = polish/long-tail
**Status:** `[ ]` todo · `[~]` partial · `[x]` done

---

## Phase 0 — Crawlability & indexing (site-wide)
*The real bottleneck. Until these pass, everything below is invisible to crawlers.*

- [ ] 🔴 Every meaningful view has a **unique, server-rendered URL** (`/play`, `/learn/how-to-play-lasca`, `/history/moscow-1996`, `/openings/hague`). **CURRENT: all views live at `/` via `useState` in App.tsx:152 — this is the flagship gap.**
- [ ] 🔴 Critical content is in the **prerendered/SSG HTML**, not painted by JS (verify with `curl`, not DevTools). SSG spike (react-router + vite-react-ssg) PASSED — needs landing.
- [x] 🔴 `robots.txt` present (web/public/robots.txt) — verify it points to sitemap and doesn't block JS/CSS.
- [x] 🔴 `sitemap.xml` present (web/public/sitemap.xml) — must list every canonical URL once routes exist.
- [~] 🔴 Self-referencing `<link rel="canonical">` per page. CURRENT: single canonical to `/` only (all routes share homepage head).
- [x] 🟠 Google Search Console verified (meta tag present in index.html).
- [ ] 🟠 Confirm no `noindex` / `X-Robots-Tag` on prod.

## Phase 1 — Title tags
- [~] 🔴 Unique `<title>` per page, keyword first, ~50–60 chars. CURRENT: one global title only.
  - Home: `Laska — Play Lasca Online (Lasker's Game)`
  - Learn: `How to Play Lasca — Rules & Strategy`
  - History: `Emanuel Lasker's Laska Games — Annotated Replays`
- [ ] 🔴 Brand at end on inner pages, front only on home.
- [ ] 🟡 Cover both spellings — **"Lasca" and "Laska"** — across the site (already in description/JSON-LD).

## Phase 2 — Meta descriptions
- [~] 🟠 Unique per page, 140–160 chars, ad-copy voice. CURRENT: one strong global description.
- [ ] 🟠 Front-load keyword + implicit CTA per route.

## Phase 3 — Heading structure
- [ ] 🔴 Exactly one `<h1>` per page with the primary keyword matching intent.
- [ ] 🟠 Logical h2/h3 nesting, no skipped levels, no styling-only headings.
- [ ] 🟠 Rules/tutorial headings mirror queries: "How pieces move", "How capturing works", "How to win".

## Phase 4 — Content quality & keyword placement
*Highest long-term leverage — own an under-served niche.*

- [ ] 🔴 **Cornerstone "How to play Lasca" page** — complete rules, board, win condition. Highest-value SEO asset. (TUTORIAL.md / LessonsPage exist — needs a crawlable canonical rules URL.)
- [ ] 🟠 Keyword in H1, first 100 words, one H2, image alt, URL slug — naturally, once each.
- [~] 🟠 Heritage/Lasker content as moat + link bait (Moscow 1996 shipped, Lasker bio). Needs indexable URLs.
- [ ] 🟡 FAQ block ("Is Lasca the same as checkers?", "Who invented Lasca?") → People-Also-Ask + FAQ schema.
- [ ] 🟡 Surface opening-book data (Hague opening, Wing gambit) as crawlable long-tail pages.

## Phase 5 — Structured data (JSON-LD)
- [x] 🟠 `VideoGame` + `Organization` (Northbound) + `WebSite` schema in index.html.
- [ ] 🟠 `FAQPage` schema on rules page.
- [ ] 🟡 `BreadcrumbList` on history/openings sections.
- [ ] 🟡 Validate every page in Google Rich Results Test.

## Phase 6 — Internal linking
- [ ] 🟠 Home links the 3 pillars (Play, Learn, History) with descriptive anchors.
- [ ] 🟠 Cornerstone rules page linked from every page (nav/footer).
- [ ] 🟠 Cross-link openings ↔ historic games ↔ tutorial.
- [ ] 🟡 No orphan pages; every URL ≤3 clicks from home.

## Phase 7 — Image optimization
- [ ] 🟠 Descriptive `alt` on board diagrams (not "image1").
- [ ] 🟠 Serve WebP/AVIF, sized correctly, lazy-load below-fold.
- [x] 🟠 OG image present (young-emanuel-lasker.png) — consider per-page board renders (1200×630).
- [ ] 🟡 Descriptive filenames.

## Phase 8 — Page layout & CTA placement (conversion)
- [ ] 🔴 One primary CTA above the fold on home: **"Play now"**, no signup wall.
- [ ] 🟠 Rules/tutorial page ends with "Now play the AI" CTA.
- [ ] 🟠 Hero states *what Laska is* in one line (most visitors don't know the category).
- [ ] 🟡 Repeat play CTA after long content blocks.

## Phase 9 — Mobile UX & Core Web Vitals
- [ ] 🔴 Board fully playable on mobile (tap targets ≥44px, no h-scroll, no hover-only).
- [ ] 🔴 LCP < 2.5s — hero/board must not wait on full JS bundle.
- [ ] 🟠 CLS < 0.1 — reserve board space.
- [ ] 🟠 `font-display: swap` (present in font URL) + preload display face.
- [ ] 🟡 Sticky/reachable mobile CTA.

---

## Working order (by impact, not top-to-bottom)
1. **Phase 0** — land routing + SSG prerender. Nothing else matters until indexable.
2. **Phase 4 cornerstone "How to play Lasca" page** + its title/H1/schema.
3. **Phase 8 home CTA + Phase 9 mobile/CWV.**
4. Heritage/openings content (Phases 4–6) — moat + long-tail.
5. Meta descriptions, images, polish (Phases 2, 7).
