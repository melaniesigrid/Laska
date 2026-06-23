# Laska Strategy — Canonical Reference

> Source material distilled from David Johnson-Davies' Lasca strategy notes
> (johnson-davies.com, © 2011–2018) plus Lasker's own dictum that Lasca is *"a
> game of attack rather than of defence."* This file is the **single source of
> truth** for strategy content across the project: the AI evaluation heuristic
> (`src/ai.ts`), the interactive tutorial (`TUTORIAL.md` / tutorial lessons), and
> the canonical rules brochure (`web/src/BrochurePage.tsx`) should all trace back
> here. Keep terminology consistent with the rules engine: a **column** (a.k.a.
> tower) is a stack; its **commander** is the top piece; everything beneath is
> **buried** (enemy pieces buried = prisoners). A **soldier** moves one way, an
> **officer** (promoted) moves both ways.

## 1. Column strength is positional, not just material

Two columns of equal height are **not** equally strong. Strength depends on:

- **Height** — taller columns have more "lives": each capture only peels the
  commander, exposing the next piece, so a deep column can be attacked several
  times before it is neutralised.
- **Edge vs. centre** — a strong/tall column is **safer near the edge**, where it
  can be approached from fewer directions. A weak column dragged into the centre
  is exposed on more diagonals.
- **Commander rank** — an officer commander (moves both directions) is far more
  flexible than a soldier commander, both for defence and for mounting attacks.

**Heuristic implications (for `src/ai.ts`):**
- Reward tall columns being held near the board edge; penalise tall/valuable
  columns marooned in the centre where they can be approached from both sides.
- This must remain compatible with the negamax sign-flip — any positional term
  must be antisymmetric (scored `+` for the side that controls the column and the
  exact same magnitude `−` for the opponent), exactly like the existing
  `enemyPrisoner` term. Do not add a one-sided term.

## 2. Don't over-concentrate captures into one fragile column ("capture spreading")

When you have a **choice of captures**, prefer spreading the captured pieces
across several of your columns rather than piling them all under one commander.

- A single over-stuffed column is a **liability**: it can be lured/attacked, and
  if its commander falls you can lose the whole stack of recaptured men.
- All else equal, capture with the piece that keeps your columns balanced. In the
  source example, the lower/edge-side capturer (`c1`) is preferred.
- **Caveat / counterpoint:** it can sometimes be *worth* sacrificing several men
  in order to **recapture them later as a single powerful column** — deep columns
  have many lives and can dominate. The rule is "don't *accidentally* build a
  fragile tower," not "never build a tall one."

## 3. Guarding a weak column

A weak (short, isolated) column is vulnerable to a **sacrifice lure**: the
opponent throws a piece in front of it to force it to capture, dragging it off
the edge into the centre where it can be picked off.

- **Good defence:** post an **officer as a guard** behind/beside the weak column.
  The guard means a sacrificing piece would simply be recaptured by the officer,
  so the lure no longer drags the weak column into the open.
- **Cost:** a dedicated guard ties up two pieces. Better still is to **avoid
  forming weak columns in the first place** (see capture-spreading, §2).

## 4. The one-handed attack

Strong columns enable a clean, forcing attack where an attacking column marches
through and converts the defender's men into prisoners.

**Conditions for it to work:**
1. The **attacking column must have more men than the defending column** it is
   marching against.
2. Every attacking man involved **must be able to move in the direction of the
   attack** — i.e. they must be **officers** if the attack runs "backwards"
   relative to a soldier's single legal direction.
3. **No interfering piece** may sit on the attack path (e.g. a stray enemy soldier
   at `F4` in the source example can spoil the combination).

The attacker offers itself as bait; after the forced exchanges resolve, the
attacker still stands as a (shorter but intact) column while the defender's men
have become buried prisoners. **There is no restriction on inspecting either
player's columns** to check which buried men are officers before committing.

## 5. Attack over defence (the governing principle)

Lasca rewards **aggression and long-term initiative over passive safety**:

- When a piece is threatened, a passive retreat (e.g. `c3→b4`) "achieves very
  little." A counter-attacking move (e.g. `b2→a3`) that creates a bigger threat is
  usually stronger.
- **Risk short-term material loss for long-term gain.** Initiative, tempo, and the
  threat of a one-handed attack are often worth more than the men they cost.

**Heuristic implication:** difficulty tiers / evaluation may carry a mild
*initiative/aggression bias* — valuing mobility, advancement, and attacking
structure over pure material parity — so the engine plays the game the way Lasker
intended rather than hoarding pieces.

---

### Cross-references
- AI evaluation: `src/ai.ts` (`evaluate`, `EvalWeights`, `DEFAULT_WEIGHTS`).
- Tutorial lessons: `TUTORIAL.md` and the tutorial content modules.
- Canonical written rules: `web/src/BrochurePage.tsx`.
- Engine vocabulary (column/commander/buried/officer/soldier): `src/types.ts`,
  `src/rules.ts`.
