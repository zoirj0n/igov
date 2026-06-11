import type { ReactNode } from "react";

interface Props {
  title: string;
  detail?: string;
  action?: ReactNode;
}

export function EmptyState({ title, detail, action }: Props) {
  return (
    <div className="grid place-items-center rounded-sm border border-dashed border-ink-200 p-10 text-center">
      <div className="mb-3 h-10 w-10 rounded-full bg-ink-100" aria-hidden />
      <div className="text-sm font-medium text-ink-800">{title}</div>
      {detail && <div className="mt-1 max-w-sm text-xs text-ink-500">{detail}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
