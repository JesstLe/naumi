"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { authHeader } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// 业务系统聚合页:项目卡片墙 + 增删改查。
// run_type 区分三种形态:web=常驻网页服务 / script=本地脚本(按需跑) / external=外部链接。
// ---------------------------------------------------------------------------

type Project = {
  slug: string;
  name: string;
  description: string;
  url: string;
  color: string;
  category: string;
  agent_tool: boolean;
  run_type: "web" | "script" | "external";
  visible: boolean;
};

const RUN_TYPE_LABEL: Record<string, string> = {
  web: "网页服务",
  script: "本地脚本",
  external: "外部链接",
};

const EMPTY_FORM = {
  slug: "",
  name: "",
  description: "",
  url: "",
  color: "#4F46E5",
  category: "业务系统",
  agent_tool: false,
  run_type: "web" as Project["run_type"],
  visible: true,
};

export function HubClient() {
  const { user, ready } = useAuth();
  const { openAuth } = useAuthModal();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null); // null=列表, slug=编辑
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/hub/projects?all=1")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startCreate() {
    if (!user) {
      openAuth("sign-in");
      return;
    }
    setForm(EMPTY_FORM);
    setEditing("__new__");
  }

  function startEdit(p: Project) {
    setForm({
      slug: p.slug,
      name: p.name,
      description: p.description,
      url: p.url,
      color: p.color,
      category: p.category,
      agent_tool: p.agent_tool,
      run_type: p.run_type,
      visible: p.visible,
    });
    setEditing(p.slug);
  }

  async function save() {
    setError(null);
    if (!form.name.trim() || !form.slug.trim()) {
      setError("名称与 slug 必填");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/hub/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(
          editing === "__new__"
            ? form
            : { ...form, slug: editing }
        ),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || "保存失败");
      setEditing(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(slug: string) {
    if (!confirm(`确认删除「${slug}」?`)) return;
    await fetch(`/api/hub/projects?slug=${encodeURIComponent(slug)}`, {
      method: "DELETE",
      headers: await authHeader(),
    }).catch(() => {});
    load();
  }

  const categories = Array.from(new Set(projects.map((p) => p.category)));

  return (
    <div className="w-full px-5 py-6 sm:px-6 lg:px-8">
      {/* 面包屑 */}
      <div className="mb-4 flex items-center justify-between">
        <nav className="flex items-center gap-1.5 text-[13px]">
          <Link href="/" className="text-c-text3 transition-colors hover:text-c-text">
            首页
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-c-text4" />
          <span className="font-semibold text-c-text">业务系统</span>
        </nav>
        {user && (
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold text-white shadow-btn [background:var(--grad-acc)] transition-all hover:brightness-95"
          >
            <Plus className="h-4 w-4" />
            新增项目
          </button>
        )}
      </div>

      {/* 编辑表单(弹出卡) */}
      {editing && (
        <div className="mb-6 rounded-card border border-c-border bg-c-card p-5 shadow-card">
          <h2 className="mb-4 text-[15px] font-bold text-c-text">
            {editing === "__new__" ? "新增项目" : `编辑:${form.name || editing}`}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">名称 *</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-[10px] border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                placeholder="例:生意参谋助手"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">slug(唯一标识)</span>
              <input
                value={form.slug}
                onChange={(e) =>
                  setForm({
                    ...form,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                  })
                }
                disabled={editing !== "__new__"}
                className="w-full rounded-[10px] border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                placeholder="sycm"
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="font-medium">描述</span>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-[10px] border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                placeholder="一句话说明用途"
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="font-medium">URL</span>
              <input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                className="w-full rounded-[10px] border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                placeholder="http://localhost:3001 或 https://..."
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">运行形态</span>
              <select
                value={form.run_type}
                onChange={(e) =>
                  setForm({ ...form, run_type: e.target.value as Project["run_type"] })
                }
                className="w-full rounded-[10px] border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="web">网页服务(常驻)</option>
                <option value="script">本地脚本(按需)</option>
                <option value="external">外部链接</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">分类</span>
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-[10px] border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                placeholder="运营 / 美工 / 营销 / 管理"
              />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.agent_tool}
                onChange={(e) => setForm({ ...form, agent_tool: e.target.checked })}
                className="h-4 w-4 accent-[#4F46E5]"
              />
              <span className="font-medium">可被 Agent 调度</span>
            </label>
          </div>
          {error && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13.5px] font-semibold text-white shadow-btn [background:var(--grad-acc)] transition-all hover:brightness-95 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              保存
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-xl border border-border px-4 py-2 text-[13.5px] font-medium text-c-text transition-colors hover:bg-secondary"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 卡片墙(按分类分组) */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
        </div>
      ) : projects.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">
          还没有注册项目。点右上角「新增项目」开始。
        </div>
      ) : (
        categories.map((cat) => (
          <div key={cat} className="mb-8">
            <p className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-c-text3">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {cat}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects
                .filter((p) => p.category === cat)
                .map((p) => (
                  <div
                    key={p.slug}
                    className="group rounded-2xl border border-c-border bg-c-card p-4 shadow-card transition-all hover:-translate-y-0.5"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-10 w-10 flex-none items-center justify-center rounded-xl text-[15px] font-bold text-white"
                        style={{ background: p.color }}
                      >
                        {p.name.slice(0, 1)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-[14.5px] font-bold text-c-text">
                          {p.name}
                          {!p.visible && (
                            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              隐藏
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-[12px] text-c-text3">
                          {p.description || "—"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] text-c-text3">
                        <span className="rounded-md bg-secondary px-1.5 py-0.5">
                          {RUN_TYPE_LABEL[p.run_type] || p.run_type}
                        </span>
                        {p.agent_tool && (
                          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                            Agent 可调度
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                        {p.url && (
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11.5px] font-medium text-c-text transition-colors hover:bg-secondary"
                          >
                            <ExternalLink className="h-3 w-3" />
                            打开
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                          aria-label="编辑"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(p.slug)}
                          className="rounded-lg border border-red-500/30 p-1.5 text-red-500 transition-colors hover:bg-red-500/10"
                          aria-label="删除"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
