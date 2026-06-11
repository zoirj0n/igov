"use client";

import { Modal } from "@/components/shared/Modal";

const SHORTCUTS: { keys: string[]; description: string }[] = [
  { keys: ["⌘", "K"], description: "Open command palette" },
  { keys: ["Ctrl", "K"], description: "Open command palette (Windows/Linux)" },
  { keys: ["?"], description: "Show this help" },
  { keys: ["Esc"], description: "Close modal / mobile nav" },
  { keys: ["Enter"], description: "Send chat message" },
  { keys: ["Shift", "Enter"], description: "Newline in chat input" },
  { keys: ["↑", "↓"], description: "Navigate command palette" },
  { keys: ["Tab"], description: "Focus next element / cycle within modal" },
];

export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" width="md">
      <ul className="divide-y divide-ink-100">
        {SHORTCUTS.map((s) => (
          <li key={s.description} className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-sm text-ink-700">{s.description}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {s.keys.map((k, i) => (
                <kbd
                  key={i}
                  className="rounded-xs border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink-700 shadow-card"
                >
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-2xs text-ink-400">
        Press{" "}
        <kbd className="rounded-xs border border-ink-200 bg-ink-50 px-1 py-0.5 font-mono text-[10px]">
          ?
        </kbd>{" "}
        anytime to toggle this panel.
      </p>
    </Modal>
  );
}
