# API Reference

Base URL: `https://api.country-intel.gov.ae/v1`

OpenAPI 3.1 spec served at `/openapi.json`.
Interactive docs: `/docs`.

## Auth
All endpoints require `Authorization: Bearer <jwt>` except `/auth/*` and `/health`.

## Endpoints

### Countries
- `GET /countries` — list all countries
- `GET /countries/:iso3` — full profile
- `GET /countries/:iso3/indicators?metric=gdp,co2&years=2020-2025`
- `GET /countries/:iso3/agreements` — bilateral agreements
- `GET /countries/:iso3/projects` — major projects

### Comparison
- `POST /compare` — body `{ countries: string[], metrics: string[] }`

### Briefings
- `POST /briefings` — generate; body `{ countryIso3, audience, topics[] }`
- `GET /briefings/:id`
- `POST /briefings/:id/export?format=pdf|pptx|docx`

### Chat (streamed)
- `POST /chat` — SSE stream; body `{ messages[], filters? }`

### Video
- `POST /videos` — body `{ topic, countries[], duration_seconds }`
- `GET /videos/:id/status`

### Insights
- `GET /insights/forecast?metric=...&iso3=...&horizon_years=5`
- `GET /insights/risk?iso3=...`

### Cooperation
- `GET /cooperation/opportunities?iso3=...&sector=...`

## Errors
RFC 7807 Problem Details. Example:
```json
{
  "type": "https://errors.country-intel/forbidden-classification",
  "title": "Insufficient clearance",
  "status": 403,
  "detail": "User clearance 'internal' < required 'confidential'"
}
```

## Rate limits
- Per user: 600 req/min
- AI endpoints: 60 req/min, 100k tokens/hour
- Excess: HTTP 429 with `Retry-After` header
