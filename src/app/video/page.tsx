import { VideoStudioClient } from "@/components/video/video-studio-client";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `视频工作台 — ${BRAND}` };

export default function VideoPage() {
  return <VideoStudioClient />;
}
