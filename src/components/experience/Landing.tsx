"use client";

import { ChatDock } from "@/components/experience/ChatDock";
import { SentenceComposer } from "@/components/experience/SentenceComposer";
import { flagForIso3, iso3Name } from "@/lib/data/iso-countries";
import type { CountryChoice } from "@/lib/experience/machine";
import type { RoleSelection } from "@/lib/experience/roles";
import { useI18n } from "@/lib/i18n/context";

export interface RunChip {
  id: string;
  title: string;
  iso3: string;
}

export function Landing({
  country,
  role,
  busy,
  recent,
  onOpenPicker,
  onRole,
  onBegin,
  onOpenRun,
  onAskPrepare,
}: {
  country: CountryChoice | null;
  role: RoleSelection;
  busy: boolean;
  recent: RunChip[];
  onOpenPicker: () => void;
  onRole: (r: RoleSelection) => void;
  onBegin: () => void;
  onOpenRun: (id: string) => void;
  onAskPrepare: (iso3: string) => void;
}) {
  const { t } = useI18n();
  const x = t.experience;

  return (
    <section className="mx-auto flex min-h-[70dvh] w-full max-w-4xl flex-col items-center justify-center gap-10 px-6 pb-20">
      <div className="inline-flex items-center gap-2 rounded-full border border-tamm-cyan/30 bg-tamm-cyan/10 px-3.5 py-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-tamm-cyan">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tamm-cyan" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-tamm-cyan" />
        </span>
        {t.appName}
      </div>

      <SentenceComposer
        country={country}
        role={role}
        busy={busy}
        onOpenPicker={onOpenPicker}
        onRole={onRole}
        onBegin={onBegin}
      />

      <ChatDock onPrepare={onAskPrepare} />

      {recent.length > 0 && (
        <div className="flex flex-col items-center gap-2.5">
          <h2 className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
            {x.recent}
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {recent.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpenRun(r.id)}
                className="max-w-72 truncate rounded-full border border-ink-200 bg-ink-100/80 px-4 py-1.5 text-sm text-ink-700 transition hover:border-tamm-cyan/50 hover:text-ink-900"
              >
                {flagForIso3(r.iso3)} {iso3Name(r.iso3) ?? r.iso3} — {r.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
