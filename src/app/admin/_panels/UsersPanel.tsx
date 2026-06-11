"use client";

import { useToast } from "@/lib/hooks/useToast";
import { useEffect, useState } from "react";

type Cls = "public" | "internal" | "confidential" | "secret";

interface DeptRec {
  id: string;
  name: string;
  parentId?: string;
  defaultClassification?: Cls;
  createdAt: string;
  createdBy: string;
  memberCount?: number;
}

interface AdminUserRec {
  sub: string;
  email: string;
  name: string;
  role: string;
  clearance: string;
  departmentId: string;
  departmentSource: "sso" | "admin" | null;
}

export function UsersPanel() {
  const { push } = useToast();
  const [users, setUsers] = useState<AdminUserRec[]>([]);
  const [depts, setDepts] = useState<DeptRec[]>([]);
  const [savingSub, setSavingSub] = useState<string | null>(null);

  function load(): void {
    fetch("/api/admin/users")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { users?: AdminUserRec[] } | null) => {
        if (d?.users) setUsers(d.users);
      })
      .catch(() => {});
    fetch("/api/admin/departments")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { departments?: DeptRec[] } | null) => {
        if (d?.departments) setDepts(d.departments);
      })
      .catch(() => {});
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: load is stable in this component
  useEffect(load, []);

  async function assign(sub: string, departmentId: string): Promise<void> {
    setSavingSub(sub);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(sub)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ departmentId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${res.status}`);
      push({ kind: "success", title: "Department updated", detail: `${sub} → ${departmentId}` });
      load();
    } catch (e) {
      push({
        kind: "error",
        title: "Update failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSavingSub(null);
    }
  }

  return (
    <section className="card overflow-hidden">
      <table className="min-w-full text-sm">
        <thead className="bg-ink-50/60">
          <tr className="border-b border-ink-100 text-2xs font-medium uppercase tracking-wide text-ink-500">
            <th className="px-4 py-2 text-start">Name</th>
            <th className="px-4 py-2 text-start">Email</th>
            <th className="px-4 py-2 text-start">Role</th>
            <th className="px-4 py-2 text-start">Clearance</th>
            <th className="px-4 py-2 text-start">Department</th>
            <th className="px-4 py-2 text-start">Source</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-xs text-ink-400">
                Loading…
              </td>
            </tr>
          )}
          {users.map((u) => (
            <tr key={u.sub} className="border-b border-ink-100 last:border-0 hover:bg-ink-150">
              <td className="px-4 py-2 font-medium text-ink-800">{u.name}</td>
              <td className="px-4 py-2 font-mono text-xs text-ink-600">{u.email}</td>
              <td className="px-4 py-2 text-ink-700">{u.role}</td>
              <td className="px-4 py-2">
                <span className="rounded-xs bg-ink-100 px-2 py-0.5 text-[11px] text-ink-700">
                  {u.clearance}
                </span>
              </td>
              <td className="px-4 py-2">
                <select
                  value={u.departmentId}
                  onChange={(e) => assign(u.sub, e.target.value)}
                  disabled={savingSub === u.sub}
                  className="rounded-md border border-ink-150 bg-ink-100 px-2 py-1 text-xs disabled:opacity-50"
                >
                  {depts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.defaultClassification ? ` (default: ${d.defaultClassification})` : ""}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-2">
                {u.departmentSource ? (
                  <span
                    className={`rounded-xs px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                      u.departmentSource === "admin"
                        ? "bg-accent-subtle text-accent"
                        : "bg-ink-100 text-ink-600"
                    }`}
                  >
                    {u.departmentSource}
                  </span>
                ) : (
                  <span className="text-2xs text-ink-400">default</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
