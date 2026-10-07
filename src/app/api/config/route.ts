import { NextResponse } from "next/server";
import { dbEnabled, creditMeteringEnabled } from "@/lib/db";
import { storageEnabled } from "@/lib/storage";
import { authMode } from "@/lib/auth-mode";
import { multiUserEnabled } from "@/lib/native-auth";
import { smtpConfigured } from "@/lib/mailer";
import { getOpenAISettings } from "@/lib/settings";
import {
  getImageModelCatalog,
  getUserDefaultImageModel,
} from "@/lib/image-model-catalog";
import { imageQualityCapable } from "@/lib/image-quality";
import { authenticatedEmail } from "@/lib/request-auth";
import { betaPreviewEnabled } from "@/lib/commerce";
import { modelConfigurationEnabled } from "@/lib/model-config/requests";
import { getModelRuntime } from "@/lib/model-config/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lets the client know which integrations are live so it can choose between
// server persistence and the localStorage mock.
export async function GET(request: Request) {
  const multiUser = await multiUserEnabled();
  const imageSettings = await getOpenAISettings();
  const email = dbEnabled ? await authenticatedEmail(request) : null;
  const imageModels = await getImageModelCatalog(email);
  const managed = await modelConfigurationEnabled() ? await (await getModelRuntime()).publicCatalog("image") : null;
  const featureCatalog = managed ? await (await getModelRuntime()).publicCatalog("image", "image.generate") : null;
  const defaultModel = featureCatalog?.defaultModelId || managed?.bindings["image.generate"] || managed?.models[0]?.id || imageSettings.model;
  const userDefaultModel = await getUserDefaultImageModel(email);
  return NextResponse.json({
    db: dbEnabled,
    creditsMetered: dbEnabled ? await creditMeteringEnabled() : true,
    storage: storageEnabled,
    authMode,
    // 原生多用户模式(运行时开关)。开则前端启用注册/登录(邮箱+密码)+ 会话 hydrate。
    multiUser,
    // 注册是否需要邮箱验证码(= 多用户 且 站长已配 SMTP);前端据此显示验证码栏。
    emailCode: multiUser && (await smtpConfigured()),
    openai: managed ? !!managed.models.length : (process.env.OPENAI_API_KEY ?? "").length > 0,
    defaultImageModel: userDefaultModel || defaultModel,
    modelVersion: managed?.version,
    imageModelBindings: managed?.bindings,
    imageBindingCapabilities: managed?.bindingCapabilities,
    imageModels: managed ? imageModels.filter(m => m.id.startsWith("byok:") || featureCatalog!.models.some(v => v.id === m.id)).map(m => ({ ...m, provider: m.id.startsWith("byok:") ? m.provider : "managed" })) : imageModels,
    // 出图质量通道能力:上游真实处理 quality 字段时为 true,前端才放开
    // 高档选择;false 时统一按默认档执行(提交前回退,见 src/lib/image-quality.ts)。
    imageQualityCapable: managed ? !!managed.models.find(m => m.id === defaultModel)?.qualitySupported : imageQualityCapable(),
    imageQualityExperimental: betaPreviewEnabled,
  });
}
