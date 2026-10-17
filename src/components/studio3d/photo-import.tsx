"use client";
import { useEffect, useRef, useState } from "react";
import { X, Upload, LoaderCircle, ScanLine } from "lucide-react";
import { decodePhoto, localPhotoProject } from "@/lib/studio3d/photo-client";
import type { Crop, Outline } from "@/lib/studio3d/photo-outline";
import type { StudioProject } from "@/lib/studio3d/project";

export function PhotoImport({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (project: StudioProject) => void;
}) {
  const [source, setSource] = useState<{
      file: File;
      canvas: HTMLCanvasElement;
      url: string;
    } | null>(null),
    [crop, setCrop] = useState<Crop>({
      x: 0.25,
      y: 0.2,
      width: 0.5,
      height: 0.7,
    });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<{
      project: StudioProject;
      outline: Outline;
      elapsedMs: number;
    } | null>(null);
  const input = useRef<HTMLInputElement>(null),
    image = useRef<HTMLImageElement>(null),
    start = useRef<{ x: number; y: number } | null>(null),
    abort = useRef<AbortController | null>(null),
    dialog = useRef<HTMLDivElement>(null),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    const before = document.activeElement as HTMLElement;
    dialog.current?.focus();
    return () => {
      live.current = false;
      abort.current?.abort();
      before?.focus();
    };
  }, []);
  const close = () => {
    abort.current?.abort();
    onClose();
  };
  const load = async (file: File) => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const canvas = await decodePhoto(file);
      if (live.current)
        setSource({ file, canvas, url: canvas.toDataURL("image/png") });
    } catch (e) {
      if (live.current)
        setError(e instanceof Error ? e.message : "图片读取失败");
    } finally {
      if (live.current) setBusy(false);
    }
  };
  const process = async () => {
    if (!source || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    try {
      const value = await localPhotoProject(
        source.file,
        source.canvas,
        crop,
        controller.signal,
      );
      if (live.current) setResult(value);
    } catch (e) {
      if (
        live.current &&
        !(e instanceof DOMException && e.name === "AbortError")
      )
        setError(e instanceof Error ? e.message : "本机处理失败");
    } finally {
      if (live.current) setBusy(false);
    }
  };
  const point = (event: React.PointerEvent) => {
    const rect = image.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  const outline =
    result?.outline.silhouette
      .map(
        (row, i) =>
          `${(crop.x + row.left * crop.width) * 100},${(crop.y + (i / (result.outline.silhouette.length - 1)) * crop.height) * 100}`,
      )
      .join(" ") +
    " " +
    result?.outline.silhouette
      .map(
        (row, i) =>
          `${(crop.x + row.right * crop.width) * 100},${(crop.y + (i / (result.outline.silhouette.length - 1)) * crop.height) * 100}`,
      )
      .reverse()
      .join(" ");
  return (
    <div
      className="s3-photo-overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialog}
        className="s3-photo-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="照片本机建模"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
          if (e.key === "Tab") {
            const all = [
                ...dialog.current!.querySelectorAll<HTMLElement>(
                  "button:not(:disabled),input:not([hidden]):not(:disabled)",
                ),
              ],
              first = all[0],
              last = all.at(-1);
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === dialog.current)
            ) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <div>
            <h2>
              照片本机建模 <span>试验</span>
            </h2>
            <p>适合直立瓶罐 · 图片留在此设备</p>
          </div>
          <button onClick={close} aria-label="关闭照片建模">
            <X size={18} />
          </button>
        </header>
        <div className="s3-photo-body">
          <div className="s3-photo-source">
            {source ? (
              <div
                className="s3-photo-image"
                onPointerDown={(e) => {
                  if (busy) return;
                  start.current = point(e);
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setResult(null);
                }}
                onPointerMove={(e) => {
                  if (!start.current) return;
                  const p = point(e),
                    a = start.current;
                  setCrop({
                    x: Math.min(a.x, p.x),
                    y: Math.min(a.y, p.y),
                    width: Math.abs(a.x - p.x),
                    height: Math.abs(a.y - p.y),
                  });
                }}
                onPointerUp={() => {
                  start.current = null;
                }}
                onPointerCancel={() => {
                  start.current = null;
                }}
              >
                <img
                  ref={image}
                  src={source.url}
                  alt="本机产品原图"
                  draggable={false}
                />
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-label="产品框选范围"
                >
                  <path
                    d={`M0 0H100V100H0Z M${crop.x * 100} ${crop.y * 100}v${crop.height * 100}h${crop.width * 100}v${-crop.height * 100}Z`}
                    fill="rgba(20,40,28,.35)"
                    fillRule="evenodd"
                  />
                  <rect
                    x={crop.x * 100}
                    y={crop.y * 100}
                    width={crop.width * 100}
                    height={crop.height * 100}
                    fill="none"
                    stroke="#fff"
                    strokeWidth=".25"
                  />
                  {result && (
                    <polygon
                      points={outline}
                      fill="none"
                      stroke="#54e595"
                      strokeWidth=".3"
                    />
                  )}
                </svg>
              </div>
            ) : (
              <button
                className="s3-photo-pick"
                onClick={() => input.current?.click()}
                disabled={busy}
              >
                <Upload size={30} />
                <strong>选择产品图片</strong>
                <span>PNG / JPG / WebP · 12MB 以内</span>
              </button>
            )}
          </div>
          <aside>
            <input
              ref={input}
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp"
              aria-label="选择本机建模图片"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void load(f);
              }}
            />
            <h3>1. 框选完整瓶子</h3>
            <p>在图片上拖动，紧贴产品四周。不要带入海报文字或其他物体。</p>
            <div className="s3-photo-crop">
              {(["x", "y", "width", "height"] as const).map((key, i) => (
                <label key={key}>
                  {["左边", "顶部", "宽度", "高度"][i]} %
                  <input
                    type="number"
                    aria-label={`选区${key}`}
                    min="0"
                    max="100"
                    step=".1"
                    value={Number((crop[key] * 100).toFixed(2))}
                    disabled={busy}
                    onChange={(e) => {
                      setResult(null);
                      setCrop((v) => ({
                        ...v,
                        [key]: Number(e.target.value) / 100,
                      }));
                    }}
                  />
                </label>
              ))}
            </div>
            <button
              disabled={!source || busy}
              onClick={() => void process()}
              className="s3-primary s3-full"
            >
              {busy ? (
                <LoaderCircle className="s3-spin" size={16} />
              ) : (
                <ScanLine size={16} />
              )}
              提取轮廓
            </button>
            {source && (
              <button
                className="s3-full"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                更换图片
              </button>
            )}
            <h3>2. 检查绿色轮廓</h3>
            <p>按左右对称轮廓旋转生成网格；遮挡、倾斜和透视会影响形状。</p>
            {result && (
              <div className="s3-photo-result" role="status">
                轮廓已提取 · {result.outline.profile.length} 个采样点
                <br />
                本机后台计算 {Math.round(result.project.photo!.workerMs)} ms
              </div>
            )}
            <h3>这次会生成什么</h3>
            <p>
              可见正面使用原图投影；背面为中性色待补充。照片中的反光仍保留，切换白模可检查真实几何。
            </p>
            <p>
              尺寸先按假定瓶高 160mm 建立比例，可再修改。此试验不是实物扫描。
            </p>
            {error && (
              <p className="s3-photo-error" role="alert">
                {error}
              </p>
            )}
          </aside>
        </div>
        <footer>
          <span>无图片上传 · 无服务器建模 · 无第三方调用</span>
          <button
            className="s3-primary"
            disabled={!result || busy}
            onClick={() => {
              if (result) onCreate(result.project);
            }}
          >
            打开三维模型
          </button>
        </footer>
      </div>
    </div>
  );
}
