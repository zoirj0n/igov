# Architecture

## Overview
AI-powered Country Intelligence Platform for UAE government leadership. Delivers consolidated country profiles, real-time indicators, AI-generated briefings, video summaries, comparison views, and predictive insights.

## High-level diagram
```
        ┌──────────────────────────────────────────────────────┐
        │  Next.js App Router (web)                            │
        │  ├─ /dashboard  /country/:iso3  /compare  /briefing  │
        │  └─ /chat  /video  /insights  /cooperation           │
        └────────────────────────┬─────────────────────────────┘
                                 │ HTTPS / mTLS
        ┌────────────────────────▼─────────────────────────────┐
        │  NestJS API gateway (Node 20)                        │
        │  ├─ auth (UAE PASS / Entra OIDC)                     │
        │  ├─ rbac/abac middleware                             │
        │  └─ rest + websockets (streamed AI)                  │
        └──┬───────────┬──────────────┬──────────────┬─────────┘
           │           │              │              │
        ┌──▼──┐    ┌──▼──┐        ┌──▼──┐        ┌──▼──┐
        │ PG  │    │Redis│        │ OS  │        │ AI  │
        │ +   │    │     │        │earch│        │svc  │
        │GIS  │    │     │        │     │        │     │
        └─────┘    └─────┘        └─────┘        └──┬──┘
                                                    │
                                              ┌─────▼─────┐
                                              │ Claude    │
                                              │ Opus 4.7  │
                                              │ + pgvector│
                                              │ RAG       │
                                              └───────────┘
```

## Components
- **web** — Next.js 15, React 19, Tailwind, shadcn/ui, TanStack Query.
- **api** — NestJS, zod validation, OpenAPI 3.1 spec auto-generated.
- **etl** — Dagster pipelines pulling World Bank, IEA, IMF, UN Comtrade, IRENA, WEF, OECD, FCSC.
- **ai-svc** — Anthropic SDK wrapper. RAG over pgvector. Prompt-injection guard.
- **siem** — audit events → Splunk/Sentinel via syslog.

## Data classification
Public / Internal / Confidential / Secret. Stored per-row in `classification` column. RLS policies enforce read access.

## Multi-region
UAE region only. Cross-region replica in second UAE AZ for DR (RPO 15m, RTO 1h).

## Auth flow
1. User → `/auth/uae-pass/start` → redirect to UAE PASS.
2. Callback → exchange code → fetch profile → issue JWT (RS256, 15m).
3. Refresh token rotation, idle timeout 10m.
4. MFA challenge if step-up required (classified data, admin actions).

## Observability
OpenTelemetry → OTLP collector → Grafana/Tempo/Loki/Prometheus.
SLO dashboards: latency p50/p95/p99, error rate, AI token usage.
