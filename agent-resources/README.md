# Agent resources

Per-category staging area for subagents that fetch from the source catalog.

## Layout

```
agent-resources/
├── manifest.json                # generated from data/sources.csv (single source of truth)
├── <category-slug>/             # one folder per category in sources.csv
│   ├── sources.md               # human-readable index of that category's sources
│   └── <source-slug>.cache.{json,html,csv}   # fetched payloads (gitignored)
```

## Conventions
- **Source of truth**: `data/sources.csv` (90 rows × 11 categories). Never edit `manifest.json` by hand.
- **Regenerate**: `bash scripts/sync-sources.sh` rebuilds manifest + fetches each URL → category folder.
- **Cache filenames**: `<source-slug>.cache.<ext>` where slug = lowercase kebab of source name.
- **Gitignored**: cache files. `sources.md` index + manifest committed.

## Which subagent owns which category

| Category | Owning subagent |
|---|---|
| International datasets | `data-source-curator` → `economic-data-fetcher` |
| Economic indicators | `economic-data-fetcher` |
| Energy statistics | `energy-data-fetcher` |
| Energy and sustainability | `energy-data-fetcher` + `sustainability-analyst` |
| Sustainability reports | `sustainability-analyst` |
| Competitiveness indexes | `trade-cooperation-analyst` |
| Trade and agreements | `trade-cooperation-analyst` |
| Public international reports | `data-source-curator` |
| Government publications | `data-source-curator` |
| Regional sources | `data-source-curator` |
| Executive materials | `text-writer` |

## Hard rules for subagents
1. **Never invent URLs.** Read from `manifest.json` or `data/sources.csv` only.
2. **Cache locally first.** If `<category>/<slug>.cache.<ext>` exists and is < TTL old, use it.
3. **Respect upstream rate limits.** World Bank 1 req/s sustained, IMF Datamapper similar.
4. **Flag paywalled sources** (IEA, WEF, IMD paid tiers, EIU).
5. **Audit every fetch** via `logAudit('source.fetch', ...)`.
6. **Classification**: all cached payloads inherit the most restrictive classification of any indicator they feed.

## Workflow

1. Subagent receives a query (e.g. "renewables share for ARE").
2. Look up category in `manifest.json` (`energy-statistics` for IRENA/IEA).
3. Read the first 1-3 sources per category by `bestUse` specificity.
4. Fetch URL if no fresh cache exists → save to `<category>/<slug>.cache.<ext>`.
5. Parse + normalize → platform `Indicator` schema.
6. Upsert via `runByKey()` or direct DB write.
