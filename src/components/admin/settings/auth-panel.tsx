"use client";
import {useEffect,useState} from "react";

import {Loader2,ShieldCheck,KeyRound,Users,MessageSquare} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

import {ReadyBadge} from "./ready-badge";

import type {SettingsSession} from "./use-settings-session";

export function AdminAuthSettings({section,settings}:{section:string;settings:SettingsSession}){
 const {view,token,busy,postSettings,saveEncrypted,mutation}=settings;
const [wechatAppid, setWechatAppid] = useState("");
const [wechatToken, setWechatToken] = useState("");
const [wechatEmailDomain, setWechatEmailDomain] = useState("");
const [wechatSecretInput, setWechatSecretInput] = useState("");
const [payEnabled, setPayEnabled] = useState(false);
const [multiUserOn, setMultiUserOn] = useState(false);
const [meteringOn, setMeteringOn] = useState(false);
const [smtpHost, setSmtpHost] = useState("");
const [smtpPort, setSmtpPort] = useState("465");
const [smtpUser, setSmtpUser] = useState("");
const [smtpPass, setSmtpPass] = useState("");
const [smtpFrom, setSmtpFrom] = useState("");
const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
const [ownerEmailInput, setOwnerEmailInput] = useState("");
const [ownerPwInput, setOwnerPwInput] = useState("");
const [alipayAppid, setAlipayAppid] = useState("");
const [alipayPublicKey, setAlipayPublicKey] = useState("");
const [alipayPrivateKeyInput, setAlipayPrivateKeyInput] = useState("");
const [wxpayMchid, setWxpayMchid] = useState("");
const [wxpayAppid, setWxpayAppid] = useState("");
const [wxpayCertSerial, setWxpayCertSerial] = useState("");
const [wxpayApiv3Input, setWxpayApiv3Input] = useState("");
const [wxpayCertInput, setWxpayCertInput] = useState("");
 useEffect(()=>{setWechatAppid(view.wechatAppid??"");},[view.wechatAppid]);
 useEffect(()=>{setWechatToken(view.wechatToken??"");},[view.wechatToken]);
 useEffect(()=>{setWechatEmailDomain(view.wechatEmailDomain??"");},[view.wechatEmailDomain]);
 useEffect(()=>{setPayEnabled(!!view.payEnabled);},[view.payEnabled]);
 useEffect(()=>{setMultiUserOn(!!view.multiUserEnabled);},[view.multiUserEnabled]);
 useEffect(()=>{setMeteringOn(!!view.creditsMetering);},[view.creditsMetering]);
 useEffect(()=>{setSmtpHost(view.smtpHost??"");},[view.smtpHost]);
 useEffect(()=>{setSmtpPort(view.smtpPort||"465");},[view.smtpPort]);
 useEffect(()=>{setSmtpUser(view.smtpUser??"");},[view.smtpUser]);
 useEffect(()=>{setSmtpFrom(view.smtpFrom??"");},[view.smtpFrom]);
 useEffect(()=>{setAlipayAppid(view.alipayAppid??"");},[view.alipayAppid]);
 useEffect(()=>{setAlipayPublicKey(view.alipayPublicKey??"");},[view.alipayPublicKey]);
 useEffect(()=>{setWxpayMchid(view.wxpayMchid??"");},[view.wxpayMchid]);
 useEffect(()=>{setWxpayAppid(view.wxpayAppid??"");},[view.wxpayAppid]);
 useEffect(()=>{setWxpayCertSerial(view.wxpayCertSerial??"");},[view.wxpayCertSerial]);
 useEffect(()=>{const abort=new AbortController();void fetch("/api/admin/owner-account",{headers:{Authorization:`Bearer ${token}`},signal:abort.signal}).then(async response=>{const data=await response.json().catch(()=>null);if(!abort.signal.aborted&&response.ok)setOwnerEmail(data?.ownerEmail||null);}).catch(()=>{});return()=>abort.abort();},[token]);
async function saveWechatLogin() {
    await postSettings(
      {
        wechatAppid,
        wechatToken,
        wechatEmailDomain,
      },
      "微信登录已保存"
    );
  }
  const alipayReady = !!view?.alipayAppid && !!view?.alipayPrivateKeyReady;
  const wxpayReady =
    !!view?.wxpayMchid &&
    !!view?.wxpayAppid &&
    !!view?.wxpayCertSerial &&
    !!view?.wxpayApiv3Ready &&
    !!view?.wxpayCertReady;
  // 收款「实际生效」= 总开关已开 且 至少一个商户齐全(前端真正显示在线充值的条件)。
  const payLive = !!view?.payEnabled && (alipayReady || wxpayReady);

return <>
      {section === "auth" && (
      <div>
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">管理员 · 登录与支付</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            仅管理员可见
          </span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          开源自部署时在此填入自己的微信公众号与收款凭证。所有敏感字段均「浏览器内 RSA
          加密传输 + 服务端 AES 加密存储」，永不明文、不回显；留空则自动回退环境变量配置。
        </p>

        {/* 多用户模式开关 */}
        <div className="mb-5 space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-primary" />
            多用户模式
          </div>
          <p className="text-xs text-muted-foreground">
            开启后：访客可注册 / 登录（邮箱 + 密码），新用户获赠积分，生图按积分扣费，
            你可对外卖积分运营（和官方站一样）。关闭则为单用户自托管（仅你自己用、不计费）。
            开启前请先在下方配好收款（支付宝 / 微信），否则用户买不了积分。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              多用户开关：
            </span>
            {[
              { v: true, label: "开启" },
              { v: false, label: "关闭" },
            ].map((o) => (
              <button
                key={o.label}
                onClick={() => setMultiUserOn(o.v)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  multiUserOn === o.v
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                {o.label}
              </button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void postSettings(
                  { multiUserEnabled: multiUserOn },
                  "多用户开关已保存"
                )
              }
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存
            </Button>
          </div>
        </div>

        {/* 站长邮箱账号:让站长也能像官方站一样在登录框用邮箱+密码登录 */}
        <div className="mb-5 space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-primary" />
            站长邮箱账号
            <ReadyBadge ready={!!ownerEmail} className="ml-auto" />
          </div>
          <p className="text-xs text-muted-foreground">
            设置后,你可以直接在网站登录框用<b>邮箱 + 密码</b>登录(与官方站一致),
            自动拥有管理员权限;原「管理员密码」仍可用于 /admin 应急。
            你现有的积分、作品会整体迁移到该邮箱名下。
            {ownerEmail && (
              <>
                {" "}当前:<code className="rounded bg-black/5 px-1 dark:bg-white/10">{ownerEmail}</code>
              </>
            )}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              type="email"
              value={ownerEmailInput}
              onChange={(e) => setOwnerEmailInput(e.target.value)}
              placeholder={ownerEmail ? "改绑新邮箱" : "you@example.com"}
            />
            <Input
              type="password"
              autoComplete="new-password"
              value={ownerPwInput}
              onChange={(e) => setOwnerPwInput(e.target.value)}
              placeholder="登录密码(至少 6 位)"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !ownerEmailInput.trim() || ownerPwInput.length < 6}
            onClick={async () => {
              await mutation(async actor=>{
                const res = await fetch("/api/admin/owner-account", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${actor}`,
                  },
                  body: JSON.stringify({
                    email: ownerEmailInput.trim(),
                    password: ownerPwInput,
                  }),
                }).catch(()=>{throw Error("网络错误,请重试")});
                const d = await res.json().catch(() => null);
                if(!res.ok||!d?.ok)throw Error(d?.error||"设置失败");return d;
              },d=>{setOwnerEmail(String(d.ownerEmail||ownerEmailInput.trim()));setOwnerEmailInput("");setOwnerPwInput("");},"站长邮箱账号已设置,现在可以用邮箱+密码从登录框登录了");
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {ownerEmail ? "改绑并迁移数据" : "设置站长账号"}
          </Button>
        </div>

        {/* 邮件服务(SMTP,忘记密码用) */}
        <div className="mb-5 space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquare className="h-4 w-4 text-primary" />
            邮件服务（SMTP）
            <ReadyBadge ready={!!view?.smtpConfigured} className="ml-auto" />
          </div>
          <p className="text-xs text-muted-foreground">
            用于多用户「忘记密码」发送重置邮件。填你的 SMTP（企业邮箱 / 阿里云邮件推送等）。
            密码加密存储、不回显。
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground">
                SMTP 服务器
              </label>
              <Input
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.exmail.qq.com"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground">
                端口
              </label>
              <Input
                value={smtpPort}
                inputMode="numeric"
                onChange={(e) =>
                  setSmtpPort(e.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="465"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground">
                账号（用户名）
              </label>
              <Input
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="noreply@yourdomain.com"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground">
                密码 / 授权码
                {view?.smtpConfigured ? "（已保存，留空不改）" : ""}
              </label>
              <Input
                type="password"
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-muted-foreground">
                发件人（可选，默认用账号）
              </label>
              <Input
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
                placeholder='"你的站点" <noreply@yourdomain.com>'
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                void postSettings(
                  {
                    smtpHost,
                    smtpPort: Number(smtpPort) || 465,
                    smtpUser,
                    smtpFrom,
                    smtpPass,
                  },
                  "邮件配置已保存",
                  () => setSmtpPass("")
                )
              }
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存邮件配置
            </Button>
            {/* 一键验证连通性:先保存再点这个,不用走完整「忘记密码」流程 */}
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {const to=window.prompt("把测试邮件发到哪个邮箱?(先点「保存邮件配置」再测试)");if(!to||!to.trim())return;await mutation(async actor=>{const res = await fetch("/api/admin/smtp-test", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${actor}`,
                    },
                    body: JSON.stringify({ to: to.trim() }),
                  }).catch(()=>{throw Error("网络错误,请重试")});
                  const d=await res.json().catch(()=>null);if(!res.ok||!d?.ok)throw Error(d?.error||"发送失败");return d;},()=>{},`测试邮件已发出,去 ${to.trim()} 收件箱(含垃圾箱)确认`);}}
            >
              发送测试邮件
            </Button>
          </div>
        </div>

        {/* 当前收款模式(只读说明) */}
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-none" />
          <span>当前：原生对接模式（填好下方商户即可直接收款）。</span>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* 卡 1:微信登录 */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
            <div className="flex items-center justify-between gap-2 text-sm font-semibold">
              <span className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                微信登录（公众号扫码）
              </span>
              <ReadyBadge ready={!!view?.wechatReady} />
            </div>
            <label className="block text-[11px] font-medium text-muted-foreground">
              AppID
            </label>
            <Input
              value={wechatAppid}
              onChange={(e) => setWechatAppid(e.target.value)}
              placeholder="wx 开头的公众号 AppID"
            />
            <label className="block text-[11px] font-medium text-muted-foreground">
              Token（服务器配置里的令牌）
            </label>
            <Input
              value={wechatToken}
              onChange={(e) => setWechatToken(e.target.value)}
              placeholder="回调验签用的 Token"
            />
            <label className="block text-[11px] font-medium text-muted-foreground">
              合成邮箱域名
            </label>
            <Input
              value={wechatEmailDomain}
              onChange={(e) => setWechatEmailDomain(e.target.value)}
              placeholder="wx.naumi.local"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void saveWechatLogin()}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存微信登录
            </Button>

            {/* AppSecret(加密) */}
            <div className="mt-1 flex items-center justify-between border-t border-border pt-3 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                AppSecret
              </span>
              <span className="text-muted-foreground">
                当前：{view?.wechatReady ? view?.wechatSecretMasked || "••••" : "未设置"}
              </span>
            </div>
            <Input
              type="password"
              value={wechatSecretInput}
              onChange={(e) => setWechatSecretInput(e.target.value)}
              placeholder="粘贴新的 AppSecret（提交前浏览器内 RSA 加密）"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                RSA 加密传输 + AES 加密存储，永不明文、不回显
              </p>
              <Button
                variant="gradient"
                size="sm"
                onClick={() =>
                  void saveEncrypted(
                    "encryptedWechatSecret",
                    wechatSecretInput,
                    "微信 AppSecret 已加密更新",
                    () => setWechatSecretInput("")
                  )
                }
                disabled={busy || !wechatSecretInput.trim()}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                加密更新 Secret
              </Button>
            </div>
          </div>

          {/* 卡 2:收款总开关 */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="h-4 w-4 text-primary" />
              收款总开关
              <ReadyBadge ready={payLive} className="ml-auto" />
            </div>
            <p className="text-xs text-muted-foreground">
              控制前端是否显示「在线充值」（需同时已配置收款信息：支付宝或微信商户齐全）。
            </p>
            {/* 收款开关 */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                收款总开关：
              </span>
              {[
                { v: true, label: "开启" },
                { v: false, label: "关闭" },
              ].map((o) => (
                <button
                  key={o.label}
                  onClick={() => setPayEnabled(o.v)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    payEnabled === o.v
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {o.label}
                </button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void postSettings({ payEnabled }, "收款开关已保存")
                }
                disabled={busy}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                保存开关
              </Button>
            </div>
          </div>

          {/* 卡 3:支付宝商户 */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="h-4 w-4 text-primary" />
              支付宝商户
              <ReadyBadge ready={alipayReady} className="ml-auto" />
            </div>
            <label className="block text-[11px] font-medium text-muted-foreground">
              AppID
            </label>
            <Input
              value={alipayAppid}
              onChange={(e) => setAlipayAppid(e.target.value)}
              placeholder="支付宝应用 AppID"
            />
            <label className="block text-[11px] font-medium text-muted-foreground">
              支付宝公钥
            </label>
            <Input
              value={alipayPublicKey}
              onChange={(e) => setAlipayPublicKey(e.target.value)}
              placeholder="支付宝公钥（非敏感，可明文存）"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void postSettings(
                  { alipayAppid, alipayPublicKey },
                  "支付宝商户已保存"
                )
              }
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存支付宝商户
            </Button>

            {/* 应用私钥(加密) */}
            <div className="mt-1 flex items-center justify-between border-t border-border pt-3 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                应用私钥
              </span>
              <span className="text-muted-foreground">
                当前：
                {view?.alipayPrivateKeyReady
                  ? view?.alipayPrivateKeyMasked || "••••"
                  : "未设置"}
              </span>
            </div>
            <textarea
              value={alipayPrivateKeyInput}
              onChange={(e) => setAlipayPrivateKeyInput(e.target.value)}
              placeholder="粘贴应用私钥（提交前浏览器内 RSA 加密）"
              rows={3}
              className="w-full resize-y rounded-lg border border-border bg-card p-2.5 text-sm outline-none focus:border-primary"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                RSA 加密传输 + AES 加密存储，永不明文、不回显
              </p>
              <Button
                variant="gradient"
                size="sm"
                onClick={() =>
                  void saveEncrypted(
                    "encryptedAlipayPrivateKey",
                    alipayPrivateKeyInput,
                    "支付宝应用私钥已加密更新",
                    () => setAlipayPrivateKeyInput("")
                  )
                }
                disabled={busy || !alipayPrivateKeyInput.trim()}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                加密更新私钥
              </Button>
            </div>

            {/* 排错:从已存私钥反推出的应用公钥,须与支付宝平台上传的「应用公钥」一致 */}
            {view?.alipayDerivedPublicKey && (
              <div className="mt-1 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="mb-1 text-[11px] font-semibold text-amber-700">
                  🔍 排错 · 你私钥对应的「应用公钥」
                </p>
                <p className="mb-2 text-[11px] leading-relaxed text-amber-700">
                  下面这串,必须和你上传到支付宝平台「接口加签方式 →
                  应用公钥」里的<b>一字不差</b>。不一致 =
                  验签出错的根因(私钥与平台上传的公钥不是一对)。点框内全选复制去对照。
                </p>
                <textarea
                  readOnly
                  value={view.alipayDerivedPublicKey}
                  rows={3}
                  onClick={(e) =>
                    (e.target as HTMLTextAreaElement).select()
                  }
                  className="w-full resize-y rounded-md border border-amber-300 bg-white p-2 font-mono text-[11px] text-amber-900 outline-none"
                />
              </div>
            )}
          </div>

          {/* 卡 4:微信支付商户 */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="h-4 w-4 text-primary" />
              微信支付商户
              <ReadyBadge ready={wxpayReady} className="ml-auto" />
            </div>
            <label className="block text-[11px] font-medium text-muted-foreground">
              商户号 mchid
            </label>
            <Input
              value={wxpayMchid}
              onChange={(e) => setWxpayMchid(e.target.value)}
              placeholder="微信支付商户号 mchid"
            />
            <label className="block text-[11px] font-medium text-muted-foreground">
              绑定 AppID（公众号 / 小程序）
            </label>
            <Input
              value={wxpayAppid}
              onChange={(e) => setWxpayAppid(e.target.value)}
              placeholder="Native 下单绑定的 appid"
            />
            <label className="block text-[11px] font-medium text-muted-foreground">
              证书序列号
            </label>
            <Input
              value={wxpayCertSerial}
              onChange={(e) => setWxpayCertSerial(e.target.value)}
              placeholder="商户证书序列号 serial_no"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void postSettings(
                  { wxpayMchid, wxpayAppid, wxpayCertSerial },
                  "微信支付商户已保存"
                )
              }
              disabled={busy || !wxpayMchid.trim()}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存微信支付商户
            </Button>

            {/* APIv3 Key(加密) */}
            <div className="mt-1 flex items-center justify-between border-t border-border pt-3 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                APIv3 Key
              </span>
              <span className="text-muted-foreground">
                当前：
                {view?.wxpayApiv3Ready ? view?.wxpayApiv3Masked || "••••" : "未设置"}
              </span>
            </div>
            <Input
              type="password"
              value={wxpayApiv3Input}
              onChange={(e) => setWxpayApiv3Input(e.target.value)}
              placeholder="粘贴 APIv3 Key（提交前浏览器内 RSA 加密）"
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="gradient"
                size="sm"
                onClick={() =>
                  void saveEncrypted(
                    "encryptedWxpayApiv3",
                    wxpayApiv3Input,
                    "微信支付 APIv3 Key 已加密更新",
                    () => setWxpayApiv3Input("")
                  )
                }
                disabled={busy || !wxpayApiv3Input.trim()}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                加密更新 APIv3
              </Button>
            </div>

            {/* 商户 API 私钥 apiclient_key.pem(加密) */}
            <div className="mt-1 flex items-center justify-between border-t border-border pt-3 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                商户 API 私钥(apiclient_key.pem)
              </span>
              <span className="text-muted-foreground">
                当前：
                {view?.wxpayCertReady ? view?.wxpayCertMasked || "••••" : "未设置"}
              </span>
            </div>
            <textarea
              value={wxpayCertInput}
              onChange={(e) => setWxpayCertInput(e.target.value)}
              placeholder="粘贴 apiclient_key.pem 全文（提交前浏览器内 RSA 加密）"
              rows={3}
              className="w-full resize-y rounded-lg border border-border bg-card p-2.5 text-sm outline-none focus:border-primary"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                RSA 加密传输 + AES 加密存储，永不明文、不回显
              </p>
              <Button
                variant="gradient"
                size="sm"
                onClick={() =>
                  void saveEncrypted(
                    "encryptedWxpayCert",
                    wxpayCertInput,
                    "微信支付商户证书已加密更新",
                    () => setWxpayCertInput("")
                  )
                }
                disabled={busy || !wxpayCertInput.trim()}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                加密更新证书
              </Button>
            </div>
          </div>
        </div>
      </div>
      )}

</>;
}
