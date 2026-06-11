"use client";

import { AgentRunner } from "@/components/agent/AgentRunner";
import { AppShell } from "@/components/shell/AppShell";
import { Suspense } from "react";

export default function AgentPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <AgentRunner />
      </Suspense>
    </AppShell>
  );
}
