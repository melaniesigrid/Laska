# Chapter 5 — The Middlegame

> This is where Laska becomes Lasker's game. The opening is a forced handshake;
> the endgame is conversion; the middlegame is the **fight** — towers colliding,
> baits offered, columns lured off the edge and toppled. Here the four working
> principles of [`STRATEGY.md`](../STRATEGY.md) §2–§5 earn their keep, and here the
> dictum that opened Part II — *"a game of attack rather than of defence"* —
> stops being a motto and becomes a method. Every line below is in the engine's
> notation and was replayed through `src/`; the `[VERIFY]` tags and the
> verification table at the end say exactly what was and was not machine-checked.

---

## 5.1 The shape of the middlegame

By move three or four the back ranks have begun to empty, towers have formed, and
the board is no longer symmetric. Now the strategic questions of
[Chapter 3](ch03-fundamentals.md) become live decisions on every turn:

- *Which of my columns is doing the fighting, and which is just cargo?*
- *Where is my tall tower — sheltered at the edge, or marooned in the centre?*
- *Whose tempo is it — am I dictating the exchanges, or reacting to them?*

The middlegame is the contest to arrive at a **commanding structure** — a tall,
officer-led tower, well placed, full of enemy prisoners — before your opponent
does. Everything that follows is technique in service of that single aim: build
the tower you can attack with, deny your opponent his, and convert the moment one
appears.

---

## 5.2 Capture-spreading, and the deliberate tall tower (STRATEGY §2)

When a capture is forced, you often have **no** choice of which piece captures —
only one jump exists. But when two of your columns can take the same man, you
hold a real decision, and [STRATEGY §2](../STRATEGY.md) governs it:

> **Prefer the capture that keeps your columns balanced — do not *accidentally*
> pile every prisoner under one fragile commander.**

Picture the cleanest possible fork. A lone Black soldier sits on c3; two White
soldiers, on b2 and d2, can each jump it:

> **[DIAGRAM: W:4=Ws,5=Ws,8=Bs]**
> White to move; the choice is `b2xd4` or `d2xb4`. Two genuinely different
> captures, the same prize.
> *(Verified: both captures are legal; here they are perfectly symmetric.)*

In this bare position the two are mirror images and nothing distinguishes them.
But change one capturer into a tower that is *already* carrying men, and the
choice acquires meaning:

> **[DIAGRAM: W:4=BsWs,5=Ws,8=Bs]**
> Now b2 is a White-topped tower already holding one Black prisoner (`BsWs`,
> height 2), while d2 is a lone soldier. Capture with b2 (`b2xd4`) and you grow
> *one* tower to height 3 (`BsBsWs`) — two prisoners under a single cap. Capture
> with d2 (`d2xb4`) and you **spread**: two separate height-2 towers, a prisoner
> under each.
> *(Verified: `b2xd4` → `d4=BsBsWs`; `d2xb4` → two `BsWs` towers.)*

[STRATEGY §2](../STRATEGY.md) leans toward the **spread** — `d2xb4` — because a
single over-stuffed column is a *liability*: it can be lured, attacked, and if its
lone commander falls you lose the whole hoard beneath in one stroke. Two modest
towers cannot be toppled by one combination. The engine carries this exact
instinct as its `overConcentration` term in `src/ai.ts` — a mild penalty for any
column that overshoots its side's average height — precisely so it avoids building
fragile towers *by accident*.

> **An honest measurement.** In the toy position above, both captures simply win
> outright (Black is left with no men), so the engine scores them **equal at every
> depth** — it sees no reason to prefer one when both are winning. *(Verified: tied
> at depths 3, 4, and 6.)* Capture-spreading is therefore best understood as a
> **guideline for the unforced, roughly-equal middlegame choice** — keep your
> wealth distributed when nothing forces your hand — rather than a preference the
> search will surface in a sharp tactical position. The principle is real; it is a
> statement about *fragility and risk*, which a result-based search only "sees"
> once the fragility is actually exploited.

**The counterpoint matters as much as the rule.** [STRATEGY §2](../STRATEGY.md) is
"don't build a fragile tower *by accident*," **not** "never build a tall one." A
deliberately constructed deep column — many lives, full of prisoners, led by an
officer, sheltered at the edge — is the most powerful object on a Laska board and
the engine of the one-handed attack we meet in [§5.4](#54-the-one-handed-attack).
The art is the distinction: build tall **on purpose, with a plan to use it**;
spread **by default, to deny your opponent a target**.

---

## 5.3 Guarding a weak column (STRATEGY §3)

A **weak column** is a short, isolated tower — often a lone soldier — with no
friend nearby to recapture for it. It is the natural prey of the **sacrifice
lure**, the defining attacking motif of the middlegame: your opponent throws a man
in front of your weak column, you are *forced* to take it (capture is mandatory),
and the act of taking drags your column off its safe square — often off the edge
and into the open centre — where a second blow topples it.

The mechanism is pure [STRATEGY §5](../STRATEGY.md): the lure *spends a man to
seize your tempo*, choosing your move for you. Against a weak, unguarded column it
is devastating, because the column has no answer but to walk into the trap.

[STRATEGY §3](../STRATEGY.md) prescribes the defence:

> **Post an officer as a guard behind or beside the weak column.** Now the
> sacrificing man, if taken, is simply recaptured by the officer — the lure no
> longer drags your weak column anywhere, because it need not be the piece that
> captures, or because the officer stands ready to answer the follow-up. The
> two-way officer is the guard precisely because it can recapture in *any*
> direction the lure comes from.

The cost is real: a dedicated guard ties up two of your men in mutual defence, men
who are not attacking. So the principle carries its own corollary, and it points
straight back to [§5.2](#52-capture-spreading-and-the-deliberate-tall-tower):
**the best defence against the lure is to never form the weak column in the first
place.** Spread your captures, keep your towers mutually supporting, and you give
the lure nothing to grip.

> `[VERIFY]` — *A single clean, forced "lure refuted by guard" line that the
> engine confirms as best is not asserted here.* This is the same gap honestly
> recorded in [`exercises.md`](exercises.md): candidate positions were probed, but
> a position where the sacrifice is **forced**, the guard's recapture is the
> **engine's top move**, and the refutation is unambiguous has not yet been
> isolated and machine-verified. The *principle* is sound and traces to
> [STRATEGY §3](../STRATEGY.md); the **worked line is deferred** rather than
> invented. A future pass should build this position against the engine and only
> then promote it from principle to verified study.

---

## 5.4 The one-handed attack (STRATEGY §4)

Here is the middlegame's masterpiece — the combination Lasker's rules were built
to reward, and the clearest expression of *attack over defence* on the board. A
strong column marches into the enemy and, with a single offered sacrifice, forces
a sequence that sweeps the defender's men into prisoners beneath it.

[STRATEGY §4](../STRATEGY.md) names three conditions for it to work:

1. **The attacking column must out-man the column it marches against** — it needs
   more lives than the defence can take.
2. **Every attacking man must be able to move in the direction of the attack** —
   which, for an attack that runs *backward* relative to a soldier's single legal
   direction, means the commander must be an **officer**.
3. **No interfering piece may sit on the attack path** — a stray enemy man on the
   wrong square can spoil the whole combination.

Watch all three conditions paid off at once. White commands a three-man tower on
a1 led by an officer (`WsWsWo`, bottom-to-top), a spare soldier on d2, and faces a
two-man Black tower on d4:

> **[DIAGRAM: W:0=WsWsWo,5=Ws,12=BsBs]**
> White to move and win.
>
> **1. d2-c3** — the bait. A quiet, unforced step that *offers* the c3 soldier.
> **1... d4xb2** — Black's **only** legal reply. The capture is mandatory, and it
> is the single move on the board; Black is compelled to take, jumping to b2 and
> burying White's offered man.
> **2. a1xc3xa1** — the collection. White's officer-led tower jumps **forward**
> over b2 to c3, then — b2 still occupied by the second Black man — reverses to
> jump **back** over b2 to a1. A same-square chain that sweeps both Black soldiers
> into the cellar of White's tower.
>
> *(Verified: after `1.d2-c3`, Black has exactly one legal move, `d4xb2`; the
> finishing chain `a1xc3xa1` is legal and ends the game — the final a1 tower reads
> `BsBsWsWsWo`, two Black prisoners under White's officer, and Black has no men.)*

Read what each condition contributed. The **officer** on top (condition 2) is what
licenses the *backward* second jump that completes the sweep — a soldier could
never reverse, and the combination would die after one leg. The tower's **height**
(condition 1) is what lets it offer a man on c3 and still stand intact afterward.
And the bait works at all only because **no interfering piece** (condition 3)
blocks the c3–b2–a1 path. The attacker ends *shorter than it threatened* but
*taller in prisoners*; the defender's army is now cargo. **This is the whole point
of building a deliberate tall tower** ([§5.2](#52-capture-spreading-and-the-deliberate-tall-tower)):
not to hoard, but to wield.

This same backward-reversing jump, isolated, is worth drilling on its own — the
officer that changes direction mid-chain to keep capturing:

> **[DIAGRAM: W:8=Wo,12=Bs,13=Bs]**
> White officer to move. **`c3xe5xg3`** — jump d4 *forward* to e5, then reverse to
> jump f4 *back down* to g3. A soldier could not make the second leg; the officer's
> command of all four diagonals turns one capture into a sweep.
> *(Verified: `c3xe5xg3` is the engine's top move at depth 6 and ends the game.)*

---

## 5.5 The same-square jump — Lasker's signature tactic

The one-handed attack's engine is a tactic so particular to Laska that it deserves
its own name: the **same-square re-jump**, in which one officer jumps over the
*same square twice in a single turn* because that square is still occupied after
the first jump took only the man on top.

> **[DIAGRAM: W:0=Wo,4=BsBs]**
> A White officer on a1 faces a two-man Black tower on b2. **`a1xc3xa1`**: jump
> the Black commander on b2, landing on c3 (the first Black man is now buried
> under your officer). The square b2 is *still occupied* — the second Black
> soldier, formerly buried, is now exposed on top — so your officer reverses and
> jumps b2 **again**, back to a1. Two jumps, one square jumped twice, the entire
> enemy tower swept into your cellar in a single move.
> *(Verified: `a1xc3xa1` is the engine's top move at depth 6 and ends the game.)*

This is impossible in checkers, where a captured man is removed and the square
empties. In Laska only the *commander* is taken; the tower's lower men remain,
re-exposed, and a two-way officer can come back for them. It is the most
characteristically *Laskan* idea on the board — and, fittingly, a favourite of the
inventor's own games. Internalise it: **a tall enemy tower is not one capture, it
is a sequence of them**, and an officer with a clear path can collect the whole
sequence in one turn.

---

## 5.6 Prophylaxis — the move that prevents

Lasker the chess champion is remembered for *prophylaxis*: the quiet move that
forestalls the opponent's plan before it begins. Laska rewards the same foresight,
and the middlegame is where it tells.

Because the most dangerous weapon in the game is the **forced** sacrifice lure
([§5.3](#53-guarding-a-weak-column-strategy-3)) and the one-handed attack
([§5.4](#54-the-one-handed-attack)), the most valuable prophylaxis is the move that
**denies the enemy the structure those weapons need.** Concretely:

- **Deny the landing square.** A capture is impossible if the square beyond the
  target is occupied. By placing a man on a key landing square you can make an
  enemy jump *illegal* — and, conversely, an enemy who does this to you dictates
  which way your own forced captures run (the **wall**, met in
  [§4.4](ch04-opening.md#44-reading-the-wall-a-structural-trap)). Watch the landing
  squares around your towers as closely as the towers themselves.
- **Deny the bait its bite.** The lure only works against a column with no
  recapture. Keep your columns *mutually supporting* — every tower within an
  officer's reach of a friend — and a sacrifice thrown in front of one is simply
  recaptured by another. This is [STRATEGY §3](../STRATEGY.md) applied as a *habit
  of placement* rather than an emergency repair.
- **Deny the centre to the enemy's wealth.** A tall enemy tower is most
  dangerous, and most *vulnerable*, in the open centre. Prophylaxis can mean
  steering the position so that *his* deep column is the one marooned in the
  middle, exposed to approach from both sides ([§3.4](ch03-fundamentals.md)),
  while *yours* shelters at the rim.

Prophylaxis in Laska is rarely a single brilliant move; it is the accumulated
refusal to give your opponent a target. The player who never forms a weak column,
never leaves a tall tower in the open, and always watches the landing squares
gives the attacker nothing to attack — and in a game of attack, that is the
deepest defence there is.

---

## 5.7 Sacrifice — attack over defence, made literal (STRATEGY §5)

Every motif in this chapter is, underneath, a **sacrifice**: the bait of the
one-handed attack, the lure against a weak column, even the opening's forced
contact. This is no accident. In a game where no man ever leaves the board, a
sacrifice is never a permanent loss of *material* — it is a temporary loan of a
man in exchange for **tempo and structure**, the two currencies that actually
decide Laska.

[STRATEGY §5](../STRATEGY.md) states the governing principle bluntly: **risk
short-term material loss for long-term gain.** When a column is threatened, a
passive retreat "achieves very little"; a counter-attacking move that creates a
*bigger* threat is usually stronger. The reasoning is the arithmetic of
[§3.5](ch03-fundamentals.md): whoever holds the initiative chooses the exchanges,
and a sacrifice that *seizes the initiative* buys more than the man it spends.

So the middlegame instinct the whole book has been building toward is this. When
you must choose between **guarding** a man and **attacking** with him, lean
toward the attack. Offer the bait. Force the reply. Trust that the structure you
reach — a tall, officer-led tower full of the prisoners your sacrifice forced —
is worth more than the parity you gave up to reach it. That is not recklessness.
It is the correct reading of a game whose inventor told us, in the first sentence
of his rules, exactly how it wants to be played:

> *"Lasca is a game of attack rather than of defence."*

Play it that way.

---

## Verification summary

Every position and line in this chapter was decoded with `decodePosition`,
checked against `legalMoves` / `applyMove`, and every "only move / forced /
engine's top move at depth N / wins" claim asserted programmatically via the
session-scratchpad harness behind [`exercises.md`](exercises.md).

| Claim | Status |
|---|---|
| 5.2 fork `b2xd4` / `d2xb4` both legal and symmetric | **Verified** |
| 5.2 overstuff (`b2xd4`→`BsBsWs`) vs spread (`d2xb4`→ two `BsWs`); tied at depths 3/4/6 | **Verified** |
| 5.3 guard-refutes-lure worked line | **`[VERIFY]` — deferred, principle only** |
| 5.4 one-handed attack: `1.d2-c3` Black's only reply `d4xb2`; `2.a1xc3xa1` wins, final `BsBsWsWsWo` | **Verified** |
| 5.4 `c3xe5xg3` officer reverses mid-chain, engine top at depth 6, ends game | **Verified** |
| 5.5 same-square `a1xc3xa1`, engine top at depth 6, ends game | **Verified** |
| 5.6 prophylaxis (landing-square / mutual-support / centre principles) | Rule-derived; rests on verified §4.4, §5.4 |
| 5.7 sacrifice = tempo-for-material (STRATEGY §5) | Editorial; rests on verified motifs |

**Claims engine-verified: 5 concrete lines/positions. `[VERIFY]`: 1** (the
guard-refutes-lure line of §5.3, deferred rather than invented — consistent with
the known gap recorded in `exercises.md`). No winning line in this chapter was
asserted that the engine did not confirm.
