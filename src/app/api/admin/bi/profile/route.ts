import { NextResponse } from "next/server";
import { z } from "zod";
import { biAuthorize, biJson, sameSiteBiMutation } from "@/lib/bi/access";
import { updateBiProfile } from "@/lib/bi/repository";
import {accountIdentifierSchema} from '@/lib/account-identity-schema';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const profile = z
  .object({
    email: accountIdentifierSchema,
    accountType: z.enum(["unknown", "personal", "enterprise"]),
    company: z.string().trim().max(200),
    agreedPayPercent: z
      .number()
      .positive()
      .max(100)
      .multipleOf(0.01)
      .nullable(),
    note: z.string().trim().max(2000),
  })
  .strict()
  .refine((x) => x.accountType !== "enterprise" || x.company.length > 0, {
    message: "企业账户请填写企业名称",
  });
export async function PUT(request: Request) {
  const auth = await biAuthorize(request);
  if (auth instanceof NextResponse) return auth;
  if (!sameSiteBiMutation(request))
    return biJson({ error: "不允许跨站更新" }, 403);
  const data = profile.safeParse(await request.json().catch(() => null));
  if (!data.success)
    return biJson(
      { error: data.error.issues[0]?.message || "资料参数无效" },
      400,
    );
  try {
    await updateBiProfile(data.data.email, data.data, auth.actor);
    return biJson({ ok: true });
  } catch (error) {
    return biJson(
      {
        error:
          error instanceof Error && error.message === "用户不存在"
            ? "用户不存在"
            : "保存失败，请重试",
      },
      400,
    );
  }
}
