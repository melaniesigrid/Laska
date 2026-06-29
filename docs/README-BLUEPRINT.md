# The README Blueprint

> A reusable recipe for writing a README people actually *read* — then star, then
> use. Copy this file into any project and fill in the blanks. It's the structure
> behind Laska's [`README.md`](../README.md); steal it freely.

The core idea: **a great README is two readers in one document.** The first reader
is a curious human who has never heard of your thing and decides in ten seconds
whether to care. The second is a developer who already cares and wants to know how
it's built. Serve the human first, the developer second — never the reverse.

---

## The one rule above all others

> **Show, don't claim. Then prove it.**

- *Show* — a screenshot or GIF in the first screenful, not paragraph six.
- *Don't claim* — "blazingly fast", "beautiful", "robust" are noise. Replace every
  adjective with a fact, a number, or an image.
- *Prove it* — back claims with test counts, benchmarks, badges, or a live demo
  link. If you can't prove it, cut it.

---

## The skeleton (in order)

Each section below lists **why it exists** and **what makes it good**. Drop any that
don't apply — but keep the order. The order *is* the funnel: hook → understand →
try → explore → trust → contribute.

### 1. Masthead — the 10-second hook
- Centered: **name**, a one-line subtitle a stranger understands, and **one vivid
  sentence** that captures the single most interesting thing about it.
- A **hero image** (screenshot or GIF) immediately. This is the most important
  pixel in the whole document.
- A row of **badges** that are *true and useful*: language/version, test status,
  zero-deps, license, a live-demo link. Not 15 vanity badges — 4 to 6 real ones.

> Litmus test: if someone read *only* the masthead, would they know what this is
> and want to see more? If not, rewrite it.

### 2. Explain it like I'm five — the "what is this"
- Plain language. Short sentences. **One concrete metaphor** beats three abstract
  features. (Laska's: "checkers, but captured pieces climb *under* yours instead of
  leaving.")
- A **before/after or comparison table** is gold for "how is this different from
  the thing I already know."
- Embed the screenshot that best illustrates the core concept right here, with a
  caption that points at the thing to notice.

### 3. Quickstart — the "try it in 30 seconds"
- The *fewest* commands that get to a running thing. Copy-pasteable, in one block.
- State prerequisites inline (the exact version), and what success looks like
  (the URL, the output).
- If there's a hosted demo, link it here too — many readers won't clone anything.

### 4. Feature gallery — the "what can I do"
- One subsection per headline capability. Each = a **short benefit-led blurb** (what
  it does *for the user*, not how) **+ a screenshot**.
- Lead with the user's win, not the implementation. "Play a bot that understands
  the game" > "Negamax search with alpha-beta."
- Visuals carry this section. Aim for one image per feature.

### 5. The story / context — the "why does this exist"
- The origin, the person, the problem. People remember stories, not feature lists.
- Optional but powerful — it's what makes a project *memorable* instead of merely
  useful.

### 6. How it's built — the developer half
- A **clear header that signals the audience shift** ("🛠️ How we built it"), so
  casual readers know they can stop here.
- Start with the *simple version* (one paragraph, plain English: the key design
  idea and why). Then go deep.
- An **architecture diagram** (ASCII is fine and ages well) earns its space.
- A **testing/rigor table**: what's covered and how. This is how you *prove*
  quality instead of claiming it.
- Be **honest about what's not done.** A "known limitations" note builds more trust
  than a flawless-sounding pitch.

### 7. Layout & contributing — the "where do I start"
- A short annotated file tree (one line per top-level dir — what it's *for*).
- Point to the deeper engineering doc rather than duplicating it.
- Make the first contribution obvious: where to look, how to run tests.

### 8. Footer — the closing CTA
- One memorable line + the primary call to action (play / install / docs).
- A compact link row to the few things that matter.

---

## Craft notes (the things that separate good from great)

- **Visuals.** Real screenshots > mockups. A short **GIF/video of the thing in
  motion** beats any static image for interactive products. Keep images in a
  tracked folder (`docs/screenshots/` or `.github/assets/`) — *never* link to a
  temp/CI path that will rot. Set an explicit `width` so they don't blow out the
  page; use `<img>` HTML when you need sizing/centering, Markdown `![]()` when you
  don't.
- **Captions.** A one-line italic caption under an image, pointing at the detail to
  notice, does more than a paragraph above it.
- **Scannability.** Headers, tables, and bold lead-ins let people skim. Most readers
  skim first and read second — design for the skim.
- **Tables for comparison.** "Us vs the thing you know" and "test suite → what it
  covers" both land harder as tables than prose.
- **Concrete numbers.** "130+ tests", "zero dependencies", "8 moves deep" — specific
  beats "well-tested", "lightweight", "smart".
- **Voice.** Pick one (warm/playful or precise/technical) and hold it. Laska mixes:
  playful up top for newcomers, precise down low for engineers — but each *section*
  is internally consistent.
- **Honesty.** Document the interpretive choices and the not-yet-done. Credibility
  is a feature.
- **Length.** Long is fine *if* it's skimmable. The hook must work in 10 seconds;
  the depth rewards the reader who scrolls.

---

## Pre-publish checklist

- [ ] Is there an image in the **first screenful**?
- [ ] Could a stranger explain what this is after reading **only** the masthead?
- [ ] Is there a **copy-pasteable** quickstart that actually works from a clean clone?
- [ ] Is every **adjective** backed by a fact, number, image, or link? (Cut the rest.)
- [ ] Does each headline feature have a **screenshot**?
- [ ] Is there a **clear handoff** from "for everyone" to "for developers"?
- [ ] Are images in a **tracked, stable path** (not a temp/CI folder)?
- [ ] Do all **links and image paths** resolve?
- [ ] Is there an honest note about **limitations / interpretive choices**?
- [ ] Does the footer have **one clear call to action**?

---

## Copy-paste starter skeleton

```markdown
<div align="center">

# Project Name
### One-line subtitle a stranger understands
*One vivid sentence about the single most interesting thing.*

<img src="docs/screenshots/hero.png" alt="..." width="760">

![badge](...) ![badge](...) ![badge](...)
</div>

---

## 🧒 Explain it like I'm five
Plain-language paragraph + one metaphor.
| The thing you know | This thing |
|---|---|
| ... | ... |

## ▶️ Try it in 30 seconds
​```bash
# fewest commands to a running thing
​```

## ✨ What you can do
### Feature one
Benefit blurb. <img ...>
### Feature two
Benefit blurb. <img ...>

## 📖 The story
Why this exists / who made it.

# 🛠️ How it's built
The simple version (one paragraph). Then: diagram, AI/engine notes, testing table.

## 📂 Layout
Annotated file tree.

## 🤝 For developers
Point to the engineering guide; how to run tests.

---
<div align="center">
*Memorable closing line.* **Primary CTA.**
</div>
```
