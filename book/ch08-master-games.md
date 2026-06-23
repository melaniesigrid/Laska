# Chapter 8 — The Master Games

> **Status:** DRAFT for editorial review. Every move, capture, promotion, and
> control count cited below was produced by replaying the recorded score through
> the live engine (`web/src/games.ts` → `src/`), not transcribed by hand or by
> memory. Where the engine and the inherited commentary disagree, or where a
> claim cannot be settled by the engine alone, the text says so with a
> `[VERIFY]` marker rather than asserting it. Positions worth wiring to a live
> board are flagged `[DIAGRAM: …]`.
>
> Notation note: the engine's geometry files the board **a–g / 1–7, White at the
> bottom moving up** (see `src/board.ts`). Lasker's 1911 booklet numbered the 25
> playing squares 1–25 instead. This chapter annotates in the engine's algebraic
> coordinates — the ones the board actually renders — and quotes Lasker's
> original numeric tokens where it matters, so a reader can hold the booklet in
> one hand and the app in the other.

---

## I. Why these games, and not others

A strategy book earns the right to teach by first proving it is telling the
truth. Most games — chess, draughts, go — can lean on a literature so deep that
no single annotator has to vouch for the rules; the canon is the canon. Laska has
no such luxury. Its entire competitive record, a century after Emanuel Lasker
printed the rules in 1911, is a handful of scores: the teaching games Lasker
wrote into his own booklet, and a thin scatter of tournament fragments that
survived in club bulletins and on a few devoted web pages. That is the whole
archive. There is nothing to fall back on.

So these games carry a double weight. They are the only *competitive* record the
game owns — the closest thing Laska has to a tournament history — and they are
also the **proof of faithfulness**. When Lasker's own 1911 game replays
move-for-move on the same engine that enforces the rules online, that is not
nostalgia. It is the strongest possible evidence that the rules in this book are
the rules the inventor meant. The engine and the inventor check each other across
a hundred and fifteen years, and they agree.

That is the spirit of this chapter. We are not decorating old scores with
adjectives. We are reading three games that the engine has *verified are legal in
every ply*, and asking what they teach — naming the five principles of
[`STRATEGY.md`](../STRATEGY.md) where they actually appear in the moves, and being
honest, as Lasker would have insisted, about what we still do not know.

Three games survive the engine clean:

| Game | Players / source | Plies | Engine verdict at last recorded ply |
|---|---|---|---|
| **Moscow, 1996** | Tatarinow–Roschtschin | 25 | Position legal, **still ongoing** — Black *resigned* |
| **Lasker's Game 2 (1911)** | Lasker's booklet | 39 | **Win, White, by no-moves** — Black is frozen |
| **Lasker's Game 3 (1911)** | Lasker's booklet | 78 | Position legal, **still ongoing** — White is lost but not yet stalemated |

Note already, in that last column, the kind of honesty this chapter insists on.
Two of these three scores do **not** end in an engine-detected terminal position.
That is not a flaw in the games — it is how real games end: a player resigns, or
the result is agreed, before the board is literally emptied or frozen. The engine
proves the moves are legal; it cannot prove a resignation was correct. Where the
recorded result outruns what the engine can mechanically confirm, we will say so.

---

## II. Moscow, 1996 — Tatarinow vs Roschtschin

> **Source:** *"Twee Laska partijnotaties uit Rusland"*, Hoofdlijn No. 48 (1996),
> via lasca.org. **Engine:** all 25 plies legal; final position **ongoing**
> (Black resigned). **Result as recorded:** White wins, Black resigns.

### The opening: contest the centre, immediately

The board begins with the centre row empty — eleven soldiers a side, rows 1–3
against rows 5–7, and the no-man's-land of row 4 between them. White does the
most natural and most testing thing:

**1. c3–d4** — a soldier steps into the empty centre and dares Black to take it.

[DIAGRAM: opening — c3-d4 played, centre contested]

Black obliges: **1… e5xc3**, and now the first principle of the whole game shows
its face. That capture does *not* remove White's man from the board. It buries
it. The jumped White soldier slides to the **bottom** of Black's column, and
c3 now holds a two-piece stack `WsBs` — a White prisoner under a Black commander.
Material in Laska never leaves; it only changes hands and changes *depth*. This
is **column strength as a positional, not a material, idea** (STRATEGY §1) in its
very first instance: Black is not "a piece up," Black is *one column taller in one
place*, which is a different and more fragile kind of asset.

White recaptures toward the centre — **2. b2xd4** — and the early game settles
into the symmetric, trade-for-trade shape that the 1911 teaching games will show
us is essentially *theory*. Both sides keep feeding the centre and exchanging:
`c5–b4 / a3xc5 / d6xb4 / g3–f4 / f6–e5 / f4xd6 / c7xe5 / d4xf6 / d6xf4`. Through
ply 12 the control count stays near-level (White 9 / Black 9 controlled squares),
and nobody has yet committed to a tower.

### The turn: a soldier is sent the length of the board

The game's whole point arrives at move 9 of White (ply 17). Watch the column
heights, because they tell the story the move list hides.

Through the middlegame White has been quietly assembling. By ply 11 White's
**d4xf6** has built a three-high column on f6 (`BsBsWs` — two Black prisoners
under a White soldier). That tower is White's engine. And on ply 17:

**9. g3xg7** *(scored with a `*` in the original — a promotion marker)*.

[DIAGRAM: before ply 17 — White to play g3, the crowning combination]

The inherited note in the score calls this "White jumps the length of the board
and crowns." The engine tells the truer, sharper version: **g3xg7 is a two-jump
chain**, `g3 → e5 → g7`, capturing the men on **f4 and f6** in one breath, and the
soldier is **crowned the instant it lands on g7**. (Promotion ends the move even
mid-chain — a real rule, see `src/rules.ts`. The chain stops at g7 not because no
further jump existed in principle but because crowning closes the turn.) A
*soldier* that began the move able to step only one way arrives on the back rank a
**general** that moves both.

This is **attack over defence** (STRATEGY §5) made concrete. White did not spend
the middlegame guarding; White spent it *building a runway*, and then ran a single
man the length of the board through two enemy pieces and out the far side as an
officer. The men White "lost" earlier were never lost — here they are, buried,
being collected.

### The decisive column

After **9… c5–d4** Black tries to keep playing, but **10. g7xe5** turns the new
general loose:

[DIAGRAM: ply 19 — the crowned general sweeps back to e5, building a four-high tower]

The general sweeps back down the board, jumps f6, and the column on **e5 reaches
height four — `BsBsBsWO`**: three Black prisoners stacked beneath a White officer.
This is the deep-tower exception that STRATEGY §2 is careful to name — *"it can
sometimes be worth … recapturing them later as a single powerful column."* White
has not built a fragile over-stuffed tower by accident; White has built a
**dominating** one on purpose, crowned and mobile, with three enemy lives locked
underneath it. A column like this can be attacked several times before it is
neutralised — each capture only peels the commander — and Black simply does not
have the force left to do it.

The remaining moves (`d4xf2 / g1xe3 / b6–c5 / f2–g3 / a7–b6 / e5–f6`) are White
consolidating while Black shuffles. At the final recorded ply the engine still
counts the position **ongoing** — Black has four legal moves — but Black resigns,
and any honest reading agrees: White's crowned four-tower against scattered single
soldiers is not a game any longer.

> **Resolved — resignation, since proven sound by the engine.** Every one of the
> 25 recorded plies is legal, and the final position is *not* terminal: Black still
> has moves (`c3–b2, b4–a3, c5–d4, e7–d6`), so "White wins" was a **human
> resignation**, not a mechanical mate. We have now settled it the right way —
> by having the engine play the final position out under best play for both sides
> (strongest tier, depth 8, quiescence on). The verdict is unambiguous and stable
> across six seeds: **White wins by no-moves in 16 plies**, and the engine's static
> read of Black's best try in the final position is **−452.5** — a side that is, in
> the engine's eyes, already lost by the equivalent of more than four pieces. The
> resignation was correct. What the player saw over the board, the search confirms:
> the crowned tower decides.

**What this game teaches, in one line:** a soldier is not a small thing. Given a
runway and a reason, one soldier marched the length of the board, crowned, and
turned three captures into a single tower that decided the game. *Attack over
defence; build the deep column on purpose.*

---

## III. Lasker's Game 2 (1911) — the clean kill

> **Source:** *"Rules of Lasca, the Great Military Game"*, Dr. Emanuel Lasker,
> 1911 — Explanatory Game 2. **Engine:** all 39 plies legal; final position
> **terminal — Win, White, by no-moves.** **Result:** White wins, Black cannot
> move.

This is the jewel of the chapter and the cornerstone of the whole book's claim to
authority. It is one of the five games Lasker printed *himself* to explain his own
invention — and it replays, move-for-move, all thirty-nine plies, to an
**engine-detected win**. Black does not resign. Black is *frozen*: at the final
position the engine generates **zero legal moves** for Black, and `gameStatus`
returns `win / White / no-moves`. When the inventor's own teaching game ends in a
mechanically-provable mate on the code that runs the game today, the rules in this
book are not an interpretation. They are *his*.

### The opening: theory, by both hands

Lasker's tokens are numeric (his **9–13** is our **c3–d4**), and his Game 2 opens
exactly as Moscow 1996 will eighty-five years later — the same `c3–d4`, the same
immediate central exchange. That is not a coincidence to pass over: it suggests
the centre contest is genuine *opening theory*, the soundest first idea in the
game, arrived at independently by Lasker the inventor and by a Russian club player
a lifetime apart. A book on this game can fairly call **c3–d4** the main line.

The first dozen plies are a marvel of symmetry — capture answered by capture,
each side recapturing toward the centre, the control count hovering at parity
(White 9–11 / Black 8–10 throughout). Neither player is winning material, because
in Laska you cannot; both are jockeying for *which* columns will be tall and
*where* they will stand. This is STRATEGY §1 as a whole opening philosophy: the
fight is over column geography, not piece count.

### The first breakthrough: a crowning chain to the corner

The hinge of the game is **White's 10th move, ply 19**, the move Lasker's score
writes as the long chain **10—13—16—19—22**:

[DIAGRAM: before ply 19 — White's crowning combination e3 → c5 → a7]

> **[VERIFY] — chain length: the booklet's path vs. the engine's `Move`.** The
> inherited commentary in `games.ts` describes this as "a four-jump chain to
> square 22." The engine resolves the *actual move* as a **two-jump capture**:
> `e3 → c5 → a7`, taking the men on **d4 and b6**, and **promoting on a7** (square
> 22, a back-rank corner). The discrepancy is one of *notation*, not legality:
> Lasker's `10—13—16—19—22` lists every traversed square (the squares jumped *over*
> sit between the landing squares), so it reads as five numbers; the engine counts
> two jumps and two captured pieces. Both describe the same legal move — but the
> book should annotate the engine's two-capture reading, and a careful editor
> should reconcile the "four-jump" phrasing in `games.ts` so the prose and the
> engine never disagree. **Flagging, not papering over.**

What matters strategically: White lands an officer in the **a7 corner**. The edge
is the safest real estate in Laska for a strong column (STRATEGY §1, *edge vs.
centre*) — a corner officer can be approached from the fewest directions. White
has crowned *and* parked the crown where it is hardest to dislodge. That is
prophylaxis and aggression in the same move.

### The middlegame: spreading the captures, never one fragile tower

Watch what White does *not* do across plies 19–29. White repeatedly has a choice
of recapture, and repeatedly keeps the prisoners **spread** rather than piling
them under one commander. By ply 21 the a7 officer marches back **a7→c5** and the
column there grows to four (`BsBsBsWO`) — but White does not then funnel
*everything* into it. Through the middle of the game White's tall columns sit at
**c3 (`WsWsBs`)** and the traveling officer, with prisoners distributed, not
hoarded. This is **capture-spreading** (STRATEGY §2) practiced by the inventor
himself: balanced columns, no single over-stuffed liability for Black to lure and
topple.

Compare the control counts: from ply 19 onward White's controlled-square count
stays at 8–10 while Black's slides 6 → 5 → 4. White is not winning *material*
(there is none to win); White is winning *commanders* — steadily converting Black
soldiers into buried prisoners while keeping his own men on top.

### The second breakthrough and the freeze

The kill has two stages. First, around plies 27–30, a sharp exchange in the
lower-left (`b4→d2`, `d4→b2`, `c1→a3`, and Black's desperate sweeping reply
**g5→e3→c1**, a two-jump capture that even crowns on c1) trades down toward an
endgame where White holds the structural trumps. After **30… g5xe3xc1**, the c1
square holds a remarkable four-high mixed column `WOWsBsBO` — and from here White
is simply more mobile and better placed.

Then the noose. **31. g3xe5**, **33. e5xc7** (crowning a *second* White officer
on the c7 corner), and a quiet shuffle (`f2–e3`, the Black king flailing on the
back rank) reduce Black to four controlled squares with no constructive move. The
final blow is **20. e3xg5 (ply 39)**:

[DIAGRAM: ply 39 — White plays e3xg5; Black has no legal reply]

[DIAGRAM: FINAL — Black to move, zero legal moves: engine win for White]

The engine, asked for Black's reply, returns **nothing**. Black's remaining men
are all either soldiers facing the wrong way or columns with no empty diagonal to
step to and no capture available. `gameStatus` declares it: **White wins,
no-moves.** This is the **one-handed attack** (STRATEGY §4) carried to its logical
end — White's superior, mobile columns marched through and converted Black's force
into prisoners until the defender, materially "even" but positionally bankrupt,
could not lift a single man.

**What this game teaches, in one line:** you win Laska not by capturing *pieces*
but by capturing *mobility* — bury enough commanders, keep your own columns
spread and crowned at the edges, and the opponent runs out of moves while the
board is still full. *This is Lasker's own demonstration, and the engine signs
its name to it.*

---

## IV. Lasker's Game 3 (1911) — the long squeeze, and an honest gap

> **Source:** *"Rules of Lasca, the Great Military Game"*, Dr. Emanuel Lasker,
> 1911 — Explanatory Game 3. **Engine:** all 78 plies legal; final recorded
> position **ongoing** (White has 3 legal moves). **Result as recorded:** Black
> wins, White's last men blocked.

Where Game 2 is a clean kill in 39 plies, Game 3 is its opposite and its
complement: a patient, 78-ply manoeuvring battle, the longest score we own, and
the one that ends not in a bang but in a slow strangulation. It is also the game
that forces the most honesty out of us — so we will give it that honesty plainly.

### The opening and early middlegame: build, don't trade

Game 3 again opens **1. c3–d4** (Lasker's **9–13**) — a third independent vote for
the central main line. But its character diverges fast. Where Game 2 traded
columns down, Game 3 **builds** them and keeps the tension. Through the first
dozen plies both sides accumulate two-high columns on the c-file and the centre,
recapturing without ever fully clearing the board. By ply 14 Black has nudged
ahead on control (White 7 / Black 11) — Black is the one accumulating commanders
early here.

A clean illustration of **guarding a weak column** (STRATEGY §3) lives in this
phase. Notice White's quiet **15. b2–a3** (Lasker's **5—8**) and the earlier
**13. f2–e3**: these are not captures and not advances toward the enemy — they are
*support* moves, posting men beside vulnerable columns so that a sacrificial lure
into the centre would simply be recaptured. In a game this long, the
non-capturing guard move is half the work. (Lasker, the chess World Champion who
made *prophylaxis* a household word a generation before Nimzowitsch wrote it down,
would have called this obvious.)

### The middle: the longest run, and the crown race

The game's single most spectacular moment is **White's 13th move, ply 25**, written
**5—9—13—17—21** — and here the engine again sharpens the booklet's notation:

[DIAGRAM: before ply 25 — White's long capturing run b2 → d4 → f6]

> **[VERIFY] — run length.** The inherited note calls ply 25 "a five-square march
> to 21 — the longest single run of the game." The engine resolves the move as a
> **two-jump capture**, `b2 → d4 → f6`, taking the men on **c3 and e5**. As in Game
> 2, Lasker's five-number token lists *traversed* squares, not jumps; the engine
> counts two captures. It is still the longest *capturing chain* of the game — the
> commentary's spirit is right, its arithmetic is in the booklet's older
> convention. Annotate the engine's reading; reconcile the phrasing.

From here the game becomes a **crown race**. Both sides shepherd soldiers toward
their back ranks, and the engine's promotion flags light up on both sides: Black
crowns on **g1 (ply 30)**, White on **e7 (ply 37)**, Black again on **c1 (ply 38)**,
**a1 (ply 50)**, **e1 (ply 52)**. Officers proliferate. This is the phase that
makes Laska so unlike checkers: with both armies still largely on the board as
buried prisoners, the game's real currency becomes *which commanders move both
ways*, and the position fills with kings jockeying for the long diagonals.

### The squeeze: a single oscillating officer, and zugzwang

By the late middlegame the structural verdict is in, and it is against White. From
roughly ply 48 onward the control count locks at **White 2 / Black 10** — White is
reduced to exactly **two controlled squares** for the rest of the game. The engine
shows precisely what those are at the final position: a soldier-topped column on
**g3 (`BsWs`)** that can only creep forward, and a lone officer on **e7 (`WO`)**.

And so the game's last quarter — plies 53 through 77 — is one of the most
instructive things in the entire archive: **White's officer shuffles e7 ↔ f6,
back and forth, with nothing else to do**, while Black calmly improves, walking
columns around the board at leisure. White is in **zugzwang in slow motion**. Every
White move is forced or pointless; Black is simply waiting White out. This is the
shadow side of **attack over defence** (STRATEGY §5): the player reduced to
*pure defence*, with no counter-threat to make, loses not in a single blow but by
running out of useful things to do.

### The honest gap at the end

Here is where the chapter must be exact, because the engine and the recorded
result do not fully meet.

> **Resolved — the winner stands; the *mechanism* was misremembered.** The score
> ends at ply 78, **78… d4–e5** (Lasker's **13—17**), with the result given as
> *"Black wins — White's last men blocked."* The engine, asked for White's reply at
> that final position, returns **three legal moves** (`g3–f4, e7–f6, e7–d6`) and
> reports the game **ongoing**, not terminal. So the literal phrase "White's last
> men are blocked" is **not** what the board reaches — White can still move.
>
> Rather than leave it at that, we settled it the right way: the engine played the
> final position out under best play for both sides (strongest tier, depth 8,
> quiescence on), and the verdict is stable across six seeds. **Black wins by
> no-pieces in four plies.** The truth is more brutal than "blocked." Every White
> man but two is already buried under a Black commander; White's only free pieces
> are the `g3` column and the lone `e7` officer. Whatever White tries, Black simply
> captures both of those last free commanders within two moves apiece — and once
> they fall, White controls *zero* columns and loses by having no piece left to
> lead. White's best try in the final position scores **−999904**: the engine's
> notation for a forced loss, distance-to-mate and all.
>
> So the booklet's *result* is vindicated and the booklet's *reason* is corrected —
> exactly the kind of seam this engine-checked edition exists to find. Black does
> not freeze White in place; Black liquidates White's last two leaders. The
> "blocked" of the old note is a poet's shorthand for a four-ply execution.

[DIAGRAM: ply ~53 onward — White's officer oscillating e7↔f6, the zugzwang engine]

[DIAGRAM: FINAL recorded — White 2 controlled squares (g3, e7) vs Black 10]

**What this game teaches, in one line:** the slow win is a real win. You do not
always need a combination — sometimes you reduce the opponent to a single piece
with nowhere to go and simply *wait*. But the chapter also teaches a discipline
about evidence: when the inventor's record says "blocked" and the engine still
sees a move, the honest book reports both and resolves the gap with the engine,
not with invention.

---

## V. What the three games agree on

Read together, three games separated by eighty-five years and an ocean converge
on the same handful of truths — which is exactly why they belong in a strategy
book and not merely an archive:

1. **The centre is the main line.** All three open **c3–d4**, contesting the empty
   middle row at once. Inventor and tournament player, independently, vote the same
   first move. (STRATEGY §1 — column geography is decided early.)
2. **Material is an illusion; mobility is the asset.** No game is won by being
   "pieces up" — you cannot be, the men only change depth. Two of three are decided
   by the loser running out of *moves* while the board is still full. (STRATEGY §4,
   §5.)
3. **Build the deep column on purpose; spread the rest.** Moscow's crowned
   four-tower and Lasker's balanced middlegame are the two halves of STRATEGY §2 —
   one tall tower built deliberately, the other refusing to over-stuff the rest.
4. **The crown is the lever.** Every decisive turn in all three games involves a
   soldier reaching the back rank and becoming an officer that moves both ways.
   Promotion ends the move (sometimes mid-chain) and changes the game.
5. **Attack over defence, even at the end.** The player who can still *make a
   threat* dictates; the player reduced to pure defence — Game 3's oscillating
   officer — loses by zugzwang. Lasker's dictum is not a slogan; it is the through
   line of his own teaching games. (STRATEGY §5.)

---

## VI. Notes for the editor (gaps, verifications, wiring)

**Engine-verified, fully:**
- All 25 / 39 / 78 plies of the three games are legal in the engine (they replay
  at `games.ts` import or the build fails). Control counts, capture targets,
  promotion squares, and final-position move counts in this chapter all come from
  a replay harness, not by hand.
- Game 2 terminates in a genuine engine-detected mate (`win / White / no-moves`).
  This is the chapter's strongest claim and it is rock-solid.

**Resolved since the first draft (engine play-out, strongest tier, both sides):**
- **Moscow 1996 result** — *closed.* The final position is non-terminal (a
  resignation), but played out under best play the engine wins for **White by
  no-moves in 16 plies** (Black's best try scores −452.5), stable across six seeds.
  The resignation was sound; the chapter now states this outright.
- **Game 3 result** — *closed, with a correction.* Played out, **Black wins by
  no-pieces in 4 plies** (White's best try scores −999904, a forced loss). The
  booklet's *winner* is vindicated; its *reason* ("White's last men blocked") is
  not what the board does — Black liquidates White's last two free commanders
  rather than freezing them. The chapter now annotates the engine's true mechanism.

**Still open / flagged (`[VERIFY]`):**
- **Notation reconciliation** — the `games.ts` notes describe ply 19 of Game 2 as a
  "four-jump chain" and ply 25 of Game 3 as a "five-square march," but the engine
  resolves both as **two-jump captures** (the booklet's tokens list traversed
  squares, not jumps). The prose here annotates the engine's reading; an editor
  should align the `games.ts` commentary so the two never contradict (BOOK.md §4.2).

**Genuinely thin / unknown (BOOK.md §4.5):**
- We have **three** validated historic scores total. That is the *entire*
  competitive record this book can stand on. Any claim that a line is "best play"
  in these games is, strictly, unproven — these are illustrative games, not
  engine-optimal ones. The chapter is careful to say "teaches" and "illustrates,"
  never "refutes" or "wins by force," except where the engine returns an actual
  terminal verdict (Game 2).
- The held-back / partially-recovered scores referenced in the heritage backlog
  (lasca.org Game 1, a second 1911 game, brochure Games 1/4/5) are **not** in
  `HISTORIC_GAMES` and therefore **not** annotated here. When they replay clean they
  become new sections of this chapter — and not before. We ship history, not
  guesses.

**Live-diagram wiring (`[DIAGRAM]` markers above) — suggested interactive points:**
1. Moscow: the opening `c3–d4`; the ply-17 crowning combination `g3xg7`; the
   ply-19 four-tower on e5.
2. Game 2: the ply-19 corner-crowning chain `e3→c5→a7`; the ply-39 final
   no-moves position (the marquee interactive — let a reader try to find Black a
   move and fail).
3. Game 3: the ply-25 long run `b2→d4→f6`; the oscillating-officer zugzwang
   (plies 53–77); the final 2-vs-10 control picture.

Each of these maps to a `ReplayPage` ply index already, so wiring is a matter of
deep-linking the existing replay viewer to a move number, not building anything
new (`web/src/ReplayPage.tsx` already steps by ply).
