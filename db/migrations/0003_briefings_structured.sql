-- Extend briefings table with structured fields produced by AI generator.
ALTER TABLE briefings
  ADD COLUMN IF NOT EXISTS talking_points  TEXT[],
  ADD COLUMN IF NOT EXISTS risks           TEXT[],
  ADD COLUMN IF NOT EXISTS opportunities   TEXT[],
  ADD COLUMN IF NOT EXISTS citations       TEXT[],
  ADD COLUMN IF NOT EXISTS confidence      confidence_level;

-- Seed the four sample briefings (idempotent UPSERT)
INSERT INTO briefings (id, title, country_iso3, audience, classification, created_by, body,
                       talking_points, risks, opportunities, citations, confidence)
VALUES
  ('brf_001', 'UAE–Germany energy transition partnership',
    'DEU', 'Minister of Energy', 'internal'::classification, NULL,
    'Briefing for upcoming ministerial visit covering hydrogen, renewables, and grid interconnection opportunities.',
    ARRAY['Open on shared net-zero commitments.', 'Surface H2Global as deal-ready vehicle.',
          'Position Masdar as preferred clean-energy export partner.',
          'Pre-empt CO₂ challenge with renewables trajectory.', 'Close with 90-day working group.'],
    ARRAY['Diverging certification standards on hydrogen.', 'Political cycle risk in Germany.',
          'EU CBAM scope creep.'],
    ARRAY['Green-ammonia offtake corridor.', 'Critical-minerals JV via DERA.',
          'Smart-grid cyber-resilience under BSI cooperation.'],
    ARRAY['World Bank, 2025', 'IRENA, 2025', 'BMWK, 2025', 'H2Global, 2025'],
    'high'::confidence_level)
ON CONFLICT (id) DO UPDATE SET
  talking_points = EXCLUDED.talking_points,
  risks = EXCLUDED.risks,
  opportunities = EXCLUDED.opportunities,
  citations = EXCLUDED.citations,
  confidence = EXCLUDED.confidence;
