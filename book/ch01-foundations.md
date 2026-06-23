# Part I — Foundations

> **Status:** DRAFT for review. Every rule, coordinate, notation, position and
> move in these two chapters has been checked against the live engine in
> [`src/`](../src) — the same code you play against in the app. Nothing here is
> drawn from memory or from a secondary rulebook; where a claim could not be
> confirmed against the engine it is tagged `[VERIFY]`. Positions marked
> `[DIAGRAM: …]` are handles the app renders as a live board; in print they
> become a static diagram.

---

## Chapter 1 — The Board and the Men

### A small board with a long memory

Lasca is played on a board of forty-nine squares, seven by seven, but you will
only ever touch twenty-five of them. As in draughts, the men live on one colour
of square — here, the dark ones — and the light squares are merely the gaps
between. Lay the board down and the playing squares fall into a quiet, slanting
lattice: four along the bottom edge, three tucked in above, four again, and so
on to the top. Twenty-five in all.

That is the whole world. It is smaller than a chessboard and far smaller than a
draughts board, and a newcomer's first reaction is almost always that it looks
*too* small to hold a real game. Hold that thought. Lasca's smallness is a
trick. The board does not grow, but what stands on each square does — and a
single square, before a game is out, can hold a tower of half a dozen men with a
memory of every capture that built it. The board is small so that the *columns*
can be tall.

We will need two ways to name a square, because the game's history left us two.
Both describe the very same twenty-five squares; learn the lay of them once and
you can read either.

### Naming the squares: files and ranks

The notation this book uses for moves — the one the app speaks, the one Lasca's
modern scores are written in — borrows the chess habit of **files** and
**ranks**. Files are the columns of the grid, lettered `a` through `g` from left
to right. Ranks are the rows, numbered `1` through `7` from White's side
upward. A square is its file then its rank: `c3`, `e5`, `g7`. White's home is
along the low ranks; Black's along the high.

Because only the dark squares play, the lettered grid has holes in it. On the
even ranks the playing squares sit on files `b, d, f`; on the odd ranks they sit
on `a, c, e, g`. Here is the whole board, drawn White-at-the-bottom exactly as it
appears in the app:

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

Notice what is *not* there. There is no `b5`, no `a4`, no `d3`. A coordinate that
names a light square names nothing at all — the board has no such place. (This is
not pedantry: a famous transcription of one of Lasker's lines prints the move
"c5-b5," and `b5` simply does not exist on a Lasca board. The engine refuses it,
and so should you.) When in doubt, glance back at the diagram above: if the
file-letter and rank-number disagree about colour, the square is a phantom.

[DIAGRAM: W:0=Ws,1=Ws,2=Ws,3=Ws,4=Ws,5=Ws,6=Ws,7=Ws,8=Ws,9=Ws,10=Ws,14=Bs,15=Bs,16=Bs,17=Bs,18=Bs,19=Bs,20=Bs,21=Bs,22=Bs,23=Bs,24=Bs]

### Lasker's numbers

Emanuel Lasker, who invented the game in 1911, numbered the squares instead of
lettering them — `1` through `25`, threading left-to-right and bottom-to-top.
His square `1` is our `a1`; his `9` is our `c3`; his `25` is the far corner `g7`.
The two systems are the same board under different paint. You will meet Lasker's
numbers whenever you read his own writing or replay his original games, so it is
worth knowing that **Lasker's square N is the app's Nth square**, and that the
app's internal index for it is simply `N − 1`. We will lead with files-and-ranks
throughout, and reach for Lasker's numbers only when his own voice calls for them.

### The opening array

Set the men out as in draughts. Each side has **eleven** soldiers, filling the
three rows nearest its owner. White takes the low ground — every playing square
on ranks `1`, `2` and `3`. Black takes the high ground — ranks `5`, `6` and `7`.
The middle rank, the row of `b4 d4 f4`, is left empty: a no-man's-land three
squares wide that both armies are marching to cross.

In the engine's own position language, the start looks like this:

```
W:0=Ws,1=Ws,2=Ws,...,10=Ws, 14=Bs,...,24=Bs
```

— twenty-two lone soldiers, eleven of each colour, White to move. (Don't worry
about decoding that string yet; we will take it apart in the next chapter, where
it starts to earn its keep.) On Lasker's numbering the same picture reads:
White on `1`–`11`, Black on `15`–`25`, the centre `12`–`14` open.

There are always twenty-two men on this board. Remember that number. In Lasca
*nothing is ever removed* — a captured man is not taken off, only taken
**prisoner**. Twenty-two men start the game and twenty-two men finish it,
however the towers rearrange them. This single fact is the door to everything
that makes Lasca its own game, and Chapter 2 walks through it.

### The men, and what to call them

There are only two kinds of man, and a small, precise vocabulary for the shapes
they make together. The app and this book use one set of words; Lasker's
original booklet used another for the same things. Both are worth knowing.

- **Soldier** *(Lasker: a "private")* — a plain, un-promoted man. The pawn of
  Lasca. A soldier moves and captures **forward only**, one diagonal square at a
  time, toward the far side of the board.

- **Officer** *(Lasker: an "officer"; in the app, a "general," marked with a
  star)* — a promoted man, crowned for reaching the enemy's back rank. An
  officer moves and captures in **all four** diagonal directions, forward *or*
  backward. Green crowns for White, red for Black, in the app's heraldry — but a
  crown is a crown.

- **Column** — a stack of two or more men sharing one square, built by capture.
  A column never spreads across squares; it stands on exactly one and travels as
  a unit.

- **Commander** *(Lasker: the "Leader")* — the man on **top** of a column. The
  commander, and the commander alone, decides everything about the column: its
  colour (whose column it is), the direction it may move, and whether it is a
  soldier-column or an officer-column. The men beneath have no vote.

- **Prisoner / buried man** — any man *below* the commander. He is held captive,
  inert, contributing nothing but his weight — for now. He is not gone. The
  moment the commander above him is captured, the next man down inherits the
  square, and a prisoner can change sides in an instant.

A lone man is simply a column of height one, commanding itself. Everything the
rules say about "the commander" is true of a lone soldier or officer too; it is
its own commander.

### How the men move (when no one is captured)

Set aside captures for one page; they are the whole of Chapter 2 and they
deserve room. When *no* capture is available, the moves are gentle:

- A **soldier-column** (a column whose commander is a soldier) slides one square
  diagonally **forward** to an empty square. Forward means toward the enemy:
  upward in rank for White, downward for Black.

- An **officer-column** (commander is an officer) slides one square diagonally
  in **any** of the four directions, to an empty square.

That is all a quiet move is: one diagonal step, onto an empty square, in a
direction the commander is allowed to face. From the opening array, White has
exactly six legal first moves — the men on the front rank stepping into the empty
centre:

> `a3-b4`, `c3-b4`, `c3-d4`, `e3-d4`, `e3-f4`, `g3-f4`

Read one of them: **`c3-d4`** means *the column on `c3` steps to the empty square
`d4`*. The hyphen says "quiet move, no capture." After `c3-d4`, the `c3` square is
empty and a lone White soldier stands on `d4`, the first man into no-man's-land.

[DIAGRAM: B:0=Ws,1=Ws,2=Ws,3=Ws,4=Ws,5=Ws,6=Ws,7=Ws,9=Ws,10=Ws,12=Ws,14=Bs,15=Bs,16=Bs,17=Bs,18=Bs,19=Bs,20=Bs,21=Bs,22=Bs,23=Bs,24=Bs]

The starting position is perfectly symmetrical, so although White has six first
moves they collapse to only **three distinct ideas**: `a3-b4` and `g3-f4` are
mirror images, as are `c3-b4`/`e3-f4` and `c3-d4`/`e3-d4`. Lasker named the
openings that grow from the three — the Wing gambit, the Hague, the Berlin — but
that is a story for Part III.

### Promotion: the crowning

When a **soldier-column** completes a move on the enemy's back rank — White
reaching rank `7`, Black reaching rank `1` — its commander is **crowned** on the
spot, exchanged for an officer of the same colour. Only the commander is
promoted; whatever prisoners it carries stay exactly as they were, soldiers or
officers, buried as before. A new officer can now turn around and move backward,
which is precisely what makes the crowning worth fighting for.

Two subtleties to file away now and meet properly in Chapter 2. First, an
**officer-column needs no promotion** and gets none — it is already crowned, so
reaching the back rank is just another square to it. Second, and famously,
**crowning ends the move at once** — even in the middle of a capturing run. A
soldier that captures its way onto the back rank stops there and is crowned,
forgoing any further jumps it might have made. We will see why that rule has
teeth when we look at captures.

### How a game ends

You do not win Lasca by counting heads — the head-count never changes. You win
by **smothering** the enemy. A player **loses** when, on their turn, they have:

- **no men they command** — every column on the board is topped by the
  opponent's colour, so the player has nothing to move; or
- **no legal move** — they still command men, but every one of them is blocked,
  hemmed in with nowhere to step and nothing to capture.

Either way the opponent is declared the winner. (A player may also simply
**resign**.) There is a pleasing symmetry to it: because no man ever leaves the
board, you defeat your opponent not by removing their army but by *burying* it —
holding their men prisoner under your commanders — or by *freezing* it in place.
Both of Lasker's surviving teaching games end exactly this way: White's
opponent, still possessed of men on the board, simply runs out of squares to use
them.

### Draws

Lasker's own rules are silent on the draw — his game is built to be won. This
app, so that a game cannot wander forever, recognises three draws, and you should
know they are a **modern, practical addition**, not part of the 1911 ruleset:

- **Threefold repetition** — the same position, with the same player to move,
  arising a third time.
- **No progress** — a long stretch of moves (the app's default is forty plies)
  in which nothing irreversible happens: no capture, no soldier advance, no
  promotion. Shuffling officers back and forth makes no progress.
- **Mutual agreement** — both players simply consent to halve the point.

With the board, the men, and the gentle moves in hand, you are ready for the one
rule that turns this modest seven-by-seven grid into a game Lasker thought could
out-teach chess. Turn the page.

---

## Chapter 2 — The One Rule That Changes Everything

### What every checkers player has to unlearn

If you have ever played draughts, you already know what a capture is supposed to
do. You jump the enemy man, you lift him off the board, he is gone. The board
empties as the game goes on; the endgame is a few lonely kings on a wide,
deserted field. Capture, in draughts, is **subtraction**.

In Lasca, capture is **construction**.

You still jump — diagonally, over an adjacent enemy, onto the empty square
beyond, exactly as in draughts. But the man you jump is *not removed*. He is
taken prisoner and slid to the **bottom of your own column**, and the two of you
move on together as one taller stack. Nothing leaves the board. Every capture
makes a column one man **taller**, not the board one man emptier.

This is the whole game. Everything strategic about Lasca — every idea in Part II,
every move in Lasker's teaching games — descends from this single inversion.
Sit with it before reading on, because the instincts of a draughts player will
fight it at every turn.

### The jump, exactly

Here is the simplest capture there is. Put a White soldier on `c3` and a Black
soldier on `d4`, the square diagonally in front of it. The square beyond, `e5`,
is empty.

[DIAGRAM: W:8=Ws,12=Bs]

White's only legal move is the capture, written **`c3xe5`**. The `x` (instead of
a hyphen) means *capture*: the moving man leaps the enemy on the square between
`c3` and `e5` — that's `d4` — and lands on `e5`. The Black soldier is not lifted
away. He is taken prisoner and placed *under* the White soldier, so `e5` now
holds a two-man column: a Black prisoner at the bottom, a White commander on top.

In the engine's notation that resulting square reads `BsWs` — listed
**bottom-to-top**: `Bs` (Black soldier, the buried prisoner) then `Ws` (White
soldier, the commander). One square, two men, White's column. The whole position
after the move is simply `B:16=BsWs` — Black to move, with that single column
sitting on `e5`. (Square `16` is the engine's index for `e5`; remember,
file-and-rank is the human notation, the bare number is the machine's.)

Read the column from the top down and you read its politics: *White commands; one
Black man is his prisoner.* You have not destroyed a man — you have **captured**
one, in the older, more literal sense of the word.

### Command: the top man rules everything

A column is governed, completely and solely, by its **commander** — the man on
top. This one principle answers almost every question a position can raise:

- **Whose column is it?** The commander's colour. A stack of five men with a
  White soldier on top is a *White* column, no matter how many Black men are
  buried in it. It moves on White's turn and it answers to White.
- **Which way can it move?** The commander's rank. Soldier on top → forward only.
  Officer on top → all four directions. The buried men's ranks are irrelevant; a
  column with three officers entombed beneath a single soldier commander still
  moves forward only, because the soldier is in charge.
- **Can it be promoted?** Only if the commander is a soldier and the column lands
  on the back rank. Buried men are never promoted; promotion is a crown for the
  commander alone.

The men below the commander are dead weight with a pulse. They cannot move, vote,
or fight. They do exactly one thing: **wait**. And what they wait for is the
subject of the most beautiful rule in the game.

### Only the leader is taken

When you jump an enemy *column* — not a lone man, but a whole stack — you do
**not** capture the stack. You capture only its **commander**: the one man on
top. The rest stay put on their square.

This follows from command, once you see it. You can only ever fight the man in
charge; the prisoners beneath him are his problem, not yet yours. So a jump peels
off exactly one man — the commander — buries him at the base of *your* column,
and leaves the rest of the enemy stack standing on its square.

And here is the turn of the key. The commander you just removed was the *only*
thing making that stack the enemy's. Lift him off, and **the man who was beneath
him is now on top** — he is the new commander, and the whole column instantly
belongs to *whoever he is*. Capture the enemy's leader and you may have just
handed a column **back to its prisoners** — possibly to your own colour.

### Freeing a column, shown

This is the move that converts a checkers player. Set it up: a White soldier on
`c3`, and on `d4` an enemy column — a *Black* soldier commanding, with a *White*
soldier buried as his prisoner underneath. The empty landing square `e5` lies
beyond.

[DIAGRAM: W:8=Ws,12=WsBs]

That `d4` column, written bottom-to-top, is `WsBs`: a White man at the bottom,
held prisoner; a Black man on top, in command. As far as the board is concerned
it is a **Black** column — Black's to move, Black's to lose.

White plays **`c3xe5`**, jumping the column on `d4`. Watch both squares at once:

- On the **landing** square `e5`, White's column is now `BsWs` — the captured
  Black commander buried at the base, the White soldier still commanding on top.
  One prisoner taken, exactly as before.
- On `d4`, the column **did not vanish and did not move**. White only took its
  top man. What remains is the man who was buried — the lone White soldier —
  and with the Black commander gone, he is *back on top of his own square*. He is
  a free White soldier again, standing on `d4`.

The full position after the move: a White column `BsWs` on `e5`, and a freed,
lone White soldier on `d4`. One jump, and a man who began the move as a **prisoner
of Black** ends it as a **free soldier of White**, simply because the jailer
above him was lifted away.

That is *freeing a column*: capturing a commander frees the prisoners under him,
re-crowning the stack with whoever was next in line. In a tall column it can run
deeper still — peel a commander and the man below inherits; peel *him* next turn
and the man below *that* inherits — so a single tower can change hands, layer by
layer, over several moves. The men never leave. They only change who is on top.

### The run: captures are compulsory, and they chain

Two more rules give the jump its menace.

**Capturing is forced.** If you can capture, you must — you may not decline a jump
to make a quiet move instead. When the chance appears, you are *compelled* to
take the prisoner. (If your opponent overlooks a capture they were obliged to
make, you are entitled to make them go back and take it.)

**A run continues with the same man.** After a jump, if the very same column can
immediately jump *again* — another enemy adjacent, another empty square beyond —
it **must**, and the captures chain into a single move. The column grows taller
with each jump, sweeping prisoners to its base one after another.

A chained capture is written by listing every landing in turn. Put a White
soldier on `a1`, Black soldiers on `b2` and `d4`, with `c3` and `e5` empty beyond
them. White's forced move is the two-jump run **`a1xc3xe5`**: jump the `b2` man
and land on `c3`, then — same man, same move — jump the `d4` man and land on
`e5`. The result is a three-man White column on `e5`, written `BsBsWs`: two Black
prisoners at the base, the White commander on top, both enemies swept up in a
single turn.

[DIAGRAM: W:0=Ws,4=Bs,12=Bs]

This is why a careless advance is fatal: line your men up on a diagonal and you
have laid a staircase for an enemy column to climb, burying one of your men per
step.

### The brake: a crowning stops the run

There is exactly one thing that can cut a forced run short, and we met it in
Chapter 1: **promotion ends the move immediately.** If a *soldier*-commanded
column captures its way onto the enemy's back rank, it is crowned the instant it
lands — and the move is over, even if more jumps were available. The new officer
does *not* get to continue the run this turn.

Watch it happen. A White soldier on `c5`, a Black soldier on `d6`, and the back
rank square `e7` empty beyond. White plays **`c5xe7`**: he jumps the `d6` man,
lands on the back rank `e7`, and is crowned on arrival. The result on `e7` is the
column `BsWo` — the Black prisoner at the base, and on top a White **officer**
(`Wo`), freshly promoted. Had any further capture beckoned from `e7`, it would
go unmade: the crown closes the move.

[DIAGRAM: W:15=Ws,19=Bs]

(An *officer*-commanded column has no such brake — it is already crowned, so it
captures straight through the back rank and keeps running. Only a soldier is
stopped by promotion, because only a soldier has somewhere to be promoted *to*.)

So the run is a greedy thing with one rein on it. A soldier sweeps up every
prisoner it can reach — unless the sweep carries it to glory at the back rank,
where it must stop and accept its crown.

### A choice Lasker left to you

One last point, because it is the live question of the game and we have made a
deliberate decision about it. Suppose two *different* captures are open to you —
two different men that could each begin a forced run. Which must you take?

In some draughts traditions the rule is iron: you must take the line that
captures the **most** men. Lasker's own advice was softer. He counselled taking
the capture giving "the **longest run or best advantage**" — and that little word
*or* turns a law into a recommendation. Best advantage is a matter of judgement,
not arithmetic. Following the inventor, **this app lets you choose freely** among
the available captures. You are still *forced to capture* when a capture exists —
that much is law — but *which* capture is yours to decide.

It is a small ruling with large consequences, and Part II is largely about how to
make that choice well: when to spread your prisoners thin across many short
columns, and when to gather them into one deep, dangerous tower. For now, the
mechanics are yours. The board is small, nothing ever leaves it, and the man on
top rules everything. Everything else is strategy.
