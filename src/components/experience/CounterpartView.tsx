"use client";

import { initialsOf, photoProxySrc } from "@/components/experience/counterpart-utils";
import { useI18n } from "@/lib/i18n/context";
import type { CounterpartProfile } from "@/services/agent/state";

export function CounterpartView({ profile }: { profile?: CounterpartProfile }) {
  const { locale, t } = useI18n();
  const x = t.experience.counterpartView;
  const lang: "en" | "ar" = locale === "ar" ? "ar" : "en";

  if (!profile || profile.confidence === "unconfirmed") {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <div
          className="grid h-20 w-20 place-items-center rounded-full border border-ink-300 bg-ink-150 text-2xl text-ink-400"
          aria-hidden
        >
          ?
        </div>
        <h3 className="text-lg font-semibold text-ink-800">{x.unconfirmedTitle}</h3>
        {profile?.role && (
          <p className="text-sm text-ink-500">
            {lang === "ar" ? (profile.roleAr ?? profile.role) : profile.role}
          </p>
        )}
        <p className="max-w-md rounded-md border border-signal-warn/50 bg-signal-warn/10 px-4 py-2 text-sm text-tamm-olive">
          ⚠ {x.unconfirmedBody}
        </p>
      </div>
    );
  }

  const src = photoProxySrc(profile);
  const name = lang === "ar" ? (profile.nameAr ?? profile.name) : profile.name;
  const role = lang === "ar" ? (profile.roleAr ?? profile.role) : profile.role;
  const confCls =
    profile.confidence === "high"
      ? "border-signal-ok/40 text-signal-ok"
      : "border-tamm-olive/40 text-tamm-olive";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-5">
        {src ? (
          <img
            src={src}
            alt={profile.name}
            className="h-44 w-36 shrink-0 rounded-lg border border-accent/40 object-cover shadow-card"
          />
        ) : (
          <div
            className="grid h-44 w-36 shrink-0 place-items-center rounded-lg border border-accent/40 bg-ink-150 text-3xl font-bold text-tamm-cyan shadow-card"
            aria-hidden
          >
            {initialsOf(profile.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-2xl font-semibold text-ink-900">{name}</h3>
          <p className="text-sm text-ink-500">{role}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-2xs text-ink-400">
            <span className={`rounded-full border px-2 py-0.5 font-semibold uppercase ${confCls}`}>
              {x.confidence}: {profile.confidence}
            </span>
            <span>
              {x.identifiedAsOf} {profile.identifiedAsOf}
            </span>
          </p>
          {profile.education && (
            <p className="mt-2.5 text-sm text-ink-600">
              <span className="me-1.5 text-2xs uppercase tracking-wide text-ink-400">
                {x.education}
              </span>
              {profile.education}
            </p>
          )}
          {profile.summary && (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-700">{profile.summary}</p>
          )}
        </div>
      </div>

      {profile.career.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold uppercase tracking-tight text-ink-400">
            {x.career}
          </h4>
          <ul className="mt-2 space-y-1.5">
            {profile.career.map((c) => (
              <li
                key={`${c.period}-${c.position}`}
                className="flex flex-wrap items-baseline gap-2 text-sm"
              >
                <span className="font-mono text-2xs text-tamm-cyan">{c.period}</span>
                <span className="text-ink-700">{c.position}</span>
                <span className="text-2xs text-ink-400">· {c.org}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile.likelyToRaise.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold uppercase tracking-tight text-ink-400">
            {x.likelyToRaise}
          </h4>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-ink-700">
            {profile.likelyToRaise.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      )}

      {profile.statements.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold uppercase tracking-tight text-ink-400">
            {x.statements}
          </h4>
          <ul className="mt-2 space-y-1 text-sm">
            {profile.statements.map((st) => (
              <li key={st.url}>
                <a
                  href={st.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-strong hover:underline"
                >
                  {st.text}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile.citations.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold uppercase tracking-tight text-ink-400">
            {x.sources}
          </h4>
          <ul className="mt-2 flex flex-wrap gap-2">
            {profile.citations.map((c) => (
              <li
                key={c}
                className="max-w-72 truncate rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-xs text-ink-600"
              >
                {c}
              </li>
            ))}
          </ul>
          {profile.photoAttribution && (
            <p className="mt-2 text-2xs text-ink-400">{profile.photoAttribution}</p>
          )}
        </section>
      )}
    </div>
  );
}
