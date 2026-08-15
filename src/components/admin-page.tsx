"use client";

import { useState } from "react";
import { PageShell, Section } from "./page-shell";
import { PROVIDER_LIST, type ProviderId } from "@/lib/providers";
import { IconCheck, IconKey, IconTrash } from "./icons";

export interface AdminEmployee {
  userId: string;
  name: string;
  email: string;
  role: string;
  limitCents: number | null;
  spentCentsThisPeriod: number;
  periodDays: number;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Org-paid provider keys and per-employee spend caps — unreachable except on
 * a self-hosted, `ORG_MANAGED_KEYS=true` deployment, and then only to the
 * account matching `ADMIN_EMAIL`. See the route in `app/(app)/admin/page.tsx`
 * for the gating and `session.ts`'s `ensureFirstAdmin` for how that account
 * gets the role in the first place.
 *
 * A saved key is never sent back to this page — the provider list below only
 * ever says "configured" or not, never the key itself. Replacing a key means
 * typing a new one, not editing a masked one.
 */
export function AdminPage({
  configuredProviders,
  employees: initialEmployees,
}: {
  configuredProviders: string[];
  employees: AdminEmployee[];
}) {
  const [configured, setConfigured] = useState(new Set(configuredProviders));
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [busyProvider, setBusyProvider] = useState<ProviderId | null>(null);

  const [employees, setEmployees] = useState(initialEmployees);
  const [limitDrafts, setLimitDrafts] = useState<Record<string, { limit: string; period: string }>>(
    {},
  );
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  async function saveKey(provider: ProviderId) {
    const key = (keyDrafts[provider] ?? "").trim();
    if (!key) return;
    setBusyProvider(provider);
    try {
      const res = await fetch("/api/admin/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key }),
      });
      if (res.ok) {
        setConfigured((prev) => new Set(prev).add(provider));
        setKeyDrafts((prev) => ({ ...prev, [provider]: "" }));
      }
    } finally {
      setBusyProvider(null);
    }
  }

  async function removeKey(provider: ProviderId) {
    setBusyProvider(provider);
    try {
      const res = await fetch(`/api/admin/keys?provider=${provider}`, { method: "DELETE" });
      if (res.ok) {
        setConfigured((prev) => {
          const next = new Set(prev);
          next.delete(provider);
          return next;
        });
      }
    } finally {
      setBusyProvider(null);
    }
  }

  async function saveLimit(employee: AdminEmployee) {
    const draft = limitDrafts[employee.userId];
    const unlimited = draft?.limit === "unlimited";
    const limitCents = unlimited
      ? null
      : draft?.limit
        ? Math.round(Number(draft.limit) * 100)
        : employee.limitCents;
    const periodDays = draft?.period ? Number(draft.period) : employee.periodDays;
    if (!unlimited && (limitCents === null || !Number.isFinite(limitCents) || limitCents < 0)) return;
    if (!Number.isFinite(periodDays) || periodDays <= 0) return;

    setBusyUserId(employee.userId);
    try {
      const res = await fetch("/api/admin/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: employee.userId, limitCents, periodDays }),
      });
      if (res.ok) {
        setEmployees((prev) =>
          prev.map((e) => (e.userId === employee.userId ? { ...e, limitCents, periodDays } : e)),
        );
        setLimitDrafts((prev) => ({ ...prev, [employee.userId]: { limit: "", period: "" } }));
      }
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <PageShell
      title="Admin"
      description="Provider keys are shared by everyone on this instance. Spend limits are per person."
    >
      <Section
        title="Provider keys"
        description="Configure once, paid by the company. Employees never see or enter these."
      >
        <ul className="space-y-2">
          {PROVIDER_LIST.map((info) => {
            const isConfigured = configured.has(info.id);
            const busy = busyProvider === info.id;
            return (
              <li
                key={info.id}
                className="flex items-center gap-2 rounded-lg border border-border-subtle p-2.5"
              >
                <IconKey size={14} className="shrink-0 text-text-faint" />
                <span className="w-28 shrink-0 text-dense text-text">{info.label}</span>
                {isConfigured ? (
                  <>
                    <span className="flex items-center gap-1 text-dense text-accent">
                      <IconCheck size={13} /> Configured
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeKey(info.id)}
                      aria-label={`Remove ${info.label} key`}
                      className="ml-auto rounded-md p-1.5 text-text-faint hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                    >
                      <IconTrash size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      type="password"
                      value={keyDrafts[info.id] ?? ""}
                      onChange={(e) =>
                        setKeyDrafts((prev) => ({ ...prev, [info.id]: e.target.value }))
                      }
                      placeholder={info.keyPlaceholder}
                      className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-dense text-text focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={busy || !(keyDrafts[info.id] ?? "").trim()}
                      onClick={() => void saveKey(info.id)}
                      className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-dense font-medium text-accent-text hover:brightness-110 disabled:opacity-40"
                    >
                      Save
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        title="Employees"
        description="A limit of $0 or an unconfigured employee blocks every request — set one before they need it."
      >
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-dense">
            <thead>
              <tr className="border-b border-border-subtle text-left text-text-faint">
                <th className="pb-2 font-normal">Name</th>
                <th className="pb-2 font-normal">Role</th>
                <th className="pb-2 font-normal">This period</th>
                <th className="pb-2 font-normal">Limit</th>
                <th className="pb-2 font-normal">Period (days)</th>
                <th className="pb-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const draft = limitDrafts[e.userId] ?? { limit: "", period: "" };
                const busy = busyUserId === e.userId;
                return (
                  <tr key={e.userId} className="border-b border-border-subtle/60">
                    <td className="py-2">
                      <div className="text-text">{e.name}</div>
                      <div className="text-micro text-text-faint">{e.email}</div>
                    </td>
                    <td className="py-2 text-text-secondary">{e.role}</td>
                    <td className="py-2 text-text-secondary">
                      {formatCents(e.spentCentsThisPeriod)}
                      {e.limitCents !== null && ` / ${formatCents(e.limitCents)}`}
                    </td>
                    <td className="py-2">
                      <input
                        value={draft.limit}
                        onChange={(ev) =>
                          setLimitDrafts((prev) => ({
                            ...prev,
                            [e.userId]: { ...draft, limit: ev.target.value },
                          }))
                        }
                        placeholder={e.limitCents === null ? "unlimited" : (e.limitCents / 100).toFixed(2)}
                        className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-dense text-text focus:border-accent focus:outline-none"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        value={draft.period}
                        onChange={(ev) =>
                          setLimitDrafts((prev) => ({
                            ...prev,
                            [e.userId]: { ...draft, period: ev.target.value },
                          }))
                        }
                        placeholder={String(e.periodDays)}
                        className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-dense text-text focus:border-accent focus:outline-none"
                      />
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveLimit(e)}
                        className="rounded-md border border-border px-2.5 py-1 text-dense text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </PageShell>
  );
}
