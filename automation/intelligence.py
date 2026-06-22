#!/usr/bin/env python3
"""
Sqwod Intelligence — Statista fact extractor.

Reads the PRIVATE, licensed Statista PDFs in research/statista/ and pulls the
chart data tables (title, unit, year axis, values, source attribution) into a
committable fact bank: automation/intelligence/<study>.json.

The PDFs themselves stay private (gitignored). Only the extracted FACTS +
provenance get committed — those are the backbone for living Intelligence
reports (figures, charts, changelog) and let us cite every number.

Usage:
    python3 automation/intelligence.py                 # extract everything
    python3 automation/intelligence.py --file <path>   # one PDF
    python3 automation/intelligence.py --list          # list studies, no write

Requires pypdf:  pip install pypdf  (or: pip install --break-system-packages pypdf)
"""
import json, os, re, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "research", "statista")
OUT_DIR = os.path.join(ROOT, "automation", "intelligence")

try:
    from pypdf import PdfReader
except ImportError:
    sys.exit("Missing dependency. Install it:  pip install --break-system-packages pypdf")

# A Statista chart page reliably contains a "Source(s):" line, often a "Note(s):"
# line, a unit line, a year axis, and a run of numeric values (the data table).
NUM = re.compile(r"-?\d{1,4}(?:[.,]\d+)?")
YEAR = re.compile(r"\b(19|20)\d{2}\b")


def clean_num(tok):
    # Statista uses "." as decimal in EN exports; normalise and drop axis ticks.
    try:
        return float(tok.replace(",", "."))
    except ValueError:
        return None


def extract_chart(text):
    """Pull (title, unit, years, values, source, note) from one chart page."""
    if "Source(s):" not in text:
        return None
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    src = next((l for l in lines if l.startswith("Source(s):")), "")
    note = next((l for l in lines if l.startswith("Note(s):")), "")
    unit = next((l for l in lines if re.search(r"(in (billion|million|U\.S\. dollars|percent)|Unit shipments|Revenue in|in millions)", l, re.I)), "")
    # Title: the descriptive line that names the metric + a year span, near the page end.
    title = ""
    for l in lines:
        if YEAR.search(l) and len(l) > 25 and not l.startswith(("Source", "Note", "Description")):
            title = l
    # Years on the axis (the row that's mostly years).
    years = []
    for l in lines:
        ys = YEAR.findall(l)
        toks = l.split()
        if len(toks) >= 4 and sum(1 for t in toks if YEAR.fullmatch(t)) >= 4:
            years = [t for t in toks if YEAR.fullmatch(t)]
            break
    # Capture EVERY numeric row (each = one data series), so multi-series charts
    # aren't silently truncated. A human/LLM then picks the right series.
    year_row = " ".join(years) if years else None
    series_rows = []
    # (a) horizontal series: a line holding the whole data row.
    for l in lines:
        if year_row and l == year_row:
            continue
        vals = [clean_num(t) for t in NUM.findall(l)]
        vals = [v for v in vals if v is not None and not (1990 <= v <= 2099 and v == int(v))]
        if len(vals) >= 3:
            series_rows.append(vals)
    # (b) vertical series: Statista often lays values one-per-line. Accumulate runs
    # of single-number lines into a series (catches stacked multi-series charts).
    single = re.compile(r"^-?\d{1,4}[.,]\d+$|^-?\d{1,4}$")
    run = []
    for l in lines + [""]:
        if single.match(l):
            v = clean_num(l)
            if v is not None and not (1990 <= v <= 2099 and v == int(v)):
                run.append(v); continue
        if len(run) >= 3:
            series_rows.append(run)
        run = []
    # drop y-axis tick rows: evenly-spaced ladders starting at 0 (e.g. 0,10,20..70)
    def is_axis(r):
        if len(r) < 3 or r[0] != 0:
            return False
        step = r[1] - r[0]
        return step > 0 and all(abs((r[i] - r[i - 1]) - step) < 1e-9 for i in range(1, len(r)))
    series_rows = [r for r in series_rows if not is_axis(r)]
    if not series_rows:
        return None
    # de-dupe identical rows (a vertical run may echo a horizontal grab)
    seen, uniq = set(), []
    for r in series_rows:
        k = tuple(r)
        if k not in seen:
            seen.add(k); uniq.append(r)
    series_rows = uniq
    best = max(series_rows, key=len)
    return {
        "title": title or "(untitled chart)",
        "unit": unit,
        "years": years,
        "values": best,             # convenience: the longest single row
        "series_rows": series_rows, # ALL rows — multi-series charts keep every series
        "source": src.replace("Source(s):", "").strip(),
        "note": note.replace("Note(s):", "").strip()[:240],
        "needs_review": len(series_rows) > 1 or (years and len(best) != len(years)),
    }


def extract_pdf(path):
    reader = PdfReader(path)
    study = os.path.splitext(os.path.basename(path))[0]
    charts = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        c = extract_chart(text)
        if c and c["values"]:
            c["page"] = i
            charts.append(c)
    return {"study": study, "file": os.path.relpath(path, ROOT), "charts": charts}


def main():
    args = sys.argv[1:]
    list_only = "--list" in args
    one = None
    if "--file" in args:
        one = args[args.index("--file") + 1]
    pdfs = [one] if one else sorted(glob.glob(os.path.join(SRC_DIR, "**", "*.pdf"), recursive=True))
    if not pdfs:
        sys.exit(f"No PDFs found in {SRC_DIR} (drop your Statista files there first).")
    os.makedirs(OUT_DIR, exist_ok=True)
    total = 0
    for p in pdfs:
        data = extract_pdf(p)
        n = len(data["charts"])
        total += n
        print(f"· {os.path.basename(p)} → {n} chart(s)")
        if not list_only:
            out = os.path.join(OUT_DIR, data["study"] + ".json")
            with open(out, "w") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"\n{'Listed' if list_only else 'Extracted'} {total} chart(s) across {len(pdfs)} study file(s).")
    if not list_only:
        print(f"Fact bank → automation/intelligence/  (commit these; the PDFs stay private)")


if __name__ == "__main__":
    main()
