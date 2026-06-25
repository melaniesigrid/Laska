# Mobile design-polish pass (from /ios-design-review, 2026-06-24)

Durable record of the iOS design review and the follow-up fixes, so this can be
continued in a fresh session. Full review + screenshots:
`~/.gstack/projects/melaniesigrid-Laska/ios-design-review-20260624/`.

## Context

After the neumorphic redesign (real dual-shadow `boxShadow`, Fraunces + Hanken
Grotesk fonts, 6-palette system, rebuilt SVG board), a device review on the
iPhone 16 Pro simulator scored **~6.9/10**. The board and neumorphism are
excellent; the gaps were polish + accessibility. Four fixes were approved.

Reproduce the review: build with `npx expo run:ios`, then
`xcrun simctl io booted screenshot out.png`. Navigation on the sim needs macOS
Accessibility permission granted to the host app (synthetic clicks via
`osascript … click at {x,y}`), because this is an Expo/RN app with no native
DebugBridge daemon for `/ios-qa` to drive.

## The four fixes

| # | Fix | Files | Status |
|---|-----|-------|--------|
| 1 | Real tab-bar icons (replace placeholder ▼ triangles) + friendly back label | `src/components/TabIcon.tsx` (new), `src/navigation/index.tsx` | ✅ verified on device |
| 2 | Ghost-button affordance — shallow inset slot so the 48pt target is discoverable | `src/components/Button.tsx` | ✅ verified on device |
| 3 | Muted-text / btn-ink contrast to WCAG AA 4.5:1 across all 6 palettes | `src/theme/tokens.ts` | ✅ applied (5/6 AA-small; chocolate caveat below) |
| 4 | Board move/selection animation (settle, no teleport) | `src/components/Board.tsx`, `hooks/useGame.ts`, `screens/GameScreen.tsx` | ✅ wired (RN Animated glide; verify motion live) |

**Verified 2026-06-24** on iPhone 16 Pro sim (Stone + Dark). Screenshots `05-after-playmenu.png`, `06-board-dark.png` in the gstack project dir. Typecheck green, headless iOS bundle clean.

### Done — exact values applied
- **Fix 1:** `TabIcon.tsx` draws play (coin), online (globe), profile (user) in react-native-svg; wired via `tabBarIcon` + `TAB_ICON` map in `navigation/index.tsx`; PlayMenu `title:'Menu'` so the Game back button reads "Menu".
- **Fix 2:** ghost resting state → `inset(palette, 2.5)` (shallow recessed slot), press → deeper inset. `styles.ghost` removed.
- **Fix 3 (per-palette muted, computed for AA 4.5:1):** stone `#7a7363→#6a6456`; light/classic `#9a6354→#744b3f` (muted+btnInk); dark `#9a9082` and navy `#a9bdd7` already pass (kept). **Chocolate**: ground deepened `#9a6c45→#845d3b` (backdrop→`#7a5435`) so primary 5.20:1 + btnInk 4.57:1 pass AA-small; muted `#ead9bf` is AA-large only — a mid-brown ground can't carry a visually-dimmer muted at AA-small. **Classic bonus fix:** its navy `backdrop` + dark-clay `text` made screen titles invisible (dark-on-dark); backdrop set to the clay ground. The navy-page flourish is dropped on mobile — to restore it, add a per-surface text token (separate `text` for backdrop vs. ground).
- **Fix 4:** `useGame` now tracks `lastMove` (set in `apply` + the AI move; cleared on reset); `GameScreen` passes it to `Board`. `Board` glides the landed column from origin→destination over 240ms (`Animated.ValueXY` + `Animated.createAnimatedComponent(G)`, `useNativeDriver:false` since SVG can't use the native driver). No-op when `lastMove` is null.

### Follow-ups not in this pass (for a future session)
- VoiceOver audit + largest Dynamic Type test (dim 6 still ~6/10).
- Chocolate muted is AA-large only; revisit if chocolate becomes a primary theme.
- Classic could get a distinct identity (currently ≈ Light after the backdrop fix).
- Selection-lift micro-animation (web lifts the selected column 3px) not ported — only the move glide is.

### Fix 1 — tab icons
The bottom tabs render react-navigation's default ▼ placeholder because no
`tabBarIcon` is set. `@expo/vector-icons` is NOT installed; to avoid a new dep
we hand-draw lucide-style line icons with `react-native-svg` (already a dep):
- Play → a checker coin (circle + center pip) — on-theme for Laska columns.
- Online → globe (circle + meridian ellipse + equator line).
- Profile → user (head circle + shoulders arc).
Wire via `tabBarIcon: ({color,size}) => <TabIcon name=… color size />`. Also set
the Play stack's back title to "Menu" (was the raw route name "PlayMenu").

### Fix 2 — ghost affordance
Ghost buttons (unselected difficulty/theme, Resign, Sign out) render as bare
text in wide gaps — the tap target isn't discoverable (live taps repeatedly
missed them). DESIGN.md forbids hard borders, so use a SHALLOW inset
(`inset(palette, 2-3)`) for the ghost resting state — reads as a recessed slot,
on-brand. Pressed state deepens.

### Fix 3 — contrast
`textMuted` on `ground` fails AA (Stone `#7a7363` on `#e8e4db` ≈ 3.3:1; need
4.5:1). Recompute per palette and darken (light themes) / lighten (dark themes)
`textMuted` and `btnInk` until ≥4.5:1. A WCAG contrast helper was used to pick
values — see commit. Verify all 6 palettes.

### Fix 4 — board animation
Pieces teleport on move. `Board.tsx` already receives `lastMove {from,to}`
(online play passes it; local `useGame` does not yet — add it there if local
animation is wanted). Animate the moved column sliding from
`pos(from)-pos(to)` → 0 over ~240ms with RN `Animated` + an
`Animated.createAnimatedComponent(G)` translate. Keep it guarded: captures
remove coins, so only animate the surviving moved column; fall back to no-op if
`lastMove` is null. (Reanimated is installed but has no babel plugin wired, so
use core `Animated` to avoid adding `babel.config.js`.)

## Verify after each fix
`npx tsc --noEmit` (must stay green), then `npx expo export -p ios --output-dir
/tmp/check` for a headless bundle sanity check, then re-screenshot the affected
screen on the sim.
