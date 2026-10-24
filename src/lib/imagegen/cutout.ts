import "server-only";
import {currentImagegenStep} from "./context";
import {currentModelExecution} from "../model-config/context";
import {inspectImagegenPixels} from "./postprocess";
import {currentSynchronousBilling,configuredToolCost,synchronousChargedCredits} from "../billing/synchronous-operation";
import {dbEnabled,reserveCredits,refundCredits,addArtworks,getUser,isBanned,addLedgerEntry} from "../db";
import {storageEnabled,uploadImage} from "../storage";
import {getCutoutSettings,getOpenAISettings} from "../settings";
import {safeError} from "../api-error";
import {cutoutOpenAI,cutoutReplicate} from "./cutout-provider";
import type {CutoutInput} from "./cutout-types";
export type CutoutResult={status:number;body:Record<string,any>};
function cutoutResult(body:Record<string,any>,options?:{status:number}):CutoutResult{return {status:options?.status??200,body};}
/** Shared cutout execution; transport parsing and authenticated actor resolution stay at the entry. */
export async function executeCutout(input:CutoutInput,context:{actor:()=>Promise<string|null>;ip:string|null}):Promise<CutoutResult>{
  if (input.bytes.length > 12 * 1024 * 1024) {
    return cutoutResult({ error: "图片过大(请 < 12MB)" }, { status: 400 });
  }

  try {
    const ip = context.ip;

    // 生产(接库)必须凭有效登录态;用 token 里的 email 作准,不信任请求体。
    if (dbEnabled) {
      const tokenEmail = await context.actor();
      if (!tokenEmail) {
        return cutoutResult({ error: "请先登录后再操作" }, { status: 401 });
      }
      input.email = tokenEmail;
    }
    const useDb = dbEnabled && input.email.length > 0;
    // 价格由同一服务器冻结报价决定，不在处理器内硬编码。
    const cost = await configuredToolCost();

    if (dbEnabled && (await isBanned(input.email, ip))) {
      return cutoutResult(
        { error: "账号或 IP 已被封禁" },
        { status: 403 }
      );
    }

    if (useDb && cost > 0) {
      const ok = await reserveCredits(input.email, cost);
      if (!ok) {
        return cutoutResult(
          { error: "积分不足,请升级方案后重试" },
          { status: 402 }
        );
      }
    }

    let out: Buffer;
    try {
      const cfg = await getCutoutSettings();
      // 抠图统一走发丝级(Replicate);失败退 OpenAI(gpt-image-1 透明底)。
      // 自托管 rembg 免费抠图已下线(2026-06-21 用户停用),不再回退自托管。
      const fallback = async (): Promise<Buffer> => {
        const { apiKey } = await getOpenAISettings();
        if (!apiKey) throw new Error("抠图后端不可用");
        return await cutoutOpenAI(
          input.bytes,
          input.type,
          apiKey,
          cfg.openaiModel
        );
      };
      if (currentImagegenStep()&&currentModelExecution("image") || cfg.backend === "openai" || !cfg.replicateToken) {
        out = await fallback(); // 主用 gpt-image,或没配 Replicate token → 直接兜底
      } else {
        try {
          out = await cutoutReplicate(
            input.bytes,
            input.type,
            cfg.replicateToken,
            cfg.replicateModel
          );
        } catch (e) {
          if(currentImagegenStep()||currentSynchronousBilling()?.upstream!=="rejected")throw e;
          console.error(
            "[cutout] Replicate failed, falling back:",
            e instanceof Error ? e.message : e
          );
          out = await fallback();
        }
      }
    } catch (e) {
      if (useDb && cost > 0)
        await refundCredits(input.email, cost).catch(() => {});
      throw e;
    }

    const transparency=await inspectImagegenPixels(out);
    if(!transparency.transparentPixels||!transparency.visiblePixels)throw new Error("抠图未返回有效透明主体，请核对供应商能力");
    // 透明底必须是 PNG
    const id = `cut-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    let url = `data:image/png;base64,${out.toString("base64")}`;
    if (storageEnabled) {
      try {
        url = await uploadImage(
          new Uint8Array(out),
          "image/png",
          `cutouts/${id}.png`
        );
      } catch (e) {
        console.error(
          "[cutout] R2 upload failed, returning inline:",
          e instanceof Error ? e.message : e
        );
      }
    }

    // 输入原图也存一份(供「本工具记录」原图 / 成品对比;失败不阻断主流程)。
    let srcUrl: string | null = null;
    if (storageEnabled) {
      try {
        const sext = input.type.includes("png")
          ? "png"
          : input.type.includes("webp")
            ? "webp"
            : "jpg";
        srcUrl = await uploadImage(
          new Uint8Array(input.bytes),
          input.type,
          `cutouts/src-${id}.${sext}`
        );
      } catch {
        /* 原图存档失败,忽略 */
      }
    }

    let user: Awaited<ReturnType<typeof getUser>> = null;
    if (useDb) {
      try {
        await addArtworks(
          input.email,
          [
            {
              id,
              title: input.title,
              category: input.category,
              prompt: "",
              status: "completed",
              image: url,
              gradient: "from-stone-100 to-slate-100",
              style: null,
              ratio: input.ratio || null,
              resolution: input.resolution || null,
              source: srcUrl,
              parentId: input.parentId || null,
              parentIds: [],
            },
          ],
          `cut-${Date.now()}`
        );
      } catch (e) {
        console.error(
          "[cutout] addArtworks failed:",
          e instanceof Error ? e.message : e
        );
      }
      if (cost > 0) {
        await addLedgerEntry(input.email, -cost, "抠图 · 发丝级").catch(
          () => {}
        );
      }
      user = await getUser(input.email).catch(() => null);
    }

    return cutoutResult({
      ok: true,
      id,
      url,
      creditsUsed: useDb ? synchronousChargedCredits(cost) : 0,
      user,
    });
  } catch (e) {
    return cutoutResult(
      { error: safeError(e, "抠图服务暂时不可用,请稍后重试") },
      { status: 500 }
    );
  }
}
