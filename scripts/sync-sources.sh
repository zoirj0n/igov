#!/usr/bin/env bash
# Rebuild agent-resources/ from data/sources.csv + best-effort cache fetch.
# Usage:
#   scripts/sync-sources.sh                # regen manifest + sources.md per category
#   scripts/sync-sources.sh --fetch        # also fetch each URL (best-effort, may rate-limit)
#   scripts/sync-sources.sh --fetch --category energy-statistics
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CSV="$ROOT/data/sources.csv"
OUT="$ROOT/agent-resources"
FETCH=0
ONLY_CAT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --fetch) FETCH=1; shift ;;
    --category) ONLY_CAT="$2"; shift 2 ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1"; exit 1 ;;
  esac
done

[ -f "$CSV" ] || { echo "missing $CSV"; exit 1; }

mkdir -p "$OUT"

python3 - "$CSV" "$OUT" <<'PY'
import csv, os, json, re, sys
csv_path, out_dir = sys.argv[1], sys.argv[2]

def slug(s):
    return re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')

manifest = {"version":"1.0.0","sourceCsv":"data/sources.csv","categories":{}}
with open(csv_path) as f:
    for row in csv.DictReader(f):
        cat = row['Category'].strip()
        cat_slug = slug(cat)
        os.makedirs(f"{out_dir}/{cat_slug}", exist_ok=True)
        manifest['categories'].setdefault(cat_slug, {"label": cat, "dir": f"agent-resources/{cat_slug}", "sources": []})
        manifest['categories'][cat_slug]['sources'].append({
            "name": row['Source'].strip(),
            "url": row['URL'].strip(),
            "coverage": row['Coverage'].strip(),
            "bestUse": row['Best use'].strip(),
            "cacheKey": slug(row['Source'].strip())
        })

with open(f"{out_dir}/manifest.json","w") as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)

for cat_slug, info in manifest['categories'].items():
    with open(f"{out_dir}/{cat_slug}/sources.md","w") as f:
        f.write(f"# {info['label']}\n\nManaged by `scripts/sync-sources.sh`. Source: `data/sources.csv`.\n\n")
        f.write(f"| Source | URL | Coverage | Best use |\n|---|---|---|---|\n")
        for s in info['sources']:
            f.write(f"| {s['name']} | {s['url']} | {s['coverage']} | {s['bestUse']} |\n")
print(f"manifest regenerated: {len(manifest['categories'])} categories, {sum(len(c['sources']) for c in manifest['categories'].values())} sources")
PY

if [ "$FETCH" -eq 0 ]; then
  exit 0
fi

echo "==> Fetching cache payloads (best-effort, 1 req/sec)"

python3 - "$OUT" "$ONLY_CAT" <<'PY'
import json, os, sys, time, subprocess
out_dir, only_cat = sys.argv[1], sys.argv[2]
with open(f"{out_dir}/manifest.json") as f:
    manifest = json.load(f)
total = 0
ok = 0
fail = 0
for cat_slug, info in manifest['categories'].items():
    if only_cat and cat_slug != only_cat:
        continue
    for s in info['sources']:
        total += 1
        url = s['url']
        if not url.startswith('http'):
            print(f"  skip non-URL {s['name']}: {url}")
            continue
        target = f"{out_dir}/{cat_slug}/{s['cacheKey']}.cache.html"
        try:
            subprocess.run([
                "curl","-sSL","--max-time","20","-A","CountryIntel/1.0 (subagent-cache)",
                "-o",target,"-w","",url
            ], check=True)
            size = os.path.getsize(target) if os.path.exists(target) else 0
            print(f"  OK  {cat_slug}/{s['cacheKey']} ({size} bytes)")
            ok += 1
        except Exception as e:
            print(f"  FAIL {cat_slug}/{s['cacheKey']}: {e}")
            fail += 1
        time.sleep(1.0)
print(f"fetched ok={ok} fail={fail} total={total}")
PY
