import { NextResponse } from "next/server";
import { dbEnabled, setSignupBonus } from "@/lib/db";
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
  savePayEnabled,
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
  saveCreditsMetering,
  saveSmtp,
} from "@/lib/settings";
import { requireAdmin, resolveUserEmail } from "@/lib/admin-auth";
import {sameSiteBillingMutation} from "@/lib/billing/access";

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
  return NextResponse.json(await getAdminView());
}

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  if (!sameSiteBillingMutation(req)) return NextResponse.json({error:"请求来源无效"},{status:403});
  const actor = await resolveUserEmail(req) || "local-admin";

  let body: {
    model?: string;
    models?: string[];
    cutoutModel?: string;
    cutoutBackend?: string;
    replicateModel?: string;
    encryptedBaseUrl?: string; // AI 模型接口地址(RSA 加密传输)
    baseUrlPlain?: string; // HTTP 无 crypto.subtle 时的明文兜底(服务端仍加密落库)
    baseUrlClear?: boolean; // 清除接口地址→回退直连
    encryptedKey?: string;
    keyPlain?: string; // HTTP 无 crypto.subtle 时的明文兜底(服务端仍加密落库)
    encryptedReplicateToken?: string;
    signupBonus?: number;
    // 微信登录(明文)
    wechatAppid?: string;
    wechatToken?: string;
    wechatEmailDomain?: string;
    // 支付(明文)
    alipayAppid?: string;
    alipayPublicKey?: string;
    wxpayMchid?: string;
    wxpayCertSerial?: string;
    wxpayAppid?: string;
    payEnabled?: boolean;

    brandName?: string;
    brandLogo?: string;
    // 站长自定义页面(基础能力,开源版也可改;纯文本)
    pageAbout?: string;
    pageContact?: string;
    pagePlans?: string;

    multiUserEnabled?: boolean;
    // 积分计费开关(基础能力,单用户也可开)
    creditsMetering?: boolean;

    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    smtpFrom?: string;
    // 加密类(浏览器 RSA 密文)
    encryptedWechatSecret?: string;
    encryptedAlipayPrivateKey?: string;
    encryptedWxpayApiv3?: string;
    encryptedWxpayCert?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  // 解出浏览器 RSA 密文 → 明文;解密失败/为空回 null,调用方据此回 400。
  async function decryptField(b64: unknown): Promise<string | null> {
    if (typeof b64 !== "string" || !b64.trim()) return null;
    try {
      const plain = await decryptFromClient(b64);
      return plain && plain.trim() ? plain : null;
    } catch {
      return null;
    }
  }

  try {
    if (typeof body.model === "string" && body.model.trim()) {
      await saveOpenAIModel(body.model);
    }
    if (Array.isArray(body.models)) {
      await saveOpenAIModels(body.models);
    }
    // AI 模型接口地址:RSA 加密传输、加密落库(保护海外域名/凭证,不走明文)。
    // baseUrlClear=清除→回退直连;否则解密后保存(saveOpenAIBaseUrl 内部再 AES 落库)。
    if (body.baseUrlClear === true) {
      await saveOpenAIBaseUrl("");
    } else if (
      typeof body.encryptedBaseUrl === "string" &&
      body.encryptedBaseUrl.trim()
    ) {
      const plain = await decryptFromClient(body.encryptedBaseUrl);
      if (!plain || !plain.trim()) {
        return NextResponse.json(
          { error: "解密后的接口地址无效" },
          { status: 400 }
        );
      }
      await saveOpenAIBaseUrl(plain.trim());
    } else if (
      typeof body.baseUrlPlain === "string" &&
      body.baseUrlPlain.trim()
    ) {
      // HTTP 自托管(无 crypto.subtle)兜底:明文传入,saveOpenAIBaseUrl 内部 AES 落库。
      await saveOpenAIBaseUrl(body.baseUrlPlain.trim());
    }
    if (typeof body.cutoutModel === "string" && body.cutoutModel.trim()) {
      await saveCutoutModel(body.cutoutModel);
    }
    if (
      typeof body.cutoutBackend === "string" &&
      body.cutoutBackend.trim()
    ) {
      await saveCutoutBackend(body.cutoutBackend);
    }
    if (typeof body.replicateModel === "string" && body.replicateModel.trim()) {
      await saveReplicateModel(body.replicateModel);
    }
    if (typeof body.signupBonus === "number" && Number.isFinite(body.signupBonus)) {
      await setSignupBonus(body.signupBonus, actor);
    }
    if (body.encryptedKey) {
      const plain = await decryptFromClient(body.encryptedKey);
      if (!plain || plain.length < 8) {
        return NextResponse.json(
          { error: "解密后的 key 无效" },
          { status: 400 }
        );
      }
      await saveOpenAIKey(plain);
    } else if (typeof body.keyPlain === "string" && body.keyPlain.trim()) {
      // HTTP 自托管(无 crypto.subtle)兜底:明文 key,saveOpenAIKey 内部 AES 落库。
      if (body.keyPlain.trim().length < 8) {
        return NextResponse.json({ error: "key 无效" }, { status: 400 });
      }
      await saveOpenAIKey(body.keyPlain.trim());
    }
    if (body.encryptedReplicateToken) {
      const plain = await decryptFromClient(body.encryptedReplicateToken);
      if (!plain || plain.length < 8) {
        return NextResponse.json(
          { error: "解密后的 Replicate Token 无效" },
          { status: 400 }
        );
      }
      await saveReplicateToken(plain);
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
      });
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
      await saveWechatSecret(plain);
    }

    // ---- 支付:明文字段 ----
    if (typeof body.payEnabled === "boolean") {
      await savePayEnabled(body.payEnabled, actor);
    }
    if (
      (typeof body.alipayAppid === "string" && body.alipayAppid.trim()) ||
      (typeof body.alipayPublicKey === "string" && body.alipayPublicKey.trim())
    ) {
      await saveAlipay({
        appid: body.alipayAppid,
        publicKey: body.alipayPublicKey,
      });
    }
    if (typeof body.wxpayMchid === "string" && body.wxpayMchid.trim()) {
      await saveWxpay({ mchid: body.wxpayMchid });
    }
    if (typeof body.wxpayCertSerial === "string" && body.wxpayCertSerial.trim()) {
      await saveWxpayCertSerial(body.wxpayCertSerial);
    }
    if (typeof body.wxpayAppid === "string" && body.wxpayAppid.trim()) {
      await saveWxpayAppid(body.wxpayAppid);
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
      await saveAlipayPrivateKey(plain);
    }
    if (typeof body.encryptedWxpayApiv3 === "string" && body.encryptedWxpayApiv3.trim()) {
      const plain = await decryptField(body.encryptedWxpayApiv3);
      if (!plain) {
        return NextResponse.json(
          { error: "解密后的微信支付 APIv3 Key 无效" },
          { status: 400 }
        );
      }
      await saveWxpayApiv3(plain);
    }
    if (typeof body.encryptedWxpayCert === "string" && body.encryptedWxpayCert.trim()) {
      const plain = await decryptField(body.encryptedWxpayCert);
      if (!plain) {
        return NextResponse.json(
          { error: "解密后的微信支付商户证书无效" },
          { status: 400 }
        );
      }
      await saveWxpayCert(plain);
    }

    // 注意:用 typeof 判断「字段是否出现」,空串也要写入(=清除),不能用真值跳过。
    if (typeof body.brandName === "string" || typeof body.brandLogo === "string") {
      await saveBrand({ name: body.brandName, logo: body.brandLogo });
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
      });
    }

    if (typeof body.multiUserEnabled === "boolean") {
      await saveMultiUser(body.multiUserEnabled);
    }

    // ---- 积分计费开关(基础,单用户也可开)----
    if (typeof body.creditsMetering === "boolean") {
      await saveCreditsMetering(body.creditsMetering, actor);
    }

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
      });
    }
    return NextResponse.json(await getAdminView());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存失败" },
      { status: 500 }
    );
  }
}
