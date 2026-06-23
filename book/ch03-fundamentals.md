# Chapter 3 — Fundamentals

> *"Lasca is a game of attack rather than of defence."* — Emanuel Lasker, 1911
>
> **Part II — Strategy** opens here. Chapters 1 and 2 put the rules in your hands;
> this chapter puts judgement behind them. Every concrete line below is written in
> the engine's own notation and has been replayed through `src/` — where a claim
> is asserted *the only move*, *forced*, or *the engine's choice at depth N*, it
> was checked by machine, not by eye. The four strategic principles drilled here
> trace to [`STRATEGY.md`](../STRATEGY.md) §1.

---

## Notation, in one breath

A square is a file-letter `a`–`g` and a rank-number `1`–`7`; White's home is the
low ranks, Black's the high. `c3-d4` is a quiet step; `c3xe5` is a capture (you
jump the man on d4 and land on e5); `a1xc3xa1` is a *chain* — the same piece
keeps jumping, here landing twice on the same square. A position is written
`side:square=stack,…`, each stack listed **bottom-to-top**, two characters per
man (`Ws` = White soldier, `Bo` = Black officer). So `c3=BsWs` is a column on c3
with a Black soldier buried at the bottom and a White soldier on top — a White
column holding one prisoner. The board is empty everywhere not listed. This is
exactly the string the engine reads, so nothing here can be drawn that the rules
would forbid.

---

## 3.1 The board never empties

Begin with the single fact that makes Laska *Laska* and not draughts: **no man
ever leaves the board.** When you jump an enemy commander, you do not remove it —
you slide it to the bottom of your own column, a prisoner under your cap. Capture
is not subtraction. It is *acquisition*. The piece you took still sits on the
board; it has merely changed hands and changed altitude.

This single rule rewrites every habit a checkers player brings to the table. In
checkers you count what you have taken *off*; the man you jumped is gone, and the
score is a subtraction. In Laska nothing is ever gone. Twenty-two men start the
game and twenty-two men are there at the end, redistributed into towers. So the
question "who is winning?" can never be answered by counting heads — the heads
are equal forever. It must be answered by asking *who commands*.

> **[DIAGRAM: W:8=Ws,12=Bs]**
> The simplest capture on the board. White's only move is `c3xe5`: jump the Black
> soldier on d4, land on e5, and the man you took is now buried beneath you. One
> move, one prisoner, and Black — having no men left in command — has lost.
> *(Verified: `c3xe5` is the only legal move and ends the game.)*

A **column** (or *tower*) is a stack of one or more men on one square. Its top
piece is the **commander**: it alone decides the column's colour, its direction,
and what it may do. Everything beneath is **buried** — and a buried enemy man is
a **prisoner**. A column of one is just a lone soldier. A column of five is a
fortress with five lives.

---

## 3.2 Control, not count — how to read a position

Here is the discipline that separates a Laska player from a tourist: **read the
tops.** Run your eye across the board and ask, of every tower, only one question —
*whose man is on top?* That, and nothing else, tells you who owns the column.

Consider a position where one side plainly has *more men* yet is *worse*:

> **[DIAGRAM: W:8=Ws,10=Ws,12=BsBsBs]**
> White has two lone soldiers (c3, g3). Black has a single three-man tower on d4.
> Count men: Black has three, White two — Black "leads in material." Count
> *command*: White controls **two** columns, Black only **one**.
> *(Verified: White controls 2 squares, Black 1.)*

The engine that plays this game does not even have a function for "number of
men." Its evaluation, in `src/ai.ts`, begins by walking the board and scoring
**column control** first — a flat bonus for every tower you command — and only
then adjusts for what is buried inside. This is not an implementation quirk; it is
the truth of the game made into code. A man who is not on top of something is not
fighting. He is cargo.

So the first number you should compute in any position is not *pieces*, it is
**columns commanded**. The side with more commanders has more attackers, more
defenders, and more moves. Everything that follows — height, edge, rank, tempo —
is a *correction* to that first count, never a replacement for it.

---

## 3.3 Height is lives — the arithmetic of a tower

Two columns of equal height are **not** equally strong, and two columns of *un*equal
height differ by more than one rung. This is [STRATEGY §1](../STRATEGY.md) —
*column strength is positional, not just material* — and its first clause is the
one beginners feel in their bones once they have lost a stack: **height is
lives.**

When your tower is attacked, the enemy jump peels only the **commander** — the
single man on top. The prisoner beneath is now exposed and becomes the new
commander, but the column survives. A two-man tower can be jumped once and live.
A four-man tower can be jumped *three times* and still stand. Each rung of height
is one more life, one more turn the column can be attacked before it is finally
neutralised.

> Think of a tall column as a candle. Every capture against it burns one length
> off the top, and only when the last length is gone does the light go out. A lone
> soldier is a candle already at its wick.

But read the clause exactly, because it cuts both ways. Height is lives *for the
commander's side* — and every rung below the top that belongs to the **enemy** is
a prisoner, an asset you have already banked. A tall column full of your enemy's
men is a vault. A tall column full of *your own* men stacked under one cap is a
liability waiting to be lured into the open and toppled (we return to this in
[Chapter 5](ch05-middlegame.md), the over-concentration trap of STRATEGY §2).
Height alone is not strength. Height *of the right colour, in the right place* is
strength.

---

## 3.4 Edge versus centre, and the rank of the commander

[STRATEGY §1](../STRATEGY.md) names two more corrections to raw control, and both
are about *exposure*.

**Edge versus centre.** A diagonal-moving man on the outer file can be approached
from fewer directions than one in the middle. Put a single soldier on the rim and
count its steps:

> **[DIAGRAM: W:7=Ws]** A lone White soldier on a3 has exactly **one** legal
> move: `a3-b4`. The edge gives it nothing to its left — half its world is off the
> board.
>
> **[DIAGRAM: W:12=Ws]** The same soldier on d4, in the centre, has **two**:
> `d4-e5` and `d4-c5`.
> *(Verified: 1 legal move from a3, 2 from d4.)*

For a *lone soldier* this looks like the centre is simply better — more reach,
more squares. And in the **opening** that is exactly right: you are placing
*reach*, and the centre maximises it (Chapter 4). But invert the picture for a
**tall, valuable** tower. Now those extra diagonals are not opportunities — they
are *avenues of attack*. The same openness that lets a centre man do more lets the
enemy approach a centre tower from both sides at once. A deep column you cannot
afford to lose is **safer hugging the edge**, where it can be threatened from one
direction only and its many lives are not strung out in the open. The engine
encodes precisely this asymmetry: its `edgeSafety` term rewards *extra height*
(everything above a lone commander) the closer that tower sits to the rim, and
rewards it not at all in the centre file.

The rule, then, is a tension you will manage all game: **march your reach toward
the centre, but shelter your wealth toward the edge.**

**Commander rank.** The last correction is the crown. An **officer** (a promoted
man) commands all four diagonals; a **soldier** commands only the two that lead
forward. The difference is not cosmetic — it is, again, arithmetic:

> **[DIAGRAM: W:12=Ws]** A soldier on d4 moves two ways (`d4-e5`, `d4-c5`).
>
> **[DIAGRAM: W:12=Wo]** An officer on the same square moves **four** (`d4-e5`,
> `d4-c5`, `d4-e3`, `d4-c3`) — and, decisively, can capture *backwards*.
> *(Verified: 2 legal moves for the soldier, 4 for the officer.)*

An officer commander is worth a standing bonus in the engine's eyes
(`officer: 60` against `column: 100` in `DEFAULT_WEIGHTS`) — better than half a
fresh column — because a two-way commander defends a tower from threats a soldier
must simply suffer, and because the backward jump is the engine of half of all
Laska combinations. We meet that backward jump as a weapon in
[Chapter 5](ch05-middlegame.md); for now, register only the valuation: **a crown
is the single most valuable upgrade a column can receive**, and steering a
soldier toward the back rank is a strategic aim in its own right, not merely the
happy ending of a capture chain.

---

## 3.5 Tempo, when nothing leaves the board

Because no man is ever removed, **time** is the currency Laska spends instead of
material. You cannot win by attrition; there is no attrition. You win by reaching
a commanding structure *before your opponent does* — and that is a race measured
in tempo.

A **tempo** is a move that improves your position; a *wasted* tempo is a move
that does not, or worse, one you are *forced* to make. Two features of the rules
make tempo unusually sharp in Laska:

1. **Capture is mandatory.** If a jump exists anywhere, you *must* play a jump —
   you forfeit your free choice of move entirely. This means a well-placed
   sacrifice can *seize your opponent's tempo*: offer a man he is compelled to
   take, and you have chosen his move for him.
2. **Soldiers cannot retreat.** A soldier-topped column moves forward only. Every
   soldier step is irreversible — it spends ground you can never recover. (The
   engine even counts soldier moves as "progress" for the no-progress draw rule,
   precisely because they cannot be undone.) Officers, moving both ways, can
   *lose* a tempo deliberately — a shuffle that hands the obligation to move back
   to the opponent. In a tight endgame this is a weapon; in the middlegame it is
   how an officer waits.

Hold these two facts together and a strategic instinct emerges that governs the
rest of Part II: **the player who keeps the initiative chooses the exchanges, and
the player who chooses the exchanges chooses who ends up on top.** This is the
bridge to [STRATEGY §5](../STRATEGY.md) — *attack over defence* — which we develop
in the middlegame. A passive move that merely shores up a threat "achieves very
little"; a counter-attacking move that creates a *bigger* threat seizes the tempo
and forces the opponent to react to you. Lasker's dictum is not a temperament. It
is a consequence of the arithmetic: in a game where nothing leaves the board,
whoever dictates the tempo dictates the result.

---

## 3.6 Counting an advantage — a worked reckoning

Put the chapter together on one position and *count it properly*, the way the
engine does.

> **[DIAGRAM: W:8=Ws,12=WsBs,11=Bs]**
> White to move. The tower on d4 reads `WsBs` bottom-to-top — a White soldier
> buried beneath a Black commander. **That column is Black's**, and one of your
> men is its prisoner. There is also a lone Black soldier on b4. White has one
> lone soldier on c3.

Naïve count: White one man on top, Black two on top plus a buried White — Black
looks comfortably ahead. Now read it as Laska. White is to move, a capture
exists, and so it is forced. Of White's options, one transforms the reckoning:

> **Solution:** `c3xe5`. White jumps the Black-topped column on d4. You take only
> the **commander** — the Black soldier on top — and the White soldier it was
> burying is **liberated**, rejoining you on the surface. Control of the board
> swings: White's commanded columns rise from one to two, and the prisoner ledger
> flips from Black's favour to White's.
> *(Verified: `c3xe5` is the engine's top choice at depth 4; after it White
> controls 2 columns, having freed his own man and taken a prisoner in a single
> jump.)*

This is the lesson of the whole chapter in one move. The man you should count is
not the man you *have* but the man you *command*; the jump that wins is not the
one that grabs the most but the one that **flips the most command** — here,
freeing your own soldier *and* burying the enemy's in the same stroke. Read the
tops. Count the columns. Spend tempo to change who is on top. Everything else in
Part II is detail on this frame.

---

## Verification summary

Every concrete position in this chapter was decoded with `decodePosition`, its
legality and move list confirmed against `legalMoves` / `applyMove` from
`src/index.ts`, and every "only move / forced / engine's choice at depth N / wins"
claim asserted programmatically via a throwaway harness in the session scratchpad
(modelled on the one behind [`exercises.md`](exercises.md)).

| Claim | Status |
|---|---|
| 3.1 `c3xe5` only legal move, ends game | **Verified** |
| 3.2 White commands 2 columns to Black's 1 (more men ≠ more command) | **Verified** |
| 3.3 height-is-lives (rule consequence) | Rule-derived, no line to verify |
| 3.4 a3 soldier 1 move vs d4 soldier 2; d4 officer 4 moves | **Verified** |
| 3.5 tempo (capture mandatory; soldiers irreversible) | Rule-derived |
| 3.6 `c3xe5` engine top at depth 4, liberates + captures, control flips | **Verified** |

**Claims engine-verified: 4 concrete lines. `[VERIFY]`: 0.** The two rule-derived
sections (3.3 height, 3.5 tempo) state direct consequences of the rules engine's
documented behaviour rather than specific lines, and are cross-referenced to the
code (`src/ai.ts` weights; `src/rules.ts` progress counter) so a reader can check
them at the source.
