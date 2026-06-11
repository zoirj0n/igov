"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { AssistantFab } from "./AssistantFab";
import { CommandPalette } from "./CommandPalette";
import { ShortcutHelp } from "./ShortcutHelp";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const STORAGE_KEY = "country-intel.sidebarCollapsed";
const AUTH_PING_MS = 5 * 60 * 1000; // every 5 minutes

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [palette, setPalette] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  // Close mobile drawer on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Session sentinel: redirect to /login if cookie expired mid-session.
  // Pings on mount, on tab refocus, and every 5 minutes.
  useEffect(() => {
    let cancelled = false;
    async function check(): Promise<void> {
      try {
        const r = await fetch("/api/auth/me", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { user: unknown | null };
        if (cancelled) return;
        if (d.user === null && pathname !== "/login") {
          const next = encodeURIComponent(pathname || "/dashboard");
          router.replace(`/login?next=${next}`);
        }
      } catch {
        // Network blip — leave user where they are.
      }
    }
    check();
    function onFocus(): void {
      void check();
    }
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(check, AUTH_PING_MS);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, [pathname, router]);

  // Lock body scroll while mobile drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      // "?" opens help, but not while typing in a form field.
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (!inField && e.key === "?" && !mod) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && mobileOpen) {
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className="relative min-h-screen bg-ink-50 text-ink-800">
      {/* ambient command-center atmosphere (subtle, fixed behind content) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-tamm-teal/10 blur-[150px]" />
        <div className="absolute -right-44 top-1/4 h-[34rem] w-[34rem] rounded-full bg-tamm-cyan/[0.06] blur-[160px]" />
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(130% 90% at 50% 0%, #000 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(130% 90% at 50% 0%, #000 30%, transparent 75%)",
          }}
        />
      </div>
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className={collapsed ? "md:ps-[64px]" : "md:ps-[228px]"}>
        <Topbar
          onOpenPalette={() => setPalette(true)}
          onOpenMobileNav={() => setMobileOpen(true)}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-[calc(100vh-64px)] focus:outline-none"
        >
          {children}
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <AssistantFab />
    </div>
  );
}
