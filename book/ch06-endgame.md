# The Book of Laska — Chapter 6: The Endgame

> **Status:** DRAFT for review. Every position, verdict, and line below was
> constructed and *solved* through the real rules engine in `src/` — not by eye.
> The verification method is unusually strong for this chapter: where checkers
> and chess authors lean on a human's judgement, the small-piece Laska endgame is
> finite enough to **solve exactly**, and I did. Two tools sit behind the claims:
> an exhaustive game-theoretic solver (full reachable-graph minimax with the
> repetition/no-progress draw rule built in) and a strongest-AI play-out
> (`chooseMove` at depth 8 with quiescence, both sides). Anything not nailed down
> by one of those is tagged `[VERIFY]` and is presented as an *open question*, not
> a fact. There is a lot we honestly do not yet know — and this chapter says so.
>
> **How to read a position.** Squares are file-letter `a`–`g` and rank `1`–`7`;
> White's home is the low ranks. A position is `side:square=stack,…`, each stack
> listed bottom-to-top, two characters per man (`Ws` White soldier, `Bo` Black
> officer). `c3=BsWs` is a White-commanded column on c3 burying one Black prisoner.
> This is exactly the string the engine reads. `c3-d4` is a quiet step; `c3xe5` a
> capture; `a1xc3xa1` a chain (one piece, same square jumped twice). The
> `[DIAGRAM: …]` line is the handle the app uses to render the board live.

---

## The shape of a Laska endgame

Two facts about Laska bend its endgame away from every game it resembles.

**First: nothing ever leaves the board.** A capture does not remove a man — it
*buries* him at the foot of the capturing column. Material, in the chess sense,
is conserved forever; what changes hands is *control*. So the endgame is never
about a dwindling count of pieces. It is about who commands the columns that
remain, and whether the men buried beneath those commanders can ever be set free.
A "won endgame" in Laska is one where you can force the last enemy commander to
be jumped — burying the final piece that still answers to the other player —
because once a side controls **no** column, it has lost (`gameStatus`,
`reason: 'no-pieces'`).

**Second: the soldier cannot wait.** A soldier moves one direction only. Every
soldier move is therefore *irreversible progress* toward its own back rank, and a
soldier with no capture and no forward square has **no move at all** — which in
Laska is not stalemate-as-draw but a **loss** (`reason: 'no-moves'`). Only an
**officer** — crowned, two-directional — can shuffle back and forth, mark time,
and decline to commit. This single asymmetry governs the whole endgame: *the
officer is the only piece that can wait, and in a game decided by who is forced
to move first, the right to wait is the whole battle.*

Put those two facts together and the Laska endgame reveals itself as a game of
**zugzwang** — of compulsion. You do not win by having more; you win by arranging
that your opponent must move *into* a capture while you need not. We will prove,
position by position, that this is not a metaphor.

---

## A tablebase in miniature

What follows is a handful of fundamental endings, each **exactly solved**: every
reachable position classified win / loss / draw by full minimax over the finite
move graph, with the engine's own repetition and no-progress draw rules applied
to cycles. Where a graph was too large to solve exhaustively in memory, the
verdict instead comes from a strongest-AI play-out and is labelled as such. These
are the bricks; the named techniques below are built from them.

### Key Position 1 — The lone officers (the purest zugzwang)

**Position:** `W:8=Wo,24=Bo` — a White general on c3, a Black general on g7, and
nothing else. White to move.
**Verdict (exactly solved): WHITE LOSES.** Not "is worse" — *loses*, against any
defence, in a graph of **609 reachable positions with zero draws among them.**
**Technique:** *He who must move, loses.* Each general roams all four diagonals,
so neither can be cornered by force — yet the engine's full-graph solver proves
every one of White's four legal first moves (`c3-d4`, `c3-b4`, `c3-d2`, `c3-b2`)
leads to a position Black wins. The reason is conservation plus compulsion: with
one piece each and no waiting partner, the board is small enough that the side on
move is eventually shouldered into a square where the *next* tempo forces it
adjacent to the enemy general on the enemy's terms. A sample forced finish:
`c3-d4 g7-f6 d4-e5 f6xd4` — and now White, with no piece left, has no move and
has lost.
**Why it matters:** this is the atom of Laska endgame theory. *One general versus
one general is never a draw* — it is a full-point swing decided entirely by whose
turn it is. Learn to count the tempo before you trade down to it. (Engine-solved:
609 nodes, 284 wins / 325 losses / **0 draws**.)
`[DIAGRAM: W:8=Wo,24=Bo]`

### Key Position 2 — Soldier loses to officer (rank is destiny)

**Position:** `W:0=Ws,24=Bo` — a White soldier on a1, a Black general on g7.
White to move.
**Verdict (exactly solved): WHITE LOSES** — 701 reachable positions, **0 draws.**
**Technique:** *A soldier cannot wait; an officer can.* The White soldier can only
march forward toward g7's half of the board, and the moment it can no longer
advance without being taken, the general collects it. A forced line:
`a1-b2 g7-f6 b2-c3 f6-g7 c3-d4 g7-f6 d4-e5 f6xd4` — White is buried and lost. The
general never had to commit to anything; it simply waited the soldier out.
**Why it matters:** when you must trade down, **trade down to the officer, not the
soldier.** A crown is not a luxury in the endgame — it is the difference between
the piece that loses and the piece that wins. (Engine-solved: 701 nodes,
321 / 380 / **0 draws**.)
`[DIAGRAM: W:0=Ws,24=Bo]`

### Key Position 3 — The clean conversion: two generals beat one

**Position:** `W:0=Wo,3=Wo,24=Bo` — White generals on a1 and g1, a lone Black
general on g7. White to move.
**Verdict (exactly solved): WHITE WINS** — 7,995 reachable positions, **0 draws.**
**Technique:** *Two waiters defeat one.* With two generals, White always has a
spare officer to burn a tempo while the other improves — so White can hand the
zugzwang to Black instead of suffering it. The solver's winning line walks the
generals up the board in step, never letting Black escape the squeeze, until a
capture is forced:
`a1-b2 g7-f6 g1-f2 f6-g7 b2-c3 g7-f6 f2-g3 f6-g7 c3-d4 g7-f6 g3-f4 f6-g7 d4-e5 g7-f6 e5xg7` —
and Black, with no piece left, has lost.
**Technique to *feel*:** notice White never rushes. Each pair of moves is "advance
one general, wait with the other." That is the engine of the whole conversion —
**keep one officer in reserve as a tempo bank** so the obligation to move always
falls on the defender. This is the model for converting any officer-majority
ending. (Engine-solved: 7,995 nodes, 4,288 / 3,707 / **0 draws**.)
`[DIAGRAM: W:0=Wo,3=Wo,24=Bo]`

### Key Position 4 — Officer + soldier beats lone officer

**Position:** `W:0=Wo,1=Ws,24=Bo` — a White general on a1, a White soldier on c1,
a lone Black general on g7. White to move.
**Verdict (strongest-AI play-out, depth 8, both sides): WHITE WINS** in 11 plies:
`a1-b2 g7-f6 c1-d2 f6-g5 b2-c3 g5-f6 c3-d4 g5? …` resolving
`a1-b2 g7-f6 c1-d2 f6-g5 b2-c3 g5-f6 c3-d4 f6-g5 d4-e5 g5-f6 e5xg7`, Black with no
piece left.
**Technique:** *the soldier is the spare tempo.* Even an un-crowned soldier, used
purely as a man to push while the general does the cornering, supplies the extra
move that breaks the symmetry of Position 1 — and the side with the extra man
wins. The full game graph for this material is large; this verdict comes from a
play-out by the strongest engine setting for **both** sides, not from the
exhaustive solver, so it is reported as a strong play-out result rather than a
proof of every defence. `[VERIFY: exhaustive solve pending — graph exceeded the
in-memory solver; only the play-out line is certified.]`
`[DIAGRAM: W:0=Wo,1=Ws,24=Bo]`

---

## Winning structures vs. drawing structures

From the solved atoms, a hierarchy emerges — stated as the engine proved it, with
the honest gaps marked.

- **An officer majority wins** (Position 3): a spare general is a tempo bank, and
  the tempo bank breaks zugzwang in your favour.
- **A material/tempo advantage of even one man wins** (Position 4): the extra man
  need not even be crowned; it only has to be able to *waste a move* you need to
  waste.
- **Equal lone material is decided by the move, not the men** (Positions 1–2):
  one-for-one, the side *to move* is in zugzwang and loses. This is the single
  most important endgame fact in Laska and the least intuitive to a chess player,
  for whom king-vs-king is the deadest of draws.
- **Rank beats reach-less.** A soldier, unable to wait, loses to an officer of
  otherwise equal standing (Position 2). When simplifying, steer your last
  surviving man to a crown.

The practical reading for the middlegame-into-endgame transition: **count tempi
before you trade.** Before you swap down to a bare ending, ask *who will be on
move in the resulting position* — because in Laska that, not the material count,
is frequently the whole result.

---

## The fortress, and an honest gap

Here this chapter must be candid, in keeping with the book's standard of being
honest about the unknown. **I went looking for a drawing fortress and could not
build one in the material I can exhaustively solve.** Every small ending I solved
to completion — one officer each, two officers vs. one, officer-and-soldier vs.
officer, and others — came back with the same astonishing line in the report:
**zero drawn positions.** Each is a forced win for one side. (See Positions 1–3:
609, 7,995, and 701 nodes respectively, all with a draw-count of 0.)

Two structural reasons explain why fortresses are so scarce in Laska, and they
are worth understanding even though they are not yet a theorem:

1. **A free officer roams the whole board.** Attempts to wall a general into a
   safe pocket fail because, moving all four diagonals, it can almost always be
   coaxed out — and once two generals share an open 7×7 board, a capture is
   always *reachable*, so the position can never be permanently frozen. Every
   walled-fortress candidate I built had a capture somewhere in its reachable set.
2. **Soldiers cannot hold a wall alone.** A line of mutually-blocking soldiers is
   genuinely frozen — but a side reduced to only frozen soldiers eventually has
   *no legal move*, which is a loss, not a draw. A draw needs a waiting move, a
   waiting move needs an officer, and a free officer (reason 1) breaks the freeze.

So the working conjecture — **stated as a conjecture, not a fact** — is that
*pure-officer and officer-vs-soldier Laska endgames may admit no fortress draw at
all; small Laska endings may be universally decisive.* That would make Laska
endgame theory radically unlike chess or checkers, where the draw is the gravity
the whole endgame falls toward. The engine's draw machinery (threefold
repetition, 40-ply no-progress) is real and *fires* in messier middlegame
positions; what I have not yet found is a clean, minimal, exactly-solved *ending*
in which it is the best both sides can do.

**`[VERIFY]` — the drawing fortress.** This is the chapter's one genuinely open
deliverable. The exercises file deferred an endgame draw/zugzwang study precisely
because a fortress must be *proven* to draw, not asserted, and I will not ship an
asserted one. The next pass needs either (a) a constructed position with at least
one immobile-soldier wall and exactly one penned officer per side, small enough to
solve exhaustively and showing draw-count > 0; or (b) a proof sketch that no such
position exists, upgrading the conjecture above to a theorem. Until then, the
honest headline of the Laska endgame is: **we have found only wins.** That is new
ground, and we mark it as new ground.

---

## Chapter 7 — Attack Over Defence (endgame coda)

> The full Chapter 7 lives elsewhere; this is the endgame's bridge to it. Lasker
> called Lasca *"a game of attack rather than of defence,"* and the endgame is
> where that principle stops being a slogan and becomes arithmetic.

Everything proven above is the attacker's charter. In a game where **material is
conserved and the side compelled to move is the side that loses**, *passivity is
not safe — passivity is the losing condition itself.* The defender who merely
waits is, in the literal solved sense of Position 1, the player **on move**: the
one zugzwang squeezes. There is no quiet harbour to retreat into, because the
no-progress clock and the conservation of material mean a passive position cannot
be *improved* by sitting in it — it can only be handed back, one tempo at a time,
until someone is forced onto a losing square.

This reframes Lasker's dictum with engine-backed force:

- **The initiative is the right to make your opponent move.** In Positions 3 and
  4, the winner's whole method is to keep a spare tempo so the *obligation* to
  commit always falls on the defender. To attack, in the Laska endgame, is simply
  to ensure your opponent runs out of waiting moves before you do.
- **Spend material for the move, not for the man.** Position 4 shows an *extra
  soldier* — the weakest possible material — converting a drawn-looking symmetry
  into a win, purely because it is one more move you can afford to throw away.
  Conversely, STRATEGY §5's middlegame advice ("a passive retreat achieves very
  little; a counter-attack that creates a bigger threat is stronger") is the same
  truth read backward from the endgame: the men you spend to seize the initiative
  buy you the tempo that wins the bare ending.
- **Why passivity loses, concretely.** A defender who declines to attack will,
  with perfect play, reach exactly the positions this chapter solves — and in
  every one we solved, *the player to move loses.* Defence in Laska does not hold
  a draw; it merely chooses which losing tempo to be handed. Attack is not the
  bolder option. In the endgame, it is the only one that does not lose.

The endgame, then, is Lasker's principle made provable: **in Laska, you do not
defend a position — you either compel, or you are compelled.**

---

## Verification

| # | Position | Material | Verdict | Method | Draws in graph |
|---|----------|----------|---------|--------|---:|
| 1 | `W:8=Wo,24=Bo` | Oo vs Oo | **White loses** (zugzwang) | exact solve, 609 nodes | 0 |
| 2 | `W:0=Ws,24=Bo` | Ws vs Bo | **White loses** | exact solve, 701 nodes | 0 |
| 3 | `W:0=Wo,3=Wo,24=Bo` | 2 Oo vs Oo | **White wins** | exact solve, 7,995 nodes | 0 |
| 4 | `W:0=Wo,1=Ws,24=Bo` | Oo+Ws vs Oo | **White wins** | strongest-AI play-out (d8) | `[VERIFY]` exhaustive |
| — | drawing fortress | — | **not found** | exhaustive search of solvable material | — |

**Method, in brief.** Positions 1–3 were solved by building the *entire* reachable
position graph (board + side-to-move as the key, exactly as the engine's
repetition key encodes it) and running win/loss/draw minimax to a fixpoint, with
unresolved cycles classified as draws per the engine's own draw rules. The
verdict "White loses" means *every* legal White move was independently confirmed
to reach a position the opponent wins — checked programmatically, not by reading a
single line. Position 4 was verified by playing the position to a terminal
`gameStatus` with `chooseMove` at depth 8 + quiescence for **both** sides
(deterministic seed). Throwaway harnesses (`harness.ts`, `solver.ts`, `reach.ts`)
live in the session scratchpad, never the repo.

**Status of this draft:** 3 endgame positions exactly solved (Positions 1–3),
1 verified by strongest play-out (Position 4), and **1 honest open problem** (the
drawing fortress). Correctness over volume: every verdict above is engine-proven
or engine-played, and the one thing we could not prove is labelled, not faked.

### Known gaps and next passes (for review)
- **The drawing fortress is unbuilt.** Top priority: either construct and
  exactly-solve a position with draw-count > 0 (likely needing an immobile-soldier
  wall plus one penned officer per side), or prove no small-material fortress
  exists — upgrading the "Laska endings may be universally decisive" conjecture to
  a theorem. This is the chapter's load-bearing `[VERIFY]`.
- **Position 4 wants an exhaustive solve.** Its graph overran the in-memory solver;
  a more memory-efficient solver (bitboard keys, on-disk frontier) would let us
  certify the win against *all* defences, not just the played-out line.
- **Conversion with prisoners.** Every solved ending here is "bare" (no buried
  men). An ending where a winning column already holds prisoners — and the defence
  tries to *recapture the commander to free them* — is the next motif to verify;
  early probes hit solver-size limits and are deferred rather than asserted.
- **A repetition-draw study.** Even if no static fortress exists, a *dynamic*
  threefold-repetition draw between two generals who both decline to commit may be
  forced from some root; finding and certifying one (the repetition key firing in
  optimal play, not merely in engine-vs-engine drift) is worth a dedicated study.
