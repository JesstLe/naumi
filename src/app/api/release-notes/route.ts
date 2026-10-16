import { NextResponse } from "next/server";
import history from "@/content/public-release-notes.json";
import { buildVersion } from "@/lib/version";
import { publicNotesForVersion, validatePublicReleaseNotes } from "@/lib/public-release-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export async function GET(request: Request) {
  const running = buildVersion();
  const version = new URL(request.url).searchParams.get("version") || running;
  if (version !== "0" && !/^[1-9]\d{8,10}$/.test(version)) return NextResponse.json({ error: "Invalid version" }, { status: 400, headers });
  try {
    const entries = publicNotesForVersion(validatePublicReleaseNotes(history), version, running);
    return NextResponse.json({ version, entries }, { headers });
  } catch {
    // Never echo rejected source text or internal paths to a public caller.
    return NextResponse.json({ error: "Release notes are temporarily unavailable" }, { status: 503, headers });
  }
}
