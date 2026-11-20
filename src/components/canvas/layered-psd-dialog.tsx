"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, LoaderCircle, X } from "lucide-react";
import { CachedImage } from "@/components/cached-image";
import { surfaceAppearanceClass, useSurfaceAppearance } from "@/components/ui/surface-appearance";
import { browserRandomUUID } from "@/lib/browser-crypto";
import { isTerminalBillingFailure, readBillingSubmissionResponse } from "@/lib/billing/client-response";
import { canvasDocumentFetch, type CanvasDocumentScope } from "@/lib/canvas/document-scope";
import { canvasDownloadBrowser } from "@/lib/canvas/download-browser";

const PATH = "/api/canvas/layered-psd";
type Quote = { version: number; credits: number; pilotOperationId?: string };
type Preview = {
  width: number;
  height: number;
  scale: number;
  file: Blob;
  layers: { name: string; x: number; y: number; image: HTMLCanvasElement }[];
};

export type LayeredPsdSelection = { id: string; image: string; title: string; scope: CanvasDocumentScope };

async function readPreview(response: Response, signal: AbortSignal): Promise<Preview> {
  if (!response.ok || response.headers.get("content-type") !== "image/vnd.adobe.photoshop") throw new Error("PSD unavailable");
  const file = await response.blob();
  const { readPsd } = await import("ag-psd");
  signal.throwIfAborted();
  const psd = readPsd(await file.arrayBuffer(), { useImageData: true, skipCompositeImageData: true, skipThumbnail: true });
  signal.throwIfAborted();
  const scale = Math.min(1, 768 / Math.max(psd.width, psd.height));
  const source = document.createElement("canvas");
  const layers = psd.children?.map((layer, index) => {
    const pixels = layer.imageData;
    if (!pixels) throw new Error("Missing PSD layer");
    source.width = pixels.width;
    source.height = pixels.height;
    const sourceContext = source.getContext("2d")!;
    const frame = sourceContext.createImageData(pixels.width, pixels.height);
    frame.data.set(pixels.data);
    sourceContext.putImageData(frame, 0, 0);
    const image = document.createElement("canvas");
    image.width = Math.max(1, Math.round(pixels.width * scale));
    image.height = Math.max(1, Math.round(pixels.height * scale));
    image.getContext("2d")!.drawImage(source, 0, 0, image.width, image.height);
    return { name: layer.name || String(index + 1), x: layer.left ?? 0, y: layer.top ?? 0, image };
  });
  source.width = 0;
  if (!layers || layers.length < 2) throw new Error("Missing PSD layers");
  return { file, width: psd.width, height: psd.height, scale, layers };
}

export function LayeredPsdDialog({ selection, english, onClose, onSettled, onChild }: {
  selection: LayeredPsdSelection;
  english: boolean;
  onClose: () => void;
  onSettled: () => void;
  onChild?: (id:string)=>Promise<void>;
}) {
  const { id, image, title, scope } = selection;
  const L = (zh: string, en: string) => english ? en : zh;
  const appearance = useSurfaceAppearance() ?? "light";
  const headingId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const composite = useRef<HTMLCanvasElement>(null);
  const connection = useRef<AbortController | null>(null);
  const running = useRef(false);
  const sourceImage = image.split("?", 1)[0];
  const storageKey = "naumi-layered-psd:" + JSON.stringify([scope.key, id, sourceImage]);
  const [quote, setQuote] = useState<Quote>();
  const [operation, setOperation] = useState<string>();
  const [preview, setPreview] = useState<Preview>();
  const [attachment,setAttachment]=useState<"saved"|"failed"|"saving">();
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState<"read" | "submit" | null>("read");
  const [state, setState] = useState<"pending" | "export_incomplete" | "failed" | "unavailable" | "file" | "storage">();

  function request(url: string, signal: AbortSignal, init?: RequestInit) {
    return canvasDocumentFetch(scope, url, { ...init, signal }, true);
  }

  async function loadQuote(signal: AbortSignal) {
    setQuote(undefined);
    try {
      const response = await request(PATH, signal);
      const value = await response.json();
      if (!response.ok || !Number.isSafeInteger(value.version) || !Number.isSafeInteger(value.credits)) throw new Error("Quote unavailable");
      if (!signal.aborted && scope.viewCurrent()) {
        setQuote(value);
        if(value.pilotOperationId && onChild){
          const prior=await request(PATH+"?operationId="+encodeURIComponent(value.pilotOperationId)+"&sourceId="+encodeURIComponent(id),signal);
          if(prior.ok && (await prior.json()).state==="ready" && !signal.aborted && scope.viewCurrent()){
            setOperation(value.pilotOperationId);
            await inspect(value.pilotOperationId,signal);
          }
        }
      }
    } catch {
      if (!signal.aborted && scope.viewCurrent()) setState("unavailable");
    }
  }

  async function attach(operationId:string,signal:AbortSignal){
    if(!onChild)return;
    setAttachment("saving");
    try{
      const r=await request(PATH+"/document",signal,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sourceId:id,operationId})});
      const result=await r.json();if(!r.ok||!result.nodeId)throw Error();
      scope.assertView();await onChild(result.nodeId);
      if(!signal.aborted)setAttachment("saved");
    }catch{if(!signal.aborted)setAttachment("failed")}
  }
  async function inspect(operationId: string, signal: AbortSignal) {
    const url = `${PATH}?operationId=${encodeURIComponent(operationId)}`;
    let fileAvailable = false;
    try {
      const response = await request(url, signal);
      const body = await response.json();
      if (signal.aborted || !scope.viewCurrent()) return;
      if (response.ok && body.state === "ready") {
        fileAvailable = true;
        const data = await readPreview(await request(url + "&file=1", signal), signal);
        if (signal.aborted || !scope.viewCurrent()) return;
        setHidden(new Set());
        setPreview(data);
        setState(undefined);
        await attach(operationId,signal);
        onSettled();
      } else if (response.ok && body.state === "failed") {
        forget();
        setState("failed");
        onSettled();
        await loadQuote(signal);
      } else {
        setState(response.ok && body.state === "export_incomplete" ? "export_incomplete" : "pending");
      }
    } catch {
      if (!signal.aborted && scope.viewCurrent()) setState(fileAvailable ? "file" : "pending");
    }
  }

  function forget() {
    try { window.sessionStorage.removeItem(storageKey); } catch { /* Retaining the original ID is safe. */ }
    setOperation(undefined);
  }

  useEffect(() => {
    const element = dialog.current;
    const controller = new AbortController();
    connection.current = controller;
    running.current = true;
    element?.showModal();
    let prior: string | null = null;
    try { prior = window.sessionStorage.getItem(storageKey); } catch { setState("storage"); }
    if (prior) setOperation(prior);
    const load = prior ? inspect(prior, controller.signal) : loadQuote(controller.signal);
    void load.finally(() => {
      if (!controller.signal.aborted) { running.current = false; setBusy(null); }
    });
    return () => { controller.abort(); element?.close(); };
    // The mounted dialog represents one captured canvas selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const target = composite.current;
    if (!preview || !target) return;
    const context = target.getContext("2d");
    context?.clearRect(0, 0, target.width, target.height);
    preview.layers.forEach((layer, index) => {
      if (!hidden.has(index)) context?.drawImage(layer.image, Math.round(layer.x * preview.scale), Math.round(layer.y * preview.scale));
    });
  }, [preview, hidden]);

  async function start() {
    const signal = connection.current?.signal;
    if (!quote || !signal || signal.aborted || running.current || operation) return;
    running.current = true;
    setState(undefined);
    setBusy("submit");
    try {
      const operationId = quote.pilotOperationId || browserRandomUUID();
      try { window.sessionStorage.setItem(storageKey, operationId); }
      catch { setState("storage"); return; }
      setOperation(operationId);
      try {
        const response = await request(PATH, signal, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artworkId: id, sourceImage, operationId, credits: quote.credits, version: quote.version }),
        });
        const receipt = await readBillingSubmissionResponse(response, operationId);
        if (isTerminalBillingFailure(receipt.data, operationId)
          || receipt.data.accepted === false && receipt.data.operationId === operationId
          || [401, 403].includes(receipt.response.status)) {
          if (!signal.aborted) { forget(); setState("failed"); await loadQuote(signal); }
          return;
        }
      } catch { /* With a lost response, only query the original ID. */ }
      if (!signal.aborted && scope.viewCurrent()) {
        await inspect(operationId, signal);
      }
    } finally {
      if (!signal.aborted) { running.current = false; setBusy(null); }
    }
  }

  async function check() {
    const signal = connection.current?.signal;
    if (!operation || !signal || signal.aborted || running.current) return;
    running.current = true;
    setBusy("read");
    try { await inspect(operation, signal); }
    finally { if (!signal.aborted) { running.current = false; setBusy(null); } }
  }

  function download() {
    if (!preview || !scope.viewCurrent()) return;
    const name = title.replace(/[\\/:*?"<>|\p{Cc}]/gu, "").trim().slice(0, 100) || "Naumi";
    canvasDownloadBrowser(scope).save(preview.file, `${name}.psd`);
  }

  const status = busy === "submit" ? L("正在拆层，可关闭后从这张图查看原任务。", "Separating layers. You can close this window and return to this image.")
    : busy === "read" ? L("正在读取…", "Loading…")
    : state === "export_incomplete" ? L("图层已生成，PSD 导出未完成。请保留原任务编号：" + operation, "Layers generated. PSD export is incomplete. Keep request " + operation)
    : state === "pending" ? L("本次查询尚未取得结果，可稍后再查。", "The result is not available yet. Check again later.")
    : state === "file" ? L("图层文件暂时无法打开，请重新查询。", "The layered file could not be opened. Check the original request again.")
    : state === "failed" ? L("拆层未完成。", "Layers could not be generated.")
    : state === "unavailable" ? L("智能拆层暂未开放或暂不可用。", "Layer separation is currently unavailable.")
    : state === "storage" ? L("浏览器无法保存任务编号，请打开站点存储后重试。", "Allow site storage so the original request can be recovered.")
    : preview ? null : L("将图片中的主要元素拆成可独立编辑的像素图层。", "Separate the main elements into individually editable pixel layers.");

  if (typeof document === "undefined") return null;
  return createPortal(
    <dialog ref={dialog} aria-modal="true" aria-labelledby={headingId} data-canvas-hotkeys-blocked="true"
      className={`${surfaceAppearanceClass(appearance)} canvas-ui-surface-solid m-auto max-h-[90dvh] w-[calc(100%_-_24px)] max-w-3xl overflow-auto rounded-2xl border p-0 shadow-2xl backdrop:bg-[var(--canvas-ui-mask)]`}
      onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
      <header className="flex items-center justify-between px-5 pt-5">
        <h2 id={headingId} className="text-base font-semibold">{L("智能拆层", "Separate layers")}</h2>
        <button type="button" className="canvas-ui-action rounded-lg p-1.5" aria-label={L("关闭", "Close")} onClick={onClose}><X size={18}/></button>
      </header>
      <div className={`grid gap-3 p-5 ${preview ? "sm:grid-cols-2" : ""}`}>
        <figure className="min-w-0 overflow-hidden rounded-lg bg-[var(--canvas-ui-soft)]">
          <figcaption className="px-3 py-2 text-xs font-medium">{L("原图", "Original")}</figcaption>
          <CachedImage src={image} alt={title || L("原图", "Original")} className="h-64 w-full object-contain sm:h-72"/>
        </figure>
        {preview && <figure className="min-w-0 overflow-hidden rounded-lg bg-[var(--canvas-ui-soft)]">
          <figcaption className="px-3 py-2 text-xs font-medium">{L("图层预览", "Layer preview")}</figcaption>
          <div className="flex h-64 items-center justify-center sm:h-72">
            <canvas ref={composite} aria-label={L("图层合成预览", "Layer composite preview")} role="img"
              width={Math.ceil(preview.width * preview.scale)} height={Math.ceil(preview.height * preview.scale)}
              className="h-full w-full object-contain [background:repeating-conic-gradient(#dedfe0_0_25%,#f7f7f7_0_50%)_0_0/16px_16px]"/>
          </div>
        </figure>}
        {preview && <ul aria-label={L("图层可见性", "Layer visibility")} className="max-h-32 space-y-1 overflow-auto sm:col-span-2">
          {preview.layers.map((layer, index) => ({ layer, index })).reverse().map(({ layer, index }) => <li key={index}>
            <button type="button" aria-pressed={!hidden.has(index)} className="canvas-ui-control flex w-full items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm"
              onClick={() => setHidden(before => {
                const after = new Set(before);
                if (after.has(index)) after.delete(index); else after.add(index);
                return after;
              })}>
              {hidden.has(index) ? <EyeOff aria-hidden size={16}/> : <Eye aria-hidden size={16}/>}
              <span className="truncate">{layer.name}</span>
            </button>
          </li>)}
        </ul>}
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--canvas-ui-border)] px-5 py-4 text-sm">
        {attachment==="saved"&&<span role="status" className="mr-auto">{L("已添加分层子节点，双击可编辑","Layered child added. Double-click to edit.")}</span>}
        {attachment==="saving"&&<span role="status">{L("正在添加子节点…","Adding layered child…")}</span>}
        {attachment==="failed"&&operation&&<button className="canvas-ui-control rounded-lg border px-3 py-2" onClick={()=>connection.current&&void attach(operation,connection.current.signal)}>{L("重试添加分层子节点","Retry adding child")}</button>}
        {status && <p role="status" className="canvas-ui-muted mr-auto flex items-center gap-2">
          {busy && <LoaderCircle size={16} aria-hidden className="motion-safe:animate-spin"/>}{status}
        </p>}
        {preview ? <button type="button" className="canvas-ui-primary rounded-lg px-4 py-2" onClick={download}>{L("下载分层 PSD", "Download layered PSD")}</button>
          : operation && busy !== "submit" ? <button type="button" disabled={!!busy} className="canvas-ui-control rounded-lg border px-4 py-2 disabled:opacity-50" onClick={() => void check()}>{busy ? L("正在查询…", "Checking…") : L("查询原任务", "Check request")}</button>
          : quote && !operation && !busy ? <button type="button" className="canvas-ui-primary rounded-lg px-4 py-2" onClick={() => void start()}>
            {quote.pilotOperationId ? L("开始真实拆层 · 试用 1 次", "Separate layers · one trial")
              : L(`开始拆层 · ${quote.credits} 积分`, `Separate layers · ${quote.credits} credits`)}
          </button> : null}
      </footer>
    </dialog>, document.body,
  );
}
