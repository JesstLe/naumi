import {isHostedImageUrl} from "@/lib/media-url";
import type {MemberArtwork} from "./contracts";

// 点作品标题 → 进对应功能页(与前台 dashboard 的 workHref 同规则):
// 抠图→/cutout、融图→/fuse(带 ?view= 直接展示该图);其余→生图页(带 prompt+成品图,可复现/迭代)。
const artIsCutout = (a: MemberArtwork) =>
  a.category === "cutout" || a.prompt === "抠图 / 透明底";
const artIsFusion = (a: MemberArtwork) => a.category === "fusion";
export function artworkToolHref(a: MemberArtwork): string {
  const view =
    a.image && isHostedImageUrl(a.image)
      ? `?view=${encodeURIComponent(a.image)}`
      : "";
  if (artIsCutout(a)) return `/cutout${view}`;
  if (artIsFusion(a)) return `/fuse${view}`;
  const q = new URLSearchParams();
  q.set("prompt", a.prompt);
  if (a.category) q.set("category", a.category);
  if (a.style) q.set("style", a.style);
  if (a.ratio) q.set("ratio", a.ratio);
  if (a.resolution) q.set("resolution", a.resolution);
  if (a.source && isHostedImageUrl(a.source)) q.set("src", a.source);
  if (a.status === "completed" && isHostedImageUrl(a.image)) {
    q.set("gen", a.image);
  }
  q.set("from", a.id);
  return `/generate?${q.toString()}`;
}

