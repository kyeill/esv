"""Turn plan.md into docs/plan.json, the data the app reads.

Run after replacing plan.md with a new draft:
    python tools/build_plan.py            (reads plan.md)
    python tools/build_plan.py other.md   (reads another copy)
then bump CACHE in docs/sw.js so phones pick it up.

It stops with an error if the draft is missing a day 1-365, repeats one, or
uses a book abbreviation it doesn't know, rather than writing a broken plan.

Ids tie the Sheet's check marks to readings: plan days are "d<number>" and
supplements are "s:<reading>", so a new draft keeps every check mark as long as
day numbers and supplement passages stay the same.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Abbreviation in the plan -> the name esv.org understands
BOOKS = {
    "Gen": "Genesis", "Ex": "Exodus", "Lev": "Leviticus", "Num": "Numbers", "Deut": "Deuteronomy",
    "Josh": "Joshua", "Judg": "Judges", "Ruth": "Ruth", "1 Sam": "1 Samuel", "2 Sam": "2 Samuel",
    "1 Kgs": "1 Kings", "2 Kgs": "2 Kings", "1 Chr": "1 Chronicles", "2 Chr": "2 Chronicles",
    "Ezra": "Ezra", "Neh": "Nehemiah", "Esth": "Esther", "Job": "Job", "Ps": "Psalm",
    "Prov": "Proverbs", "Eccl": "Ecclesiastes", "Song": "Song of Solomon", "Isa": "Isaiah",
    "Jer": "Jeremiah", "Lam": "Lamentations", "Ezek": "Ezekiel", "Dan": "Daniel", "Hos": "Hosea",
    "Joel": "Joel", "Amos": "Amos", "Obad": "Obadiah", "Jonah": "Jonah", "Mic": "Micah",
    "Nah": "Nahum", "Hab": "Habakkuk", "Zeph": "Zephaniah", "Hag": "Haggai", "Zech": "Zechariah",
    "Mal": "Malachi", "Matt": "Matthew", "Mark": "Mark", "Luke": "Luke", "John": "John",
    "Acts": "Acts", "Rom": "Romans", "1 Cor": "1 Corinthians", "2 Cor": "2 Corinthians",
    "Gal": "Galatians", "Eph": "Ephesians", "Phil": "Philippians", "Col": "Colossians",
    "1 Thess": "1 Thessalonians", "2 Thess": "2 Thessalonians", "1 Tim": "1 Timothy",
    "2 Tim": "2 Timothy", "Titus": "Titus", "Philemon": "Philemon", "Heb": "Hebrews",
    "James": "James", "1 Pet": "1 Peter", "2 Pet": "2 Peter", "1 John": "1 John",
    "2 John": "2 John", "3 John": "3 John", "Jude": "Jude", "Rev": "Revelation",
}
BOOK_RE = re.compile(r"^(" + "|".join(sorted(map(re.escape, BOOKS), key=len, reverse=True)) + r")\b\s*(.*)$")
GROUP_RE = re.compile(r"^## Group (\d+): (.*?) \(Days (\d+)[–-](\d+)\)\s*$")
# | ☐ | Day | Reading | Theme | Note |   (Note optional: the first draft's theme)
ROW_RE = re.compile(r"^\| ☐ \| (\d+|S) \| (.*?) \| (.*?) \|(?: (.*?) \|)?\s*$")


def esv_query(reading):
    """'Gen 9; 11 + Ps 8' -> 'Genesis 9; Genesis 11; Psalm 8' (hyphens, full names)."""
    out, book = [], None
    for seg in re.split(r"\s*\+\s*|\s*;\s*", reading.replace("–", "-")):
        m = BOOK_RE.match(seg)
        if m:
            book, refs = BOOKS[m.group(1)], m.group(2)
        elif re.match(r"^\d", seg) and book:
            refs = seg
        else:
            sys.exit(f"build_plan: unknown book in {reading!r} (segment {seg!r})")
        if not refs:
            out.append(book)            # one-chapter book: Obad, Philemon, Jude, 2-3 John
            continue
        chapter = None
        for part in re.split(r"\s*,\s*", refs):
            if ":" in part:
                chapter = part.split(":")[0]
                out.append(f"{book} {part}")
            elif chapter:               # "23:6-12, 39-43": verses in the same chapter
                out.append(f"{book} {chapter}:{part}")
            else:
                out.append(f"{book} {part}")
    return "; ".join(out)


def label(reading):
    """What the app shows. When the main reading is from one book, that book is
    spelled out, and an added psalm keeps its short form ('Gen 9; 11' ->
    'Genesis 9; 11', 'Gen 1–2 + Ps 8' -> 'Genesis 1–2 + Ps 8'). Several books
    keep the plan's abbreviations ('Ex 40; Lev 10', 'Matt 1; Luke 2')."""
    main, plus, extra = reading.partition("+")
    main = main.strip()
    books = {m.group(1) for seg in re.split(r"\s*;\s*", main) if (m := BOOK_RE.match(seg))}
    if len(books) != 1:
        return reading
    abbr = books.pop()
    m = BOOK_RE.match(main)
    name, rest = BOOKS[abbr], m.group(2)
    if abbr == "Ps" and re.search(r"[–;,-]", rest):
        name = "Psalms"                 # Ps 9–13 -> Psalms 9–13, Ps 15 -> Psalm 15
    out = f"{name} {rest}".strip()
    return f"{out} + {extra.strip()}" if plus else out


def books_of(reading):
    """Abbreviations of the books a reading touches: 'Ex 40; Lev 10' -> ['Ex', 'Lev']."""
    return [m.group(1) for seg in re.split(r"\s*\+\s*|\s*;\s*", reading) if (m := BOOK_RE.match(seg))]


def book_list(readings):
    """Full names in Bible order, Psalms plural: ['Genesis', 'Job']. A psalm
    tacked on with '+' ('Acts 1–2 + Ps 16') doesn't count, or Psalms would head
    the list for the early church."""
    got = {b for r in readings for b in books_of(r.split("+")[0])}
    return ["Psalms" if b == "Ps" else BOOKS[b] for b in BOOKS if b in got]


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "plan.md"
    lines = src.read_text(encoding="utf-8").splitlines()

    title = next(l[2:].strip() for l in lines if l.startswith("# "))
    about, groups, cur, in_about = [], [], None, False
    for line in lines:
        if line.startswith("## "):
            in_about = line.strip() == "## How the plan is built"
            m = GROUP_RE.match(line)
            if m:
                cur = {"n": int(m.group(1)), "title": m.group(2), "from": int(m.group(3)),
                       "to": int(m.group(4)), "blurb": "", "items": []}
                groups.append(cur)
            continue
        if in_about and line.strip():
            about.append(line.strip())
            continue
        if not cur:
            continue
        m = ROW_RE.match(line)
        if m:
            day, reading, theme = m.group(1), m.group(2).strip(), m.group(3).strip()
            note = (m.group(4) or "").strip()
            sup = day == "S"
            reading = reading.strip("*") if sup else reading
            it = {
                "id": f"s:{reading}" if sup else f"d{day}",
                "day": None if sup else int(day),
                "reading": reading, "label": label(reading), "theme": theme, "q": esv_query(reading),
            }
            if note:
                it["note"] = note
            cur["items"].append(it)
        elif line.strip() and not line.startswith("|") and not cur["items"]:
            cur["blurb"] = (cur["blurb"] + " " + line.strip()).strip()

    items = [it for g in groups for it in g["items"]]
    days = [it["day"] for it in items if it["day"] is not None]
    ids = [it["id"] for it in items]
    problems = []
    if sorted(days) != list(range(1, 366)):
        missing = sorted(set(range(1, 366)) - set(days))
        extra = sorted({d for d in days if days.count(d) > 1})
        problems.append(f"days missing {missing[:10]} repeated {extra[:10]}")
    if len(ids) != len(set(ids)):
        problems.append(f"repeated readings {sorted({i for i in ids if ids.count(i) > 1})[:10]}")
    for g in groups:
        got = [it["day"] for it in g["items"] if it["day"] is not None]
        if got and (min(got) != g["from"] or max(got) != g["to"]):
            problems.append(f"group {g['n']} heading says days {g['from']}-{g['to']}, rows say {min(got)}-{max(got)}")
    if problems:
        sys.exit("build_plan: " + "; ".join(problems))

    # what each group card lists under its title: every book it touches, and
    # the books of its plan days alone (for when the optional readings are hidden)
    for g in groups:
        g["books"] = book_list(it["reading"] for it in g["items"])
        g["dayBooks"] = book_list(it["reading"] for it in g["items"] if it["day"] is not None)

    plan = {"title": title, "about": about, "groups": groups}
    out = ROOT / "docs" / "plan.json"
    out.write_text(json.dumps(plan, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)}: {len(groups)} groups, {len(days)} days, "
          f"{len(items) - len(days)} supplements")


if __name__ == "__main__":
    main()
