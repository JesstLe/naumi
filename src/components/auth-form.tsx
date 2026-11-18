"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  Mail,
  Lock,
  User,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth, type SessionUser } from "@/lib/auth-context";
import { supabaseEnabled } from "@/lib/auth-mode";
import { BRAND } from "@/lib/brand";
import { useSiteProfile } from '@/lib/site-control/client';
import { OPERATOR_EMAIL } from "@/lib/operator";

function PageShell({
  compact,
  children,
}: {
  compact: boolean;
  children: React.ReactNode;
}) {
  if (compact) return <div className="w-full space-y-6">{children}</div>;
  return (
    <div className="relative bg-aurora">
      <div className="absolute inset-0 -z-10 bg-dots opacity-50" />
      <div className="container flex min-h-[calc(100vh-4rem)] items-center justify-center py-16">
        <div className="w-full max-w-sm space-y-8">{children}</div>
      </div>
    </div>
  );
}

/* ── premium-auth 风格基础件 ──────────────────────────────────────────── */

// 带左侧图标的圆角输入框;可选右侧尾部元件(如密码可见切换)。
function IconField({
  icon: Icon,
  tail,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ComponentType<{ className?: string }>;
  tail?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Icon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
      <input
        {...props}
        className={`h-12 w-full rounded-xl border border-border bg-secondary/40 pl-11 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/50 focus:bg-card${
          tail ? " pr-12" : ""
        }`}
      />
      {tail && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">{tail}</div>
      )}
    </div>
  );
}

// 密码可见切换小按钮。
function EyeToggle({
  show,
  onToggle,
}: {
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onToggle}
      aria-label={show ? "隐藏密码" : "显示密码"}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
    >
      {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
    </button>
  );
}

// 黑色主按钮(premium-auth 风格)。
function DarkSubmit({
  loading,
  children,
}: {
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#16181D] text-[15px] font-semibold text-white transition hover:bg-[#16181D]/85 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

// 登录/注册 分段式切换(premium-auth 的 Login | Sign Up 胶囊)。
function ModeTabs({
  isSignUp,
  onSwitch,
}: {
  isSignUp: boolean;
  onSwitch: (m: "sign-in" | "sign-up") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-secondary/60 p-1">
      <button
        type="button"
        onClick={() => onSwitch("sign-in")}
        className={`h-10 rounded-xl text-[14px] font-medium transition-all ${
          !isSignUp
            ? "bg-card font-semibold text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        登录
      </button>
      <button
        type="button"
        onClick={() => onSwitch("sign-up")}
        className={`h-10 rounded-xl text-[14px] font-medium transition-all ${
          isSignUp
            ? "bg-card font-semibold text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        注册
      </button>
    </div>
  );
}

// Built-in mock auth — used only when Supabase Auth is not configured.
export function AuthForm({
  mode,
  compact = false,
  noRedirect = false,
  onSwitchMode,
}: {
  mode: "sign-in" | "sign-up";
  compact?: boolean;
  noRedirect?: boolean;
  onSwitchMode?: (m: "sign-in" | "sign-up") => void;
}) {
  const site=useSiteProfile(),dedicated=site.mode==='enterprise';
  const router = useRouter();
  const params = useSearchParams();
  const { signIn, signUp, multiUser, applyServerUser } = useAuth();

  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  // 密码可见切换
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  // 注册:同意条款
  const [agree, setAgree] = useState(false);

  // 一个密码同时登录用户 + 后台;没设(极老实例)回退旧的邮箱登录不锁死。
  const [localAvailable, setLocalAvailable] = useState<boolean | null>(null);
  // 忘记密码(仅多用户模式)
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotErr, setForgotErr] = useState<string | null>(null);
  // 三种模式(mock 渲染下):

  //  · pwMode = 单用户自托管(无 Supabase + 已设管理员密码)—— 一个密码进用户+后台。
  //  · legacy = 其它(旧 mock 邮箱登录)。
  const multiMode = multiUser;
  const isSignUp = !dedicated && mode === "sign-up";
  const pwMode = !dedicated && !multiUser && !supabaseEnabled && localAvailable === true;
  // 原生多用户注册:是否需要邮箱验证码(站长配了 SMTP 即需要,与官方站一致)
  const [emailCodeRequired, setEmailCodeRequired] = useState(false);
  const [code, setCode] = useState("");
  const [password2, setPassword2] = useState("");
  const [codeCountdown, setCodeCountdown] = useState(0);
  const [codeSending, setCodeSending] = useState(false);

  // tab 切换:弹窗里走 onSwitchMode(不换路由),整页里带参跳转。
  function switchMode(m: "sign-in" | "sign-up") {
    if (onSwitchMode) onSwitchMode(m);
    else router.push(`/${m === "sign-in" ? "sign-in" : "sign-up"}${switchQuery}`);
  }

  useEffect(() => {
    if(dedicated){setLocalAvailable(false);return;}
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/login");
        const d = (await r.json()) as { localAvailable?: boolean };
        if (!cancelled) setLocalAvailable(!!d.localAvailable);
      } catch {
        if (!cancelled) setLocalAvailable(false);
      }
      try {
        const r = await fetch("/api/config");
        const d = (await r.json()) as { emailCode?: boolean };
        if (!cancelled) setEmailCodeRequired(!!d.emailCode);
      } catch {
        /* 拿不到就当不需要验证码(服务端仍会强校验) */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 验证码倒计时
  useEffect(() => {
    if (codeCountdown <= 0) return;
    const t = setTimeout(() => setCodeCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [codeCountdown]);

  async function sendRegisterCode() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("请先填写正确的邮箱");
      return;
    }
    setCodeSending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const d = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !d?.ok) {
        setError(d?.error || "验证码发送失败,请重试");
        return;
      }
      setCodeCountdown(60);
    } catch {
      setError("网络错误,请重试");
    } finally {
      setCodeSending(false);
    }
  }

  const redirect = params?.get("redirect");
  const plan = params?.get("plan");
  const nextUrl =
    redirect ?? (plan ? `/checkout?plan=${plan}` : "/dashboard");
  const carry = new URLSearchParams();
  if (redirect) carry.set("redirect", redirect);
  if (plan) carry.set("plan", plan);
  const switchQuery = carry.toString() ? `?${carry.toString()}` : "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (multiMode) {
      // 注册:确认密码 + 条款 + (需要时)邮箱验证码
      if (isSignUp) {
        if (password !== password2) {
          setError("两次输入的密码不一致");
          setLoading(false);
          return;
        }
        if (!agree) {
          setError("请先阅读并同意服务条款与隐私政策");
          setLoading(false);
          return;
        }
        if (emailCodeRequired && !/^\d{6}$/.test(code.trim())) {
          setError("请填写 6 位邮箱验证码");
          setLoading(false);
          return;
        }
      }
      try {
        const endpoint = isSignUp ? "/api/auth/register" : "/api/auth/login";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isSignUp
              ? { email, password, name, code: code.trim() }
              : { email, password }
          ),
        });
        const d = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          user?: SessionUser;
        } | null;
        if (!res.ok || !d?.ok || !d.user) {
          setError(d?.error || (isSignUp ? "注册失败" : "登录失败"));
          setLoading(false);
          return;
        }
        applyServerUser(d.user, true);
        setTimeout(() => {
          if (!noRedirect) router.push(nextUrl);
        }, 400);
      } catch {
        setError("网络错误,请重试");
        setLoading(false);
      }
      return;
    }

    //(/admin 也随之解锁)+ 建立本地用户会话,一个密码登录所有地方。
    if (pwMode) {
      try {
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const d = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (!res.ok || !d?.ok) {
          setError(d?.error || "密码错误");
          setLoading(false);
          return;
        }
        signIn(OPERATOR_EMAIL);
        setTimeout(() => {
          if (!noRedirect) router.push(nextUrl);
        }, 500);
      } catch {
        setError("网络错误,请重试");
        setLoading(false);
      }
      return;
    }

    if (isSignUp) signUp(name, email);
    else signIn(email);
    setTimeout(() => {
      if (!noRedirect) router.push(nextUrl);
    }, 700);
  }

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    setForgotErr(null);
    setForgotBusy(true);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setForgotErr(d?.error || "发送失败");
        setForgotBusy(false);
        return;
      }
      setForgotSent(true);
      setForgotBusy(false);
    } catch {
      setForgotErr("网络错误,请重试");
      setForgotBusy(false);
    }
  }

  // 标题/副标题(premium-auth 的 Welcome Back / Create Account 层级)。
  const title = isSignUp ? "创建账号" : "欢迎回来";
  const subtitle = dedicated ? site.policy.brand : isSignUp
    ? `注册你的 ${BRAND} 账号,注册即送积分`
    : pwMode
      ? "输入管理员密码登录"
      : "登录以继续生成你的商业视觉";

  // 忘记密码子视图(仅多用户模式)。
  if (multiMode && forgotMode) {
    return (
      <PageShell compact={compact}>
        <div className="flex flex-col items-center gap-4 text-center">
          {!compact && <Logo />}
          <div>
            <h1 className="text-[26px] font-bold tracking-tight">找回密码</h1>
            <p className="mt-1.5 text-[15px] text-muted-foreground">
              输入注册邮箱,我们会发送重置链接。
            </p>
          </div>
        </div>
        {forgotSent ? (
          <div className="rounded-2xl border border-border bg-secondary/40 p-6 text-center text-sm text-muted-foreground">
            若该邮箱已注册,重置链接已发送,请查收邮箱(含垃圾箱)。链接 30 分钟内有效。
          </div>
        ) : (
          <form onSubmit={submitForgot} className="space-y-4">
            <IconField
              icon={Mail}
              type="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            {forgotErr && (
              <p className="text-[13px] font-medium text-c-danger">{forgotErr}</p>
            )}
            <button
              type="submit"
              disabled={forgotBusy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#16181D] text-[15px] font-semibold text-white transition hover:bg-[#16181D]/85 disabled:opacity-60"
            >
              {forgotBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              发送重置邮件
            </button>
          </form>
        )}
        <p className="text-center text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => {
              setForgotMode(false);
              setForgotSent(false);
              setForgotErr(null);
            }}
            className="font-medium text-primary hover:underline"
          >
            返回登录
          </button>
        </p>
      </PageShell>
    );
  }

  // 是否显示 登录/注册 分段 tab(可切换注册的场景)。
  const showTabs = multiMode && !dedicated;
  // 需要昵称的旧注册路径(非多用户)。
  const legacyNameField = isSignUp && !multiMode;

  return (
    <PageShell compact={compact}>
      <div className="flex flex-col items-center gap-4 text-center">
        {!compact && <Logo />}
        <div>
          <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {showTabs && <ModeTabs isSignUp={isSignUp} onSwitch={switchMode} />}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {legacyNameField && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">昵称</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="你的称呼"
              required
            />
          </div>
        )}
        {/* 多用户注册:姓名(可选,注册接口原生支持;默认用邮箱前缀) */}
        {multiMode && isSignUp && (
          <IconField
            icon={User}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="姓名(可选)"
            maxLength={40}
            autoComplete="name"
          />
        )}
        {/* 单用户:只要密码;多用户:邮箱 + 密码 */}
        {!pwMode && (
          <IconField
            icon={multiMode && !isSignUp ? User : Mail}
            type={multiMode && !isSignUp ? "text" : "email"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={multiMode && !isSignUp ? "用户名或邮箱" : "you@example.com"}
            autoComplete={multiMode && !isSignUp ? "username" : "email"}
            required
          />
        )}
        <IconField
          icon={Lock}
          type={showPw ? "text" : "password"}
          value={pwMode || multiMode ? password : undefined}
          onChange={
            pwMode || multiMode
              ? (e) => setPassword(e.target.value)
              : undefined
          }
          placeholder="密码"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          minLength={pwMode || multiMode ? 6 : undefined}
          required
          tail={
            pwMode || multiMode ? (
              <EyeToggle show={showPw} onToggle={() => setShowPw((v) => !v)} />
            ) : undefined
          }
        />

        {/* 多用户注册:确认密码 */}
        {multiMode && isSignUp && (
          <IconField
            icon={ShieldCheck}
            type={showPw2 ? "text" : "password"}
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            placeholder="确认密码"
            autoComplete="new-password"
            minLength={6}
            required
            tail={
              <EyeToggle show={showPw2} onToggle={() => setShowPw2((v) => !v)} />
            }
          />
        )}

        {/* 多用户注册:邮箱验证码(站长配了 SMTP 即需要) */}
        {multiMode && isSignUp && emailCodeRequired && (
          <div className="flex gap-2">
            <IconField
              icon={ShieldCheck}
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
              }
              inputMode="numeric"
              placeholder="6 位验证码"
              className="flex-1"
              required
            />
            <Button
              type="button"
              variant="outline"
              className="h-12 shrink-0 rounded-xl"
              disabled={codeSending || codeCountdown > 0}
              onClick={() => void sendRegisterCode()}
            >
              {codeSending && <Loader2 className="h-4 w-4 animate-spin" />}
              {codeCountdown > 0 ? `${codeCountdown}s` : "发送验证码"}
            </Button>
          </div>
        )}

        {/* 登录:忘记密码(右侧对齐,premium-auth 布局) */}
        {multiMode && !isSignUp && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setForgotMode(true);
                setForgotEmail(email);
              }}
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              忘记密码?
            </button>
          </div>
        )}

        {/* 注册:同意条款 */}
        {multiMode && isSignUp && (
          <label className="flex cursor-pointer items-start gap-2 text-[13px] text-muted-foreground">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#16181D]"
            />
            <span>
              我已阅读并同意
              <Link href="/terms" target="_blank" className="mx-0.5 text-foreground underline underline-offset-2">
                服务条款
              </Link>
              和
              <Link href="/privacy" target="_blank" className="mx-0.5 text-foreground underline underline-offset-2">
                隐私政策
              </Link>
            </span>
          </label>
        )}

        {error && (
          <p className="text-[13px] font-medium text-c-danger">{error}</p>
        )}

        <DarkSubmit loading={loading}>
          {isSignUp ? "创建账号" : "登录"}
        </DarkSubmit>
      </form>

      {pwMode ? (

        <p className="text-center text-sm text-muted-foreground">
          用安装向导里设置的管理员密码登录。到后台「登录与支付」开启多用户后,用户可用邮箱注册和登录。
        </p>
      ) : (
        !dedicated && !showTabs && (
          <p className="text-center text-sm text-muted-foreground">
            {isSignUp ? "已有账号？" : "还没有账号？"}{" "}
            {onSwitchMode ? (
              <button
                type="button"
                onClick={() => onSwitchMode(isSignUp ? "sign-in" : "sign-up")}
                className="font-medium text-primary hover:underline"
              >
                {isSignUp ? "去登录" : "注册账号"}
              </button>
            ) : (
              <Link
                href={`${isSignUp ? "/sign-in" : "/sign-up"}${switchQuery}`}
                className="font-medium text-primary hover:underline"
              >
                {isSignUp ? "去登录" : "注册账号"}
              </Link>
            )}
          </p>
        )
      )}
    </PageShell>
  );
}
