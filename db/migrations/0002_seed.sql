-- Seed countries (ISO3, EN/AR names, region)
INSERT INTO countries (iso3, name_en, name_ar, region, flag_emoji) VALUES
  ('ARE', 'United Arab Emirates',  'الإمارات العربية المتحدة', 'GCC',   '🇦🇪'),
  ('SAU', 'Saudi Arabia',          'المملكة العربية السعودية', 'GCC',   '🇸🇦'),
  ('USA', 'United States',         'الولايات المتحدة',        'NA',    '🇺🇸'),
  ('GBR', 'United Kingdom',        'المملكة المتحدة',          'EU',    '🇬🇧'),
  ('FRA', 'France',                'فرنسا',                    'EU',    '🇫🇷'),
  ('DEU', 'Germany',               'ألمانيا',                  'EU',    '🇩🇪'),
  ('JPN', 'Japan',                 'اليابان',                  'APAC',  '🇯🇵'),
  ('KOR', 'South Korea',           'كوريا الجنوبية',           'APAC',  '🇰🇷'),
  ('CHN', 'China',                 'الصين',                    'APAC',  '🇨🇳'),
  ('IND', 'India',                 'الهند',                    'APAC',  '🇮🇳'),
  ('BRA', 'Brazil',                'البرازيل',                 'LATAM', '🇧🇷'),
  ('ZAF', 'South Africa',          'جنوب أفريقيا',             'AFR',   '🇿🇦')
ON CONFLICT (iso3) DO UPDATE
  SET name_en = EXCLUDED.name_en,
      name_ar = EXCLUDED.name_ar,
      region  = EXCLUDED.region,
      flag_emoji = EXCLUDED.flag_emoji,
      updated_at = NOW();

INSERT INTO indicators (id, country_iso3, metric, value, unit, year, source, confidence) VALUES
  -- ARE
  ('ARE-gdp_usd_nominal-2025',           'ARE','gdp_usd_nominal',          507000000000,        'USD','2025','World Bank','high'),
  ('ARE-gdp_growth_pct-2025',            'ARE','gdp_growth_pct',           4.4,                 '%',  '2025','IMF','high'),
  ('ARE-population-2025',                'ARE','population',               10170000,            'people','2025','UN','high'),
  ('ARE-oil_production_kbd-2025',        'ARE','oil_production_kbd',       4010,                'kbd','2025','IEA','high'),
  ('ARE-gas_production_bcm-2025',        'ARE','gas_production_bcm',       56.2,                'bcm','2025','IEA','high'),
  ('ARE-electricity_consumption_twh-2024','ARE','electricity_consumption_twh',142,             'TWh','2024','IEA','high'),
  ('ARE-renewables_share_pct-2025',      'ARE','renewables_share_pct',     14.2,                '%',  '2025','IRENA','high'),
  ('ARE-co2_per_capita_t-2024',          'ARE','co2_per_capita_t',         20.7,                't',  '2024','IEA','high'),
  ('ARE-sdg_score-2024',                 'ARE','sdg_score',                72.3,                'score','2024','UN SDSN','high'),
  ('ARE-infrastructure_index-2024',      'ARE','infrastructure_index',     4.3,                 '/5', '2024','WEF','high'),
  ('ARE-smart_city_rank-2024',           'ARE','smart_city_rank',          11,                  'rank','2024','IMD','high'),
  ('ARE-exports_usd-2024',               'ARE','exports_usd',              549000000000,        'USD','2024','UN Comtrade','high'),
  ('ARE-fdi_inflows_usd-2024',           'ARE','fdi_inflows_usd',          30700000000,         'USD','2024','UNCTAD','high'),
  ('ARE-competitiveness_rank-2024',      'ARE','competitiveness_rank',     7,                   'rank','2024','WEF','high'),

  -- SAU
  ('SAU-gdp_usd_nominal-2025',           'SAU','gdp_usd_nominal',          1100000000000,       'USD','2025','World Bank','high'),
  ('SAU-gdp_growth_pct-2025',            'SAU','gdp_growth_pct',           3.1,                 '%',  '2025','IMF','high'),
  ('SAU-population-2025',                'SAU','population',               35900000,            'people','2025','UN','high'),
  ('SAU-oil_production_kbd-2025',        'SAU','oil_production_kbd',       9750,                'kbd','2025','IEA','high'),
  ('SAU-renewables_share_pct-2025',      'SAU','renewables_share_pct',     6.1,                 '%',  '2025','IRENA','high'),
  ('SAU-co2_per_capita_t-2024',          'SAU','co2_per_capita_t',         18.2,                't',  '2024','IEA','high'),
  ('SAU-sdg_score-2024',                 'SAU','sdg_score',                70.9,                'score','2024','UN SDSN','high'),
  ('SAU-exports_usd-2024',               'SAU','exports_usd',              332000000000,        'USD','2024','UN Comtrade','high'),

  -- DEU
  ('DEU-gdp_usd_nominal-2025',           'DEU','gdp_usd_nominal',          4500000000000,       'USD','2025','World Bank','high'),
  ('DEU-gdp_growth_pct-2025',            'DEU','gdp_growth_pct',           0.7,                 '%',  '2025','IMF','high'),
  ('DEU-renewables_share_pct-2025',      'DEU','renewables_share_pct',     52.1,                '%',  '2025','IRENA','high'),
  ('DEU-co2_per_capita_t-2024',          'DEU','co2_per_capita_t',         7.6,                 't',  '2024','IEA','high'),
  ('DEU-sdg_score-2024',                 'DEU','sdg_score',                81.5,                'score','2024','UN SDSN','high'),
  ('DEU-infrastructure_index-2024',      'DEU','infrastructure_index',     4.6,                 '/5', '2024','WEF','high'),
  ('DEU-exports_usd-2024',               'DEU','exports_usd',              1700000000000,       'USD','2024','UN Comtrade','high'),

  -- JPN
  ('JPN-gdp_usd_nominal-2025',           'JPN','gdp_usd_nominal',          4200000000000,       'USD','2025','World Bank','high'),
  ('JPN-renewables_share_pct-2025',      'JPN','renewables_share_pct',     24.3,                '%',  '2025','IRENA','high'),
  ('JPN-smart_city_rank-2024',           'JPN','smart_city_rank',          4,                   'rank','2024','IMD','high'),
  ('JPN-infrastructure_index-2024',      'JPN','infrastructure_index',     4.7,                 '/5', '2024','WEF','high'),

  -- USA, KOR, CHN, IND, GBR, FRA — selected
  ('USA-gdp_usd_nominal-2025',           'USA','gdp_usd_nominal',          28700000000000,      'USD','2025','World Bank','high'),
  ('GBR-gdp_usd_nominal-2025',           'GBR','gdp_usd_nominal',          3400000000000,       'USD','2025','World Bank','high'),
  ('FRA-gdp_usd_nominal-2025',           'FRA','gdp_usd_nominal',          3100000000000,       'USD','2025','World Bank','high'),
  ('KOR-gdp_usd_nominal-2025',           'KOR','gdp_usd_nominal',          1870000000000,       'USD','2025','World Bank','high'),
  ('CHN-gdp_usd_nominal-2025',           'CHN','gdp_usd_nominal',          19400000000000,      'USD','2025','World Bank','high'),
  ('IND-gdp_usd_nominal-2025',           'IND','gdp_usd_nominal',          4100000000000,       'USD','2025','World Bank','high'),
  ('IND-gdp_growth_pct-2025',            'IND','gdp_growth_pct',           6.5,                 '%',  '2025','IMF','high')
ON CONFLICT (country_iso3, metric, year) DO UPDATE
  SET value = EXCLUDED.value,
      unit  = EXCLUDED.unit,
      source = EXCLUDED.source,
      confidence = EXCLUDED.confidence,
      ingested_at = NOW();
