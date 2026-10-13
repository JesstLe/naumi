"use client";
import { CachedImage } from "@/components/cached-image";
import {toolImageError, toolSourceUrl} from "@/lib/tool-ui";
import {useImageResolutions} from "@/lib/model-config/resolution-client";
import {useFeatureBilling} from "@/lib/billing/preview";
import { useImageQuality } from "@/lib/image-quality-context";
import { ImageQualityControl } from "@/components/image-quality-control";

import * as React from "react";
import { Cuboid, Download, Upload, X } from "lucide-react";
import { ToolShell, ShellChips } from "@/components/tools/tool-shell";
import { ToolDemo, getDemo } from "@/components/tools/tool-demo";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/locale-context";
import { authHeader } from "@/lib/supabase";
import { downloadImage } from "@/lib/download";
import { cn } from "@/lib/utils";

const ACCENT = "#B7791F";
const MAX_UPLOAD = 16 * 1024 * 1024;

export function Packaging3dClient() {
  const { imageCost } = useImageQuality();
  const { user, applyServerUser } = useAuth();
  const { locale } = useI18n();
  const L = (zh: string, en: string) => (locale === "en" ? en : zh);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState("");
  const [packageType, setPackageType] = React.useState("auto");
  const [view, setView] = React.useState("angle");
  const [material, setMaterial] = React.useState("matte");
  const [background, setBackground] = React.useState("gray");
  const [resolution, setResolution] = React.useState("1K");
  const displayResolutions=useImageResolutions("tool.packaging3d",resolution,setResolution);
  const billing=useFeatureBilling("tool.packaging3d",{resolution});
  const [prompt, setPrompt] = React.useState("");
  const [processing, setProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState("");
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handleFile(next: File | null) {
    setError(null);
    if (!next || processing) return;
    if (toolImageError(next, MAX_UPLOAD, "image/png,image/jpeg,image/webp,image/svg+xml")) {
      setError(L("请选择16MB以内的PNG / JPG / WebP / SVG文件", "Choose a PNG / JPG / WebP / SVG under 16MB"));
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setResult("");
  }

  function clearFile() {
    if (processing) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview("");
    setResult("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function generate() {
    if (!file || processing) return;
    setError(null);
    setProcessing(true);
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("packageType", packageType);
      form.append("view", view);
      form.append("material", material);
      form.append("background", background);
      form.append("resolution", resolution);
      if (prompt.trim()) form.append("prompt", prompt.trim());
      if (user) form.append("email", user.email);
      const startResponse = await billing.submit("/api/packaging3d", {
        method: "POST",
        headers: await authHeader(),
        body: form,
      });
      const start = await startResponse.json();
      if (!startResponse.ok) throw new Error(start.error || L("生成失败", "Generation failed"));
      const jobId = start.jobId;
      if (typeof jobId !== "string" || !jobId.trim()) throw new Error(L("任务创建失败，请重试", "Could not start job; retry"));
      const deadline = Date.now() + 6 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const response = await fetch(
          `/api/packaging3d?job=${encodeURIComponent(jobId)}`,
          { cache: "no-store", headers: await authHeader() }
        );
        const job = await response.json();
        if (!response.ok) throw new Error(job.error || L("任务读取失败", "Could not read job"));
        if (job.status === "error") throw new Error(job.error || L("生成失败", "Generation failed"));
        if (job.status === "done") {
          if (typeof job.url !== "string" || !toolSourceUrl(job.url)) throw new Error(L("图片接口未返回结果", "No image was returned"));
          setResult(job.url);
          if (job.user) applyServerUser(job.user);
          setRefreshKey((value) => value + 1);
          return;
        }
      }
      throw new Error(L("生成超时，请稍后检查作品库", "Timed out; check the library later"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : L("生成失败", "Generation failed"));
    } finally {
      setProcessing(false);
    }
  }

  const left = (
    <>
      <div>
        <p className="mb-2 text-[12.5px] font-medium text-c-text2">
          {L("模切线 / 刀版图", "Dieline artwork")}
        </p>
        <input
          ref={fileRef}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
        />
        {preview ? (
          <div className="relative rounded-xl border border-c-border bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <CachedImage src={preview} alt="dieline" className="h-40 w-full object-contain" />
            <button
              type="button"
              onClick={clearFile}
              aria-label={L("移除", "Remove")}
              className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-slate-900/75 text-white"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="mt-2 truncate text-[11px] text-c-text3">{file?.name}</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              handleFile(event.dataTransfer.files?.[0] ?? null);
            }}
            className="flex h-40 w-full flex-col items-center justify-center rounded-xl border border-dashed border-c-border2 bg-c-subtle2 text-c-text3 transition-colors hover:border-amber-600 hover:text-c-text"
          >
            <Upload className="mb-2 h-5 w-5" />
            <span className="text-[12px] font-medium">{L("上传模切线图", "Upload dieline")}</span>
            <span className="mt-1 text-[10px] text-c-text4">PNG / JPG / WebP / SVG · 16MB</span>
          </button>
        )}
      </div>

      <ShellChips
        label={L("包装结构", "Package structure")}
        options={[
          { key: "auto", label: L("自动识别", "Auto") },
          { key: "carton", label: L("折叠纸盒", "Carton") },
          { key: "mailer", label: L("邮寄盒", "Mailer") },
          { key: "pouch", label: L("自立袋", "Pouch") },
          { key: "sleeve", label: L("套筒", "Sleeve") },
          { key: "label", label: L("瓶贴", "Label") },
        ]}
        value={packageType}
        onChange={setPackageType}
        accent={ACCENT}
      />
      <ShellChips
        label={L("展示视角", "View")}
        options={[
          { key: "angle", label: "45°" },
          { key: "front", label: L("正面", "Front") },
          { key: "side", label: L("侧面", "Side") },
          { key: "back", label: L("背面", "Back") },
        ]}
        value={view}
        onChange={setView}
        accent={ACCENT}
      />
      <ShellChips
        label={L("包装材质", "Material")}
        options={[
          { key: "matte", label: L("哑光", "Matte") },
          { key: "glossy", label: L("亮膜", "Glossy") },
          { key: "kraft", label: L("牛皮纸", "Kraft") },
          { key: "metallic", label: L("金属膜", "Metallic") },
        ]}
        value={material}
        onChange={setMaterial}
        accent={ACCENT}
      />
      <ShellChips
        label={L("背景", "Background")}
        options={[
          { key: "white", label: L("纯白", "White") },
          { key: "gray", label: L("浅灰棚拍", "Studio") },
          { key: "scene", label: L("简洁场景", "Scene") },
        ]}
        value={background}
        onChange={setBackground}
        accent={ACCENT}
      />
      <ShellChips
        label={L("分辨率", "Resolution")}
        options={displayResolutions.map((id) => ({ key: id, label: id }))}
        value={resolution}
        onChange={setResolution}
        accent={ACCENT}
      />
      <div>
        <label className="mb-2 block text-[12.5px] font-medium text-c-text2">
          {L("补充要求", "Additional requirements")}
        </label>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          maxLength={600}
          placeholder={L(
            "例如：盒体厚一些，正面文字必须完整，展示右侧面",
            "Example: thicker board, keep front text intact, show right panel"
          )}
          className="min-h-[82px] w-full border border-c-border bg-c-subtle2 px-3 py-2 text-[12px] leading-5 outline-none focus:border-amber-600"
        />
      </div>
    </>
  );

  return (
    <ToolShell
      name={L("模切线转 3D", "Dieline to 3D")}
      desc={L("将平面刀版图折叠成包装产品效果图", "Fold flat packaging artwork into a product mockup")}
      Icon={Cuboid}
      tint="var(--c-tint-a)"
      accent={ACCENT}
      category="packaging3d"
      cost={billing.cost}
      resolution={resolution}
      actionLabel={L("生成 3D 产品图", "Generate 3D product")}
      onAction={generate}
      processing={processing}
      disabled={!file}
      error={error}
      left={left}
      refreshKey={refreshKey}
      resultTitle={L("3D 产品可视化", "3D product visual")}
      resultHint={result ? L("点击图片可放大", "Click image to zoom") : L("输出单个完整包装", "One complete package")}
      footerNote={L(
        "复杂异形刀版建议在补充要求中说明成品结构；结果用于视觉预览，不替代印前结构校样。",
        "For unusual dielines, describe the final structure. Visual preview does not replace prepress proofing."
      )}
    >
      {(zoom) => (
        <div className={cn("flex min-h-0 flex-1", result || preview ? "items-stretch" : "items-center justify-center")}>
          {result ? (
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
              <div className="flex min-h-0 flex-col">
                <p className="mb-2 text-[11px] font-medium text-c-text3">{L("原始刀版", "Dieline")}</p>
                <button
                  type="button"
                  onClick={() => zoom(preview)}
                  className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-c-border bg-white p-3"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <CachedImage src={preview} alt="dieline" className="max-h-[650px] max-w-full object-contain" />
                </button>
              </div>
              <div className="flex min-h-0 flex-col">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-medium" style={{ color: ACCENT }}>
                    {L("3D 成品", "3D product")}
                  </p>
                  <button
                    type="button"
                    onClick={() => downloadImage(result, "packaging-3d")}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-c-text3 hover:text-c-text"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {L("下载", "Download")}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => zoom(result)}
                  className="flex min-h-0 flex-1 items-center justify-center border border-c-border bg-c-subtle2 p-3"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <CachedImage src={result} alt="3D packaging" className="max-h-[650px] max-w-full object-contain" />
                </button>
              </div>
            </div>
          ) : preview ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-c-border bg-white p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <CachedImage src={preview} alt="dieline" className="max-h-[610px] max-w-full object-contain" />
              <p className="mt-4 text-[11px] text-c-text4">
                {L("将识别裁切线、折线、粘口和相邻面板", "Cut lines, folds, glue tabs and panels will be inferred")}
              </p>
            </div>
          ) : (
            <ToolDemo {...getDemo("packaging3d")!} notice />
          )}
        </div>
      )}
    </ToolShell>
  );
}
