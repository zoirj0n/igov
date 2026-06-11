import { getCurrentUser } from "@/lib/auth/server";
import { isValidIso3 } from "@/lib/data/iso-countries";
import { logAudit } from "@/services/audit";
import { fetchHistorical, isPredictableMetric } from "@/services/predict/historical";
import { forecastHolt } from "@/services/predict/holts";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  iso3: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/),
  metric: z.string().min(2).max(60),
  horizon: z.coerce.number().int().min(1).max(15).default(5),
});

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    iso3: url.searchParams.get("iso3")?.toUpperCase(),
    metric: url.searchParams.get("metric"),
    horizon: url.searchParams.get("horizon"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  // Forecasts pull live World Bank history, so any real country works — the
  // curated-seed gate here was why /forecast 404'd for e.g. Morocco.
  if (!isValidIso3(parsed.data.iso3)) {
    return NextResponse.json({ error: "unknown country" }, { status: 404 });
  }

  if (!isPredictableMetric(parsed.data.metric)) {
    return NextResponse.json(
      { error: `metric not predictable: ${parsed.data.metric}` },
      { status: 400 },
    );
  }

  try {
    const history = await fetchHistorical(parsed.data.iso3, parsed.data.metric);
    if (history.length < 3) {
      logAudit(user, "insights.forecast.insufficient", "insights", {
        resourceId: `${parsed.data.iso3}/${parsed.data.metric}`,
        meta: { points: history.length },
      });
      return NextResponse.json(
        { error: "insufficient historical data for forecast" },
        { status: 422 },
      );
    }
    const result = forecastHolt(history, parsed.data.horizon);
    logAudit(user, "insights.forecast.ok", "insights", {
      resourceId: `${parsed.data.iso3}/${parsed.data.metric}`,
      meta: { points: history.length, horizon: parsed.data.horizon, rmse: result.rmse },
    });
    return NextResponse.json({
      iso3: parsed.data.iso3,
      metric: parsed.data.metric,
      horizon: parsed.data.horizon,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "forecast failed";
    logAudit(user, "insights.forecast.error", "insights", {
      resourceId: `${parsed.data.iso3}/${parsed.data.metric}`,
      meta: { error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
