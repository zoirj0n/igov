"use client";

import type { Briefing } from "@/services/agent/state";
import { ANTV_TEMPLATES, type AntVTemplate, antvSyntax } from "@/services/export/antv-syntax";
import { useEffect, useRef, useState } from "react";

// AntV Infographic ships no types we depend on; load it client-side on demand.
// biome-ignore lint/suspicious/noExplicitAny: third-party module without types
let antvMod: Promise<any> | null = null;
const loadAntV = () => {
  if (!antvMod) antvMod = import("@antv/infographic");
  return antvMod;
};

/**
 * In-app interactive infographic ("Visualize") rendered by AntV from the
 * briefing data — complements the server-exported one-pager. Client-side only,
 * loaded on demand, version-pinned dependency (no CDN). User switches templates.
 */
export function BriefingVisualizer({
  briefing,
  locale,
}: {
  briefing: Briefing;
  locale: "en" | "ar";
}) {
  const [tab, setTab] = useState<AntVTemplate>("swot");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const containerRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/suspicious/noExplicitAny: AntV instance has no shared types
  const instRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    loadAntV()
      .then(() => !cancelled && setStatus("ready"))
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  // (Re)render whenever the template, briefing or locale changes.
  useEffect(() => {
    if (status !== "ready" || !containerRef.current) return;
    let disposed = false;
    loadAntV().then((mod) => {
      if (disposed || !containerRef.current) return;
      try {
        if (!instRef.current) {
          instRef.current = new mod.Infographic({
            container: containerRef.current,
            width: "100%",
            height: "100%",
          });
        }
        instRef.current.render(antvSyntax(briefing, locale, tab));
      } catch (e) {
        console.error("AntV render failed", e);
        setStatus("error");
      }
    });
    return () => {
      disposed = true;
    };
  }, [status, tab, briefing, locale]);

  useEffect(
    () => () => {
      try {
        instRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      instRef.current = null;
    },
    [],
  );

  const downloadSvg = async () => {
    try {
      const url: string | undefined = await instRef.current?.toDataURL?.({ type: "svg" });
      if (!url) return;
      const a = document.createElement("a");
      a.href = url;
      a.download = `briefing-${tab}.svg`;
      a.click();
    } catch (e) {
      console.error("AntV export failed", e);
    }
  };

  return (
    <section
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="overflow-hidden rounded-lg border border-ink-200 bg-ink-100 shadow-card"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
        <span className="me-auto text-sm font-semibold text-ink-800">
          {locale === "ar" ? "عرض تفاعلي" : "Interactive view"}
        </span>
        {ANTV_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => setTab(tpl.id)}
            className={`rounded-full px-3 py-1 text-2xs font-semibold transition-colors ${
              tab === tpl.id
                ? "bg-accent text-white"
                : "border border-ink-200 text-ink-500 hover:bg-ink-200"
            }`}
          >
            {tpl.label[locale]}
          </button>
        ))}
        <button
          type="button"
          onClick={downloadSvg}
          className="rounded-full border border-ink-200 px-3 py-1 text-2xs font-medium text-ink-600 hover:bg-ink-200"
        >
          SVG
        </button>
      </header>
      <div className="relative bg-ink-50">
        {status !== "ready" && (
          <p className="absolute inset-0 grid place-items-center text-sm text-ink-400">
            {status === "error"
              ? locale === "ar"
                ? "تعذّر تحميل العرض التفاعلي."
                : "Interactive view unavailable."
              : locale === "ar"
                ? "جارٍ التحميل…"
                : "Loading…"}
          </p>
        )}
        <div ref={containerRef} className="h-[440px] w-full" aria-label="Interactive infographic" />
      </div>
    </section>
  );
}
