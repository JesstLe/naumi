import { NextResponse } from "next/server";
import {dbEnabled} from "@/platform/db/pool";
import {
  decryptFromClient,
  getAdminView,
  saveOpenAIKey,
  saveOpenAIModel,
  saveOpenAIModels,
  saveOpenAIBaseUrl,
  saveCutoutModel,
  saveCutoutBackend,
  saveReplicateToken,
  saveReplicateModel,
  saveWechatLogin,
  saveWechatSecret,
  saveAlipay,
  saveAlipayPrivateKey,
  saveWxpay,
  saveWxpayApiv3,
  saveWxpayCert,
  saveWxpayCertSerial,
  saveWxpayAppid,
  saveBrand,
  saveSitePages,
  saveMultiUser,
  saveSmtp,
} from "@/lib/settings";
import { requireAdmin } from "@/lib/admin-auth";
import { authorizeAdminMutation } from "@/lib/admin-mutation";
import { appendManagementLogAfterChange } from "@/lib/bi/management-log";
import { setSettingsAtomically } from "@/lib/settings/repository";
import { updateBillingCompatibility } from "@/lib/billing/runtime";
import { BillingError } from "@/lib/billing/types";
import { settingsMutationSchema } from "@/lib/settings/mutation-schema";
import { modelConfigurationEnabled } from "@/lib/model-config/availability";
import { ModelConfigError } from "@/lib/model-config/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard(req: Request): Promise<NextResponse | null> {
  if (!dbEnabled) {
    return NextResponse.json(
      { error: "未配置数据库，管理设置不可用" },
      { status: 503 }
    );
  }
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "需要管理员身份" }, { status: 403 });
  }
  return null;
}

export async function GET(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  try {
    return NextResponse.json({ ...await getAdminView(), modelConfigurationActive: await modelConfigurationEnabled() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ModelConfigError ? error.message : "管理设置暂时不可用" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const authorization = await authorizeAdminMutation(req, "settings", 30);
  if (authorization instanceof Response) return authorization;
  if (!dbEnabled) return NextResponse.json({ error: "未配置数据库" }, { status: 503 });
  const { actor } = authorization;
  let rawBody: unknown;

  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) return NextResponse.json({ error: "请求体无效" }, { status: 400 });

  if (["model", "models", "cutoutModel", "cutoutBackend", "encryptedBaseUrl", "baseUrlPlain", "baseUrlClear", "encryptedKey", "keyPlain"].some(key => Object.prototype.hasOwnProperty.call(rawBody, key))) {
    try {
      if (await modelConfigurationEnabled()) return NextResponse.json({ error: "模型配置已由模型配置中心管理，请在那里修改并发布", code: "MODEL_CONFIG_MANAGED", managementPath: "/admin/bi/models" }, { status: 409 });
    } catch (error) {
      return NextResponse.json({ error: error instanceof ModelConfigError ? error.message : "模型配置状态无法核对" }, { status: 503 });
    }
  }

  // 解出浏览器 RSA 密文 → 明文;解密失败/为空回 null,调用方据此回 400。
  // Preserve the legacy managed-model 409 before validating obsolete payloads.
  const parsed = settingsMutationSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  const body = parsed.data;
  // Setters prepare normalized/encrypted values through an explicit port.
  // Nothing is persisted until every field has passed validation below.
  const entries: [string, string][] = [];
  const write = async (key: string, value: string): Promise<void> => { entries.push([key, value]); };
  const decrypted = new Map<string, string>();
  async function decryptField(b64: unknown): Promise<string | null> {
    if (typeof b64 !== "string" || !b64.trim()) return null;
    if (decrypted.has(b64)) return decrypted.get(b64)!;
    try {
      const plain = await decryptFromClient(b64, true);
      if (plain?.trim()) decrypted.set(b64, plain);
      return plain && plain.trim() ? plain : null;
    } catch {
      return null;
    }
  }

  // Validate even a supplied value shadowed by clear/encrypted precedence.
  for (const field of ["encryptedBaseUrl", "encryptedKey", "encryptedReplicateToken", "encryptedWechatSecret", "encryptedAlipayPrivateKey", "encryptedWxpayApiv3", "encryptedWxpayCert"] as const) {
    const value = body[field];
    if (!value?.trim()) continue;
    const plain = await decryptField(value);
    if (!plain || ((field === "encryptedKey" || field === "encryptedReplicateToken") && plain.length < 8)) {
      return NextResponse.json({ error: "加密设置无效" }, { status: 400 });
    }
  }
  if (body.keyPlain?.trim() && body.keyPlain.trim().length < 8) return NextResponse.json({ error: "key 无效" }, { status: 400 });

  try {
    if (typeof body.model === "string" && body.model.trim()) {
      await saveOpenAIModel(body.model, write);
    }
    if (Array.isArray(body.models)) {
      await saveOpenAIModels(body.models, write);
    }
    // AI 模型接口地址:RSA 加密传输、加密落库(保护海外域名/凭证,不走明文)。
    // baseUrlClear=清除→回退直连;否则解密后保存(saveOpenAIBaseUrl 内部再 AES 落库)。
    if (body.baseUrlClear === true) {
      await saveOpenAIBaseUrl("", write);
    } else if (
      typeof body.encryptedBaseUrl === "string" &&
      body.encryptedBaseUrl.trim()
    ) {
      const plain = await decryptField(body.encryptedBaseUrl);
      if (!plain || !plain.trim()) {
        return NextResponse.json(
          { error: "解密后的接口地址无效" },
          { status: 400 }
        );
      }
      await saveOpenAIBaseUrl(plain.trim(), write);
    } else if (
      typeof body.baseUrlPlain === "string" &&
      body.baseUrlPlain.trim()
    ) {
      // HTTP 自托管(无 crypto.subtle)兜底:明文传入,saveOpenAIBaseUrl 内部 AES 落库。
      await saveOpenAIBaseUrl(body.baseUrlPlain.trim(), write);
    }
    if (typeof body.cutoutModel === "string" && body.cutoutModel.trim()) {
      await saveCutoutModel(body.cutoutModel, write);
    }
    if (
      typeof body.cutoutBackend === "string" &&
      body.cutoutBackend.trim()
    ) {
      await saveCutoutBackend(body.cutoutBackend, write);
    }
    if (typeof body.replicateModel === "string" && body.replicateModel.trim()) {
      await saveReplicateModel(body.replicateModel, write);
    }
    if (body.encryptedKey) {
      const plain = await decryptField(body.encryptedKey);
      if (!plain || plain.length < 8) {
        return NextResponse.json(
          { error: "解密后的 key 无效" },
          { status: 400 }
        );
      }
      await saveOpenAIKey(plain, write);
    } else if (typeof body.keyPlain === "string" && body.keyPlain.trim()) {
      // HTTP 自托管(无 crypto.subtle)兜底:明文 key,saveOpenAIKey 内部 AES 落库。
      if (body.keyPlain.trim().length < 8) {
        return NextResponse.json({ error: "key 无效" }, { status: 400 });
      }
      await saveOpenAIKey(body.keyPlain.trim(), write);
    }
    if (body.encryptedReplicateToken) {
      const plain = await decryptField(body.encryptedReplicateToken);
      if (!plain || plain.length < 8) {
        return NextResponse.json(
          { error: "解密后的 Replicate Token 无效" },
          { status: 400 }
        );
      }
      await saveReplicateToken(plain, write);
    }

    // ---- 微信登录:明文字段(空串自动跳过) ----
    if (
      (typeof body.wechatAppid === "string" && body.wechatAppid.trim()) ||
      (typeof body.wechatToken === "string" && body.wechatToken.trim()) ||
      (typeof body.wechatEmailDomain === "string" &&
        body.wechatEmailDomain.trim())
    ) {
      await saveWechatLogin({
        appid: body.wechatAppid,
        token: body.wechatToken,
        emailDomain: body.wechatEmailDomain,
      }, write);
    }
    // 微信 AppSecret(加密)
    if (typeof body.encryptedWechatSecret === "string" && body.encryptedWechatSecret.trim()) {
      const plain = await decryptField(body.encryptedWechatSecret);
      if (!plain) {
        return NextResponse.json(
          { error: "解密后的微信 AppSecret 无效" },
          { status: 400 }
        );
      }
      await saveWechatSecret(plain, write);
    }

    // ---- 支付:明文字段 ----
    if (
      (typeof body.alipayAppid === "string" && body.alipayAppid.trim()) ||
      (typeof body.alipayPublicKey === "string" && body.alipayPublicKey.trim())
    ) {
      await saveAlipay({
        appid: body.alipayAppid,
        publicKey: body.alipayPublicKey,
      }, write);
    }
    if (typeof body.wxpayMchid === "string" && body.wxpayMchid.trim()) {
      await saveWxpay({ mchid: body.wxpayMchid }, write);
    }
    if (typeof body.wxpayCertSerial === "string" && body.wxpayCertSerial.trim()) {
      await saveWxpayCertSerial(body.wxpayCertSerial, write);
    }
    if (typeof body.wxpayAppid === "string" && body.wxpayAppid.trim()) {
      await saveWxpayAppid(body.wxpayAppid, write);
    }
    // 支付加密字段
    if (typeof body.encryptedAlipayPrivateKey === "string" && body.encryptedAlipayPrivateKey.trim()) {
      const plain = await decryptField(body.encryptedAlipayPrivateKey);
      if (!plain) {
        return NextResponse.json(
          { error: "解密后的支付宝应用私钥无效" },
          { status: 400 }
        );
      }
      await saveAlipayPrivateKey(plain, write);
    }
    if (typeof body.encryptedWxpayApiv3 === "string" && body.encryptedWxpayApiv3.trim()) {
      const plain = await decryptField(body.encryptedWxpayApiv3);
      if (!plain) {
        return NextResponse.json(
          { error: "解密后的微信支付 APIv3 Key 无效" },
          { status: 400 }
        );
      }
      await saveWxpayApiv3(plain, write);
    }
    if (typeof body.encryptedWxpayCert === "string" && body.encryptedWxpayCert.trim()) {
      const plain = await decryptField(body.encryptedWxpayCert);
      if (!plain) {
        return NextResponse.json(
          { error: "解密后的微信支付商户证书无效" },
          { status: 400 }
        );
      }
      await saveWxpayCert(plain, write);
    }

    // 注意:用 typeof 判断「字段是否出现」,空串也要写入(=清除),不能用真值跳过。
    if (typeof body.brandName === "string" || typeof body.brandLogo === "string") {
      await saveBrand({ name: body.brandName, logo: body.brandLogo }, write);
    }

    // ---- 站长自定义页面(关于/联系/定价):基础能力,开源版也可改 ----
    if (
      typeof body.pageAbout === "string" ||
      typeof body.pageContact === "string" ||
      typeof body.pagePlans === "string"
    ) {
      await saveSitePages({
        about: body.pageAbout,
        contact: body.pageContact,
        plans: body.pagePlans,
      }, write);
    }

    if (typeof body.multiUserEnabled === "boolean") {
      await saveMultiUser(body.multiUserEnabled, write);
    }

    // ---- 积分计费开关(基础,单用户也可开)----

    if (
      typeof body.smtpHost === "string" ||
      typeof body.smtpUser === "string" ||
      typeof body.smtpFrom === "string" ||
      typeof body.smtpPass === "string" ||
      typeof body.smtpPort === "number"
    ) {
      await saveSmtp({
        host: body.smtpHost,
        user: body.smtpUser,
        from: body.smtpFrom,
        pass: body.smtpPass,
        port: body.smtpPort,
      }, write);
    }
    // All schema checks, RSA decryption and AES encryption have finished.
    // Billing owns version publication/CAS and opens its own transaction, so it
    // cannot join app_settings. It runs first: its likely failure (a concurrent
    // billing edit, 409) then leaves nothing written. Only a database failure of
    // the settings transaction after a successful billing publication can split
    // the two; validation failures (400) always occur before either write.
    if (body.signupBonus !== undefined || body.payEnabled !== undefined || body.creditsMetering !== undefined) {
      await updateBillingCompatibility(actor, "更新系统计费设置", config => {
        if (body.signupBonus !== undefined) config.credits.signup.amount = Math.min(Math.max(0, Math.trunc(body.signupBonus)), 100000);
        if (body.payEnabled !== undefined) config.switches.recharge = body.payEnabled;
        if (body.creditsMetering !== undefined) config.switches.metering = body.creditsMetering ? "on" : "off";
      });
    }
    await setSettingsAtomically(entries);
    await appendManagementLogAfterChange({ actor, subject: "settings:system", action: "settings-update", changes: { fields: Object.keys(body).sort() } });
    return NextResponse.json(await getAdminView());
  } catch (error) {
    // Billing conflicts/validation keep their own status (e.g. 409 刷新后重试); nothing was written.
    if (error instanceof BillingError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json(
      { error: "保存失败" },
      { status: 500 }
    );
  }
}
