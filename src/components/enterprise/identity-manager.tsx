"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  Copy,
  Check,
} from "lucide-react";
import { authHeader } from "@/lib/supabase";
import {
  DESIGN_GROUPS,
  GROUPS,
  TITLES,
  groupLabels,
  titleLabels,
  type Organization,
} from "@/lib/enterprise/identity/contracts";
import styles from "./identity-manager.module.css";
type Member = {
  banned: boolean;
  account_version: number;
  email: string;
  name: string;
  subject_id: string | null;
  organization: Organization | null;
  organization_version: number | null;
  roles: string[] | null;
  enabled: boolean | null;
  grant_version: number | null;
};
type Directory = {
  members: Member[];
  canManageProtected: boolean;
  sync?: {
    product_id: string;
    last_success_at: string;
    applied_members: number;
    last_error: string | null;
  }[];
};
async function call<T>(url: string, body?: unknown, signal?: AbortSignal) {
  const r = await fetch(url, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: {
      ...(await authHeader()),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error || "操作未完成");
  return j as T;
}
const initial: Organization = {
  title: "designer",
  homeGroup: "ui",
  managedGroups: [],
  reviewGroups: [],
  canTakeDesignTasks: true,
  grade: 1,
  skills: [],
  dailyCapacity: 6,
};
const suggested = (o: Organization) => [
  ...(o.title === "administrator" || o.title === "system_admin"
    ? ["admin"]
    : []),
  ...(o.title === "operations" ? ["operations"] : []),
  ...(o.title === "design_director" ? ["director", "design_admin"] : []),
  ...(o.title === "design_supervisor" ? ["design_admin"] : []),
  ...(o.title === "designer" || o.canTakeDesignTasks ? ["designer"] : []),
  ...(o.reviewGroups.length ? ["reviewer"] : []),
];
export function IdentityManager({ enterpriseId }: { enterpriseId: string }) {
  const [directory, setDirectory] = useState<Directory | null>(null),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Member | "new" | null>(null),
    [draft, setDraft] = useState<Organization>(initial),
    [name, setName] = useState(""),
    [reason, setReason] = useState(""),
    [invite, setInvite] = useState(""),
    [copied, setCopied] = useState(false),
    [access, setAccess] = useState(true);
  const generation = useRef(0),
    pending = useRef<{ key: string; id: string } | null>(null),
    abort = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const n = ++generation.current;
    const c = new AbortController();
    abort.current?.abort();
    abort.current = c;
    setLoading(true);
    try {
      const d = await call<Directory>(
        "/api/enterprise/identity?enterpriseId=" +
          encodeURIComponent(enterpriseId),
        undefined,
        c.signal,
      );
      if (n === generation.current) {
        setDirectory(d);
        setEditing((e) =>
          e && e !== "new"
            ? (d.members.find((m) => m.email === e.email) ?? null)
            : e,
        );
        setError("");
      }
    } catch (e) {
      if (!c.signal.aborted && n === generation.current)
        setError((e as Error).message);
    } finally {
      if (n === generation.current) setLoading(false);
    }
  }, [enterpriseId]);
  useEffect(() => {
    setDirectory(null);
    setEditing(null);
    void load();
    return () => {
      generation.current++;
      abort.current?.abort();
    };
  }, [load]);
  function open(member: Member | "new") {
    pending.current = null;
    setEditing(member);
    setDraft(
      member === "new"
        ? { ...initial, skills: ["UI设计"] }
        : (member.organization ?? {
            ...initial,
            homeGroup: "operations",
            title: "operations",
            canTakeDesignTasks: false,
          }),
    );
    setName(member === "new" ? "" : member.name);
    setAccess(member === "new" ? true : (member.enabled ?? false));
    setReason("");
    setError("");
  }
  async function submit(url: string, body: Record<string, unknown>) {
    const key = JSON.stringify(body);
    if (pending.current?.key !== key)
      pending.current = { key, id: crypto.randomUUID() };
    return call<{ inviteUrl?: string }>(url, {
      ...body,
      id: pending.current.id,
    });
  }
  async function save() {
    if (!editing || busy) return;
    setBusy(true);
    setError("");
    try {
      const common = { enterpriseId, reason };
      if (editing === "new") {
        const r = await submit("/api/enterprise/identity/accounts", {
          ...common,
          action: "create",
          username: name.trim(),
          name: name.trim(),
          organization: draft,
          roles: suggested(draft),
        });
        if (r.inviteUrl) setInvite(r.inviteUrl);
      } else {
        await submit("/api/enterprise/identity", {
          ...common,
          action: "organization",
          email: editing.email,
          expectedVersion: editing.organization_version ?? 0,
          organization: draft,
          productConfiguration: {
            expectedVersion: editing.grant_version ?? 0,
            enabled: access,
            roles: access ? suggested(draft) : [],
          },
        });
      }
      pending.current = null;
      setEditing(null);
      await load();
    } catch (e) {
      await load();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function inviteAgain(member: Member) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await submit("/api/enterprise/identity/accounts", {
        action: "invite",
        enterpriseId,
        email: member.email,
        reason: "管理员重新发送一次性账号邀请",
      });
      if (r.inviteUrl) setInvite(r.inviteUrl);
      pending.current = null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus(member: Member) {
    if (busy) return;
    const reason = window.prompt(member.banned ? "启用原因" : "停用原因");
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    try {
      await submit("/api/enterprise/identity/accounts", {
        action: "status",
        enterpriseId,
        email: member.email,
        expectedUserVersion: member.account_version,
        enabled: member.banned,
        reason,
      });
      pending.current = null;
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible =
    directory?.members.filter((m) =>
      [
        m.name,
        m.email,
        m.organization ? groupLabels[m.organization.homeGroup] : "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
    ) ?? [];
  function toggle(
    field: "managedGroups" | "reviewGroups",
    value: (typeof DESIGN_GROUPS)[number],
  ) {
    setDraft((d) => ({
      ...d,
      [field]: d[field].includes(value)
        ? d[field].filter((v) => v !== value)
        : [...d[field], value],
    }));
  }
  const manager = ["design_director", "design_supervisor"].includes(
    draft.title,
  );
  return (
    <section className={styles.panel}>
      <header className={styles.toolbar}>
        <div className={styles.search}>
          <Search size={17} />
          <input
            aria-label="搜索人员"
            placeholder="搜索人员"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          onClick={() => void load()}
          disabled={busy || loading}
          aria-label="刷新人员"
        >
          <RefreshCw size={17} />
        </button>
        <button
          className={styles.primary}
          onClick={() => open("new")}
          disabled={busy || !directory}
        >
          <Plus size={17} />
          新增成员
        </button>
      </header>
      {directory?.sync?.length ? (
        <div className={styles.sync}>
          {directory.sync.map((s) => (
            <span
              key={s.product_id}
              className={s.last_error ? styles.warning : ""}
            >
              {s.product_id === "design-ops" ? "设计协作" : s.product_id} ·{" "}
              {s.last_error ? "待同步" : `${s.applied_members} 人已同步`} ·{" "}
              {new Date(s.last_success_at).toLocaleString("zh-CN")}
            </span>
          ))}
        </div>
      ) : null}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      <div className={styles.table}>
        <table>
          <thead>
            <tr>
              <th>成员</th>
              <th>职务</th>
              <th>所属组</th>
              <th>管理范围</th>
              <th>设计协作</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((m) => (
              <tr key={m.email}>
                <td>
                  <strong>{m.name}</strong>
                  {m.banned && (
                    <span className={styles.disabled}> · 已停用</span>
                  )}
                </td>
                <td>
                  {m.organization
                    ? titleLabels[m.organization.title]
                    : "待配置"}
                </td>
                <td>
                  {m.organization ? groupLabels[m.organization.homeGroup] : "—"}
                </td>
                <td>
                  {m.organization?.managedGroups
                    .map((g) => groupLabels[g])
                    .join("、") || "—"}
                </td>
                <td>
                  <span
                    className={m.enabled ? styles.enabled : styles.disabled}
                  >
                    {m.enabled ? "已授权" : "未授权"}
                  </span>
                </td>
                <td className={styles.actions}>
                  <button disabled={busy} onClick={() => open(m)}>
                    配置
                  </button>
                  {!["system_admin", "administrator"].includes(
                    m.organization?.title || "",
                  ) && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => void inviteAgain(m)}
                      >
                        邀请
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void changeStatus(m)}
                      >
                        {m.banned ? "启用" : "停用"}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !visible.length && (
          <div className={styles.empty}>暂无成员</div>
        )}
        {loading && <div className={styles.empty}>加载中…</div>}
      </div>
      {editing && (
        <div
          className={styles.overlay}
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setEditing(null);
          }}
        >
          <form
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="identity-editor-title"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <header>
              <h2 id="identity-editor-title">
                {editing === "new" ? "新增成员" : name}
              </h2>
              <button
                type="button"
                disabled={busy}
                aria-label="关闭"
                onClick={() => setEditing(null)}
              >
                <X size={20} />
              </button>
            </header>
            <div className={styles.fields}>
              {editing === "new" && (
                <label>
                  花名
                  <input
                    required
                    minLength={2}
                    maxLength={40}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="off"
                  />
                </label>
              )}
              <label>
                职务
                <select
                  value={draft.title}
                  onChange={(e) => {
                    const title = e.target.value as Organization["title"];
                    setDraft((d) => ({
                      ...d,
                      title,
                      managedGroups: [
                        "design_director",
                        "design_supervisor",
                      ].includes(title)
                        ? [...DESIGN_GROUPS]
                        : [],
                      reviewGroups: [],
                      canTakeDesignTasks: title === "designer",
                      homeGroup:
                        title === "operations"
                          ? "operations"
                          : title === "designer"
                            ? "ui"
                            : "management",
                    }));
                  }}
                >
                  {TITLES.filter(
                    (t) =>
                      (editing !== "new" || t !== "system_admin") &&
                      (directory?.canManageProtected ||
                        ![
                          "system_admin",
                          "administrator",
                          "design_director",
                        ].includes(t)),
                  ).map((t) => (
                    <option key={t} value={t}>
                      {titleLabels[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                所属组
                <select
                  value={draft.homeGroup}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      homeGroup: e.target.value as Organization["homeGroup"],
                    }))
                  }
                >
                  {GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {groupLabels[g]}
                    </option>
                  ))}
                </select>
              </label>
              {manager && (
                <>
                  <fieldset>
                    <legend>调度范围</legend>
                    {DESIGN_GROUPS.map((g) => (
                      <label key={g} className={styles.check}>
                        <input
                          type="checkbox"
                          checked={draft.managedGroups.includes(g)}
                          onChange={() => toggle("managedGroups", g)}
                        />
                        {groupLabels[g]}
                      </label>
                    ))}
                  </fieldset>
                  <fieldset>
                    <legend>专业审核范围</legend>
                    {DESIGN_GROUPS.map((g) => (
                      <label key={g} className={styles.check}>
                        <input
                          type="checkbox"
                          checked={draft.reviewGroups.includes(g)}
                          onChange={() => toggle("reviewGroups", g)}
                        />
                        {groupLabels[g]}
                      </label>
                    ))}
                  </fieldset>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={draft.canTakeDesignTasks}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          canTakeDesignTasks: e.target.checked,
                        }))
                      }
                    />
                    参与设计接单
                  </label>
                </>
              )}
              <div className={styles.columns}>
                <label>
                  职级
                  <input
                    type="number"
                    min={1}
                    max={10}
                    required
                    value={draft.grade}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, grade: Number(e.target.value) }))
                    }
                  />
                </label>
                <label>
                  每日工时
                  <input
                    type="number"
                    min={0.25}
                    max={12}
                    step={0.25}
                    required
                    value={draft.dailyCapacity}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        dailyCapacity: Number(e.target.value),
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                技能
                <input
                  value={draft.skills.join("、")}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      skills: [
                        ...new Set(
                          e.target.value
                            .split(/[、,，]/)
                            .map((s) => s.trim())
                            .filter(Boolean),
                        ),
                      ],
                    }))
                  }
                />
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  disabled={editing === "new"}
                  checked={access}
                  onChange={(e) => setAccess(e.target.checked)}
                />
                允许使用设计协作
              </label>
              <label>
                变更原因
                <textarea
                  required
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}
            </div>
            <footer>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                取消
              </button>
              <button
                className={styles.primary}
                disabled={busy || reason.trim().length < 3}
                type="submit"
              >
                <ShieldCheck size={17} />
                {busy ? "保存中…" : "保存配置"}
              </button>
            </footer>
          </form>
        </div>
      )}
      {invite && (
        <div className={styles.overlay}>
          <section
            className={styles.invite}
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
          >
            <header>
              <h2 id="invite-title">账号邀请</h2>
              <button
                onClick={() => {
                  setInvite("");
                  setCopied(false);
                }}
                aria-label="关闭"
              >
                <X size={20} />
              </button>
            </header>
            <input aria-label="一次性邀请链接" readOnly value={invite} />
            <button
              className={styles.primary}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(invite);
                  setCopied(true);
                } catch {
                  setError("请选中链接后复制");
                }
              }}
            >
              {copied ? <Check size={17} /> : <Copy size={17} />}{" "}
              {copied ? "已复制" : "复制邀请链接"}
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
