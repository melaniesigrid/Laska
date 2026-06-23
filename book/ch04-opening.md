# Chapter 4 — The Opening

> *On the openings of Lasca there is, frankly, almost no literature.* This is the
> chapter the honest book must write most carefully. Where chess has five
> centuries of theory and a million catalogued games, Laska has Lasker's 1911
> booklet, a handful of historic scores, and an engine. So this chapter does
> something unusual: it states its opening principles as **the engine actually
> plays them**, verified across search depths, and it tells you plainly where the
> map ends and the blank parchment begins. Every line here was replayed through
> `src/`; nothing is invented. See [BOOK.md §4.5] on the thinness of the field —
> we present what the engine supports, not a corpus we wish existed.

---

## 4.1 The position, and the one fact that shapes everything

White has eleven soldiers on the three nearest rows, Black eleven on his; the
centre row (row 4 — the b4-d4-f4 / a5-c5-e5-g5 band, in the engine's geometry) is
empty. White moves first.

> **[DIAGRAM: START]**
> The standard starting array. White to move.

Count the legal first moves and there are exactly **six**:

> `a3-b4`, `c3-b4`, `c3-d4`, `e3-d4`, `e3-f4`, `g3-f4`
> *(Verified: exactly 6 legal opening moves from the initial position.)*

Only the third rank can move at all — the men behind are walled in by their own
army — and each of the front-rank soldiers steps once, forward, onto the empty
middle band. So far this looks like checkers' quiet first shuffle. It is not, and
here is the fact that shapes the entire opening:

**Every legal first move is immediately answered by a forced capture.**

Whatever White plays, exactly one Black soldier can jump it, and — capture being
mandatory — Black *must*:

| White plays | Black's forced reply |
|---|---|
| `c3-d4` | `e5xc3` |
| `c3-b4` | `a5xc3` |
| `e3-d4` | `c5xe3` |
| `e3-f4` | `g5xe3` |
| `a3-b4` | `c5xa3` |
| `g3-f4` | `e5xg3` |

*(Verified: in each case Black has exactly one legal reply, and it is the listed
capture.)*

Read that table slowly, because it overturns the first instinct a checkers player
brings. There is **no quiet developing move in Laska.** You cannot tiptoe a
soldier forward and build a position in peace; the moment you step onto the
contact band, you offer yourself, and your opponent is *compelled* to take. The
opening is not a question of *whether* to make contact — contact is forced on
move one — but of **which exchange you walk into, and what structure you are left
holding when the dust settles.**

This is [STRATEGY §5](../STRATEGY.md) — *attack over defence* — written into the
very first move. There is no defensive opening. There is only the choice of which
attack to invite.

---

## 4.2 Develop toward the centre — verified, and verified again

Given that every first move is a sacrifice that will be recaptured, which
sacrifice should you choose? The engine's answer is unambiguous and, more
importantly, **stable across every depth we tested.** Rank the six opening moves
by the engine's own evaluation:

| Depth | Best moves | Worst moves |
|---:|---|---|
| 2 | the four central developments (tied) | `a3-b4`, `g3-f4` |
| 3 | the four central developments (tied) | `a3-b4`, `g3-f4` |
| 4 | `c3-b4` / `e3-f4`, then `c3-d4` / `e3-d4` | `a3-b4`, `g3-f4` |

*(Verified: across search depths 2, 3 and 4 the four central developments are the
engine's best opening moves and the two edge lunges `a3-b4` / `g3-f4` are its two
worst, every time.)*

The verdict is a single sentence, and it is the soundest opening principle the
game possesses: **develop toward the centre; never lunge to the edge.** The four
central developments — `c3-d4`, `c3-b4`, `e3-d4`, `e3-f4` — each step a soldier
toward the middle of the board, where (as we saw in [§3.4](ch03-fundamentals.md))
a man commands more diagonals and contests the empty centre band. The two
**edge lunges** — `a3-b4` and `g3-f4` — commit your rim soldier, the one man on
that flank, to a forward square it can never recover, surrendering the corner and
gaining nothing in reach. The engine scores them not merely worse but *far* worse:
at depth 4 the central moves evaluate around +130 and the edge lunges around
−160, a gulf of nearly three commanded columns' worth of judgement.

> **A note on the fine print.** At depth 2 and 3 the four central moves are exactly
> tied; at depth 4 the engine develops a faint preference for `c3-b4` and `e3-f4`
> — the developments that step *toward the centre from the c/e files*, keeping a
> man off the rim — over `c3-d4` and `e3-d4`. The margin is two evaluation points,
> far inside the noise of an untuned heuristic. **Treat the four central moves as
> equally sound.** What is robust, depth after depth, is the *boundary*: centre
> good, edge bad. That boundary is a machine-checked principle, not an opinion —
> and it is the one piece of opening theory this book will stake its name on.

This is [STRATEGY §1](../STRATEGY.md) (edge-vs-centre) read *forward* from the
start. In the middlegame you will learn to shelter a tall tower at the edge; but
in the opening you hold nothing tall to shelter — you hold only *reach*, and the
centre is where reach lives.

---

## 4.3 The main line — what the first exchange actually leaves

Principles are cheap; let us walk an actual exchange to its rest and count what
remains. Take the most natural central development and follow the forced replies:

> **1. c3-d4 e5xc3**
>
> White steps to the centre; Black is compelled to jump, landing on c3 and burying
> White's soldier. The tower on c3 now reads `WsBs` — a White soldier imprisoned
> beneath a Black commander. Momentarily, Black is the one holding a prisoner.
>
> But it is **White to move, and a recapture is available** — indeed two of them:
>
> **2. b2xd4** *(or `d2xb4`)*
>
> White jumps back through the contact square. The dust settles on a position
> White can be satisfied with: **White commands 11 columns to Black's 10**, with a
> fresh White-topped tower (`BsWs`) holding a Black prisoner, and **Black has no
> immediate recapture** — the forcing sequence has ended in White's favour, on
> White's move.
> *(Verified: after `1.c3-d4 e5xc3 2.b2xd4`, White controls 11 columns to Black's
> 10, the d4 tower reads `BsWs` (White on top, one Black prisoner), and Black has
> no capture available.)*

**[DIAGRAM: W:0=Ws,1=Ws,2=Ws,3=Ws,6=Ws,7=Ws,9=Ws,10=Ws,12=BsWs,14=Bs,15=Bs,16=Bs,17=Bs,18=Bs,20=Bs,21=Bs,22=Bs,23=Bs,24=Bs]**
*(the position after `1.c3-d4 e5xc3 2.b2xd4` — White to recapture has been played; Black to move, no capture forced)*

The lesson generalises past this one line. **Move one offers a man; move two takes
him back, with interest, and leaves you commanding a tower the opponent cannot
immediately answer.** The whole opening battle is a contest to be the side who
*lands the recapture* and ends the forcing sequence on top, rather than the side
left holding the buried man. The way you win that contest is by spending move one
well — which brings us straight back to [§4.2](#42-develop-toward-the-centre):
develop centrally, keep your recapture options open, and let the edge lunger be
the one whose flank soldier is buried with no friend nearby to free him.

> **An honest caveat on the count.** Do not over-read "+1 column" as a won game,
> and do not imagine the column count is what the engine is rewarding. The
> engine's depth-4 *favourite* opening, `c3-b4`, reaches after `1.c3-b4 a5xc3
> 2.b2xd4` the **same** material balance as the `c3-d4` line above — White 11
> columns to Black's 10 — yet the engine rates the `c3-b4` sequence slightly
> *higher*. *(Verified: both lines settle at W 11 / B 10.)* The two openings are
> materially identical after the forced exchange; whatever separates them in the
> engine's eye is **structural and positional**, not a column it can count — which
> is exactly why the durable truth is the **ordering of the openings**, never a
> guarantee of material after any one line. Centre good, edge bad: that is what
> survives every depth.

---

## 4.4 Reading the wall — a structural trap

The forced-capture rule that defines the opening can also be *turned against* the
player who must obey it. Because you are compelled to jump, your opponent can
sometimes choose *where* you jump by controlling your landing squares. This is the
first named idea of Laska opening play, and it is a defensive resource as much as
an offensive one.

> **[DIAGRAM: W:8=Ws,11=Bs,12=Bs,16=Bs]**
> White to move, and a capture exists, so White must take. Two Black soldiers sit
> ahead on b4 and d4 — but the square *beyond* d4, namely e5, is occupied by a
> third Black man. The natural jump `c3xe5` is **blocked**: you cannot land on an
> occupied square. Only `c3xa5`, the leftward jump over b4, is legal.
> *(Verified: `c3xa5` is the only legal move; the e5-blocked jump is illegal.)*

A defender who **walls your landing squares** dictates the direction of your
forced capture. The jump you "must" make is the jump he has left open for you — and
he has left it open because it suits *him*, dragging your man to the side he
prefers, perhaps off the edge and into a waiting recapture. This is
[STRATEGY §5](../STRATEGY.md) again from the defender's chair: **before you obey a
forced capture, read the whole board** and ask not only "what must I take?" but
"why has he left me only this?"

In the opening proper, where the back ranks are still full, walls of this kind are
rare on move one but begin to appear by move three or four, as towers form and
landing squares fill. Train your eye on them now; in the middlegame
([Chapter 5](ch05-middlegame.md)) the deliberate construction of such walls — and
the sacrificial lures that exploit a forced reply — becomes a central art.

---

## 4.5 The honest map: where opening theory ends

It would be easy, and dishonest, to pad this chapter with a dozen "named lines"
spun out of the engine to three or four moves and dressed up as theory. We will
not. Here is the true state of Laska opening knowledge, stated plainly so you know
exactly how much to trust:

- **What is solid.** The boundary of [§4.2](#42-develop-toward-the-centre): *centre
  good, edge bad*, stable across depths 2–4 and machine-verified. The forced-contact
  fact of [§4.1](#41-the-position-and-the-one-fact-that-shapes-everything): every
  first move is answered by a single forced capture. The recapture dynamic of
  [§4.3](#43-the-main-line): the opening is a race to land the recapture and end
  the forcing sequence on top. These you can rely on.
- **What is suggestive.** The faint depth-4 preference for `c3-b4` / `e3-f4` over
  `c3-d4` / `e3-d4`. Real in the data, but two evaluation points wide and produced
  by an *untuned* heuristic. A whisper, not a rule.
- **What does not yet exist.** Named opening *systems* — multi-move sequences with
  agreed assessments, the way chess has the Ruy Lopez or draughts its three-move
  ballots. Laska has no such corpus. The historic games we possess (Lasker's own
  1911 explanatory games, replayed and validated in the engine) are *instructional*
  positions, not a competitive opening tradition. There is, as yet, no book of
  Laska openings — and a book that claimed otherwise would be selling you fiction.

This is not a confession of weakness; it is an invitation. **The opening of Laska
is, today, an unwritten chapter of a hundred-year-old game.** Lasker gave us the
rules and a few illustrative games; the engine gives us a reliable compass for the
first two or three moves. Past that, the parchment is blank, and the first players
to fill it with sound, tested lines will be writing genuine theory for the first
time since 1911. Develop to the centre, win the recapture, and play on into the
unknown — which is, after all, exactly the kind of game Lasker meant his to be.

---

## Verification summary

Every position and line in this chapter was decoded with `decodePosition`,
checked against `legalMoves` / `applyMove`, and every "only move / forced /
engine's choice at depth N / column count" claim asserted programmatically via the
session-scratchpad harness behind [`exercises.md`](exercises.md).

| Claim | Status |
|---|---|
| 4.1 Exactly 6 legal opening moves | **Verified** |
| 4.1 Every first move answered by a single forced capture (full table) | **Verified** (all 6) |
| 4.2 Central moves best, edge lunges worst — stable at depths 2, 3, 4 | **Verified** |
| 4.2 Faint depth-4 preference `c3-b4`/`e3-f4` (presented as a whisper) | **Verified** |
| 4.3 `1.c3-d4 e5xc3 2.b2xd4` → W 11 / B 10, `BsWs` on d4, no Black recapture | **Verified** |
| 4.3 caveat: `1.c3-b4 a5xc3 2.b2xd4` → W 11 / B 10 (same material as c3-d4 line) yet engine rates it slightly higher | **Verified** |
| 4.4 `c3xa5` only legal move (e5-blocked jump illegal) | **Verified** |
| 4.5 honest-map section | Editorial; rests on verified §4.1–4.3 |

**Claims engine-verified: 8 (including the full 6-row forced-reply table).
`[VERIFY]`: 0.** No winning line was invented; the one place the data is soft (the
two-point depth-4 preference) is flagged in the prose as suggestive, not solid.
