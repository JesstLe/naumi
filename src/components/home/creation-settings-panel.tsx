"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Box, Check, Film, ImageIcon, Loader2, RefreshCw, X } from "lucide-react";
import { useFeatureModels } from "@/lib/model-config/feature-client";
import type { FeatureCatalog } from "@/lib/model-config/feature-catalog";
import { compactImageModelOptions } from "@/lib/image-model-routing";
import { imageModelParameterOptions, imageCombinationSupported } from "@/lib/imagegen/parameter-options";
import { ModelIcon } from "@/components/ui/model-icon";
import { VideoDurationControl } from "@/components/video/duration-control";
import { catalogCapability, type VideoCatalogModel } from "@/lib/video/client-settings";
import { useVideoCatalogModels } from "@/lib/video/catalog-cache";
import { videoParameterChoices } from "@/lib/video/parameter-options";
import type { CreationSettings } from "@/lib/agent/creation-settings";
import styles from "./creation-settings.module.css";

type ImageModel = FeatureCatalog["models"][number];
type Catalog = { images: ImageModel[]; videos: VideoCatalogModel[]; imageError?: string; videoError?: string };
export function CreationSettingsPanel({ value, onChange, onClose, nextTurn = false }: { value: CreationSettings; onChange: (value: CreationSettings) => void; onClose: () => void; nextTurn?: boolean }) {
  const panel = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<{left:number;top:number}>();
  const [tab, setTab] = useState<"image" | "video">("image");
  // 图片模型走共享目录 store(缓存+失效总线),视频模型走 catalog-cache;首次打开前 composer 已预取,通常直接命中。
  const imageStore = useFeatureModels("image.generate");
  const videoStore = useVideoCatalogModels();
  const images = imageStore.catalog && imageStore.catalog.managed ? compactImageModelOptions(imageStore.catalog.models) : [];
  const imageError = imageStore.error ? "图片模型读取失败" : imageStore.catalog && !imageStore.catalog.managed ? "当前使用默认图像配置" : undefined;
  const catalog: Catalog | null = (imageStore.catalog || imageStore.error) && videoStore.ready ? { images, videos: videoStore.models, imageError, videoError: videoStore.error || undefined } : null;
  const retry = () => { imageStore.reload(); videoStore.reload(); };
  useLayoutEffect(() => {
    const element=panel.current, anchor=element?.parentElement;
    if(!element||!anchor)return;
    const place=()=>{const rect=anchor.getBoundingClientRect(),width=element.offsetWidth,height=element.offsetHeight;
      const top=rect.top>=height+12?rect.top-height-10:rect.bottom+height+12<innerHeight?rect.bottom+10:Math.max(8,innerHeight-height-8);
      setPosition({left:Math.max(8,Math.min(rect.left,innerWidth-width-8)),top});};
    place();const observer=new ResizeObserver(place);observer.observe(element);
    window.addEventListener("resize",place);window.addEventListener("scroll",place,true);
    return()=>{observer.disconnect();window.removeEventListener("resize",place);window.removeEventListener("scroll",place,true);};
  }, []);
  const image = catalog?.images.find(item => item.id === value.image?.modelId);
  const imageParameters = image ? imageModelParameterOptions(image) : { ratios: [], resolutions: [], combinations: undefined };
  const video = catalog?.videos.find(item => item.modelId === value.video?.modelId && item.providerId === value.video?.providerId);
  const capability = catalogCapability(video), mode = capability.modes?.[0];
  const videoParameters = videoParameterChoices(capability, mode, value.video);
  const patchImage = (patch: Partial<NonNullable<CreationSettings["image"]>>) => onChange({ ...value, image: { ...value.image, ...patch } });
  const patchVideo = (patch: Partial<NonNullable<CreationSettings["video"]>>) => {
    const next = { ...value.video, ...patch };
    const available = videoParameterChoices(capability, mode, next);
    if (next.resolution && !available.resolutions.includes(next.resolution)) next.resolution = undefined;
    const ratios = videoParameterChoices(capability, mode, next).aspectRatios;
    if (next.aspectRatio && !ratios.includes(next.aspectRatio)) next.aspectRatio = undefined;
    onChange({ ...value, video: next });
  };
  function choices(label: string, selected: string | number | undefined, options: (string | number)[], change: (value: string | number | undefined) => void, labels?: Record<string, string>, disabled?: (option: string | number) => boolean) {
    return <fieldset className={styles.field}><legend>{label}</legend><div className={label === "比例" ? styles.ratios : styles.choices}>
      {[undefined, ...options.filter(option => option !== "auto")].map(option => <button type="button" key={option ?? "auto"} aria-label={`${label} ${labels?.[String(option)] || option || "智能"}`} aria-pressed={selected === option || !selected && option === undefined} disabled={option !== undefined && disabled?.(option)} onClick={() => change(option)}>
        {label === "比例" && <i style={{ aspectRatio: option ? String(option).replace(":", "/") : "1" }} />}
        <span>{labels?.[String(option)] || option || "智能"}</span>
      </button>)}
    </div></fieldset>;
  }
  return <section ref={panel} style={position} className={styles.panel} role="dialog" aria-label="本轮创作设置" data-testid="creation-settings">
    <header><div className={styles.tabs}>{(["image", "video"] as const).map(kind => <button type="button" key={kind} aria-pressed={tab === kind} onClick={() => setTab(kind)}>{kind === "image" ? <ImageIcon size={15} /> : <Film size={15} />}{kind === "image" ? "图片" : "视频"}</button>)}</div><span>{nextTurn ? "下一轮设置" : "本轮设置"}</span><button type="button" aria-label="关闭创作设置" onClick={onClose}><X size={16} /></button></header>
    {!catalog ? <div className={styles.state} role="status">{imageStore.error || videoStore.error ? <><span>{imageStore.error || videoStore.error}</span><button type="button" onClick={retry}><RefreshCw size={15} />重试</button></> : <Loader2 className="animate-spin" />}</div> : <div className={styles.body}>
      <div className={styles.models} aria-label={tab === "image" ? "图片模型" : "视频模型"}>
        <button type="button" aria-pressed={!value[tab]?.modelId} onClick={() => onChange({ ...value, [tab]: {} })}><Box size={16} /><span>模型 · 智能</span>{!value[tab]?.modelId && <Check size={16} />}</button>
        {tab === "image" ? catalog.images.map(model => <button type="button" key={model.id} aria-pressed={model.id === value.image?.modelId} onClick={() => onChange({ ...value, image: { modelId: model.id } })}><ModelIcon modelId={model.id} modelName={model.label} size={17}/><span className={styles.modelLabel}>{model.label}</span>{model.id === value.image?.modelId && <Check size={16} />}</button>) : catalog.videos.map(model => <button type="button" key={`${model.providerId}:${model.modelId}`} aria-pressed={model === video} onClick={() => onChange({ ...value, video: { modelId: model.modelId, providerId: model.providerId } })}><ModelIcon modelId={model.modelId} modelName={model.label} size={17}/><span className={styles.modelLabel}>{model.label}</span>{model === video && <Check size={16} />}</button>)}
        {!(tab === "image" ? catalog.images : catalog.videos).length && <p role="status">{(tab === "image" ? catalog.imageError : catalog.videoError) || "暂无已配置模型"}</p>}
        {(tab === "image" ? catalog.imageError : catalog.videoError) && <button type="button" onClick={retry}><RefreshCw size={14}/>重新加载</button>}
      </div>
      <div className={styles.parameters}>{tab === "image" ? <>
        {choices("比例", value.image?.ratio, imageParameters.ratios, option => patchImage({ ratio: option as string | undefined }), undefined, option => !imageCombinationSupported(imageParameters, String(option), value.image?.resolution))}
        {choices("清晰度", value.image?.resolution, imageParameters.resolutions, option => patchImage({ resolution: option as NonNullable<CreationSettings["image"]>["resolution"] }), undefined, option => !imageCombinationSupported(imageParameters, value.image?.ratio, String(option)))}
        {!!image?.qualities?.length && choices("质量", value.image?.quality, image.qualities, option => patchImage({ quality: option as NonNullable<CreationSettings["image"]>["quality"] }), { low: "基础", medium: "标准", high: "高质量", xhigh: "超高", max: "最高", ...image.qualityLabels })}
      </> : <>
        {choices("比例", value.video?.aspectRatio, videoParameters.aspectRatios, option => patchVideo({ aspectRatio: option as string | undefined }))}
        {choices("清晰度", value.video?.resolution, videoParameters.resolutions, option => patchVideo({ resolution: option as string | undefined }))}
        <VideoDurationControl capability={capability} mode={mode} value={value.video?.durationSeconds} onChange={durationSeconds => patchVideo({ durationSeconds })} onSmart={() => patchVideo({ durationSeconds: undefined })}/>
      </>}</div>
    </div>}
  </section>;
}
