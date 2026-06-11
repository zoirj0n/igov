#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

echo "==> Seeding countries (ISO3, EN/AR names)"
psql "$DATABASE_URL" <<'SQL'
INSERT INTO countries (iso3, name_en, name_ar, region, flag_emoji) VALUES
  ('ARE', 'United Arab Emirates', 'الإمارات العربية المتحدة', 'GCC', '🇦🇪'),
  ('SAU', 'Saudi Arabia', 'المملكة العربية السعودية', 'GCC', '🇸🇦'),
  ('USA', 'United States', 'الولايات المتحدة', 'NA', '🇺🇸'),
  ('GBR', 'United Kingdom', 'المملكة المتحدة', 'EU', '🇬🇧'),
  ('FRA', 'France', 'فرنسا', 'EU', '🇫🇷'),
  ('DEU', 'Germany', 'ألمانيا', 'EU', '🇩🇪'),
  ('JPN', 'Japan', 'اليابان', 'APAC', '🇯🇵'),
  ('KOR', 'South Korea', 'كوريا الجنوبية', 'APAC', '🇰🇷'),
  ('CHN', 'China', 'الصين', 'APAC', '🇨🇳'),
  ('IND', 'India', 'الهند', 'APAC', '🇮🇳')
ON CONFLICT (iso3) DO NOTHING;
SQL

echo "==> Seeding sample indicators"
psql "$DATABASE_URL" <<'SQL'
INSERT INTO indicators (country_iso3, metric, value, unit, year, source, confidence) VALUES
  ('ARE', 'gdp_usd_nominal', 507000000000, 'USD', 2025, 'World Bank', 'high'),
  ('ARE', 'co2_per_capita_t', 20.7, 't', 2024, 'IEA', 'high'),
  ('ARE', 'renewables_share_pct', 14.2, '%', 2025, 'IRENA', 'high'),
  ('SAU', 'gdp_usd_nominal', 1100000000000, 'USD', 2025, 'World Bank', 'high'),
  ('SAU', 'renewables_share_pct', 6.1, '%', 2025, 'IRENA', 'high')
ON CONFLICT DO NOTHING;
SQL

echo "==> Seed complete"
