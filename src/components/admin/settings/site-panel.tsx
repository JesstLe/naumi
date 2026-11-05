"use client";
import {useEffect,useState} from "react";

import {Loader2,ImageIcon,Upload,Palette,FileText} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";

import {CachedImage} from "@/components/cached-image";

import type {SettingsSession} from "./use-settings-session";

export function AdminSiteSettings({section,settings}:{section:string;settings:SettingsSession}){
 const {view,busy,postSettings,mutation}=settings;
const [brandName, setBrandName] = useState("");
const [brandLogo, setBrandLogo] = useState("");
const [pageAbout, setPageAbout] = useState("");
const [pageContact, setPageContact] = useState("");
const [pagePlans, setPagePlans] = useState("");
 useEffect(()=>{setBrandName(view.brandName??"");},[view.brandName]);
 useEffect(()=>{setBrandLogo(view.brandLogo??"");},[view.brandLogo]);
 useEffect(()=>{setPageAbout(view.pageAbout??"");},[view.pageAbout]);
 useEffect(()=>{setPageContact(view.pageContact??"");},[view.pageContact]);
 useEffect(()=>{setPagePlans(view.pagePlans??"");},[view.pagePlans]);

async function saveBrandName() {
    await postSettings({ brandName }, "站点名称已保存");
  }
async function saveBrandLogo() {
    await postSettings({ brandLogo }, "Logo 已保存");
  }
async function saveSitePages() {
    await postSettings(
      { pageAbout, pageContact, pagePlans },
      "站点页面已保存"
    );
  }
async function uploadBrandLogo(file:File){await mutation(async actor=>{const body=new FormData();body.append("image",file);const response=await fetch("/api/admin/brand-logo",{method:"POST",headers:{Authorization:`Bearer ${actor}`},body});const data=await response.json();if(!response.ok)throw Error(data.error||"上传失败");return String(data.url);},async url=>{setBrandLogo(url);await postSettings({brandLogo:url},"Logo 已上传并保存");});}
return <>
      {section === "brand" && (
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">管理员 · 品牌与站点</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            仅管理员可见
          </span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          自定义站点名称与 Logo,留空则用默认。此处修改即时生效,无需重新部署。
        </p>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* 站点名称(复用首启向导的 site_name) */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Palette className="h-4 w-4 text-primary" />
              站点名称
            </div>
            <p className="text-xs text-muted-foreground">
              显示在导航栏 Logo 旁与页脚版权。留空则回退默认。
            </p>
            <Input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="例如 Naumi"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void saveBrandName()}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存站点名称
            </Button>
          </div>

          {/* Logo 图片(上传 或 填 URL) */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ImageIcon className="h-4 w-4 text-primary" />
              Logo 图片
            </div>
            <p className="text-xs text-muted-foreground">
              上传图片,或手填站内路径(如 /logo.png)/ 图床 URL。留空则回退默认 Logo。
            </p>
            <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-3">
              <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
                建议:<b>PNG(透明底)</b>或 WebP,横版 wordmark 高约 <b>80–128px</b>、
                宽 ≤ 400px;方形图标 <b>128×128</b> 起。文件 &lt; 2MB。上传会自动压到
                合适尺寸并保存(导航栏按高度约 32px 显示,建议 2 倍图更清晰)。
              </p>
              <label
                className={`inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors ${
                  busy
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer text-muted-foreground hover:border-primary hover:text-primary"
                }`}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                上传图片
                <input
                  type="file"
                  accept="image/png,image/webp,image/jpeg,image/svg+xml"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadBrandLogo(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <Input
              value={brandLogo}
              onChange={(e) => setBrandLogo(e.target.value)}
              placeholder="或手填:/logo.png 或 https://…/logo.png"
            />
            {brandLogo.trim() && (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <CachedImage
                  src={brandLogo.trim()}
                  alt="Logo 预览"
                  className="h-8 w-auto rounded-lg"
                />
                <span className="text-xs text-muted-foreground">预览</span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void saveBrandLogo()}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存 Logo
            </Button>
          </div>
        </div>
      </div>
      )}

      {/* 管理员 · 站点页面(关于/联系/定价 自定义内容;可自定义) */}
      {section === "pages" && (
      <div>
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">管理员 · 站点页面</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            仅管理员可见
          </span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          自定义「关于我们 / 联系我们 / 定价」页面内容(纯文本,空一行分段)。
          留空则显示「内容建设中」。改动即时生效。
        </p>

        <div className="space-y-5">
          <div className="space-y-2 rounded-2xl border border-border bg-card p-6 card-shadow">
            <label className="text-sm font-semibold">关于我们</label>
            <Textarea
              rows={6}
              value={pageAbout}
              onChange={(e) => setPageAbout(e.target.value)}
              placeholder="介绍你的团队 / 公司 / 产品…"
            />
          </div>
          <div className="space-y-2 rounded-2xl border border-border bg-card p-6 card-shadow">
            <label className="text-sm font-semibold">联系我们</label>
            <Textarea
              rows={5}
              value={pageContact}
              onChange={(e) => setPageContact(e.target.value)}
              placeholder="邮箱 / 微信 / 电话 / 地址 / 工作时间…"
            />
          </div>
          <div className="space-y-2 rounded-2xl border border-border bg-card p-6 card-shadow">
            <label className="text-sm font-semibold">定价</label>
            <Textarea
              rows={5}
              value={pagePlans}
              onChange={(e) => setPagePlans(e.target.value)}
              placeholder="套餐 / 价格 / 权益说明…(留空则该页显示「内容建设中」)"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void saveSitePages()}
            disabled={busy}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            保存站点页面
          </Button>
        </div>
      </div>
      )}

</>;
}
