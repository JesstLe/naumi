"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { copyText } from "@/lib/clipboard";

type Token = {
  id: string; name: string; prefix: string; scopes: string[]; dailyCreditLimit: number | null;
  expiresAt: string | null; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; spentToday: number;
};
type Expiry = "30" | "90" | "365" | "never";

const card = "rounded-card border border-c-border bg-c-card p-5 shadow-card";
const label = "text-[13px] font-medium text-c-text";
const hint = "text-[11.5px] text-c-text3";

function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }) : "";
}
function expired(token: Token) {
  return !!token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now();
}
async function failure(res: Response) {
  try { const body = await res.json(); return body?.error?.message || `请求失败（${res.status}）`; } catch { return `请求失败（${res.status}）`; }
}

function CommandLine({ text }: { text: string }) {
  const { toast } = useToast();
  return (
    <div className="flex items-center gap-2 rounded-field border border-c-border bg-c-subtle px-3 py-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12px] text-c-text">{text}</code>
      <button type="button" aria-label="复制" className="flex-none text-c-text3 hover:text-c-text" onClick={async () => { const ok = await copyText(text); toast(ok ? "已复制" : "复制失败，请手动选择", ok ? "success" : "error"); }}>
        <Copy className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AgentAccessClient() {
  const { user, ready } = useAuth();
  const { openAuth } = useAuthModal();
  const { toast } = useToast();
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("我的 Agent");
  const [write, setWrite] = useState(true);
  const [limit, setLimit] = useState("100");
  const [expiry, setExpiry] = useState<Expiry>("90");
  const [fresh, setFresh] = useState<{ name: string; secret: string } | null>(null);
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/account/agent-tokens", { cache: "no-store" });
    if (!res.ok) { setError(await failure(res)); setTokens([]); return; }
    setError("");
    setTokens((await res.json()).tokens);
  }, []);

  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => { if (ready && user) void load(); }, [ready, user, load]);

  async function create() {
    const trimmed = limit.trim();
    if (trimmed && !/^\d+$/.test(trimmed)) { toast("每日积分上限需为整数，留空表示不限", "error"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/account/agent-tokens", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scopes: write ? ["read", "write"] : ["read"], dailyCreditLimit: trimmed ? Number(trimmed) : null, expiresInDays: expiry === "never" ? null : Number(expiry) }),
      });
      if (!res.ok) { toast(await failure(res), "error"); return; }
      const body = await res.json();
      setFresh({ name: body.token.name, secret: body.secret });
      await load();
    } finally { setBusy(false); }
  }

  async function revoke(token: Token) {
    if (!window.confirm(`吊销「${token.name}」？使用它的 Agent 会立即无法调用。`)) return;
    const res = await fetch(`/api/account/agent-tokens?id=${encodeURIComponent(token.id)}`, { method: "DELETE" });
    if (!res.ok) { toast(await failure(res), "error"); return; }
    toast("已吊销");
    await load();
  }

  if (!ready || !user) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-16 text-center">
        <p className="text-[14px] text-c-text3">登录后管理 Agent 令牌</p>
        {ready && <Button className="mt-4" onClick={() => openAuth("sign-in")}>登录</Button>}
      </div>
    );
  }

  const site = origin || "https://你的站点";
  const secret = fresh?.secret || "<令牌>";
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-7 sm:px-6 lg:px-8">
      <Link href="/account" className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-c-text3 hover:text-c-text">
        <ArrowLeft className="h-3.5 w-3.5" />账户
      </Link>
      <h1 className="text-[22px] font-semibold text-c-text">Agent 接入</h1>
      <p className="mt-1 text-[13px] text-c-text3">用个人令牌让外部 Agent 通过命令行或 MCP 调用创作工具。</p>

      {fresh && (
        <div className={`${card} mt-6 border-acc`}>
          <p className={label}>「{fresh.name}」已创建，令牌只显示这一次</p>
          <div className="mt-3"><CommandLine text={fresh.secret} /></div>
          <p className={`${hint} mt-2`}>请立即保存到 Agent 所在机器；遗失后吊销并重新创建。</p>
        </div>
      )}

      <div className={`${card} mt-6 space-y-4`}>
        <p className="text-[15px] font-semibold text-c-text">创建令牌</p>
        <div className="space-y-1.5">
          <p className={label}>名称</p>
          <Input value={name} maxLength={60} onChange={event => setName(event.target.value)} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className={label}>允许收费任务</p>
            <p className={hint}>关闭后只能调用查询类工具</p>
          </div>
          <Switch checked={write} onChange={setWrite} />
        </div>
        <div className="space-y-1.5">
          <p className={label}>每日积分上限</p>
          <Input value={limit} inputMode="numeric" placeholder="不限" onChange={event => setLimit(event.target.value)} />
          <p className={hint}>上限内的报价自动确认，超出的任务不会提交</p>
        </div>
        <div className="space-y-1.5">
          <p className={label}>有效期</p>
          <Segmented<Expiry> value={expiry} onChange={setExpiry} options={[{ value: "30", label: "30 天" }, { value: "90", label: "90 天" }, { value: "365", label: "1 年" }, { value: "never", label: "长期" }]} />
        </div>
        <Button onClick={create} disabled={busy || !name.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}创建令牌
        </Button>
      </div>

      <div className={`${card} mt-6`}>
        <p className="text-[15px] font-semibold text-c-text">我的令牌</p>
        {error && <p className="mt-3 text-[13px] text-c-danger">{error}</p>}
        {tokens === null ? (
          <p className={`${hint} mt-3`}>加载中…</p>
        ) : tokens.length === 0 ? (
          <p className={`${hint} mt-3`}>还没有令牌</p>
        ) : (
          <ul className="mt-3 divide-y divide-c-border">
            {tokens.map(token => {
              const inactive = !!token.revokedAt || expired(token);
              return (
                <li key={token.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13.5px] font-medium ${inactive ? "text-c-text4 line-through" : "text-c-text"}`}>{token.name}</p>
                    <p className={`${hint} truncate`}>
                      {token.prefix}… · {token.scopes.includes("write") ? "可执行收费任务" : "只读"} · 今日 {token.spentToday}{token.dailyCreditLimit === null ? "" : ` / ${token.dailyCreditLimit}`} 积分
                      {token.lastUsedAt ? ` · 最近使用 ${date(token.lastUsedAt)}` : " · 未使用"}
                      {token.revokedAt ? " · 已吊销" : token.expiresAt ? ` · ${expired(token) ? "已过期" : `${date(token.expiresAt)} 到期`}` : " · 长期有效"}
                    </p>
                  </div>
                  {!inactive && (
                    <Button variant="ghost" size="sm" onClick={() => revoke(token)}>
                      <Trash2 className="h-4 w-4" />吊销
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={`${card} mt-6 space-y-3`}>
        <p className="text-[15px] font-semibold text-c-text">接入方式</p>
        <p className={hint}>命令行（Node.js 18+）</p>
        <CommandLine text={`curl -fsSL ${site}/agent/naumi.mjs -o naumi.mjs`} />
        <CommandLine text={`node naumi.mjs login --site ${site} --token ${secret}`} />
        <CommandLine text="node naumi.mjs tools" />
        <CommandLine text={'node naumi.mjs call generate_image prompt="白底商品主图" ratio=1:1 resolution=1K count=1 --out ./naumi-output'} />
        <p className={`${hint} pt-2`}>MCP（Claude Code / Codex 等，登录后添加）</p>
        <CommandLine text="claude mcp add naumi -- node /绝对路径/naumi.mjs mcp" />
        <CommandLine text={'codex mcp add naumi -- node /绝对路径/naumi.mjs mcp'} />
      </div>
    </div>
  );
}
