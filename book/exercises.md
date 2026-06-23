# The Book of Laska — Exercises

> **Status:** DRAFT for review. Every position and solution line in this file has
> been constructed and replayed through the real rules engine in `src/` (see
> **Verification**, below). Exercises tagged `[VERIFY]` are unverified and must be
> checked or cut before publication; at this draft there are none.
>
> **How to read an exercise.** Each one gives you a *position* in the engine's
> own notation, a *prompt* (whose turn, what to find), the *solution* in move
> notation, and the *principle* it drills — traced to [`STRATEGY.md`](../STRATEGY.md).
> The `[DIAGRAM: …]` line is the handle the app uses to render the position live;
> in print it degrades to a static board.
>
> These exercises *train the same five principles the engine evaluates and the
> tutorial introduces.* They are not a second rulebook — they are the practice
> court. Foundations and Fundamentals teach the hand; Opening, Middlegame and
> Endgame teach the head.

---

## Notation, in one breath

A square is a file-letter `a`–`g` and a rank-number `1`–`7`; White's home is the
low ranks, Black's the high. `c3-d4` is a quiet step; `c3xe5` is a capture (you
jump the man on `d4` and land on `e5`); `a1xc3xa1` is a *chain* — the same piece
keeps jumping. A position is written `side:square=stack,…` where a stack is
listed **bottom-to-top**, two characters per man (`Ws` = White soldier, `Bo` =
Black officer). So `c3=BsWs` is a column on c3 with a Black soldier buried at the
bottom and a White soldier commanding on top — a White column holding one
prisoner. The board is empty everywhere not listed. This is exactly the string
the engine reads, so nothing here can be drawn that the engine would not allow.

The squares, for reference:

```
   a   b   c   d   e   f   g
7  a7      c7      e7      g7
6      b6      d6      f6
5  a5      c5      e5      g5
4      b4      d4      f4
3  a3      c3      e3      g3
2      b2      d2      f2
1  a1      c1      e1      g1
```

---

## Chapter I — Foundations

*The mechanics, in your hands. Four positions, each isolating one truth about a
capture so it can never be confused with another. Nothing here requires you to
plan — only to see the jump and make it.*

### Exercise F1 — Your first prisoner
**Position:** `W:8=Ws,12=Bs`
**Prompt:** White to move. There is exactly one move on the board. Make it.
**Solution:** `c3xe5`
**Principle:** *The capture is a jump.* You leap the adjacent enemy on d4 and land
on the empty square beyond. The Black soldier is not removed — it slides to the
**bottom** of your column. You now command a two-man tower holding one prisoner.
This is the single rule that makes Laska not checkers (TUTORIAL, beat 1–2).
**Verified:** the move is the *only* legal move (capture is mandatory); it ends
the game — Black has no pieces left.
`[DIAGRAM: W:8=Ws,12=Bs]`

### Exercise F2 — The column moves as one
**Position:** `W:8=BsWs,12=Bs`
**Prompt:** White to move. Your column on c3 already holds a prisoner. Capture
again.
**Solution:** `c3xe5`
**Principle:** *A column is one piece.* The buried Black soldier comes along for
the ride; the **commander** (the White man on top) decides where the whole tower
goes and what it may do. After the jump you hold *two* prisoners under one
commander (STRATEGY §1 — height is lives).
**Verified:** legal and mandatory; ends the game.
`[DIAGRAM: W:8=BsWs,12=Bs]`

### Exercise F3 — Ownership can flip
**Position:** `W:8=Ws,12=WsBs,11=Bs`
**Prompt:** White to move. Two captures exist. Find the one that *frees your own
man.*
**Solution:** `c3xe5`
**Principle:** *Whoever sits on top owns the column.* The column on d4 is a White
soldier with a Black commander — it is Black's, and one of *your* men is its
prisoner. Jump it: you take only the Black commander, and the White soldier
beneath is released and rejoins you. A capture can *liberate* as well as
imprison (TUTORIAL, beat 4).
**Verified:** `c3xe5` is the engine's top move; White's controlled squares rise
from 1 to 2 and the held-prisoner count swings from Black to White.
`[DIAGRAM: W:8=Ws,12=WsBs,11=Bs]`

### Exercise F4 — The crown ends the move
**Position:** `W:16=Ws,18=Bs,19=Bs`
**Prompt:** White to move. Capture — and notice where the move *stops.*
**Solution:** `e5xc7`
**Principle:** *Promotion ends the move, even mid-chain.* Your soldier jumps b6
and lands on c7, the back rank, and is crowned a **general** (officer) at once —
so the move ends there, even though a second jump looked available. The general
will move both directions on the next turn, but not on this one. The rule that
catches every newcomer (TUTORIAL, beat 3 + rules).
**Verified:** `e5xc7` is the engine's top move and resolves as a single jump that
promotes; the chain does *not* continue.
`[DIAGRAM: W:16=Ws,18=Bs,19=Bs]`

---

## Chapter II — Fundamentals

*From mechanics to judgement. You still calculate one move, but now the position
offers a choice or a chain, and the right answer expresses a principle —
mandatory capture, the multi-jump, freeing a man, the quiet promotion.*

### Exercise Fu1 — You are not asked, you are told
**Position:** `W:8=Ws,12=Bs,1=Ws`
**Prompt:** White to move. The soldier on c1 would love to develop. May it?
**Solution:** `c3xe5`
**Principle:** *Capture is mandatory and overrides everything.* A second White
soldier sits idle on c1 with quiet moves available — but because a capture exists
anywhere on the board, *only* the capture is legal. You do not get to choose to
develop while a jump is on offer (STRATEGY — the rule the whole game turns on).
**Verified:** `c3xe5` is the *only* legal move in the position despite the spare
soldier; it ends the game.
`[DIAGRAM: W:8=Ws,12=Bs,1=Ws]`

### Exercise Fu2 — Two in one move
**Position:** `W:0=Ws,4=Bs,12=Bs`
**Prompt:** White to move. One move wins both Black men. Find the chain.
**Solution:** `a1xc3xe5`
**Principle:** *A capture must continue.* Your soldier jumps b2, lands on c3,
and — because another jump is available — must keep going, jumping d4 to e5. One
move, two prisoners, two lives added to your tower. This is the engine of every
Laska combination (STRATEGY §1).
**Verified:** the chain is the engine's top move; it ends the game with two
prisoners held.
`[DIAGRAM: W:0=Ws,4=Bs,12=Bs]`

### Exercise Fu3 — Free the man, don't just grab a piece
**Position:** `W:8=Ws,12=WsBs,11=Bs`
**Prompt:** White to move. Two captures. Which one *improves your position* the
most?
**Solution:** `c3xe5`
**Principle:** *Liberation over acquisition.* Jumping the enemy-topped column on
d4 takes the Black commander **and** releases the White soldier it was burying.
The alternative capture grabs a lone soldier but leaves your man imprisoned. Read
*who owns what* before you jump (STRATEGY §1 — control, not count).
**Verified:** `c3xe5` is the engine's top move; control swings to White and the
prisoner ledger flips from Black to White.
`[DIAGRAM: W:8=Ws,12=WsBs,11=Bs]`

### Exercise Fu4 — Crown by walking, when no jump is forced
**Position:** `W:18=Ws,24=Bs`
**Prompt:** White to move. No capture exists. Promote your soldier.
**Solution:** `b6-c7` *(or `b6-a7` — either rim square crowns)*
**Principle:** *A general is made by reaching the back rank, jump or no jump.*
With no capture on the board you are free to make a quiet move; stepping to the
seventh rank crowns the soldier into an officer that will command both
directions. Promotion is not only the climax of a capture chain — it is a goal
worth steering toward (STRATEGY §1 — commander rank).
**Verified:** with the Black soldier held far away, no capture is legal; both
rim steps are legal quiet moves and both promote.
`[DIAGRAM: W:18=Ws,24=Bs]`

---

## Chapter III — The Opening

*The first principles of the empty centre. With so few prior games on record,
these are stated as the engine sees them — and where that is all we have, the
exercise says so.*

### Exercise O1 — A wall takes away your choice
**Position:** `W:8=Ws,11=Bs,12=Bs,16=Bs`
**Prompt:** White to move. You must capture. Where does the position *let* you?
**Solution:** `c3xa5`
**Principle:** *Structure dictates tactics.* Two enemy soldiers sit ahead of you,
but the square beyond d4 (that is, e5) is occupied by a third Black man, so that
jump is blocked — only the leftward jump over b4 to a5 is legal. A defender who
*walls the landing squares* can force your capture to the side he prefers. The
move you "must" make is the move he left open (STRATEGY §5 — read the whole board
before the forced reply).
**Verified:** `c3xa5` is the *only* legal move in the position; the
e5-blocked jump is illegal.
`[DIAGRAM: W:8=Ws,11=Bs,12=Bs,16=Bs]`

### Exercise O2 — Develop toward the centre, not the edge
**Position:** the standard **starting position** (White to move) —
`W:0=Ws,1=Ws,2=Ws,3=Ws,4=Ws,5=Ws,6=Ws,7=Ws,8=Ws,9=Ws,10=Ws,14=Bs,15=Bs,16=Bs,17=Bs,18=Bs,19=Bs,20=Bs,21=Bs,22=Bs,23=Bs,24=Bs`.
**Prompt:** White's very first move. Six are legal. Which serves you, and which
should you avoid?
**Solution:** A central development such as **`c3-d4`** (equally `c3-b4`,
`e3-d4`, `e3-f4`). **Avoid `a3-b4` and `g3-f4`** — the edge lunges.
**Principle:** *Fight for the centre from move one; the edges come to you.* The
four central developments give your men more diagonals and contest the empty
middle row; the two edge moves commit a flank soldier to less useful ground.
This is STRATEGY §1 (edge-vs-centre) read forward from the start: weak material
dragged to the centre is exposed, but in the *opening* it is your reach that you
are placing, and the centre maximises it.
**Verified:** across search depths 2, 3 and 4 the engine ranks the four central
developments as its best opening moves and `a3-b4` / `g3-f4` as its two *worst*,
every time — a stable, machine-checked opening principle, not an opinion.
**Honest note:** Laska opening theory barely exists. This is the engine's
verdict, offered as the soundest available guidance, not a refuted line of play.
`[DIAGRAM: START]`

---

## Chapter IV — The Middlegame

*Where columns collide. Now you must see two and three moves deep, set bait, and
trust a forced reply. These drill STRATEGY §4 (the one-handed attack) and the
officer's command of the diagonals.*

### Exercise M1 — The one-handed attack
**Position:** `W:0=WsWsWo,5=Ws,12=BsBs`
**Prompt:** White to move and win. Set the bait, await the forced reply, convert.
**Solution:** `d2-c3`  ·  *Black is forced* `d4-b2`  ·  `a1xc3xa1`
**Principle:** *Offer the column as bait; collect the men it forces forward.*
Your tall officer-topped tower on a1 is the engine of a one-handed attack
(STRATEGY §4): the quiet `d2-c3` offers a man, Black's *only* legal reply is to
take it (`d4-b2`), and your tower jumps back through c3 to a1 — a same-square
chain that sweeps the board. The attacker ends shorter but intact; the defender's
men are now your prisoners.
**Verified:** Black's reply is *forced* — it is the single legal move after
`d2-c3`; the finishing chain `a1xc3xa1` ends the game with two new prisoners
held. (This is the worked example from the tutorial's middlegame lesson, here
re-verified.)
`[DIAGRAM: W:0=WsWsWo,5=Ws,12=BsBs]`

### Exercise M2 — The same-square re-jump
**Position:** `W:0=Wo,4=BsBs`
**Prompt:** White officer to move. Bury the entire two-man enemy column in one
turn.
**Solution:** `a1xc3xa1`
**Principle:** *An officer can jump the same square twice in a turn.* Your general
on a1 jumps the Black commander on b2 to c3, then — the square b2 still occupied
by the second Black soldier — jumps *back over b2* to a1. Two jumps, one square
jumped twice, the whole enemy column buried under your officer. This is the
defining tactic of Lasker-classic rules (the engine's default variant) and a
favourite of Lasker's own games.
**Verified:** `a1xc3xa1` is the engine's top move at depth 6; it ends the game
with both Black men held prisoner.
`[DIAGRAM: W:0=Wo,4=BsBs]`

### Exercise M3 — The officer reverses to keep capturing
**Position:** `W:8=Wo,12=Bs,13=Bs`
**Prompt:** White officer to move. One chain takes both. It changes direction
mid-jump.
**Solution:** `c3xe5xg3`
**Principle:** *An officer commands all four diagonals — including backward.* The
general on c3 jumps d4 forward to e5, then reverses to jump f4 *back down* to g3.
A soldier could never make the second leap; the officer's two-way reach is what
turns a single capture into a sweep (STRATEGY §1 — commander rank; §4 condition 2,
that backward attackers must be officers).
**Verified:** `c3xe5xg3` is the engine's top move at depth 6 and ends the game.
`[DIAGRAM: W:8=Wo,12=Bs,13=Bs]`

---

## Chapter V — The Endgame

*Conversion. Few men, no margin for a loose move. The lesson is that a column or
an officer is a winning *machine* — if you finish cleanly.*

### Exercise E1 — The officer mops up
**Position:** `W:8=Wo,12=Bs`
**Prompt:** White officer to move and win.
**Solution:** `c3xe5`
**Principle:** *In a bare endgame, the officer's reach is decisive.* The lone
Black soldier cannot avoid the general's diagonal; one jump removes it and the
game is over. With nothing left to entangle the position, a single well-placed
officer simply collects (STRATEGY §1 — commander rank as the endgame's deciding
asset).
**Verified:** `c3xe5` is the engine's top move at depth 6 and ends the game —
Black has no pieces.
`[DIAGRAM: W:8=Wo,12=Bs]`

### Exercise E2 — The crowning capture
**Position:** `W:16=Ws,18=Bs,19=Bs`
**Prompt:** White to move. Capture *and* promote in the same stroke.
**Solution:** `e5xc7`
**Principle:** *The strongest endgame jump is the one that crowns.* Your soldier
jumps b6, lands on the back rank c7, takes a prisoner *and* is promoted to a
general in one move — converting material and upgrading your commander at once.
Recall F4: the crown ends the move, so the second jump that looked available is
forbidden — but you have ended a soldier and begun an officer, and that is the
better trade (STRATEGY §1; the promotion rule as an endgame resource).
**Verified:** `e5xc7` is the engine's top move at depth 6; it captures and
promotes, and the move correctly terminates on promotion.
`[DIAGRAM: W:16=Ws,18=Bs,19=Bs]`

---

## Verification

Every position above was decoded with `decodePosition`, checked for legality and
for being non-terminal, and every solution line was replayed move-by-move through
`legalMoves` / `applyMove` from `src/index.ts`. Where an exercise claims a move is
*the only* legal one, *forced*, *the engine's top move at depth N*, or *winning*,
that claim was asserted programmatically (not by eye). The throwaway harness lives
in the session scratchpad (`verify2.ts`), modelled on the prior run's `verify.ts`.

**Status of this draft: 15 exercises, all 15 fully engine-verified, 0 `[VERIFY]`.**

| Chapter | Exercises | Engine-verified | `[VERIFY]` |
|---|---:|---:|---:|
| I — Foundations | 4 (F1–F4) | 4 | 0 |
| II — Fundamentals | 4 (Fu1–Fu4) | 4 | 0 |
| III — Opening | 2 (O1–O2) | 2 | 0 |
| IV — Middlegame | 3 (M1–M3) | 3 | 0 |
| V — Endgame | 2 (E1–E2) | 2 | 0 |
| **Total** | **15** | **15** | **0** |

### Known gaps and next passes (for review)
- **Opening is thin (2 exercises) and the field is genuinely thin.** O2 is a real,
  cross-depth-stable engine principle; O1 is a structure-reading drill. Worth
  adding: a *named trap* line and a *capture-spreading* opening choice (STRATEGY
  §2), both requiring a position where the engine clearly prefers the
  balance-keeping capture — candidates probed but none yet gave a clean,
  un-tied preference, so they are deferred rather than asserted.
- **STRATEGY §3 (guarding a weak column with an officer) is not yet drilled.** It
  needs a position where a sacrifice *lure* is refuted by a posted officer guard —
  a two-move idea worth a dedicated Middlegame exercise once a clean, forced line
  is found and verified.
- **Endgame lacks a draw/zugzwang study.** The non-negotiable "honest about the
  unknown" standard means a fortress or no-progress draw exercise should be built
  against the repetition / no-progress machinery and verified to actually draw,
  not merely look drawn. Deferred to keep this draft fully verified.
- **Difficulty within chapters escalates by *depth of calculation*, not just
  motif.** Foundations are one forced move; Fundamentals add a choice or a chain;
  Middlegame requires a forced-reply sequence. A later pass should add one
  genuinely hard 3-move combination per Middlegame/Endgame chapter.
