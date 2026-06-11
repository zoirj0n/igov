"use client";

import { InsightsView } from "@/components/insights/InsightsView";
import { AppShell } from "@/components/shell/AppShell";
import { Suspense } from "react";

export default function InsightsPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <InsightsView />
      </Suspense>
    </AppShell>
  );
}
