"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Box,
  Camera,
  Check,
  ChevronRight,
  Download,
  FolderOpen,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Move3D,
  Package,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useFeatureAccess } from "@/lib/feature-access/client";
import {
  base64ToBinary,
  binaryToBase64,
  MATERIALS,
  LIGHTS,
  TEMPLATES,
  VIEWS,
  newProject,
  normalizeLabel,
  outputDimensions,
  parseProject,
  validateGlb,
  MAX_MODEL_BYTES,
  MAX_PROJECT_BYTES,
  type StudioProject,
} from "@/lib/studio3d/project";
import {
  deleteProject,
  listProjects,
  saveProject,
} from "@/lib/studio3d/storage";
import type { StudioEngine } from "@/lib/studio3d/engine";
import "./studio3d.css";
import { PhotoImport } from "./photo-import";
import { PackagingControls } from "./packaging-controls";
import { newCartonProject, newWrapProject } from "@/lib/studio3d/packaging";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function errorMessage(error: unknown) {
  return error instanceof Error && error.name !== "ZodError"
    ? error.message
    : "工程数据格式无效，请选择完整的 .naumi3d 工程";
}

function Viewport({
  project,
  onEngine,
  onCamera,
  onError,
  onLoading,
}: {
  project: StudioProject;
  onEngine: (engine: StudioEngine | null) => void;
  onCamera: (camera: StudioProject["camera"]) => void;
  onError: (error: string) => void;
  onLoading: (value: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    callbacks = useRef({ onEngine, onCamera, onError, onLoading });
  callbacks.current = { onEngine, onCamera, onError, onLoading };
  const [engine, setEngine] = useState<StudioEngine | null>(null);
  useEffect(() => {
    let disposed = false,
      instance: StudioEngine | undefined;
    void import("@/lib/studio3d/engine")
      .then(({ StudioEngine }) => {
        if (disposed || !host.current) return;
        instance = new StudioEngine(
          host.current,
          (camera) => callbacks.current.onCamera(camera),
          (error) => {
            callbacks.current.onLoading(true);
            callbacks.current.onError(error);
          },
        );
        setEngine(instance);
        callbacks.current.onEngine(instance);
      })
      .catch((error) => callbacks.current.onError(errorMessage(error)));
    return () => {
      disposed = true;
      instance?.dispose();
      callbacks.current.onEngine(null);
    };
  }, []);
  useEffect(() => {
    if (!engine) return;
    let active = true;
    callbacks.current.onLoading(true);
    void engine
      .update(project)
      .then((applied) => {
        if (active && applied) callbacks.current.onLoading(false);
      })
      .catch((error) => {
        if (active) callbacks.current.onError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [engine, project]);
  return (
    <div ref={host} className="s3-viewport" data-testid="studio-viewport" />
  );
}

function Field({
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
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <label className="s3-field">
      <span>
        {label}
        <output>
          {Number(value.toFixed(2))}
          {suffix}
        </output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
function Color({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="s3-color">
      <span>{label}</span>
      <span>
        <small>{value.toUpperCase()}</small>
        <input
          aria-label={label}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}

export function Studio3dClient() {
  const { user, ready } = useAuth(),
    access = useFeatureAccess();
  if (!ready || !access.ready)
    return <div className="s3-loading">加载工作台…</div>;
  if (!access.can("studio3d"))
    return <div className="s3-loading">此页面尚未授权</div>;
  return (
    <StudioWorkspace
      key={user?.email.toLowerCase() || "guest"}
      owner={user?.email.toLowerCase() || "guest"}
    />
  );
}

export function StudioWorkspace({ owner }: { owner: string }) {
  const [photoOpen, setPhotoOpen] = useState(false);
  const [projects, setProjects] = useState<StudioProject[]>([]),
    [project, setProject] = useState<StudioProject | null>(null);
  const [tab, setTab] = useState("product"),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [busy, setBusy] = useState(""),
    [loading, setLoading] = useState(true),
    [saved, setSaved] = useState(true);
  const [libraryLoading, setLibraryLoading] = useState(true),
    [engine, setEngine] = useState<StudioEngine | null>(null);
  const [sceneError, setSceneError] = useState("");
  const sceneFailed = useCallback((value: string) => {
    setSceneError(value);
    setLoading(false);
  }, []);
  const sceneLoading = useCallback((value: boolean) => {
    if (value) setSceneError("");
    setLoading(value);
  }, []);
  const file = useRef<HTMLInputElement>(null),
    model = useRef<HTMLInputElement>(null),
    label = useRef<HTMLInputElement>(null),
    revision = useRef(0);
  const refresh = useCallback(async () => {
    setProjects(await listProjects(owner));
  }, [owner]);
  useEffect(() => {
    let live = true;
    listProjects(owner)
      .then((rows) => {
        if (live) setProjects(rows);
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      })
      .finally(() => {
        if (live) setLibraryLoading(false);
      });
    return () => {
      live = false;
    };
  }, [owner]);
  useEffect(() => {
    if (saved || !project) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saved, project]);
  const patch = useCallback((value: Partial<StudioProject>) => {
    revision.current++;
    setSaved(false);
    setProject((p) => (p ? { ...p, ...value } : p));
    setMessage("");
  }, []);
  const camera = useCallback(
    (value: StudioProject["camera"]) => patch({ camera: value }),
    [patch],
  );
  const run = async (title: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(title);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  };
  function open(p: StudioProject, clean = false) {
    setProject(p);
    setSaved(clean);
    setError("");
    setMessage("");
    setLoading(true);
    setSceneError("");
    setTab("product");
    revision.current++;
  }
  const leave = () => {
    if (!saved && !window.confirm("当前修改尚未保存，仍要返回项目列表吗？"))
      return;
    setProject(null);
    setError("");
    setMessage("");
  };
  const save = () =>
    run("保存工程", async () => {
      if (!project) return;
      const rev = revision.current,
        snapshot = {
          ...project,
          camera: engine?.pose() || project.camera,
          updatedAt: new Date().toISOString(),
          cover:
            engine && !sceneError && !loading
              ? engine.thumbnail()
              : project.cover,
        };
      await saveProject(owner, snapshot);
      await refresh();
      if (rev === revision.current) setSaved(true);
      setMessage("已保存到此浏览器");
    });
  const importProject = (f: File) =>
    run("导入工程", async () => {
      if (f.size > MAX_PROJECT_BYTES) throw Error("工程文件超过 38MB");
      const p = parseProject(await f.text());
      if (p.model) validateGlb(base64ToBinary(p.model));
      open({
        ...p,
        id: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
      });
    });
  const importModel = (f: File) =>
    run("导入模型", async () => {
      if (f.size > MAX_MODEL_BYTES) throw Error("请选择 20MB 以内的 GLB 模型");
      const bytes = await f.arrayBuffer();
      validateGlb(bytes);
      const p = {
        ...newProject("bottle"),
        template: "imported" as const,
        name: f.name.replace(/\.glb$/i, "").slice(0, 80) || "导入模型",
        modelName: f.name.slice(0, 120),
        model: binaryToBase64(new Uint8Array(bytes)),
      };
      open(p);
    });
  const hiddenFiles = (
    <>
      <input
        ref={file}
        hidden
        type="file"
        accept=".naumi3d,application/json"
        aria-label="导入工程文件"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importProject(f);
        }}
      />
      <input
        ref={model}
        hidden
        type="file"
        accept=".glb,model/gltf-binary"
        aria-label="导入GLB模型"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importModel(f);
        }}
      />
      <input
        ref={label}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="上传标签贴图"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f)
            void run("处理贴图", async () =>
              patch({ label: await normalizeLabel(f) }),
            );
        }}
      />
    </>
  );
  const notice = (
    <>
      {error && (
        <div className="s3-notice s3-error" role="alert">
          {error}
          <button aria-label="关闭错误" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {message && (
        <div className="s3-notice" role="status">
          <Check size={15} />
          {message}
        </div>
      )}
    </>
  );
  if (!project)
    return (
      <section className="s3 s3-library">
        {photoOpen && (
          <PhotoImport
            onClose={() => setPhotoOpen(false)}
            onCreate={(p) => {
              setPhotoOpen(false);
              open(p);
            }}
          />
        )}
        {hiddenFiles}
        <header className="s3-library-header">
          <div>
            <h1>
              <Box size={28} />
              3D 工作台
            </h1>
          </div>
          <div className="s3-actions">
            <button
              className="s3-primary"
              disabled={!!busy}
              onClick={() => setPhotoOpen(true)}
            >
              <ImagePlus size={16} />
              上传照片建模
            </button>
            <button disabled={!!busy} onClick={() => file.current?.click()}>
              <FolderOpen size={16} />
              导入工程
            </button>
            <button disabled={!!busy} onClick={() => model.current?.click()}>
              <Upload size={16} />
              导入 GLB
            </button>
          </div>
        </header>
        {notice}
        <div className="s3-packaging-entry">
          <button disabled={!!busy} onClick={() => open(newCartonProject())}>
            <Package size={25} />
            <span>
              <strong>刀模折叠成盒</strong>
              <small>标准插口盒 · 六面设计 · 展开与折叠</small>
            </span>
            <ChevronRight size={18} />
          </button>
          <button disabled={!!busy} onClick={() => open(newWrapProject())}>
            <RotateCcw size={25} />
            <span>
              <strong>瓶罐环绕标签</strong>
              <small>完整展开稿 · 360° 查看</small>
            </span>
            <ChevronRight size={18} />
          </button>
        </div>
        <section className="s3-new">
          <div className="s3-section-title">
            <h2>新建产品</h2>
            <span>参数化模型</span>
          </div>
          <div className="s3-template-grid">
            {TEMPLATES.map((t) => (
              <button
                disabled={!!busy}
                className="s3-template"
                key={t.id}
                onClick={() => open(newProject(t.id))}
              >
                <div
                  className={`s3-template-art s3-art-${t.id}`}
                  aria-hidden="true"
                >
                  <div className="s3-template-shadow" />
                  <div className="s3-object">
                    <i />
                    <b />
                    <em />
                  </div>
                </div>
                <div className="s3-template-title">
                  <div>
                    <strong>{t.name}</strong>
                    <small>{t.description}</small>
                  </div>
                  <span>
                    <Plus size={19} />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
        <section className="s3-recent">
          <div className="s3-section-title">
            <h2>
              最近项目 <span>{projects.length}</span>
            </h2>
            <small>保存在此浏览器 · 导出工程可备份或换设备继续</small>
          </div>
          {libraryLoading ? (
            <div className="s3-empty">
              <LoaderCircle className="s3-spin" />
              读取工程…
            </div>
          ) : projects.length ? (
            <div className="s3-project-grid">
              {projects.map((p) => (
                <article className="s3-project-card" key={p.id}>
                  <button
                    className="s3-project-open"
                    disabled={!!busy}
                    onClick={() => open(p, true)}
                  >
                    {p.cover ? (
                      <img src={p.cover} alt={p.name} />
                    ) : (
                      <div className="s3-cover-empty">
                        <Box size={38} />
                      </div>
                    )}
                    <strong>
                      {p.name}
                      <ArrowUpRight size={16} />
                    </strong>
                    <small>
                      {new Date(p.updatedAt).toLocaleString("zh-CN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </button>
                  <button
                    className="s3-delete"
                    aria-label={`删除${p.name}`}
                    disabled={!!busy}
                    onClick={() => {
                      if (window.confirm(`删除本机工程“${p.name}”？`))
                        void run("删除工程", async () => {
                          await deleteProject(owner, p.id);
                          await refresh();
                        });
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="s3-empty">
              <FolderOpen size={28} />
              <strong>还没有保存的项目</strong>
              <span>选择产品模板，或导入已有 GLB 模型</span>
            </div>
          )}
        </section>
      </section>
    );
  const imported =
      project.template === "imported" || project.template === "photo-lathe",
    [width, height] = outputDimensions(project),
    ready = !!engine && !loading && !busy && !sceneError;
  const exportImage = () =>
    run("渲染 PNG", async () => {
      if (engine) download(await engine.png(project), `${project.name}.png`);
      setMessage(`已导出 ${width} × ${height} PNG`);
    });
  const exportBatch = () =>
    run("渲染多视角", async () => {
      if (!engine) return;
      const JSZip = (await import("jszip")).default,
        zip = new JSZip();
      for (const view of ["front", "hero", "side", "back"] as const) {
        setBusy(`渲染 ${VIEWS[view]}`);
        zip.file(
          `${project.name}-${VIEWS[view]}.png`,
          await (await engine.png(project, view)).arrayBuffer(),
        );
      }
      download(
        await zip.generateAsync({ type: "blob" }),
        `${project.name}-四视角.zip`,
      );
      setMessage("已导出正面、45°、侧面和背面");
    });
  return (
    <section className="s3 s3-editor" aria-label="3D产品编辑器">
      {hiddenFiles}
      <header className="s3-editor-header">
        <button
          className="s3-icon"
          onClick={leave}
          disabled={!!busy}
          aria-label="返回项目"
        >
          <ArrowLeft size={19} />
        </button>
        <Box size={22} />
        <input
          className="s3-project-name"
          disabled={!!busy}
          aria-label="项目名称"
          maxLength={80}
          value={project.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
        <span className="s3-save-state">
          {saved ? (
            <>
              <Check size={13} />
              已保存
            </>
          ) : (
            "未保存"
          )}
        </span>
        <div className="s3-header-spacer" />
        <button
          onClick={() => void save()}
          disabled={!!busy || !project.name.trim()}
        >
          <Save size={15} />
          保存工程
        </button>
        <button
          className="s3-primary"
          onClick={() => void exportImage()}
          disabled={!ready}
        >
          <Download size={15} />
          导出图片
        </button>
      </header>
      {notice}
      <div className="s3-editor-grid">
        <aside className="s3-assets">
          <span className="s3-panel-heading">场景内容</span>
          <button
            className="s3-object-selected"
            onClick={() => setTab("product")}
          >
            <Package size={19} />
            <span>
              {imported
                ? project.photo
                  ? "照片轮廓 · 本机"
                  : project.modelName
                : project.packaging
                  ? "标准插口盒"
                  : TEMPLATES.find((t) => t.id === project.template)?.name}
              <small>
                {project.photo
                  ? "轴对称近似"
                  : imported
                    ? "GLB 模型"
                    : "参数化产品"}
              </small>
            </span>
            <ChevronRight size={14} />
          </button>
          <div className="s3-tree">
            <span>
              <Layers3 size={14} />
              {imported ? "原始网格与材质" : "主体与部件"}
            </span>
            {!imported && (
              <span>
                <ImagePlus size={14} />
                {project.packaging
                  ? project.packaging.artwork
                    ? "六面展开设计"
                    : "未添加展开设计"
                  : project.label
                    ? project.wrap
                      ? "整圈标签"
                      : "标签贴图"
                    : "未添加贴图"}
              </span>
            )}
            <button onClick={() => setTab("scene")}>
              <Sun size={14} />
              {LIGHTS[project.light]}
            </button>
            <button onClick={() => setTab("render")}>
              <Camera size={14} />
              渲染相机
            </button>
          </div>
          <div className="s3-asset-bottom">
            <span>
              <Move3D size={16} />
              真实三维模型
            </span>
            <small>
              拖动旋转 · 滚轮缩放
              <br />
              右键拖动平移
            </small>
            <button
              disabled={!ready}
              onClick={() =>
                void run("导出模型", async () => {
                  if (engine)
                    download(await engine.glb(), `${project.name}.glb`);
                })
              }
            >
              <Box size={15} />
              导出 GLB
            </button>
            <button
              disabled={!!busy || !project.name.trim()}
              onClick={() =>
                void run("导出工程", async () => {
                  const snapshot = {
                    ...project,
                    camera: engine?.pose() || project.camera,
                    updatedAt: new Date().toISOString(),
                  };
                  parseProject(JSON.stringify(snapshot));
                  download(
                    new Blob([JSON.stringify(snapshot)], {
                      type: "application/json",
                    }),
                    `${project.name}.naumi3d`,
                  );
                  setMessage("已导出可继续编辑的完整工程");
                })
              }
            >
              <FolderOpen size={15} />
              导出工程
            </button>
            <small>本机工程，未同步云端</small>
          </div>
        </aside>
        <main className="s3-stage">
          <div className="s3-stage-top">
            <span>
              <span className="s3-dot" />
              实时预览
            </span>
            <button
              disabled={!ready}
              onClick={() => patch({ camera: null, view: "hero" })}
            >
              <RotateCcw size={14} />
              重置视角
            </button>
          </div>
          <div className="s3-frame-area">
            <div className={`s3-frame s3-frame-${project.output}`}>
              <Viewport
                project={project}
                onEngine={setEngine}
                onCamera={camera}
                onError={sceneFailed}
                onLoading={sceneLoading}
              />
              {loading && (
                <div className="s3-stage-loading">
                  <LoaderCircle className="s3-spin" />
                  正在加载三维场景
                </div>
              )}
              {sceneError && (
                <div className="s3-stage-loading s3-scene-error" role="alert">
                  <Box size={24} />
                  <span>{sceneError}</span>
                  <small>工程数据保留，可先保存或导出工程。</small>
                </div>
              )}
            </div>
          </div>
          <div className="s3-view-strip">
            {Object.entries(VIEWS).map(([key, name]) => (
              <button
                key={key}
                disabled={!!busy || loading || !!sceneError}
                aria-pressed={project.view === key && !project.camera}
                onClick={() =>
                  patch({ view: key as StudioProject["view"], camera: null })
                }
              >
                {name}
              </button>
            ))}
          </div>
          <footer className="s3-stage-footer">
            <span>
              {project.output === "square"
                ? "1:1"
                : project.output === "portrait"
                  ? "3:4"
                  : "4:3"}{" "}
              · {width} × {height}
            </span>
            <span>WebGL · 实时渲染</span>
          </footer>
        </main>
        <aside className="s3-inspector">
          <div className="s3-tabs" role="tablist" aria-label="编辑参数">
            {[
              { id: "product", label: "产品", Icon: Box },
              { id: "material", label: "材质", Icon: SlidersHorizontal },
              { id: "scene", label: "场景", Icon: Sun },
              { id: "render", label: "出图", Icon: Camera },
            ].map((t) => (
              <button
                role="tab"
                key={t.id}
                aria-selected={tab === t.id}
                aria-controls={`s3-${t.id}`}
                id={`s3-tab-${t.id}`}
                onClick={() => setTab(t.id)}
              >
                <t.Icon size={16} />
                {t.label}
              </button>
            ))}
          </div>
          <fieldset
            disabled={!!busy}
            className="s3-panel"
            role="tabpanel"
            aria-labelledby={`s3-tab-${tab}`}
            id={`s3-${tab}`}
          >
            {project.photo && tab === "product" && (
              <>
                <h2>照片轮廓 · 近似模型</h2>
                <p className="s3-hint">
                  本机提取；背面待补充。当前尺寸
                  {project.photo.scaleSource === "assumed"
                    ? "按假定瓶高建立，非实测"
                    : "由你设定"}
                  。
                </p>
                <Field
                  label="照片模型直径"
                  value={project.width}
                  min={15}
                  max={250}
                  suffix=" mm"
                  onChange={(value) =>
                    patch({
                      width: value,
                      depth: value,
                      camera: null,
                      photo: { ...project.photo!, scaleSource: "user" },
                    })
                  }
                />
                <Field
                  label="照片模型高度"
                  value={project.height}
                  min={20}
                  max={350}
                  suffix=" mm"
                  onChange={(value) =>
                    patch({
                      height: value,
                      camera: null,
                      photo: { ...project.photo!, scaleSource: "user" },
                    })
                  }
                />
              </>
            )}
            {project.photo && !project.wrap && tab === "material" && (
              <>
                <h2>模型显示</h2>
                <div className="s3-options">
                  <button
                    aria-pressed={project.photo.textureMode === "photo"}
                    onClick={() =>
                      patch({
                        photo: { ...project.photo!, textureMode: "photo" },
                      })
                    }
                  >
                    原图外观
                  </button>
                  <button
                    aria-pressed={project.photo.textureMode === "clay"}
                    onClick={() =>
                      patch({
                        photo: { ...project.photo!, textureMode: "clay" },
                      })
                    }
                  >
                    检查白模
                  </button>
                </div>
                <p className="s3-hint">
                  原图外观保留拍摄时的反光。白模使用真实灯光；背面尚无照片依据。
                </p>
                <Color
                  label="白模颜色"
                  value={project.color}
                  onChange={(color) => patch({ color })}
                />
              </>
            )}
            {tab === "product" && (
              <>
                <h2>{imported ? "模型信息" : "产品尺寸"}</h2>
                {imported ? (
                  <>
                    <p className="s3-hint">
                      {project.photo
                        ? project.wrap
                          ? "照片轮廓 / 环绕标签"
                          : "照片正面投影 / 未知背面"
                        : project.modelName}
                    </p>
                    <p className="s3-hint">
                      {project.photo
                        ? "请从正面、侧面、背面检查近似形状，复杂物体仍需其他建模方式。"
                        : "保留导入模型的形状、贴图和材质。调整灯光、视角后即可渲染。"}
                    </p>
                  </>
                ) : (
                  <>
                    <Field
                      label={
                        project.template === "box" || project.packaging
                          ? "宽度"
                          : "直径"
                      }
                      value={project.width}
                      min={15}
                      max={250}
                      suffix=" mm"
                      onChange={(value) =>
                        patch({ width: value, camera: null })
                      }
                    />
                    <Field
                      label="高度"
                      value={project.height}
                      min={20}
                      max={350}
                      suffix=" mm"
                      onChange={(value) =>
                        patch({ height: value, camera: null })
                      }
                    />
                    {(project.template === "box" || project.packaging) && (
                      <Field
                        label="深度"
                        value={project.depth}
                        min={10}
                        max={250}
                        suffix=" mm"
                        onChange={(value) =>
                          patch({ depth: value, camera: null })
                        }
                      />
                    )}
                    {!project.packaging && !project.wrap && (
                      <>
                        <div className="s3-divider" />
                        <h2>标签贴图</h2>
                        {project.label ? (
                          <div className="s3-label-preview">
                            <img src={project.label} alt="当前标签" />
                            <button
                              aria-label="移除标签"
                              onClick={() => patch({ label: null })}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : null}
                        <button
                          className="s3-upload"
                          onClick={() => label.current?.click()}
                        >
                          <ImagePlus size={18} />
                          {project.label ? "更换贴图" : "上传标签 / 包装设计"}
                          <small>PNG · JPG · WebP</small>
                        </button>
                        {project.label && (
                          <>
                            <Field
                              label="贴图大小"
                              min={0.2}
                              max={1}
                              step={0.01}
                              value={project.labelScale}
                              onChange={(value) => patch({ labelScale: value })}
                            />
                            <Field
                              label="贴图位置"
                              min={0.2}
                              max={0.65}
                              step={0.01}
                              value={project.labelY}
                              onChange={(value) => patch({ labelY: value })}
                            />
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
                {(project.packaging ||
                  ["bottle", "jar", "photo-lathe"].includes(
                    project.template,
                  )) && (
                  <PackagingControls
                    project={project}
                    onChange={patch}
                    onError={setError}
                  />
                )}
                <div className="s3-divider" />
                <Field
                  label="产品旋转"
                  value={project.rotation}
                  min={-180}
                  max={180}
                  suffix="°"
                  onChange={(value) => patch({ rotation: value })}
                />
              </>
            )}
            {tab === "material" && (
              <>
                <h2>主体材质</h2>
                {imported && !project.wrap ? (
                  <p className="s3-hint">
                    {project.photo
                      ? "原图像素直接映射到前半面，不重画品牌文字。"
                      : "此模型使用 GLB 内嵌材质。参数化产品可直接编辑材质和标签。"}
                  </p>
                ) : (
                  <>
                    <div className="s3-options">
                      {Object.entries(MATERIALS).map(([key, name]) => (
                        <button
                          key={key}
                          aria-pressed={project.material === key}
                          onClick={() =>
                            patch({
                              material: key as StudioProject["material"],
                              roughness:
                                key === "matte"
                                  ? 0.5
                                  : key === "glass"
                                    ? 0.08
                                    : 0.2,
                            })
                          }
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                    <Color
                      label="主体颜色"
                      value={project.color}
                      onChange={(value) => patch({ color: value })}
                    />
                    {project.template !== "box" && (
                      <Color
                        label="盖子颜色"
                        value={project.capColor}
                        onChange={(value) => patch({ capColor: value })}
                      />
                    )}
                    <Field
                      label="表面粗糙度"
                      value={project.roughness}
                      min={0.02}
                      max={1}
                      step={0.01}
                      onChange={(value) => patch({ roughness: value })}
                    />
                    <div className="s3-swatches">
                      {[
                        "#708576",
                        "#e3d8c2",
                        "#a35c41",
                        "#eceae4",
                        "#303a37",
                        "#bac7d3",
                      ].map((color) => (
                        <button
                          aria-label={`主体色${color}`}
                          key={color}
                          style={{ background: color }}
                          onClick={() => patch({ color })}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
            {tab === "scene" && (
              <>
                <h2>灯光方案</h2>
                <div className="s3-light-presets">
                  {Object.entries(LIGHTS).map(([key, name]) => (
                    <button
                      key={key}
                      aria-pressed={project.light === key}
                      onClick={() =>
                        patch({
                          light: key as StudioProject["light"],
                          background:
                            key === "bright"
                              ? "#ffffff"
                              : key === "dramatic"
                                ? "#d3d1ce"
                                : "#f0eeea",
                        })
                      }
                    >
                      <span className={`s3-light-demo s3-light-${key}`}>
                        <i />
                      </span>
                      {name}
                    </button>
                  ))}
                </div>
                <Field
                  label="曝光"
                  value={project.exposure}
                  min={0.3}
                  max={2}
                  step={0.05}
                  onChange={(value) => patch({ exposure: value })}
                />
                <div className="s3-divider" />
                <h2>背景</h2>
                <Color
                  label="背景颜色"
                  value={project.background}
                  onChange={(value) => patch({ background: value })}
                />
              </>
            )}
            {tab === "render" && (
              <>
                <h2>画幅</h2>
                <div className="s3-options">
                  {[
                    { id: "square", name: "1:1" },
                    { id: "portrait", name: "3:4" },
                    { id: "landscape", name: "4:3" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      aria-pressed={project.output === item.id}
                      onClick={() =>
                        patch({
                          output: item.id as StudioProject["output"],
                          camera: null,
                        })
                      }
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
                <h2>输出尺寸</h2>
                <div className="s3-options">
                  {[1024, 2048, 4096].map((size) => (
                    <button
                      key={size}
                      aria-pressed={project.size === size}
                      onClick={() =>
                        patch({ size: size as StudioProject["size"] })
                      }
                    >
                      {size / 1024}K
                    </button>
                  ))}
                </div>
                <label className="s3-check">
                  <input
                    type="checkbox"
                    checked={project.transparent}
                    onChange={(e) => patch({ transparent: e.target.checked })}
                  />
                  透明背景 PNG
                </label>
                <p className="s3-hint">
                  {project.transparent
                    ? "透明导出不包含背景和地面阴影。"
                    : "按当前模型、材质、灯光和相机渲染。"}
                </p>
                <div className="s3-divider" />
                <h2>导出</h2>
                <button
                  className="s3-primary s3-full"
                  disabled={!ready}
                  onClick={() => void exportImage()}
                >
                  <Download size={16} />
                  当前视角 PNG
                </button>
                <button
                  className="s3-full"
                  disabled={!ready}
                  onClick={() => void exportBatch()}
                >
                  <Camera size={16} />
                  四视角打包 ZIP
                </button>
                <p className="s3-hint">同一模型 · 正面 / 45° / 侧面 / 背面</p>
                <div className="s3-mobile-export">
                  <div className="s3-divider" />
                  <button
                    className="s3-full"
                    disabled={!ready}
                    onClick={() =>
                      void run("导出模型", async () => {
                        if (engine)
                          download(await engine.glb(), `${project.name}.glb`);
                      })
                    }
                  >
                    <Box size={15} />
                    导出 GLB
                  </button>
                  <button
                    className="s3-full"
                    disabled={!!busy || !project.name.trim()}
                    onClick={() =>
                      void run("导出工程", async () => {
                        const snapshot = {
                          ...project,
                          camera: engine?.pose() || project.camera,
                          updatedAt: new Date().toISOString(),
                        };
                        parseProject(JSON.stringify(snapshot));
                        download(
                          new Blob([JSON.stringify(snapshot)], {
                            type: "application/json",
                          }),
                          `${project.name}.naumi3d`,
                        );
                      })
                    }
                  >
                    <FolderOpen size={15} />
                    导出工程
                  </button>
                  <p className="s3-hint">本机工程，未同步云端</p>
                </div>
              </>
            )}
          </fieldset>
        </aside>
      </div>
      {busy && (
        <div className="s3-busy" role="status">
          <LoaderCircle className="s3-spin" />
          {busy}…
        </div>
      )}
    </section>
  );
}
