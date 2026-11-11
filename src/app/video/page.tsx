import { VideoStudioClient } from "@/components/video/video-studio-client";
import { BRAND } from "@/lib/brand";
import { findCreationCase } from "@/lib/creation-cases/catalog";

export const metadata = { title: `视频工作台 — ${BRAND}` };

export default async function VideoPage({ searchParams }: { searchParams?: Promise<{ case?: string | string[] }> }) {
  const query = await searchParams ?? {};
  const item = typeof query.case === "string" ? findCreationCase(query.case, "video") : undefined;
  return <VideoStudioClient initialCaseId={item?.id} />;
}
