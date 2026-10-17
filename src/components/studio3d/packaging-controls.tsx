"use client";
import { useEffect, useRef, useState } from "react";
import { Download, ImagePlus, X, Maximize2 } from "lucide-react";
import {
  cartonNet,
  dielineSvg,
  netLines,
  wrapBand,
} from "@/lib/studio3d/packaging";
import { normalizeLabel, type StudioProject } from "@/lib/studio3d/project";

function saveFile(data: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  return (
    <label className="s3-field">
      <span>
        {label}
        <output>
          {Number(value.toFixed(1))}
          {suffix}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
const FACE_COLORS = [
  "#cbd9c6",
  "#e2cdb1",
  "#becfd7",
  "#e3d5c5",
  "#deddd5",
  "#d1ddc8",
  "#e5d9c9",
];
export function NetPreview({ project: p }: { project: StudioProject }) {
  const net = cartonNet(p.width, p.height, p.depth);
  return (
    <svg
      className="s3-net"
      aria-label="标准插口盒展开图"
      role="img"
      viewBox={`-3 -3 ${net.width + 6} ${net.height + 6}`}
    >
      {net.panels.map((q, i) => (
        <g key={q.id}>
          <rect
            x={q.x}
            y={q.y}
            width={q.width}
            height={q.height}
            fill={
              p.packaging?.artwork
                ? "#faf8f2"
                : FACE_COLORS[i % FACE_COLORS.length]
            }
          />
        </g>
      ))}
      {p.packaging?.artwork && (
        <image
          href={p.packaging.artwork}
          x={0}
          y={0}
          width={net.width}
          height={net.height}
          preserveAspectRatio="xMidYMid meet"
        />
      )}
      {netLines(net).map((l, i) => (
        <line
          key={i}
          x1={l.axis === "h" ? l.start : l.at}
          y1={l.axis === "h" ? l.at : l.start}
          x2={l.axis === "h" ? l.end : l.at}
          y2={l.axis === "h" ? l.at : l.end}
          stroke={l.fold ? "#387cbb" : "#c26464"}
          strokeWidth={0.65}
          strokeDasharray={l.fold ? "2 1" : undefined}
        />
      ))}
      {!p.packaging?.artwork &&
        net.panels.map((q) => (
          <text
            key={q.id}
            x={q.x + q.width / 2}
            y={q.y + q.height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={Math.min(6, q.height / 3, q.width / 3)}
            fill="#34483b"
          >
            {q.name}
          </text>
        ))}
    </svg>
  );
}
/** Deliberately named demo: deterministic original artwork, not a reconstructed brand. */
function sampleArtwork(p: StudioProject, carton: boolean) {
  const net = cartonNet(p.width, p.height, p.depth),
    band = wrapBand(p);
  const aspect = carton
    ? net.width / net.height
    : band.circumference / band.height;
  const c = document.createElement("canvas");
  c.width = Math.round(1800 * Math.min(1, aspect));
  c.height = Math.round(1800 / Math.max(1, aspect));
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#eee9dd";
  ctx.fillRect(0, 0, c.width, c.height);
  if (carton) {
    const sx = c.width / net.width,
      sy = c.height / net.height;
    net.panels.forEach((q, i) => {
      ctx.fillStyle = FACE_COLORS[i % FACE_COLORS.length];
      ctx.fillRect(q.x * sx, q.y * sy, q.width * sx, q.height * sy);
      ctx.save();
      ctx.beginPath();
      ctx.rect(q.x * sx, q.y * sy, q.width * sx, q.height * sy);
      ctx.clip();
      ctx.translate((q.x + q.width / 2) * sx, (q.y + q.height / 2) * sy);
      const font = Math.min((q.width * sx) / 6, (q.height * sy) / 5);
      ctx.fillStyle = "#304c3b";
      ctx.textAlign = "center";
      ctx.font = `600 ${font}px sans-serif`;
      ctx.fillText(q.name, 0, 0);
      if (["front", "back", "left", "right"].includes(q.id)) {
        ctx.font = `${font * 0.45}px sans-serif`;
        ctx.fillText("NAUMI · DEMO", 0, font * 1.2);
        ctx.beginPath();
        ctx.moveTo(0, -font * 1.2);
        ctx.lineTo(0, -font * 2);
        ctx.lineTo(-font * 0.25, -font * 1.7);
        ctx.moveTo(0, -font * 2);
        ctx.lineTo(font * 0.25, -font * 1.7);
        ctx.strokeStyle = "#304c3b";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    });
  } else {
    ctx.fillStyle = "#416854";
    ctx.fillRect(c.width * 0.25, 0, c.width * 0.5, c.height);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${c.height * 0.18}px sans-serif`;
    ctx.fillText("NAUMI", c.width * 0.5, c.height * 0.46);
    ctx.font = `${c.height * 0.07}px sans-serif`;
    ctx.fillText("STUDIO / DEMO", c.width * 0.5, c.height * 0.65);
    ctx.fillStyle = "#416854";
    ctx.font = `${c.height * 0.08}px sans-serif`;
    ctx.fillText("BACK", c.width * 0.12, c.height * 0.48);
    ctx.fillText("360°", c.width * 0.88, c.height * 0.48);
  }
  return c.toDataURL("image/png");
}

export function PackagingControls({
  project: p,
  onChange: patch,
  onError,
}: {
  project: StudioProject;
  onChange: (v: Partial<StudioProject>) => void;
  onError: (e: string) => void;
}) {
  const file = useRef<HTMLInputElement>(null),
    [uploading, setUploading] = useState(false),
    [large, setLarge] = useState(false),
    [mismatch, setMismatch] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const carton = !!p.packaging,
    enabled = !!p.wrap;
  const net = cartonNet(p.width, p.height, p.depth),
    band = wrapBand(p);
  const artwork = carton ? p.packaging!.artwork : p.label;
  const setArtwork = (image: string | null) =>
    carton
      ? patch({ packaging: { ...p.packaging!, artwork: image } })
      : patch({ label: image });
  const setWrap = (value: Partial<NonNullable<StudioProject["wrap"]>>) =>
    patch({ wrap: { ...p.wrap!, ...value } });
  return (
    <div className="s3-packaging-controls">
      {!carton && (
        <>
          <div className="s3-divider" />
          <h2>标签方式</h2>
          <div className="s3-options">
            <button
              aria-pressed={!enabled}
              onClick={() =>
                patch({ version: p.photo ? 2 : 1, wrap: undefined })
              }
            >
              {p.photo ? "照片外观" : "局部贴图"}
            </button>
            <button
              aria-pressed={enabled}
              onClick={() =>
                patch({
                  version: 3,
                  wrap: {
                    height: Math.min(40, p.height * 0.4),
                    center: 0.33,
                    rotation: 0,
                  },
                })
              }
            >
              360° 环绕
            </button>
          </div>
        </>
      )}
      {(carton || enabled) && (
        <>
          <h2>{carton ? "刀模折叠" : "整圈标签"}</h2>
          {carton && (
            <>
              <div className="s3-options">
                <button
                  aria-pressed={p.packaging!.fold === 0}
                  onClick={() =>
                    patch({
                      packaging: { ...p.packaging!, fold: 0 },
                      camera: null,
                    })
                  }
                >
                  展开
                </button>
                <button
                  aria-pressed={p.packaging!.fold === 100}
                  onClick={() =>
                    patch({
                      packaging: { ...p.packaging!, fold: 100 },
                      camera: null,
                    })
                  }
                >
                  折成盒
                </button>
              </div>
              <Slider
                label="折叠程度"
                value={p.packaging!.fold}
                min={0}
                max={100}
                suffix="%"
                onChange={(fold) =>
                  patch({ packaging: { ...p.packaging!, fold }, camera: null })
                }
              />
              <button
                className="s3-net-button"
                aria-label="放大展开图"
                onClick={() => setLarge(true)}
              >
                <NetPreview project={p} />
                <Maximize2 size={14} />
              </button>
              <div className="s3-net-legend">
                <span>红实线：切线</span>
                <span>蓝虚线：折线</span>
              </div>
              <button
                className="s3-upload"
                onClick={() =>
                  saveFile(
                    dielineSvg(p.width, p.height, p.depth),
                    `插口盒-${p.width}x${p.height}x${p.depth}.svg`,
                    "image/svg+xml",
                  )
                }
              >
                <Download size={15} />
                下载刀模模板 SVG
              </button>
              <p className="s3-hint">
                标准盒型结构预览，未计纸厚与生产公差。按模板画板排版后上传设计稿。
              </p>
            </>
          )}
          <input
            ref={file}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp"
            aria-label={carton ? "上传展开设计稿" : "上传环绕标签"}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setUploading(true);
              setMismatch("");
              try {
                const data = await normalizeLabel(f);
                const img = new Image();
                img.src = data;
                await img.decode();
                if (!alive.current) return;
                const target = carton
                  ? net.width / net.height
                  : band.circumference / band.height;
                if (Math.abs(img.width / img.height / target - 1) > 0.03)
                  setMismatch(
                    "画板比例不同，已完整保留并留白；请按模板尺寸排版。",
                  );
                setArtwork(data);
              } catch (e) {
                if (alive.current)
                  onError(e instanceof Error ? e.message : "贴图处理失败");
              } finally {
                if (alive.current) setUploading(false);
              }
            }}
          />
          {artwork && (
            <div className="s3-label-preview">
              <img src={artwork} alt={carton ? "展开设计稿" : "环绕标签"} />
              <button
                aria-label="移除包装设计稿"
                onClick={() => setArtwork(null)}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <button
            disabled={uploading}
            className="s3-upload"
            onClick={() => file.current?.click()}
          >
            <ImagePlus size={17} />
            {uploading
              ? "正在读取…"
              : carton
                ? "上传展开设计稿"
                : "上传整圈标签"}
            <small>PNG · JPG · WebP</small>
          </button>
          {mismatch && (
            <p className="s3-hint" role="status">
              {mismatch}
            </p>
          )}
          <button
            disabled={uploading}
            className="s3-upload"
            onClick={() => {
              setMismatch("");
              setArtwork(sampleArtwork(p, carton));
            }}
          >
            试用示例设计
          </button>
          {!carton && (
            <>
              <p className="s3-hint">
                标签画板 {band.circumference.toFixed(1)} ×{" "}
                {band.height.toFixed(1)} mm · 接缝默认在背面
              </p>
              <Slider
                label="标签高度"
                value={band.height}
                min={1}
                max={Math.min(
                  300,
                  p.height *
                    (p.photo ? 0.89 : p.template === "jar" ? 0.62 : 0.53),
                )}
                suffix=" mm"
                onChange={(height) => setWrap({ height })}
              />
              <Slider
                label="标签上下位置"
                value={band.center / p.height}
                min={0.05}
                max={0.95}
                step={0.01}
                onChange={(center) => setWrap({ center })}
              />
              <Slider
                label="标签环绕角度"
                value={p.wrap!.rotation}
                min={-180}
                max={180}
                suffix="°"
                onChange={(rotation) => setWrap({ rotation })}
              />
              {p.photo && (
                <p className="s3-hint">
                  保留照片轮廓，改用统一底色与完整标签；锥面贴合为近似。
                </p>
              )}
            </>
          )}
        </>
      )}
      {large && (
        <div
          className="s3-net-modal"
          role="dialog"
          aria-modal="true"
          aria-label="包装展开图"
          onKeyDown={(e) => {
            if (e.key === "Escape") setLarge(false);
          }}
        >
          <div>
            <header>
              <strong>
                标准插口盒 · {net.width.toFixed(1)} × {net.height.toFixed(1)} mm
              </strong>
              <button
                autoFocus
                aria-label="关闭展开图"
                onClick={() => setLarge(false)}
              >
                <X size={18} />
              </button>
            </header>
            <NetPreview project={p} />
            <p>红实线：切线　蓝虚线：折线</p>
          </div>
        </div>
      )}
    </div>
  );
}
