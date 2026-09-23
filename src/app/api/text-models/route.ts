import { NextResponse } from "next/server";
import { textModelCatalog } from "@/lib/text-models";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await textModelCatalog(), {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}

