"use client";

import { ChatWorkspace } from "@/components/chat/ChatWorkspace";
import { AppShell } from "@/components/shell/AppShell";
import { Suspense } from "react";

export default function ChatPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <ChatWorkspace />
      </Suspense>
    </AppShell>
  );
}
