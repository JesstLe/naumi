"use client";
import {useVideoI18n} from "./i18n";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { Download, Maximize2, Minimize2, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { isTopVideoDialog } from "./dialog-stack";
import type {VideoPlayerAction} from "@/lib/video/player-actions";
export type {VideoPlayerAction} from "@/lib/video/player-actions";
export function mediaDownloadHref(url: string, name = "video.mp4") { return `/api/download?u=${encodeURIComponent(url)}&n=${encodeURIComponent(name.replace(/[^\w.\-]+/g, "_").slice(0, 160) || "video.mp4")}`; }
export function mediaDownloadName(url: string, fallback = "video.mp4") { try {
    const name = decodeURIComponent(new URL(url, "http://media.local").pathname.split("/").pop() || "");
    return /\.[A-Za-z0-9]{1,8}$/.test(name) ? name : fallback;
}
catch {
    return fallback;
} }
function timeLabel(value: number) { const seconds = Math.max(0, Number.isFinite(value) ? value : 0), minutes = Math.floor(seconds / 60); return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
export function VideoPlayer({ url, title = "视频", kind = "video", selected = true, compact = false, onProcess, canProcess = true, downloadName, allowExpand = true }: {
    url: string;
    title?: string;
    kind?: "video" | "audio";
    selected?: boolean;
    compact?: boolean;
    onProcess?: (action: VideoPlayerAction) => void;
    canProcess?: boolean;
    downloadName?: string;
    allowExpand?: boolean;
}) {
    const V = useVideoI18n();
    const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null), containerRef = useRef<HTMLDivElement>(null);
    const [playing, setPlaying] = useState(false), [duration, setDuration] = useState(0), [current, setCurrent] = useState(0), [volume, setVolume] = useState(1), [muted, setMuted] = useState(false), [fullscreen, setFullscreen] = useState(false), [expanded, setExpanded] = useState(false), [error, setError] = useState("");
    const previewRef = useRef<HTMLDivElement>(null);
    useEffect(() => { if (!selected)
        mediaRef.current?.pause(); }, [selected]);
    useEffect(() => { setPlaying(false); setDuration(0); setCurrent(0); setError(""); }, [url]);
    useEffect(() => { const changed = () => setFullscreen(document.fullscreenElement === containerRef.current); document.addEventListener("fullscreenchange", changed); return () => document.removeEventListener("fullscreenchange", changed); }, []);
    useEffect(() => {
        if (!expanded)
            return;
        const previous = document.activeElement as HTMLElement | null;
        const items = () => Array.from(previewRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]') || []).filter(item => item.offsetParent !== null);
        items()[0]?.focus();
        const close = (event: KeyboardEvent) => { if (!isTopVideoDialog(previewRef.current))
            return; if (event.key === "Escape") {
            event.stopPropagation();
            setExpanded(false);
        }
        else if (event.key === "Tab") {
            const elements = items(), first = elements[0], last = elements[elements.length - 1];
            if (first && event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            }
            else if (first && !event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        } };
        document.addEventListener("keydown", close, true);
        return () => { document.removeEventListener("keydown", close, true); previous?.focus(); };
    }, [expanded]);
    async function toggle() { const media = mediaRef.current; if (!media)
        return; try {
        if (media.paused)
            await media.play();
        else
            media.pause();
        setError("");
    }
    catch {
        setError("视频暂不可播放，请检查任务或重新加载");
    } }
    async function toggleFullscreen() { try {
        if (fullscreen) {
            if (typeof document.exitFullscreen !== "function")
                throw new Error("unavailable");
            await document.exitFullscreen();
        }
        else {
            const container = containerRef.current;
            if (typeof container?.requestFullscreen !== "function")
                throw new Error("unavailable");
            await container.requestFullscreen();
        }
    }
    catch {
        setError("浏览器暂不支持全屏");
    } }
    const mediaEvents = { onLoadedMetadata: (event: SyntheticEvent<HTMLMediaElement>) => { const media = event.currentTarget; setDuration(Number.isFinite(media.duration) ? media.duration : 0); media.volume = volume; media.muted = muted; }, onTimeUpdate: (event: SyntheticEvent<HTMLMediaElement>) => setCurrent(event.currentTarget.currentTime), onPlay: () => setPlaying(true), onPause: () => setPlaying(false), onEnded: () => setPlaying(false), onError: () => setError("媒体加载失败") };
    const control = "nodrag nowheel nokey flex shrink-0 items-center justify-center rounded-md p-1.5 text-white/90 hover:bg-white/15 disabled:opacity-30";
    return <div ref={containerRef} data-testid="video-player" className={`nodrag nowheel nokey relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg bg-black text-white ${fullscreen ? "p-4" : ""}`} onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onKeyDown={event => { event.stopPropagation(); if (event.code === "Space" && event.target === event.currentTarget) {
        event.preventDefault();
        void toggle();
    } }} tabIndex={selected ? 0 : -1}>
    <div className="relative min-h-0 flex-1">{kind === "audio" ? <div className="flex h-full min-h-16 items-center justify-center"><audio key={url} src={url} ref={element => { mediaRef.current = element; }} preload="metadata" {...mediaEvents}/><Volume2 size={32} className="opacity-40"/></div> : <video key={url} src={url} ref={element => { mediaRef.current = element; }} aria-label={V(`${title}播放器`)} playsInline preload="metadata" className="h-full w-full object-contain" {...mediaEvents}/>}
      {kind === "video" && selected && onProcess && <div data-testid="canvas-video-extract-controls" className="absolute left-1 right-1 top-1 flex flex-wrap justify-end gap-1">
        {([{ label: V("首帧"), timestamp: "first" }, { label: V("当前帧"), timestamp: duration > 0 && current >= duration - 0.01 ? "last" : current }, { label: V("尾帧"), timestamp: "last" }] as const).map(item => <button key={item.label} type="button" className={`${control} bg-black/70 px-2 text-[10px]`} disabled={!canProcess || duration <= 0} onClick={() => onProcess({ action: "frame", timestamp: item.timestamp })}>{item.label}</button>)}
        <button type="button" className={`${control} bg-black/70 px-2 text-[10px]`} disabled={!canProcess} onClick={() => onProcess({ action: "extract_audio" })}>{V("\u97F3\u8F68")}</button>
        {!compact && <><button type="button" className={`${control} bg-black/70 px-2 text-[10px]`} disabled={!canProcess} onClick={() => onProcess({ action: "separate" })}>{V("\u5206\u79BB")}</button><button type="button" className={`${control} bg-black/70 px-2 text-[10px]`} disabled={!canProcess} onClick={() => onProcess({ action: "trim" })}>{V("\u88C1\u526A")}</button></>}
      </div>}
      {error && <p role="alert" className="absolute bottom-2 left-2 right-2 rounded bg-black/80 p-2 text-[11px] text-red-300">{error}</p>}
    </div>
    <div data-testid="canvas-video-timeline" className="flex shrink-0 items-center gap-1 px-2 pt-1"><span className="text-[10px] tabular-nums">{timeLabel(current)}</span><input aria-label={V("视频时间轴")} type="range" min={0} max={duration || 1} step={0.01} disabled={!duration} value={Math.min(current, duration || 1)} className="min-w-0 flex-1 accent-teal-400" onChange={event => { const media = mediaRef.current; if (media) {
        media.currentTime = Number(event.target.value);
        setCurrent(media.currentTime);
    } }}/><span className="text-[10px] tabular-nums">{timeLabel(duration)}</span></div>
    <div className="flex shrink-0 items-center gap-1 px-1 py-1"><button type="button" data-testid="canvas-media-playback" aria-label={playing ? V("暂停") : V("播放")} className={control} onClick={() => void toggle()}>{playing ? <Pause size={14}/> : <Play size={14}/>}</button>
      <button type="button" aria-label={muted ? V("取消静音") : V("静音")} className={control} onClick={() => { const next = !muted; setMuted(next); if (mediaRef.current)
        mediaRef.current.muted = next; }}>{muted ? <VolumeX size={14}/> : <Volume2 size={14}/>}</button>
      <input aria-label={V("视频音量")} type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} className={`min-w-0 accent-teal-400 ${compact ? "w-10" : "w-16"}`} onChange={event => { const next = Number(event.target.value); setVolume(next); setMuted(next === 0); if (mediaRef.current) {
        mediaRef.current.volume = next;
        mediaRef.current.muted = next === 0;
    } }}/>
      {onProcess && compact && <button type="button" aria-label={V("媒体处理")} className={`${control} text-[10px]`} disabled={!canProcess} onClick={() => onProcess({ action: "trim" })}>{V("\u5904\u7406")}</button>}
      <div className="ml-auto flex items-center gap-1"><a aria-label={kind === "audio" ? V("下载音频") : V("下载视频")} className={control} href={mediaDownloadHref(url, downloadName || mediaDownloadName(url, `${kind}.${kind === "audio" ? "wav" : "mp4"}`))} download><Download size={14}/></a>
        {allowExpand && <button type="button" data-testid="canvas-media-preview" aria-label={V("放大预览")} className={control} onClick={() => { mediaRef.current?.pause(); setExpanded(true); }}><Maximize2 size={14}/></button>}
        {kind === "video" && <button type="button" aria-label={fullscreen ? V("退出全屏") : V("全屏")} className={control} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}</button>}
      </div>
    </div>
    {expanded && typeof document !== "undefined" && createPortal(<div ref={previewRef} role="dialog" aria-label={V("视频放大预览")} aria-modal="true" data-canvas-hotkeys-blocked="true" className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4" onKeyDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}><button type="button" aria-label={V("关闭视频预览")} className="absolute right-3 top-3 rounded-lg bg-white/15 p-2" onClick={() => setExpanded(false)}><X size={18}/></button><div className="h-[min(78dvh,720px)] w-full max-w-5xl"><VideoPlayer url={url} title={title} kind={kind} downloadName={downloadName} allowExpand={false}/></div></div>, document.body)}
  </div>;
}
