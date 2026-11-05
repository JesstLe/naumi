"use client";
import {useEffect,useState} from "react";

import {Loader2,ShieldCheck,KeyRound,Cpu,Scissors,ExternalLink} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

import {encryptKey,hasSubtle} from "./credentials";
import type {SettingsSession} from "./use-settings-session";
const MODELS = [
  "gpt-image-1",
  "gpt-image-1-mini",
  "gpt-image-1.5",
  "gpt-image-2",
  "dall-e-3",
];

// 供应商充值入口(站长自助充值)。若图像走第三方中转,把 OPENAI_TOPUP_URL 换成中转商充值页。
const OPENAI_TOPUP_URL =
  "https://platform.openai.com/settings/organization/billing/overview";
const REPLICATE_TOPUP_URL = "https://replicate.com/account/billing";

export function AdminApiSettings({section,settings}:{section:string;settings:SettingsSession}){
 const {view,busy,setMsg,postSettings,saveEncrypted}=settings;
const [model, setModel] = useState("");
const [imageModels, setImageModels] = useState("");
const [cutoutModel, setCutoutModel] = useState("");
const [baseUrl, setBaseUrl] = useState("");
const [baseUrlMasked, setBaseUrlMasked] = useState("");
const [baseUrlSet, setBaseUrlSet] = useState(false);
const [cutoutBackend, setCutoutBackend] = useState<"openai" | "replicate">(
    "replicate"
  );
const [replicateModel, setReplicateModel] = useState("");
const [replicateTokenInput, setReplicateTokenInput] = useState("");
const [keyInput, setKeyInput] = useState("");
 useEffect(()=>{setModel(view.model);},[view.model]);
 const publishedModels=(view.models??[view.model]).join(", ");
 useEffect(()=>{setImageModels(publishedModels);},[publishedModels]);
 useEffect(()=>{setCutoutModel(view.cutoutModel);},[view.cutoutModel]);
 useEffect(()=>{setBaseUrlMasked(view.openaiBaseUrlMasked??"");},[view.openaiBaseUrlMasked]);
 useEffect(()=>{setBaseUrlSet(!!view.openaiBaseUrlSet);},[view.openaiBaseUrlSet]);
 useEffect(()=>{setCutoutBackend(view.cutoutBackend??"replicate");},[view.cutoutBackend]);
 useEffect(()=>{setReplicateModel(view.cutoutReplicateModel??"men1scus/birefnet");},[view.cutoutReplicateModel]);
async function save(opts:{withKey:boolean}){
 await postSettings(async actor=>{const payload:{model:string;models:string[];cutoutModel:string;cutoutBackend:string;replicateModel:string;encryptedKey?:string;keyPlain?:string}={model,models:imageModels.split(/[\n,]/).map(item=>item.trim()).filter(Boolean),cutoutModel,cutoutBackend,replicateModel};if(opts.withKey){if(!keyInput.trim())throw Error("请输入新的 API Key");if(hasSubtle())payload.encryptedKey=await encryptKey(keyInput.trim(),actor);else payload.keyPlain=keyInput.trim();}return payload;},opts.withKey?"Key 已加密更新":"模型已更新",()=>setKeyInput(""));
}
async function saveReplicate(){if(!replicateTokenInput.trim()){setMsg({ok:false,text:"请输入新的 Replicate Token"});return;}await postSettings(async actor=>({replicateModel,encryptedReplicateToken:await encryptKey(replicateTokenInput.trim(),actor)}),"Replicate Token 已加密更新",()=>setReplicateTokenInput(""));}
return <>
      {section === "api" && view?.modelConfigurationActive && (
        <div className="rounded-xl border border-c-border2 bg-c-card p-6">
          <h2 className="text-lg font-semibold">模型与供应商管理</h2>
          <p className="my-3 text-sm text-c-text3">接口、密钥、模型能力、默认用途与混合路由统一在模型配置中心维护。修改先保存为草稿，再核对差异发布。</p>
          <a href="/admin/bi/models" className="inline-block rounded-lg bg-primary px-4 py-2 text-sm text-white">进入模型配置中心</a>
          <div className="mt-6 space-y-3 border-t border-border pt-5">
            <h3 className="font-semibold">Replicate 商品抠图服务</h3>
            <p className="text-sm text-c-text3">独立的商品分割服务保留原配置；生成式图片模型与兜底通道在模型配置中心维护。当前 Token：{view.cutoutReplicateTokenMasked || "未配置"}。</p>
            <label className="block text-xs">Replicate 模型 slug
              <Input value={replicateModel} onChange={event => setReplicateModel(event.target.value)} placeholder="men1scus/birefnet" />
            </label>
            <label className="block text-xs">更新 Replicate API Token
              <Input type="password" value={replicateTokenInput} onChange={event => setReplicateTokenInput(event.target.value)} autoComplete="new-password" placeholder="提交前浏览器内 RSA 加密" />
            </label>
            <Button onClick={() => void saveReplicate()} disabled={busy || !replicateTokenInput.trim()}>加密保存 Replicate 配置</Button>
          </div>
        </div>
      )}
      {section === "api" && !view?.modelConfigurationActive && (
      <div>
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">管理员 · 接口与模型</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            仅管理员可见
          </span>
        </div>

        {/* 大陆服务器:模型接口地址配置帮助 */}
        <div className="mb-5 rounded-xl border border-c-border2 bg-c-subtle2 p-4 text-[13px] leading-relaxed">
          <p className="font-semibold text-c-text">
            🇨🇳 大陆服务器:生图报「无法连接 AI 服务」怎么办
          </p>
          <p className="mt-1.5 text-c-text3">
            大陆服务器直连不了 AI 模型,需要给模型配置一个可访问的接口地址才能生图。两种办法:
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-c-text3">
            <li>
              用一台海外服务器搭一个 OpenAI 兼容的接口,把地址填到运行环境变量{" "}
              <code className="rounded bg-black/5 px-1 dark:bg-white/10">
                OPENAI_BASE_URL
              </code>
              (compose 里加这行后 <code className="rounded bg-black/5 px-1 dark:bg-white/10">docker compose up -d</code> 重启)。
            </li>
            <li>也可以使用已配置好的 OpenAI 兼容网关地址。</li>
          </ul>
          <p className="mt-1.5 text-c-text4">海外服务器一般直连即可,忽略本条。</p>
        </div>

        {/* AI 模型接口地址:后台直接填,加密存储,即时生效(免改 compose / 免重启) */}
        <div className="mb-5 space-y-2 rounded-2xl border border-border bg-card p-6 card-shadow">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <Cpu className="h-4 w-4 text-primary" />
            AI 模型接口地址
          </label>
          <p className="text-xs text-muted-foreground">
            大陆服务器把模型接口地址填这里,<b>保存后加密存储、即时生效(免改 compose、免重启)</b>。
            留空 = 直连(海外默认)。
            {baseUrlSet && (
              <>
                {" "}当前已配置:
                <code className="rounded bg-black/5 px-1 dark:bg-white/10">
                  {baseUrlMasked || "已设置"}
                </code>
                (出于安全不显示完整地址;重填即可覆盖)。
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={baseUrlSet ? "重新填写以更新" : "https://模型接口域名/v1"}
              className="min-w-[260px] flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !baseUrl.trim()}
              onClick={() => {
                if (hasSubtle()) {
                  void saveEncrypted(
                    "encryptedBaseUrl",
                    baseUrl,
                    "接口地址已保存(加密)",
                    () => setBaseUrl("")
                  );
                } else {
                  // HTTP 自托管:明文传输(本就无 TLS),服务端仍 AES 加密落库
                  void postSettings(
                    { baseUrlPlain: baseUrl.trim() },
                    "接口地址已保存(加密存储)",
                    () => setBaseUrl("")
                  );
                }
              }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存
            </Button>
            {baseUrlSet && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (
                    !window.confirm(
                      "清除后将恢复直连(海外默认),大陆服务器会无法生图。确定清除?"
                    )
                  )
                    return;
                  void postSettings({ baseUrlClear: true }, "已清除,恢复直连");
                }}
              >
                清除
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* 左:图像模型 + 对应 OpenAI Key + 充值入口 */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Cpu className="h-4 w-4 text-primary" />
              图像模型
            </div>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="例如 gpt-image-2"
            />
            <div className="flex flex-wrap gap-2">
              {MODELS.map((m) => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    model === m
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                前台可切换模型（逗号或换行分隔）
              </label>
              <Input
                value={imageModels}
                onChange={(e) => setImageModels(e.target.value)}
                placeholder="gpt-image-2, gpt-image-1.5, gpt-image-1"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void save({ withKey: false })}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存图像模型
            </Button>

            {/* OpenAI API Key(图像模型对应的 key) */}
            <div className="mt-2 flex items-center gap-2 border-t border-border pt-3 text-sm font-semibold">
              <KeyRound className="h-4 w-4 text-primary" />
              OpenAI API Key
            </div>
            <p className="text-sm text-muted-foreground">
              当前：
              <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">
                {view?.hasKey ? view.keyMasked : "未设置"}
              </code>
              <span className="ml-2 text-xs">
                来源：
                {view?.source === "db"
                  ? "后台"
                  : view?.source === "env"
                    ? "环境变量"
                    : "无"}
              </span>
            </p>
            <Input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="粘贴新的 sk-...（提交前浏览器内 RSA 加密）"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                浏览器内 RSA 加密传输 + 服务端 AES 加密存储，永不明文
              </p>
              <Button
                variant="gradient"
                size="sm"
                onClick={() => void save({ withKey: true })}
                disabled={busy || !keyInput.trim()}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                加密更新 Key
              </Button>
            </div>
            <a
              href={OPENAI_TOPUP_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              前往 OpenAI 充值
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* 右:抠图模型(后端 / Replicate / 兜底)+ 对应 Token + 充值入口 */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Scissors className="h-4 w-4 text-primary" />
              抠图模型
            </div>
            <p className="text-xs text-muted-foreground">
              「AI 抠图」与画布抠图的识别引擎。Replicate BiRefNet：发丝级边缘、像素级
              保真，适合商品主体；OpenAI gpt-image：备选引擎，风格化更强。默认推荐
              Replicate。
            </p>
            {/* 后端切换 */}
            <div className="flex flex-wrap gap-2">
              {[
                { id: "replicate" as const, label: "Replicate BiRefNet（推荐）" },
                { id: "openai" as const, label: "OpenAI gpt-image（备选）" },
              ].map((b) => (
                <button
                  key={b.id}
                  onClick={() => setCutoutBackend(b.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    cutoutBackend === b.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            {/* Replicate BiRefNet(第三方,后台可改 Token + 模型) */}
            <div className="space-y-2 rounded-xl border border-border bg-secondary/40 p-3">
              <div className="flex items-center justify-between text-xs font-medium">
                <span>Replicate BiRefNet</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                    view?.cutoutReplicateReady
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-amber-500/10 text-amber-600"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      view?.cutoutReplicateReady ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  {view?.cutoutReplicateReady
                    ? `已配置 · ${view.cutoutReplicateTokenMasked || "••••"}`
                    : "未配置 Token"}
                </span>
              </div>
              <label className="block text-[11px] font-medium text-muted-foreground">
                模型 slug
              </label>
              <Input
                value={replicateModel}
                onChange={(e) => setReplicateModel(e.target.value)}
                placeholder="men1scus/birefnet"
              />
              <label className="block text-[11px] font-medium text-muted-foreground">
                API Token
              </label>
              <Input
                type="password"
                value={replicateTokenInput}
                onChange={(e) => setReplicateTokenInput(e.target.value)}
                placeholder="粘贴新的 r8_…（提交前浏览器内 RSA 加密）"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  RSA 加密传输 + AES 加密存储,永不明文、不回显
                </p>
                <Button
                  variant="gradient"
                  size="sm"
                  onClick={() => void saveReplicate()}
                  disabled={busy || !replicateTokenInput.trim()}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  加密更新 Token
                </Button>
              </div>
            </div>

            {/* gpt-image 备用模型 */}
            <p className="text-xs font-medium text-muted-foreground">
              gpt-image 备用模型
            </p>
            <Input
              value={cutoutModel}
              onChange={(e) => setCutoutModel(e.target.value)}
              placeholder="例如 gpt-image-1"
            />
            <div className="flex flex-wrap gap-2">
              {["gpt-image-1", "gpt-image-1-mini", "gpt-image-1.5", "gpt-image-2"].map(
                (m) => (
                  <button
                    key={m}
                    onClick={() => setCutoutModel(m)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      cutoutModel === m
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {m}
                  </button>
                )
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void save({ withKey: false })}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存抠图设置
            </Button>
            <a
              href={REPLICATE_TOPUP_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              前往 Replicate 充值
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
      )}

</>;
}
