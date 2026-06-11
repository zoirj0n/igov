"use client";

import { BriefingsList } from "@/components/briefings/BriefingsList";
import { AppShell } from "@/components/shell/AppShell";
import { Suspense } from "react";

export default function BriefingsPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <BriefingsList />
      </Suspense>
    </AppShell>
  );
}
