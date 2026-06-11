"use client";

import { CompareView } from "@/components/compare/CompareView";
import { AppShell } from "@/components/shell/AppShell";
import { Suspense } from "react";

export default function ComparePage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <CompareView />
      </Suspense>
    </AppShell>
  );
}
