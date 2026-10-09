import { NextResponse } from "next/server";

export const runtime = "nodejs", dynamic = "force-dynamic";
const disabled = () => NextResponse.json(
  { error: "用户自带接口已取消，请使用平台模型", code: "USER_IMAGE_PROVIDER_DISABLED" },
  { status: 410, headers: { "cache-control": "no-store" } },
);
// Retire stale clients without reading keys, contacting their endpoint or changing stored records.
export const GET = disabled, POST = disabled, DELETE = disabled;
