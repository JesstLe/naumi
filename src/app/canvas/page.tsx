import { CanvasClient } from "@/components/canvas/canvas-client";
import { CanvasErrorBoundary } from "@/components/canvas/canvas-error-boundary";
import { CanvasPerformanceHarness } from "@/components/canvas/canvas-performance-probe";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `创作画布 — ${BRAND}` };

export default async function CanvasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const initialProject = process.env.NEXT_PUBLIC_CANVAS_PERF_PROBE === "1" ? String((await searchParams).project || "") || undefined : undefined;
  return (
    <CanvasErrorBoundary>
      <CanvasPerformanceHarness><CanvasClient initialProject={initialProject} /></CanvasPerformanceHarness>
    </CanvasErrorBoundary>
  );
}
