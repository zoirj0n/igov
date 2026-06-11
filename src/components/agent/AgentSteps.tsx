"use client";

export type StepStatus = "idle" | "start" | "done" | "error";

export interface StepView {
  key: string;
  label: string;
  status: StepStatus;
  detail?: string;
  /** Live activity lines (data source, model, figures) streamed while running. */
  notes?: string[];
}

/**
 * Animated, data-driven "agents working" timeline. Each node reflects the real
 * agent trace: a spinning gold ring while a specialist works, a filled
 * check when done. The connector line fills gold as progress advances. MOEI
 * gold (#92722a) + light-gold (#d7bc6d) accents.
 */
export function AgentSteps({
  steps,
  workingLabel,
  doneLabel,
}: {
  steps: StepView[];
  workingLabel: string;
  doneLabel: string;
}) {
  const doneCount = steps.filter((s) => s.status === "done").length;
  const allDone = steps.length > 0 && doneCount === steps.length;
  const errored = steps.some((s) => s.status === "error");

  return (
    <div className="relative mt-6 overflow-hidden rounded-xl border border-ink-200 bg-ink-100 p-5 shadow-card">
      {/* ambient cyan glow while working */}
      {!allDone && !errored && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-0"
          style={{
            background:
              "radial-gradient(120% 60% at 0% 0%, rgba(146, 114, 42,0.06), transparent 60%), radial-gradient(120% 60% at 100% 100%, rgba(215, 188, 109,0.07), transparent 60%)",
          }}
        />
      )}

      <div className="relative mb-4 flex items-center gap-2.5">
        <span className="relative flex h-2.5 w-2.5">
          {!allDone && !errored && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tamm-cyan opacity-75" />
          )}
          <span
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${allDone ? "bg-signal-ok" : errored ? "bg-signal-risk" : "bg-accent"}`}
          />
        </span>
        <span className="text-sm font-semibold text-ink-800">
          {allDone ? doneLabel : workingLabel}
        </span>
        <span className="ms-auto font-mono text-2xs text-ink-400">
          {doneCount}/{steps.length}
        </span>
      </div>

      <ol className="relative space-y-0">
        {steps.map((s, i) => {
          const isLast = i === steps.length - 1;
          return (
            <li key={s.key} className="relative flex gap-3.5 pb-5 last:pb-0">
              {!isLast && (
                <span
                  aria-hidden
                  className={`absolute start-[13px] top-7 h-[calc(100%-1.25rem)] w-0.5 transition-colors duration-700 ${
                    s.status === "done" ? "bg-accent" : "bg-ink-150"
                  }`}
                />
              )}

              <span className="relative z-10 grid h-7 w-7 shrink-0 place-items-center">
                {s.status === "start" && (
                  <span
                    aria-hidden
                    className="absolute inset-0 animate-ping rounded-full bg-tamm-cyan/25"
                  />
                )}
                {s.status === "done" ? (
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-xs font-bold text-white">
                    ✓
                  </span>
                ) : s.status === "error" ? (
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-signal-risk text-xs text-white">
                    ✕
                  </span>
                ) : s.status === "start" ? (
                  <span className="h-7 w-7 animate-spin rounded-full border-2 border-tamm-cyan/30 border-t-accent" />
                ) : (
                  <span className="h-3 w-3 rounded-full border-2 border-ink-300" />
                )}
              </span>

              <div className="min-w-0 flex-1 self-center">
                <div
                  className={`text-sm transition-colors ${
                    s.status === "start"
                      ? "font-semibold text-accent-strong"
                      : s.status === "idle"
                        ? "text-ink-400"
                        : "font-medium text-ink-800"
                  }`}
                >
                  {s.label}
                </div>

                {/* Live activity feed — real source/model/figure lines, streamed in */}
                {s.status === "start" && s.notes && s.notes.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {s.notes.slice(-4).map((n, idx) => {
                      const base = s.notes ? s.notes.length - Math.min(4, s.notes.length) : 0;
                      return (
                        <li
                          // global index → stable key so settled lines don't re-animate
                          key={`${s.key}-note-${base + idx}`}
                          className="animate-in flex items-center gap-1.5 font-mono text-2xs text-ink-400"
                        >
                          <span className="pulse-dot h-1 w-1 shrink-0 rounded-full bg-tamm-cyan" />
                          <span className="truncate">{n}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {s.status !== "start" && s.detail && (
                  <div className="mt-0.5 text-2xs text-ink-400">{s.detail}</div>
                )}
              </div>

              {s.status === "start" && (
                <span className="animate-pulse self-center text-2xs font-medium text-accent">
                  ●●●
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
