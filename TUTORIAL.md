# Laska — Tutorial Source Material

Collected copy, rules, and structure for the **interactive tutorial** (the
flagship onboarding) and the later **lessons & courses**. See `TODO.md →
FLAGSHIP: Interactive Tutorial & Lessons`. Keep the tutorial engine-driven
(validate every step with the real `legalMoves`/`applyMove`) so it can never
drift from the actual rules.

## The hook — why Laska is different
> **Pieces are taken prisoner, not taken off.** In ordinary draughts, a jumped
> piece leaves the board for good. Lasker changed the single rule that mattered:
> the piece you capture slides underneath yours, and the two move together as a
> column. The board never empties — it stacks.

## First Run — designed for a 60-second attention span
The player we are designing for: **has never seen Laska, will not read a wall of
text, and decides in seconds whether this is worth their time.** The demand test
is in-person and social (Moishe House, Toronto) — success is people playing **4+
unprompted games**. So the onboarding's only job is: *get them to their first
capture in ~15s and their first win in ~90s, hands-on, with almost no reading.*

### Hard rules for the flow (anti-friction)
- **Learn by doing, never by reading.** Each step is a real position with exactly
  **one** sensible move. We **highlight the piece to tap and the square to tap**,
  and **gate all other input** (illegal/irrelevant taps do nothing or nudge). The
  player physically cannot get lost.
- **One short coach line per step.** ≤ 8 words, plain language, in a single
  speech-bubble/coach strip. No paragraphs, no modal dumps. Example: *"Tap the
  glowing piece."* → *"Now tap the green square."*
- **Show the payoff immediately.** The captured piece visibly **slides under** the
  capturer (reuse the capture animation) — that *is* the lesson; the text just
  names what they saw afterward: *"It's your prisoner now."*
- **Two taps, not gestures.** Tap origin, tap destination. No drag (unreliable on
  a passed-around phone). Big targets.
- **Always skippable, always resumable.** A persistent *Skip* → drops straight
  into a game vs the Beginner bot. Progress saved to `localStorage`.
- **Reward, then advance.** A tiny micro-celebration (coin pulse + one word:
  *"Captured!"*) auto-advances; no "Next" button to hunt for.
- **Leverage the star.** With the **Heirloom** insignia theme, a general wears a
  **star** (see DESIGN.md → piece insignia). "The star runs the stack" is a
  one-glance idea — much faster than "the officer is the two-dot piece." Teach
  rank using the star, not pip-counting.

### The 5-tap script (the entire free core, ~60–90s)
Each line is one gated, engine-validated step rendered over the real `BoardView`.

1. **Capture.** A lone enemy soldier sits diagonally ahead, empty square beyond.
   Coach: *"Jump the dark piece."* → they tap their piece, tap the landing
   square. The jump plays; the enemy **tucks underneath**.
   After: *"Captured — it rides beneath you."*
2. **You command the column.** Same column, a new enemy ahead. Coach: *"Jump
   again — your column moves as one."* Teaches that the stack moves/captures as a
   unit and the **top piece is the commander**.
3. **Promote to a star.** A soldier one step from the back row. Coach: *"Reach the
   far row."* On landing it **crowns into a general (star)**; the move ends.
   After: *"A general — it moves both ways now."* (Teaches promotion + officers.)
4. **Free the prisoners.** Jump a tall enemy column. Coach: *"Take only the top —
   the rest go free."* The freed pieces visibly rejoin under a new top piece.
   After: *"You take the commander; the captives switch sides."*
5. **First win.** Drop into a tiny, nearly-won position vs the **Beginner** bot
   (depth 1, high blunder rate) so the player lands the finishing capture in a
   move or two. Coach: *"Finish it."* End screen: *"You won. Play a real game?"* →
   straight into vs-AI (or pass-the-phone), where the 4+-games behavior lives.

### The four capture beats (the rule content, mapped to steps 1, 1, 2, 4)
The classic four beats below are the *rules* the script teaches; the script above
is the *delivery*. Keep both in sync with the engine.

1. **You jump an enemy.** Just like checkers — you leap an adjacent opponent and
   land on the empty square beyond.
2. **It tucks beneath you.** The captured piece isn't removed. It becomes a
   prisoner at the base of your column.
3. **The top piece rules.** A column moves, jumps and belongs to whoever sits on
   top — its *commander* (the **star** when it's a general).
4. **Capture frees the rest.** Jump an enemy column and you take only its
   commander. Everything below is released and rejoins play under a new top piece.

## Full rules (the source of truth is `src/`, cross-checked against Wikipedia "Lasca" + MindSports)
- **Board.** 7×7 grid; play on the 25 squares where `(row + col)` is even.
- **Setup.** 11 soldiers per side on the three nearest rows; centre row empty;
  White moves first.
- **Columns.** A stack is controlled by its **top** piece, the *commander*.
  Soldier-topped columns move/capture **forward only**; officer-topped columns
  move/capture **both directions**.
- **Capture.** Jump an adjacent enemy-controlled square to the empty square
  beyond. Only the **top** piece of the jumped column is taken; it goes to the
  **bottom** of the capturing column. The rest of the jumped column stays put and
  may flip to a new controller.
- **Mandatory capture.** If any capture exists, only captures are legal; a capture
  must continue with the same piece until it can capture no more.
- **Promotion.** A soldier-topped column reaching the back rank is crowned an
  **officer** — and promotion **ends the move immediately**, even mid-chain.
- **Win.** Opponent has no controlled pieces, or no legal move, or resigns.
- **Draw (a design choice, not official):** threefold repetition; a no-progress
  ply counter (default 40); mutual agreement.

## Reading the board (Phase 2)
- **Commander** = the top piece; it controls and moves the whole column.
- **Soldier vs officer (general):** the commander wears a rank mark set by the
  active insignia theme. In the default **Heirloom** theme, a soldier shows a
  single pip and a general shows a **star**; the **Dots** theme keeps the classic
  **1 dot / 2 dots**. Generals move and capture both directions. (See DESIGN.md →
  piece insignia themes.)
- **Column height:** a small **count badge** shows how many pieces are stacked.
- **Prisoners:** captured pieces peek out as **rims** beneath the commander; jump
  the column and they are freed under whoever is newly on top.
- **Forced capture** is highlighted — when a capture exists you must take it.

## Tutorial step shape (implementation)
Represent each step as data, rendered over the real `BoardView`:
```
{
  position,            // FEN-like string (decodePosition) or a builder
  prompt,              // "Jump the dark soldier — land beyond it."
  expectedMoves,       // Move[] (or a predicate) validated via legalMoves
  hint,                // shown after a wrong/slow attempt
  successText,         // "Captured — see it slide beneath your piece."
  highlight,           // squares to glow
}
```
A `TutorialBoard` wrapper adds highlighting + gates input to the expected move(s).
Progress in `localStorage` now, account later.

## Course outline (Phase 4, monetizable)
Each course = a sequence of interactive lessons + engine-verified puzzles. Free
intro lesson per course; full course behind subscription / one-time purchase.
- **Openings** — sound first moves on 7×7; why the empty centre row matters.
- **Tactics** — capture chains, multi-jumps, sham sacrifices that win a column.
- **Column strategy** — build tall vs stay mobile; when freeing prisoners helps you.
- **Endgames** — converting a column/material edge; beating the no-progress draw.

## The opponent (already built — explain it in-app)
The bot is `chooseMove` in `src/ai.ts`: negamax + alpha-beta over a Laska
evaluator (column **control**, officer bonus, held prisoners, promotion progress,
mobility — never raw piece count). Six levels via `DIFFICULTY_DEPTH` /
`DIFFICULTY_ORDER`: beginner(1) · easy(2) · intermediate(3) · medium(4) ·
hard(6) · expert(8) half-moves of lookahead, with a decreasing blunder rate.
