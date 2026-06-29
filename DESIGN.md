# Design System — Laska

A **neumorphic** (soft-UI) design system. One cohesive warm-clay palette; every
surface is sculpted from the same two shadows — a cream highlight (top-left) and
a clay shade (bottom-right). Sleek, premium, minimalist — the aim is a Swiss
luxury-spa calm. Reference: `Laska/lasca-soft (1).html`.

> Source of truth. Read this before any visual or UI change.

## Principles
- **One palette, used consistently.** Warm clay family + a single cobalt accent.
  No competing hues. Light and dark are the same family, not different brands.
- **Neumorphism via two shadows.** Raised elements: `Xpx Xpx … var(--dark),
  -Xpx -Xpx … var(--light)`. Recessed elements: the same, `inset`. Never flat
  drop-shadows, never hard borders.
- **Icons:** Lucide-React only. No emoji, no other icon set.
- **Spacing:** precise and generous, never cramped, never wasteful. Use the
  `clamp()` scale; let the board and controls breathe.
- **Responsive:** everything sizes off CSS `clamp()` / `vw` units and reflows.
  Verified desktop / tablet / mobile, light and dark.

## Pages
- **Landing** (`web/src/Landing.tsx`, styles in `landing.css`, scoped under
  `.landing-page`) — ported from `laska.html`. Stone + eucalyptus palette; this
  is the **site default**. Every "Play" CTA enters the game board.
- **Game board** (`web/src/App.tsx` + `Board.tsx`) — a clean **rounded-square**
  neumorphic panel → recessed checker tray → stacked coins (centered in their
  squares), wired to the real engine + AI. The landing hero reuses this same
  board, **playing itself** (engine vs engine), so the demo shows real stacking.
- **Lasker** (`web/src/LaskerPage.tsx`) — heritage biography; scoped landing styles.
- **Brochure / Rules** (`web/src/BrochurePage.tsx`) — the canonical ruleset,
  drawn from Lasker's original 1911 booklet and reconciled with the engine. Holds
  the terminology (Privates/Columns/Officers/Bombs/Leader/Run + modern mapping),
  a numbered board diagram (square N ↔ engine index N−1), capture rules, Lasker's
  strategy notes, the five explanatory games, and the proposition. This is the
  source of truth for what the rules ARE in-app; keep it consistent with
  `src/rules.ts`. Linked from the landing's rules section.
- **Historic game replay** (`web/src/ReplayPage.tsx` + `games.ts`) — steps a real
  recorded game move-by-move on the live `BoardView`, with a game picker. Positions
  come from the *engine* replaying the score (`games.ts` parses each ply and
  `applyMove`s it), never a hand-drawn mock. Ships **three engine-verified games**:
  Moscow 1996, and **Lasker's own 1911 Game 2 & Game 3** (his brochure games, which
  validate move-for-move — primary-source proof the engine is faithful). Adding a
  game = add a `RawGame` to `games.ts`; it must validate through the engine or it's
  a real bug. Linked from the landing, Lasker page, and brochure.

## Color — seven palettes, Navy is the default
**navy** *(default)* — a naval-blue neumorphic surface (`--ground`, `--pedestal`,
and `--plate` all `#182b4d`) with blue and red armies, gold move signals, and a
gold general insignia that reads like rank brass. The other palettes are selected
via `[data-theme]` on `<html>` (cycled by the theme button, persisted to
`laska-theme`); Stone is the bare `:root` (no attribute):
- **stone** (`:root`, the laska.html palette): ground `#e8e4db`, highlight
  `#fbf8f2`, shade `#c4beb1`, light army `#f2ede3`, dark army `#4b463c`,
  eucalyptus accent `#5f8c7e`.
- **dark** — Stone inverted: warm-charcoal neumorphism (ground `#2b2823`), cream
  + taupe armies, eucalyptus accent. The board emerges from the same dark surface.
- **light** — warm clay, cream/rose coins, cobalt accent.
- **chocolate** — one realistic chocolate material: the border (`--ground`)
  matches the board so the whole apparatus is the same clay, raised only by the
  neumorphic shadows; gold accent. (Was the old "dark"; its black border was
  unrealistic, so ground was unified with the board and it was renamed.)
- **twilight** — clay board on a deep navy ground. (Renamed from "classic", which
  did not describe a colour.)
- **confetti** — an original *Two-Dots-inspired* hybrid: clean cool-white ground,
  coral + blueberry armies, a sunny-yellow general star, and flat "candy" chrome
  (the only theme that flattens the chrome; the board stays neumorphic). Ships a
  small `--dot-*` accent set and the SVG dot-mascots (see `mascots.tsx`).
For a neumorphic theme `--ground` should equal `--pedestal`/`--plate` (the board
emerges from the same-colour surface via shadow, never a contrasting border).
All board metrics derive from `--sq` (`clamp(40px,7.4vw,64px)`) at lasca-soft's
exact ratios, so the whole apparatus scales as one unit.

## Typography
- **Display:** `Fraunces` (masthead title, status line, italic captions).
- **Body / UI:** `Hanken Grotesk` (controls, labels, body).
- Loaded from Google Fonts. No system fonts as primary.

## The board
- Structure: `.stage > .pedestal (round, raised) > .board (octagon clip-path,
  raised via drop-shadow) > .field (recessed checker tray, inset shadow) > .sq`.
- Playable squares are the **dark** (inset) squares (`(row+col)` even); non-play
  squares are flat **light** squares.
- Pieces are **stacked coins** (`.disc`), bottom→top, peeking by `--peek`. The
  commander (top) carries **rank pips**: 1 dot = soldier, 2 dots = officer. A
  column taller than 1 shows a count badge.
- Faction colors: White = `--cream`, Black = `--rose`.
- Sizing is all relative to `--sq` (`clamp(38px, 8.4vw, 58px)`), so the whole
  apparatus scales as one unit.

## Piece insignia themes (the rank mark on the commander)
Cosmetic only — they change how rank reads, never the rules. The engine knows
two ranks (`soldier` / `officer`); a theme picks the mark for each. Implemented
in `web/src/pieceTheme.tsx` (a `PieceThemeContext` + an `Insignia` component
using Lucide icons), selected by the top-bar **Pieces** button, persisted to
`localStorage` (`laska-piece-theme`). The same `Insignia` is used by the game
board, the legend swatches, and the landing self-play demo, so they never drift.
- **Heirloom** *(default)* — soldier: one engraved pip · general: an embossed
  **star**. The star is far easier for a first-timer to read at a glance than
  counting two dots; this is the headline win, not just a skin.
- **Lineage** — soldier: a **shield** · general: a **crown**. Nods to Lasker's
  world-champion chess lineage (the heritage wedge).
- **Dots** — the original 1-dot / 2-dot minimal set, kept for accessibility.
- **Deboss recipe (neumorphic):** the mark is *not* a contrasting icon sitting on
  the coin. It is filled in the coin's own tone, a step darker
  (`color-mix(var(--cream)/var(--rose) …)`, so it adapts to every palette), and
  reads as a recess purely from an opposed bevel: a dark `drop-shadow` on the
  top-left edge + a warm — never white — highlight on the bottom-right, lit from
  top-left like the rest of the board. No white/painted-on fills.
- **Not the scrapped theme system:** this is piece-rank insignia, distinct from
  the divergent Terracotta/Heirloom/Newsprint *palette* system that was cut
  (see the 2026-06-21 log entry). Palettes are selected independently via the
  six-palette color-theme cycle.

## Signals (the cobalt accent, used sparingly)
- **Selected** column: cobalt ring on the top coin + a small lift.
- **Legal move** (`.drop-target`): inset cobalt ring on the destination square.
- **Forced capture**: stronger cobalt ring (Laska forces captures).
- **Movable this turn**: faint cobalt inset on the square.

## Components
- **Buttons** (`.btn`): raised neumorphic, uppercase tracked label + Lucide icon;
  press = inset. **Segmented** controls (`.segment`) for mode/opponent.
- **Status** pill: recessed, Fraunces, with a Lucide state icon (turn / win / draw).
- **Selects** (`.neu-select`) and panel inputs: recessed inset.
- **Legend**: soldier/officer coin swatches with pip dots.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-21 | Full pivot to a neumorphic design system; scrapped the WebGL 3D board and the multi-theme (Terracotta/Heirloom/Newsprint) system | Founder direction: a sleek, premium, minimalist soft-UI look (reference `lasca-soft`); the 3D board was disliked. |
| 2026-06-21 | One warm-clay palette + cobalt accent, light/dark only | "Single cohesive palette" — cut the divergent navy "classic" mode from the reference to stay cohesive. |
| 2026-06-21 | Lucide-React as the only icon set; no emoji | Founder instruction. |
| 2026-06-21 | Dropped the separate marketing landing; app opens to the board | Minimalist, single-focus screen matching the reference; Online is a control toggle. |
| 2026-06-21 | CSS `clamp()` responsiveness instead of the reference's JS scaler | Cleaner, adapts to every width without script. |
| 2026-06-22 | Use the `lasca-soft` board verbatim (exact proportions), not a re-interpretation | First remake was cramped (octagon hugged the field); founder wanted the exact reference board. Reproduced lasca-soft's ratios (board/field/pedestal margins) off `--sq`. |
| 2026-06-22 | `laska.html` is the landing page; its stone palette is the site default | Founder direction. Landing → game on any Play CTA; ported scoped under `.landing-page`. |
| 2026-06-22 | Keep all lasca-soft modes (light/dark/classic) alongside Stone default | Founder likes the palettes/modes; theme button cycles all four. |
| 2026-06-22 | Board is a rounded square (dropped octagon clip-path + round pedestal); coins centered in squares | Founder: "normal edges, just a rounded square"; coins were bottom-anchored and read as misaligned. |
| 2026-06-22 | Landing hero board plays itself (engine vs engine, real board) | Founder: "the main page must show the AI playing itself." Reuses BoardView so stacking is shown live. |
| 2026-06-22 | Added a piece-insignia theme system (Heirloom default: star for generals; + Regiment, Lineage, Dots) | Founder direction: themed pieces where generals get a star instead of two dots. Doubles as a first-timer legibility win and a cosmetics line (monetization). Cosmetic only; distinct from the cut palette-theme system. |
| 2026-06-23 | Added Navy as the sixth palette | Founder direction: a navy board/background with blue and red armies and a gold general star; the board remains one continuous neumorphic material. |
| 2026-06-29 | Added a **Profile page** (`ProfilePage.tsx`) — neumorphic identity hub: chosen DotMascot (large, cheers on mount), RankBadge + stats, a 5-colour **mascot picker** (coral/sun/mint/sky/grape), piece-theme + board-palette pickers, and recent games. | Founder direction: "moments of dopamine and delight; gamify; beautiful profile pages with default mascots of different colours to choose." Selecting a mascot is the headline delight beat (pressed-in + accent ring + replaying cheer). Cosmetics are account-backed (`PATCH /me/cosmetics`; `selectedMascotTint`/`selectedPieceTheme`/`selectedBoardTheme` on `PublicUser`) with a localStorage fallback for guests — server value wins on login. Optional streak/achievement slots are pre-built for the retention PRs. |
| 2026-06-22 | Added a Historic-Game replay viewer; shipped Moscow 1996 only, engine-verified | Founder provided three lasca.org game scores. Replay drives the real engine off the recorded score. Moscow 1996 validates end-to-end; the 1976 and Lasker-1911 scores diverge mid-game under our capture rules (likely transcription) — held back rather than ship an unverifiable replay. |
| 2026-06-22 | Dropped the `.disc.top::before` inner ring on top coins; removed the **Regiment** piece theme (chevron soldier + medal general) | Founder: minimalistic look, dislikes chevrons. Themes now Heirloom/Lineage/Dots; a stored `regiment` falls back to Heirloom via `readStoredPieceTheme`. |
