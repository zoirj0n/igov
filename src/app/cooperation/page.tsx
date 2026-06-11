"use client";

import { CooperationView } from "@/components/cooperation/CooperationView";
import { AppShell } from "@/components/shell/AppShell";
import { Suspense } from "react";

export default function CooperationPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <CooperationView />
      </Suspense>
    </AppShell>
  );
}
