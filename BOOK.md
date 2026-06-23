# The Book of Laska — Editorial Vision

> **Working title:** *The Book of Laska: Lasker's Great Military Game, and How to Master It*
> **Status:** Step 1 — vision & scope (this document). Chapters not yet drafted.
> **This file is the editorial source of truth for the book.** It defines what the
> book is, who it is for, its structure, and its non-negotiable standards. Chapter
> drafts live under `book/` (to be created); this file governs them.

---

## 1. The thesis

There has never been a real book of Laska strategy. Lasker left a 1911 rules
booklet with a handful of dicta ("a game of attack rather than of defence"); a
century later there are scattered web notes (David Johnson-Davies' being the best)
and nothing else. The game's entire strategic literature would fit on a postcard.

**This book is the one that should exist.** Not a longer rulebook and not a
listicle of tips — the *Modern Chess Openings* / *My System* of Laska: a complete,
rigorous, beautifully made strategic education that takes a reader from "I have
never seen this game" to genuine mastery, and that no future book can ignore.

What makes it credible — and impossible for anyone else to copy — is that **every
position, line, and claim is verified by Laska's own rules engine.** This is not a
person's opinions written down. It is strategy proven against the same code that
enforces the game online and that replays Lasker's own 1911 games move-for-move.
The book and the engine check each other.

> The standard is literal: *the ultimate guide, the best ever built.* For a game
> with almost no prior literature that bar is reachable — but only if we earn it on
> every page. Depth over volume; verified over plausible; designed, not generated.

## 2. Who it is for (and the arc)

One book, three readers, in sequence — a deliberate **beginner → master arc** so a
single volume grows with the player:

| Part | Reader | Leaves them able to… |
|---|---|---|
| **I — Foundations** | Total newcomer | Play a legal, sensible game; read notation; understand columns |
| **II — Strategy** | Improving player | Think positionally — control columns, judge stacks, plan attacks |
| **III — Mastery** | Serious competitor | Calculate combinations, hold endgames, study master play |
| **IV — Heritage** | Anyone | Understand *why* this game exists and where it came from |

A newcomer reads front-to-back. A returning player treats Parts II–III as
reference. Each chapter ends with engine-checked exercises (see §4), so the book is
also a trainer, not just a text.

## 3. Structure (maps to the build plan)

This mirrors the project todo list; each chapter is a downstream step.

- **Part I — Foundations**
  - Ch. 1 *The Board and the Men* — geometry, notation, the pieces (soldier/officer, column/commander/buried/prisoner). Sourced from the engine, never from memory.
  - Ch. 2 *The One Rule That Changes Everything* — capture-builds, command, freeing a column. The conceptual leap from checkers.
- **Part II — Strategy**
  - Ch. 3 *Fundamentals* — column strength is positional not material; height, edge-vs-centre, commander rank; tempo; how to count an advantage when nothing leaves the board.
  - Ch. 4 *The Opening* — principled first moves, standard setups, named traps. Every line engine-validated.
  - Ch. 5 *The Middlegame* — capture-spreading vs. the deliberate tall tower; guarding weak columns; the one-handed attack; prophylaxis; sacrifice patterns.
- **Part III — Mastery**
  - Ch. 6 *The Endgame* — converting material, winning vs. drawing structures, fortress/zugzwang ideas, engine-verified key positions (a Laska "tablebase" in miniature).
  - Ch. 7 *Attack Over Defence* — Lasker's governing principle made concrete: initiative, tempo, when to spend material for the long game.
- **Part IV — Heritage & Practice**
  - Ch. 8 *The Master Games* — Lasker's 1911 teaching games and the historic scores (Moscow 1996 and the held-back games), deeply annotated, replayed on the live engine.
  - Ch. 9 *Emanuel Lasker* — the man, the mathematician-philosopher-champion, and *why* the World Champion built this game; the through-line from his chess thinking to Laska.
  - **Exercises** — woven through every chapter, collected and graded at the back.

## 4. The standards (non-negotiable)

These are what separate "the best ever built" from a nice PDF. A chapter is not
done until it meets all of them.

1. **Engine-verified, everything.** No diagram, line, opening claim, or endgame
   appears unless it has been run through `src/` and confirmed. Positions are
   stored as engine state / notation strings, not hand-drawn. Where the book makes
   a strategic claim ("this attack wins"), the supporting line is machine-checked.
   This is the moat: it is the only Laska strategy text that *cannot be wrong* about
   the rules, because it shares the rules.
2. **Traces to canon.** Strategy must stay consistent with, and supersede in prose,
   [`STRATEGY.md`](STRATEGY.md) — the terse canonical reference the AI heuristic,
   tutorial, and brochure all trace to. The book is the long-form expansion;
   `STRATEGY.md` stays the engineering one-pager. They must never contradict.
3. **Interactive by design.** This is a digital-native book. Positions should be
   *playable*, not static — every diagram links into the app's board, replay
   viewer, and puzzle engine (Ch.-to-feature wiring is a later step). A print/PDF
   export must degrade gracefully to static diagrams, but the canonical form is
   live.
4. **Designed, not generated.** It inherits Laska's neumorphic identity
   ([`DESIGN.md`](DESIGN.md)) — Fraunces/Hanken Grotesk, soft-clay boards,
   debossed insignia, `lucide-react` only. The book must look hand-made and
   distinctive, never "AI slop" (see the project aesthetics brief). Board diagrams
   are first-class typographic objects.
5. **Honest about the unknown.** Laska theory is thin; where the book breaks new
   ground it says so, and where a question is genuinely open (e.g. the
   longest-capture rule Lasker left as guidance) it presents it as open rather than
   inventing certainty.
6. **Reads like literature.** Lasker was a philosopher; the prose should have a
   point of view and a voice, not be a dry manual. The heritage chapters in
   particular should be genuinely moving.

## 5. Format & delivery (decided in a later step, framed here)

The default is **an in-app interactive book** — a new view in the React app,
chapters rendering live boards via the existing `Board` component and replay
machinery, with a high-fidelity **PDF/print export** as the secondary artifact
(the object you can hand someone). This keeps the interactive-by-design standard
primary while still producing a "real book." Final format call is its own todo.

## 6. How the book gets built (process)

Authored by the project's specialist agents against this vision, each owning the
chapters in its domain:

- **heritage-archivist-engineer** → Ch. 8 (master games) & Ch. 9 (Lasker) — the moat.
- **tutorial-content-engineer** → exercises/puzzles across all chapters, and the
  Foundations chapters' pedagogy.
- **engine-engineer** → verification harness: a script that re-validates every
  position/line in the book against `src/` (so a rules change that breaks the book
  fails CI, exactly as it does for Lasker's games today).
- **frontend-board-engineer** → the in-app book view and live diagrams.
- Strategy chapters (3–7) authored against `STRATEGY.md`, expanding each principle
  into full prose with verified examples.

Verification is continuous, not a final gate: as with Lasker's 1911 games, the
book's positions become a test fixture. If the engine and the book ever disagree,
that is a bug in one of them — and we find out at build time.

---

### One-line pitch
*The strategy book Laska never had: every line proven by the engine that plays it,
every page made by hand — the definitive guide to Emanuel Lasker's game of towers.*
