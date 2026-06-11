"use client";

import { useToast } from "@/lib/hooks/useToast";
import { useEffect, useState } from "react";

type Cls = "public" | "internal" | "confidential" | "secret";
type RoleKey = "viewer" | "analyst" | "lead" | "executive" | "admin";
const CLS_ORDER: Cls[] = ["public", "internal", "confidential", "secret"];
const ROLE_ORDER: RoleKey[] = ["viewer", "analyst", "lead", "executive", "admin"];

interface DeptRec {
  id: string;
  name: string;
  parentId?: string;
  defaultClassification?: Cls;
  createdAt: string;
  createdBy: string;
  memberCount?: number;
}

interface OrgPolicyRec {
  orgDefaultClassification: Cls;
  roleDefaults: Partial<Record<RoleKey, Cls>>;
  deptDailyBudgets?: Record<string, number>;
  updatedAt: string;
  updatedBy: string;
}

export function OrgPolicyPanel() {
  const { push } = useToast();
  const [policy, setPolicy] = useState<OrgPolicyRec | null>(null);
  const [depts, setDepts] = useState<DeptRec[]>([]);
  const [busy, setBusy] = useState(false);
  const [orgDraft, setOrgDraft] = useState<Cls>("internal");
  const [roleDraft, setRoleDraft] = useState<Partial<Record<RoleKey, Cls | "">>>({});
  const [deptBudgetDraft, setDeptBudgetDraft] = useState<Record<string, string>>({});

  function load(): void {
    fetch("/api/admin/org-policy")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { policy?: OrgPolicyRec } | null) => {
        if (!d?.policy) return;
        setPolicy(d.policy);
        setOrgDraft(d.policy.orgDefaultClassification);
        setRoleDraft({ ...d.policy.roleDefaults });
        const draft: Record<string, string> = {};
        for (const [k, v] of Object.entries(d.policy.deptDailyBudgets ?? {})) {
          draft[k] = String(v);
        }
        setDeptBudgetDraft(draft);
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

  async function savePolicy(): Promise<void> {
    setBusy(true);
    try {
      const cleanRole: Partial<Record<RoleKey, Cls>> = {};
      for (const r of ROLE_ORDER) {
        const v = roleDraft[r];
        if (v === "public" || v === "internal" || v === "confidential" || v === "secret")
          cleanRole[r] = v;
      }
      const cleanDeptBudgets: Record<string, number> = {};
      for (const [k, raw] of Object.entries(deptBudgetDraft)) {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) cleanDeptBudgets[k] = n;
      }
      const res = await fetch("/api/admin/org-policy", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orgDefaultClassification: orgDraft,
          roleDefaults: cleanRole,
          deptDailyBudgets: cleanDeptBudgets,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${res.status}`);
      push({
        kind: "success",
        title: "Org policy saved",
        detail: `default=${d.policy.orgDefaultClassification}`,
      });
      load();
    } catch (e) {
      push({
        kind: "error",
        title: "Save failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="section-title">Org-wide policy</h2>
            <p className="mt-1 text-xs text-ink-500">
              Resolved order:{" "}
              <code className="rounded-xs bg-ink-100 px-1 font-mono">
                user → role → department → org
              </code>
              . Each row clamps to user's clearance.
            </p>
          </div>
          <button
            type="button"
            onClick={savePolicy}
            disabled={busy}
            className="btn-primary text-xs disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save policy"}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
          <div className="rounded-md border border-ink-150 p-3">
            <div className="text-2xs font-medium uppercase tracking-wide text-ink-500">
              Org default
            </div>
            <select
              value={orgDraft}
              onChange={(e) => setOrgDraft(e.target.value as Cls)}
              className="mt-2 w-full rounded-md border border-ink-150 bg-ink-100 px-2 py-1.5 text-xs"
            >
              {CLS_ORDER.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="mt-1.5 font-mono text-2xs text-ink-400">
              {policy
                ? `updated ${new Date(policy.updatedAt).toLocaleString()} by ${policy.updatedBy}`
                : "—"}
            </div>
          </div>
          <div className="rounded-md border border-ink-150 p-3">
            <div className="text-2xs font-medium uppercase tracking-wide text-ink-500">
              Role defaults
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ROLE_ORDER.map((r) => (
                <div key={r} className="flex items-center gap-2">
                  <span className="w-20 font-mono text-2xs text-ink-600">{r}</span>
                  <select
                    value={roleDraft[r] ?? ""}
                    onChange={(e) =>
                      setRoleDraft((d) => ({ ...d, [r]: e.target.value as Cls | "" }))
                    }
                    className="flex-1 rounded-md border border-ink-150 bg-ink-100 px-2 py-1 text-xs"
                  >
                    <option value="">(none)</option>
                    {CLS_ORDER.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <p className="mt-2 text-2xs text-ink-500">
              Role default overrides department default but is overridden by user-personal setting.
            </p>
          </div>
        </div>
        {depts.length > 0 && (
          <div className="mt-4 rounded-md border border-ink-150 p-3">
            <div className="flex items-baseline justify-between">
              <div className="text-2xs font-medium uppercase tracking-wide text-ink-500">
                Per-department daily LLM budget (USD)
              </div>
              <div className="text-2xs text-ink-500">blank or 0 = no cap</div>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {depts.map((d) => (
                <div key={d.id} className="flex items-center gap-2">
                  <span className="flex-1 truncate font-mono text-2xs text-ink-700">{d.name}</span>
                  <span className="text-2xs text-ink-500">$</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={deptBudgetDraft[d.id] ?? ""}
                    onChange={(e) => setDeptBudgetDraft((s) => ({ ...s, [d.id]: e.target.value }))}
                    placeholder="—"
                    className="w-24 rounded-md border border-ink-150 bg-ink-100 px-2 py-1 text-right font-mono text-2xs"
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-2xs text-ink-500">
              Caps are checked per-call when{" "}
              <code className="rounded-xs bg-ink-100 px-1 font-mono">
                BUDGET_ENFORCE_BLOCK=true
              </code>
              ; otherwise alert-only.
            </p>
          </div>
        )}
      </section>

      <DepartmentsPanel depts={depts} onChange={load} />
    </div>
  );
}

function DepartmentsPanel({ depts, onChange }: { depts: DeptRec[]; onChange: () => void }) {
  const { push } = useToast();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDefault, setNewDefault] = useState<Cls | "">("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editDefault, setEditDefault] = useState<Cls | "">("");

  async function create(): Promise<void> {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const body: { name: string; defaultClassification?: Cls } = { name: newName.trim() };
      if (newDefault) body.defaultClassification = newDefault;
      const res = await fetch("/api/admin/departments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${res.status}`);
      push({ kind: "success", title: "Department created", detail: d.department.name });
      setNewName("");
      setNewDefault("");
      onChange();
    } catch (e) {
      push({
        kind: "error",
        title: "Create failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setCreating(false);
    }
  }

  async function saveDefault(id: string): Promise<void> {
    try {
      const body: { defaultClassification: Cls | null } = {
        defaultClassification: editDefault === "" ? null : editDefault,
      };
      const res = await fetch(`/api/admin/departments/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${res.status}`);
      push({ kind: "success", title: "Department updated" });
      setEditing(null);
      onChange();
    } catch (e) {
      push({
        kind: "error",
        title: "Update failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function del(id: string, name: string): Promise<void> {
    if (!confirm(`Delete department "${name}"? Members will keep current assignments.`)) return;
    try {
      const res = await fetch(`/api/admin/departments/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${res.status}`);
      push({ kind: "success", title: "Deleted", detail: name });
      onChange();
    } catch (e) {
      push({
        kind: "error",
        title: "Delete failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="section-title">Departments</h2>
          <p className="mt-1 text-xs text-ink-500">
            Per-department classification defaults. Auto-created on SSO login if `department` claim
            is present.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-ink-150 bg-ink-50/40 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_auto]">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Department name (e.g. Foreign Affairs)"
            className="rounded-md border border-ink-150 bg-ink-100 px-3 py-1.5 text-sm shadow-card focus:border-accent focus:outline-none"
          />
          <select
            value={newDefault}
            onChange={(e) => setNewDefault(e.target.value as Cls | "")}
            className="rounded-md border border-ink-150 bg-ink-100 px-2 py-1.5 text-xs"
          >
            <option value="">(default classification: none)</option>
            {CLS_ORDER.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={create}
            disabled={creating || !newName.trim()}
            className="btn-primary text-xs disabled:opacity-40"
          >
            {creating ? "Creating…" : "+ Create"}
          </button>
        </div>
      </div>

      <table className="mt-4 min-w-full text-sm">
        <thead className="bg-ink-50/60">
          <tr className="border-b border-ink-100 text-2xs font-medium uppercase tracking-wide text-ink-500">
            <th className="px-3 py-2 text-start">ID</th>
            <th className="px-3 py-2 text-start">Name</th>
            <th className="px-3 py-2 text-start">Default</th>
            <th className="px-3 py-2 text-end">Members</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {depts.map((d) => (
            <tr key={d.id} className="border-b border-ink-100 last:border-b-0">
              <td className="px-3 py-2 font-mono text-2xs text-ink-500">{d.id}</td>
              <td className="px-3 py-2 text-ink-800">{d.name}</td>
              <td className="px-3 py-2">
                {editing === d.id ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={editDefault}
                      onChange={(e) => setEditDefault(e.target.value as Cls | "")}
                      className="rounded-md border border-ink-150 bg-ink-100 px-2 py-1 text-xs"
                    >
                      <option value="">(none)</option>
                      {CLS_ORDER.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => saveDefault(d.id)}
                      className="btn-primary text-2xs"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="btn-ghost text-2xs"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <span className="font-mono text-xs text-ink-700">
                    {d.defaultClassification ?? "—"}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-end font-mono text-xs text-ink-600">
                {d.memberCount ?? 0}
              </td>
              <td className="px-3 py-2 text-end">
                {editing !== d.id && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(d.id);
                        setEditDefault(d.defaultClassification ?? "");
                      }}
                      className="btn-ghost text-2xs"
                    >
                      Edit
                    </button>
                    {d.id !== "dept-unassigned" && (
                      <button
                        type="button"
                        onClick={() => del(d.id, d.name)}
                        className="btn-ghost text-2xs text-signal-risk"
                      >
                        Delete
                      </button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
          {depts.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-xs text-ink-400">
                No departments yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
