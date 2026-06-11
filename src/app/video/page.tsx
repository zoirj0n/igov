"use client";

import { AppShell } from "@/components/shell/AppShell";
import { VideoStudio } from "@/components/video/VideoStudio";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";

export default function VideoPage() {
  useDocumentTitle("Video studio");
  return (
    <AppShell>
      <VideoStudio />
    </AppShell>
  );
}
