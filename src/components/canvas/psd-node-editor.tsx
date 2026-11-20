"use client";
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { Psd } from "ag-psd";
import { canvasDocumentFetch, type CanvasDocumentScope } from "@/lib/canvas/document-scope";
import { canvasDownloadBrowser } from "@/lib/canvas/download-browser";
import { composePsd, type PsdEdits, type MaskStroke } from "@/lib/canvas/psd-document";
import { surfaceAppearanceClass, useSurfaceAppearance } from "@/components/ui/surface-appearance";

type Edit = PsdEdits[number];
type Mode = "move" | "erase" | "restore";
type Gesture = { x: number; y: number; start: Edit; points: MaskStroke["points"]; mode: Mode; radius: number };
const control = "canvas-ui-control rounded-md border px-2 py-1.5 text-sm disabled:opacity-40";
export function PsdNodeEditor({
  node,
  scope,
  english,
  readOnly,
  onClose,
  onSaved,
}: {
  node: { id: string; title: string };
  scope: CanvasDocumentScope;
  english: boolean;
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const L = (zh: string, en: string) => (english ? en : zh);
  const url = "/api/canvas/layered-psd/document?nodeId=" + encodeURIComponent(node.id);
  const dialog = useRef<HTMLDialogElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const brushTip = useRef<HTMLSpanElement>(null);
  const heading = useId(),
    appearance = useSurfaceAppearance() ?? "light";
  const [base, setBase] = useState<Psd>(),
    [edits, setEdits] = useState<PsdEdits>([]);
  const [saved, setSaved] = useState<PsdEdits>([]),
    [revision, setRevision] = useState(0);
  const [selected, select] = useState(0),
    [mode, setMode] = useState<Mode>("move"),
    [radius, setRadius] = useState(12);
  const [zoom, setZoom] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const undo = useRef<PsdEdits[]>([]),
    redo = useRef<PsdEdits[]>([]),
    gesture = useRef<Gesture | null>(null);
  const busyRef = useRef(false),
    session = useRef<AbortController | null>(null);
  const dirty = useMemo(() => JSON.stringify(edits) !== JSON.stringify(saved), [edits, saved]);
  const [draft, setDraft] = useState<Edit | null>(null);
  const paint = useMemo(() => {
    if (!base) return null;
    try {
      return composePsd(base, draft ? edits.map((l) => (l.index === draft.index ? draft : l)) : edits);
    } catch {
      return null;
    }
  }, [edits, base, draft]);

  useEffect(() => {
    const ctl = new AbortController();
    session.current = ctl;
    const d = dialog.current;
    d?.showModal();
    void (async () => {
      const res = await canvasDocumentFetch(scope, url, { signal: ctl.signal }, true);
      const doc = await res.json();
      if (!res.ok) throw Error(doc.error);
      const bytes = await canvasDocumentFetch(scope, doc.baseUrl, { signal: ctl.signal }, true);
      if (!bytes.ok) throw Error(L("原始图层读取失败", "Could not open original layers"));
      const { readPsd } = await import("ag-psd");
      const raw = readPsd(await bytes.arrayBuffer(), {
        useImageData: true,
        skipCompositeImageData: true,
        skipThumbnail: true,
      });
      ctl.signal.throwIfAborted();
      scope.assertView();
      setEdits(doc.edits);
      setSaved(doc.edits);
      setRevision(doc.revision);
      select(doc.edits.at(-1).index);
      setBase(raw);
    })().catch((e) => {
      if (!ctl.signal.aborted) setError(e.message);
    });
    return () => {
      ctl.abort();
      d?.close();
    };
    // One captured account/project/node per mounted dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!paint?.imageData || !canvas.current) return;
    const ctx = canvas.current.getContext("2d")!,
      img = ctx.createImageData(paint.width, paint.height);
    img.data.set(paint.imageData.data);
    ctx.putImageData(img, 0, 0);
  }, [paint]);
  const active = edits.find((l) => l.index === selected);
  function commit(next: PsdEdits) {
    if (readOnly || busyRef.current || JSON.stringify(next) === JSON.stringify(edits)) return;
    undo.current = [...undo.current.slice(-39), edits];
    redo.current = [];
    setEdits(next);
    setError("");
  }
  function history(back: boolean) {
    if (readOnly || busyRef.current) return;
    const from = back ? undo.current : redo.current,
      to = back ? redo.current : undo.current;
    const value = from.pop();
    if (value) {
      to.push(edits);
      setEdits(value);
    }
  }
  function change(patch: Partial<Edit>) {
    commit(edits.map((l) => (l.index === selected ? { ...l, ...patch } : l)));
  }
  function reorder(delta: number) {
    const list = [...edits],
      from = list.findIndex((l) => l.index === selected),
      to = from + delta;
    if (to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    commit(list);
  }
  function point(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
      Math.round(((e.clientX - rect.left) * base!.width) / rect.width),
      Math.round(((e.clientY - rect.top) * base!.height) / rect.height),
    ] as [number, number];
  }
  function showBrush(e: PointerEvent<HTMLCanvasElement>) {
    const tip = brushTip.current;
    if (!tip || !base || mode === "move" || readOnly || !active?.visible) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const size = (2 * radius * rect.width) / base.width;
    Object.assign(tip.style, {
      display: "block",
      width: size + "px",
      height: size + "px",
      left: e.clientX + "px",
      top: e.clientY + "px",
    });
  }
  function hideBrush() {
    if (brushTip.current) brushTip.current.style.display = "none";
  }
  function patchGesture(g: Gesture, x: number, y: number): Edit {
    if (g.mode === "move")
      return {
        ...g.start,
        x: Math.max(-8192, Math.min(8192, g.start.x + x - g.x)),
        y: Math.max(-8192, Math.min(8192, g.start.y + y - g.y)),
      };
    const pos: [number, number] = [
      Math.max(-8192, Math.min(8192, x - g.start.x)),
      Math.max(-8192, Math.min(8192, y - g.start.y)),
    ];
    if (g.points.length < 4096 && (pos[0] !== g.points.at(-1)?.[0] || pos[1] !== g.points.at(-1)?.[1]))
      g.points.push(pos);
    return {
      ...g.start,
      strokes: [...g.start.strokes, { restore: g.mode === "restore", radius: g.radius, points: g.points.slice() }],
    };
  }
  function down(e: PointerEvent<HTMLCanvasElement>) {
    if (!base || !active || readOnly || busyRef.current || gesture.current || e.button !== 0) return;
    const [x, y] = point(e);
    let target = active;
    if (mode === "move") {
      const hit = edits
        .slice()
        .reverse()
        .find((l) => {
          const p = base.children![l.index].imageData!,
            u = x - l.x,
            v = y - l.y;
          if (!l.visible || u < 0 || u >= p.width || v < 0 || v >= p.height) return false;
          const idx = (v * p.width + u) * 4,
            mask = paint?.children?.[edits.indexOf(l)].mask?.imageData;
          return p.data[idx + 3] * (mask ? mask.data[idx] / 255 : 1) > 8;
        });
      if (!hit) return;
      target = hit;
      select(hit.index);
    } else if (!target.visible) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { x, y, start: target, points: [], mode, radius };
    if (mode !== "move") setDraft(patchGesture(gesture.current, x, y));
  }
  function move(e: PointerEvent<HTMLCanvasElement>, finish: boolean) {
    const g = gesture.current;
    if (!g || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const next = patchGesture(g, ...point(e));
    if (finish) {
      gesture.current = null;
      setDraft(null);
      commit(edits.map((l) => (l.index === next.index ? next : l)));
    } else setDraft(next);
  }
  function close() {
    if (busyRef.current) return;
    if (dirty) setDiscard(true);
    else onClose();
  }
  async function action(download: "document" | "png" | "psd" | null) {
    if (!paint || busyRef.current || !session.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const signal = session.current.signal;
    let exportRevision = revision;
    try {
      if (dirty) {
        const r = await canvasDocumentFetch(
          scope,
          url,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            signal,
            body: JSON.stringify({ nodeId: node.id, revision, edits }),
          },
          true,
        );
        const reply = await r.json();
        if (!r.ok) throw Error(reply.error);
        scope.assertView();
        exportRevision = reply.revision;
        setRevision(reply.revision);
        setSaved(edits);
        await onSaved();
      }
      if (download) {
        const params = new URLSearchParams({ export: "1", revision: String(exportRevision) });
        let filename = node.title + ".psd";
        if (download !== "document") {
          params.set("layer", String(selected));
          params.set("format", download);
          const name = base!.children![selected].name || L("图层", "Layer");
          filename = `${selected + 1}-${name}.${download}`;
        }
        const r = await canvasDocumentFetch(scope, url + "&" + params, { signal }, true);
        if (!r.ok) throw Error((await r.json()).error);
        const blob = await r.blob();
        scope.assertView();
        canvasDownloadBrowser(scope).save(blob, filename.replace(/[\\/:*?"<>|]/g, "_"));
      }
    } catch (e) {
      if (!signal.aborted) setError(e instanceof Error ? e.message : L("操作失败", "Operation failed"));
    } finally {
      if (!signal.aborted) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }
  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={heading}
      data-canvas-hotkeys-blocked="true"
      className={
        surfaceAppearanceClass(appearance) +
        " canvas-ui-surface-solid m-auto w-[96vw] max-w-6xl max-h-[96dvh] overflow-auto rounded-xl border p-4 shadow-2xl backdrop:bg-[var(--canvas-ui-mask)]"
      }
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          history(!e.shiftKey);
        }
      }}
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 id={heading} className="font-semibold">
          {node.title}
        </h2>
        <button className={control} disabled={busy} onClick={close}>
          {L("关闭", "Close")}
        </button>
      </header>
      {error && (
        <p role="alert" className="mb-2 text-red-600">
          {error}
        </p>
      )}
      {!base && !error && <p role="status">{L("正在读取图层…", "Loading layers…")}</p>}
      {base && (
        <>
          <div className="grid gap-3 md:grid-cols-[1fr_15rem]">
            <div
              className="min-w-0 overflow-auto rounded-lg bg-[var(--canvas-ui-soft)]"
              style={{ height: "min(60dvh,660px)" }}
            >
              <canvas
                ref={canvas}
                tabIndex={0}
                aria-label={L("分层海报编辑区", "Layer editor canvas")}
                width={base.width}
                height={base.height}
                onKeyDown={(e) => {
                  const delta = (
                    { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<
                      string,
                      number[]
                    >
                  )[e.key];
                  if (!delta || !active || mode !== "move" || readOnly || busy) return;
                  e.preventDefault();
                  const step = e.shiftKey ? 10 : 1;
                  change({
                    x: Math.max(-8192, Math.min(8192, active.x + delta[0] * step)),
                    y: Math.max(-8192, Math.min(8192, active.y + delta[1] * step)),
                  });
                }}
                style={{
                  display: "block",
                  margin: "auto",
                  width: zoom ? base.width : undefined,
                  height: zoom ? base.height : undefined,
                  maxHeight: zoom ? "none" : "100%",
                  maxWidth: zoom ? "none" : "100%",
                  touchAction: "none",
                  cursor: mode === "move" ? "move" : "crosshair",
                  background: "repeating-conic-gradient(#ddd 0 25%,white 0 50%) 0 0/14px 14px",
                }}
                onPointerDown={down}
                onPointerMove={(e) => {
                  showBrush(e);
                  move(e, false);
                }}
                onPointerLeave={hideBrush}
                onPointerUp={(e) => move(e, true)}
                onLostPointerCapture={() => {
                  gesture.current = null;
                  setDraft(null);
                }}
              />
              {mode !== "move" && (
                <span
                  aria-hidden="true"
                  ref={brushTip}
                  className="pointer-events-none fixed z-10 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow-[0_0_0_1px_#222]"
                />
              )}
            </div>
            <aside>
              <div className="mb-2 flex gap-1">
                <button
                  className={control}
                  disabled={readOnly || busy || active === edits.at(-1)}
                  onClick={() => reorder(1)}
                >
                  {L("上移一层", "Raise")}
                </button>
                <button
                  className={control}
                  disabled={readOnly || busy || active === edits[0]}
                  onClick={() => reorder(-1)}
                >
                  {L("下移一层", "Lower")}
                </button>
              </div>
              <ul className="max-h-[44dvh] overflow-y-auto">
                {edits
                  .slice()
                  .reverse()
                  .map((l) => (
                    <li key={l.index} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={l.visible}
                        disabled={readOnly || busy}
                        aria-label={L("显示 ", "Show ") + base.children![l.index].name}
                        onChange={() =>
                          commit(edits.map((v) => (v.index === l.index ? { ...v, visible: !v.visible } : v)))
                        }
                      />
                      <button
                        aria-pressed={selected === l.index}
                        disabled={busy}
                        onClick={() => select(l.index)}
                        className={
                          "min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm " +
                          (selected === l.index ? "bg-[var(--canvas-ui-accent-soft)] font-semibold" : "")
                        }
                      >
                        {base.children![l.index].name}
                      </button>
                    </li>
                  ))}
              </ul>
              <fieldset disabled={busy || !paint || !active} className="mt-3 flex gap-2 border-t pt-2">
                <legend className="pr-2 text-sm font-medium">
                  {dirty
                    ? L("保存并导出选中图层", "Save and export selected layer")
                    : L("导出选中图层", "Export selected layer")}
                </legend>
                <button className={control} onClick={() => void action("png")}>
                  PNG
                </button>
                <button className={control} onClick={() => void action("psd")}>
                  PSD
                </button>
              </fieldset>
            </aside>
          </div>
          <div className="my-3 flex flex-wrap items-center gap-2">
            {(["move", "erase", "restore"] as const).map((m, i) => (
              <button
                key={m}
                className={control + (mode === m ? " ring-2 ring-current font-medium" : "")}
                aria-pressed={mode === m}
                disabled={readOnly || busy}
                onClick={() => {
                  hideBrush();
                  setMode(m);
                }}
              >
                {[L("移动", "Move"), L("蒙版擦除", "Mask erase"), L("蒙版恢复", "Mask restore")][i]}
              </button>
            ))}
            {mode !== "move" && (
              <label className="text-sm">
                {L("笔刷半径", "Brush radius")} {radius}px{" "}
                <input
                  type="range"
                  min={1}
                  max={128}
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                />
              </label>
            )}
            <button className={control} aria-pressed={zoom} onClick={() => setZoom(!zoom)}>
              {zoom ? L("适应窗口", "Fit") : "100%"}
            </button>
            <button className={control} disabled={busy || !undo.current.length} onClick={() => history(true)}>
              {L("撤销", "Undo")}
            </button>
            <button className={control} disabled={busy || !redo.current.length} onClick={() => history(false)}>
              {L("重做", "Redo")}
            </button>
          </div>
          <footer className="flex flex-wrap items-center justify-end gap-2">
            <span role="status" className="mr-auto text-sm">
              {busy ? L("处理中…", "Working…") : dirty ? L("未保存", "Unsaved") : L("已保存", "Saved")}
            </span>
            <button
              className={control}
              disabled={busy || !paint || !dirty || readOnly}
              onClick={() => void action(null)}
            >
              {L("保存", "Save")}
            </button>
            <button
              className="canvas-ui-primary rounded-md px-3 py-2 text-sm"
              disabled={busy || !paint}
              onClick={() => void action("document")}
            >
              {dirty ? L("保存并导出 PSD", "Save and export PSD") : L("导出 PSD", "Export PSD")}
            </button>
          </footer>
          {!paint && (
            <p role="alert">
              {L("无法合成当前编辑，请撤销最后一步。", "Cannot composite these edits. Undo the last step.")}
            </p>
          )}
        </>
      )}
      {discard && (
        <div role="alert" className="mt-3 flex items-center justify-end gap-2">
          <span>{L("放弃未保存的修改？", "Discard unsaved changes?")}</span>
          <button className={control} onClick={() => setDiscard(false)}>
            {L("继续编辑", "Keep editing")}
          </button>
          <button className={control} onClick={onClose}>
            {L("放弃修改", "Discard")}
          </button>
        </div>
      )}
    </dialog>,
    document.body,
  );
}
