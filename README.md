# Reading Plan

Kyle's 365-day chronological Bible reading plan as a reference app: every
reading in the plan, each linked to esv.org, with a place to keep verses, notes
and sermon notes. Live at https://kyeill.github.io/esv/ (used mostly on
desktop; works on a phone and can be added to the home screen).

| Path | What it is |
|------|------------|
| `plan.md` | the plan itself, **the only copy** (started from `My Drive\365-day-chronological-bible-plan.md`, deleted 2026-11-08; that original is commit `edffae3`) |
| `tools/build_plan.py` | turns `plan.md` into `docs/plan.json`; refuses a draft with missing or repeated days |
| `docs/index.html` | the whole app, hand-written, no build step; Pages serves `docs/` from `main` |
| `docs/manifest.webmanifest`, `docs/sw.js` | make it installable and open offline |
| `apps-script/` | the web app the page reads and writes, bound to the Google Sheet |
| `tools/icons.py` | redraws the icons (needs Pillow) |

## The app

Desktop first (up to 1200px wide), one column under 820px. Warm dark, Source
Serif 4 for scripture and headings, Inter for the rest. Kyle chose every piece
of this layout from mockups on 2026-11-08 and 2026-11-10; it is **not a
check-off plan**: there is no read tracking at all, no progress bar, no title.

- **Top:** the heading *is* a dropdown of the 12 sections by full name, with the
  section's books under it and "Days 1–25" on the right, then a **Sermons**
  button. The app reopens on the last view, section and passage (per device);
  each section remembers its last passage.
- **A section, right:** every passage in it (no check boxes). Plan days are
  brown; optional readings ("Supplementary" in the plan, never called that on
  screen) are grey with the day column blank. Toggle **All Chapters / Reading
  Plan**. A count shows on passages with notes. Themes are one line, the first
  draft's note on hover.
- **A section, left:** the selected passage (linked to esv.org, with its theme),
  a box to add a **Verse** or **Note**, and that passage's notes only, always in
  this order: verses in Bible order, notes oldest first, then links to sermons
  on it by sermon date. Notes can be edited or deleted (hover).
- **Sermons page:** each sermon has Date, Series, Title, Pastor, Verses, a
  Summary and any number of sections (heading + points, one per line). The list
  shows series newest first (by their latest sermon), oldest first inside a
  series; a sermon with no series stands alone. **Verses decides which passages
  a sermon shows on**, by chapter ("1 Pet 4:1–11" → Day 324); `bookNames` in
  `plan.json` lets it be typed loosely ("Ps 120", "Psalms 121", "Song of Songs").
  "+ Sermon on this passage" starts one with today's date and the passage.

**Book names** are spelled out when the main reading is one book ("Genesis 9;
11", "Genesis 1–2 + Ps 8"); several books keep the plan's abbreviations ("Ex 40;
Lev 10"). `label()` in `tools/build_plan.py` does this; ids and esv.org links
come from the plan's own text. Group titles and the book lists under them are
also built there (`books`, from every reading except a psalm added with "+").

## Updating the plan

1. Edit `plan.md`. Rows are `| ☐ | Day | Reading | Theme | Note |`: Theme is
   the one-line summary on screen (keep it under ~65 characters); Note is the
   first draft's theme, shown only on hover. Group titles are the
   `## Group N:` headings.
2. `python tools/build_plan.py` (it stops with the reason if a day is missing,
   repeated, or a book abbreviation is new — add it to `BOOKS`).
3. Push. `plan.json` is fetched fresh whenever there is a connection.

Notes are keyed to `d<day>` for plan days and `s:<reading>` for optional
readings, so they survive a new draft as long as day numbers and optional
passages stay the same. Sermons are matched by their Verses, so they move with
the passages on their own.

## The data: the Google Sheet

["Reading Plan"](https://docs.google.com/spreadsheets/d/15dLnqYz66KrnI9P9IIQVO6xfzjoyoA75WNWW8kisjm8)
in Kyle's Drive. Columns are found by header name; tabs are made on first use.

- **Notes:** `Id | Passage | Kind | Ref | Text | Written | Updated`. Kind is
  `verse` or `note`; Written is the day it was written.
- **Sermons:** `Id | Date | Series | Title | Pastor | Verses | Summary | Sections | Updated`.
  Sections is JSON: `[{"title":"1. …","points":["…"]}]`.
- **Log:** the old check marks from before 2026-11-10; unused, left as it was.

Every cell is written as plain text, so dates, "3/4" and notes starting with
"=" come back exactly as typed (see Traps).

## Passphrase

Every call needs Kyle's passphrase. The script keeps only a SHA-256 hash, in
the script property `PASS_HASH`; the page keeps the passphrase in
`localStorage` (`esv:key`), never in the repo. When `PASS_HASH` is missing the
app shows "Choose a passphrase" and the first `{claim}` sets it.

**Forgotten passphrase:** open the script (Extensions › Apps Script from the
Sheet) › Project Settings › Script Properties › delete `PASS_HASH`. The app then
asks to choose a new one; nothing in the Sheet is lost.

## Sync

The page keeps a copy in `localStorage` (`esv:data`, queue `esv:ops`), so it
opens with no signal. Changes apply at once and queue, then send after 0.7 s,
and on load, on returning to the app, on going online, and every 2 minutes. A
badge in the top bar appears only when offline or unable to reach the Sheet. An
open sermon form is never redrawn by a sync, and leaving it asks first.

`API` at the top of the script in `docs/index.html`:

- `GET ?key=…` returns `{ok, notes:[…], sermons:[…]}`.
- `POST {key, ops:[{op:"note", note}, {op:"delnote", id}, {op:"sermon", sermon}, {op:"delsermon", id}]}`
  applies them and answers the same way. `POST {claim, ops:[]}` sets the
  passphrase when none is set. Sent as text/plain to avoid a CORS preflight.
- A missing or wrong key answers `{ok:false, error:"no-passphrase" | "wrong-passphrase"}`.

## Deploying

The page: push to `main`; Pages rebuilds in about a minute. Bump `CACHE` in
`docs/sw.js` on shell changes.

The script, from Claude's shell, with clasp:

```bash
export PATH="/c/Program Files/nodejs:/c/Users/kyleh/AppData/Roaming/npm:$PATH"
clasp -P "C:\Users\kyleh\My Drive\Documents\Claude\esv" push -f
clasp -P "C:\Users\kyleh\My Drive\Documents\Claude\esv" create-deployment -i AKfycbzzRbPGyNyGCCyjqh2poPMRuw1yAwJprIpi_GyINF_6cZPWsfzJ7KSz6iIcGDBNTeQZ -d "what changed"
```

`create-deployment -i` repoints the existing deployment, so the address never
changes. `.clasp.json` (script id
`1AW98nYjGBEwYM6qIWh6JoqSw4fZB7qLcP5dw-_2S9_vw46I1GmbbaibZ`) is gitignored.

**Testing the script without touching Kyle's data or passphrase:** copy the
code with `"PASS_HASH"` renamed `"PASS_HASH_TEST"`, `clasp push`, make a *new*
deployment (`create-deployment` with no `-i`), claim a throwaway passphrase on
it, write and delete rows with ids starting `test-`, then `delete-deployment`
it, rename back, push, and redeploy with `-i`. Done this way on 2026-11-10.

Local preview: the `esv` entry in the parent folder's `.claude/launch.json`
(port 8778). It talks to the real Sheet, so **replace `window.fetch` for
`script.google` before any unlock or save** — a real "Choose a passphrase"
submit from a test would set Kyle's passphrase.

## Traps

- **Sheets rewrites what you write.** `setValue("2026-11-08")` becomes a date
  (read back a day early in the script's time zone), "3/4" a date, and text
  starting with "=" a formula (`#ERROR!`) — even in a plain-text cell, and even
  with `setRichTextValue`. `upsert_` formats the row as text (`@`) first and
  adds a leading apostrophe only to values starting with "=".
- **`clasp create-script` overwrites `appsscript.json`.** The manifest must keep
  `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS` and the
  `spreadsheets.currentonly` scope, or the page's calls are refused.
- **A new script answers with a Google sign-in page until Kyle runs `setup()`
  once in the editor** and approves it. clasp's login does not count.
- **The web app address is public** (it's in this repo); the passphrase is what
  keeps notes private. There is no rate limit, so it should not be short.
- **esv.org shows long ranges a chapter at a time** (Song 1–8 opens on chapter 1
  and continues as you scroll), so the link is right even when the first screen
  looks short.
- **The service worker must fetch the page by URL** (`fetch(u.href, …)`), not
  `fetch(e.request, {…})`: a page-load request can't be re-issued with options,
  so that form fails and every load quietly serves the copy cached at install.
- **GitHub Pages' CDN can lag up to 10 minutes per edge** after a push; a
  `curl` can see the new file while the browser still gets the old one.
- **A `<select>` is as wide as its longest option**, which pushed the Sermons
  page 16px past a phone screen until `.pick.small select` got a width cap.
- **Themes are one line, always** (cut with "…", full text on hover). Add-on
  psalms ("+ Ps 8") are left out of the theme on purpose (Kyle's call).
