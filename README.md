# Reading Plan

Kyle's 365-day chronological Bible reading plan as a phone app: what to read
next, a one-tap link to the passage on esv.org, and check marks that sync
through a Google Sheet. Live at https://kyeill.github.io/esv/ — add it to the
phone's home screen to use it like an app.

| Path | What it is |
|------|------------|
| `plan.md` | the plan itself (copy of `My Drive\365-day-chronological-bible-plan.md`) |
| `tools/build_plan.py` | turns `plan.md` into `docs/plan.json`; refuses a draft with missing or repeated days |
| `docs/index.html` | the whole app, hand-written, no build step; Pages serves `docs/` from `main` |
| `docs/manifest.webmanifest`, `docs/sw.js` | make it installable and open offline |
| `apps-script/` | the web app the page reads and writes, bound to the Google Sheet |
| `tools/icons.py` | redraws the icons (needs Pillow) |

## The app

Tabs **Next · Plan**. Built for desktop first (Kyle's main screen, up to 1080px
wide), still fine on a phone. Warm dark, Source Serif 4 for readings and
headings, Inter for the rest, gold for buttons and progress (his pick of four
mockups, 2026-11-08). Plan days are **brown** (passage, circle, fill) because
that stands out most; optional readings are plain grey. A quick sideways swipe
switches tab on a phone.

**Optional readings** (the plan's "Supplementary readings") are never called
that on screen, at Kyle's request: plain grey rows with the day column left
blank. The Show / Hide switch has no label (his call).

**Group cards** list the books in the group (Bible order) under the title, in
place of the plan's group descriptions, which the app no longer shows. A psalm
added with "+" doesn't count; with optional readings hidden, books found only
in them drop out (`books` / `dayBooks` from `tools/build_plan.py`).

**Book names** are spelled out when a reading is from one book ("Genesis 9;
11", "Psalms 9–13"); a reading with an added psalm or several books keeps the
plan's abbreviations ("Gen 1–2 + Ps 8"). `label()` in `tools/build_plan.py` does
this; ids and esv.org links still come from the plan's own text.

- **Next:** self-paced, no calendar. Left: the lowest-numbered unread day (its
  group, reading linked to esv.org, theme, a big ✓ button), then its \*
  readings. Right: the next five unread days. \* readings left unread on the day
  before stay at the top, so marking the day first doesn't hide them. Marking
  something read shows an Undo for 6 seconds. One column on a phone.
- **Plan:** one card per group with a count and bar; the group holding the
  next day opens and scrolls to it. On a wide screen each row is one line: ✓,
  day, reading, theme, date marked. Show / Hide \* readings applies to both tabs
  and is remembered on the device. "About this plan" at the bottom is the plan's
  "How the plan is built" section.

## Updating the plan

1. Replace `plan.md` with the new draft.
2. `python tools/build_plan.py` (it stops with the reason if a day is missing,
   repeated, or a book abbreviation is new — add it to `BOOKS`).
3. Push. `plan.json` is fetched fresh whenever there is a connection.

Check marks are keyed `d<day>` for plan days and `s:<reading>` for supplements,
so they survive a new draft as long as day numbers and supplement passages stay
the same. A supplement whose passage changes loses its check mark (the old row
stays in the Sheet, unread).

## The data: the Google Sheet

["Reading Plan"](https://docs.google.com/spreadsheets/d/15dLnqYz66KrnI9P9IIQVO6xfzjoyoA75WNWW8kisjm8)
in Kyle's Drive, tab **Log**: `Id | Reading | Date | Saved`, one row per reading
marked read. Deleting a row un-marks it. Columns are found by header name.

## Sync

Same pattern as Lift Log. The page keeps a copy in `localStorage`, so it opens
with no signal. Changes apply at once and queue, then send after 0.7 s, and on
load, on returning to the app, on going online, and every 2 minutes. A badge
under the tabs appears only when offline or unable to reach the Sheet.

`API` at the top of the script in `docs/index.html`:

- `GET` returns `{ok, done:[{id, date}]}`.
- `POST {ops:[{op:"set", id, date, reading}, {op:"del", id}]}` applies them and
  answers the same way. Sent as text/plain to avoid a CORS preflight.

## Deploying

The page: push to `main`; Pages rebuilds in about a minute.

The script, from Claude's shell, with clasp:

```bash
export PATH="/c/Program Files/nodejs:/c/Users/kyleh/AppData/Roaming/npm:$PATH"
clasp -P "C:\Users\kyleh\My Drive\Documents\Claude\esv" push -f
clasp -P "C:\Users\kyleh\My Drive\Documents\Claude\esv" create-deployment -i AKfycbzzRbPGyNyGCCyjqh2poPMRuw1yAwJprIpi_GyINF_6cZPWsfzJ7KSz6iIcGDBNTeQZ -d "what changed"
```

`create-deployment -i` repoints the existing deployment, so the address never
changes. `.clasp.json` (script id
`1AW98nYjGBEwYM6qIWh6JoqSw4fZB7qLcP5dw-_2S9_vw46I1GmbbaibZ`) is gitignored.

Local preview: the `esv` entry in the parent folder's `.claude/launch.json`
(port 8778). It talks to the real Sheet unless `fetch` is mocked.

## Traps

- **`clasp create-script` overwrites `appsscript.json`.** The manifest must keep
  `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS` and the
  `spreadsheets.currentonly` scope, or the page's calls are refused.
- **A new script answers with a Google sign-in page until Kyle runs `setup()`
  once in the editor** and approves it. clasp's login does not count.
- **Anyone with the web app address can read and change the check marks.** The
  address is in this public repo. Accepted: it holds only which readings are done.
- **esv.org shows long ranges a chapter at a time** (Song 1–8 opens on chapter 1
  and continues as you scroll), so the link is right even when the first screen
  looks short.
- **The service worker must fetch the page by URL** (`fetch(u.href, …)`), not
  `fetch(e.request, {…})`: a page-load request can't be re-issued with options,
  so that form fails and every load quietly serves the copy cached at install.
- **GitHub Pages' CDN can lag up to 10 minutes per edge** after a push; a
  `curl` can see the new file while the browser still gets the old one.
- **Themes are one line, always** (cut with "…", full text on hover). Kyle plans
  to shorten many of them in `plan.md`; nothing in the app needs changing for that.
