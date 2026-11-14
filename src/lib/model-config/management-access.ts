import { pruneAppliedOperationDrafts } from "./draft-retention";
import {reviewVideoExecutionMigration} from './video-execution-migration';
import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { biAuthorize, biJson, sameSiteBiMutation } from "../bi/access";
import { readBounded } from "../supplier-cost/io";
import { getModelAdministration } from "./server";
import { refreshProviderCatalog } from "./catalog-store";
import { FEATURE_IDS } from "../billing/rules/registry";
import { BillingError } from "../billing/types";
import { editManagedModelCredits, modelCreditGrid } from "./management-pricing";
import { canonicalConfig } from "@/lib/model-config/snapshot-value";
import { validateModelConfig } from "./schema";
import { compileRouterProjection } from "./projection";
import { ModelConfigError, type ModelPublication } from "./types";
import { modelConfigurationEnabled } from "./availability";

import {identifier,managementInput as input,type ManagementAdministration} from "./management-input";
import {acquireManagementMutationTurn,acquireManagementLock} from "./management-locks";
import {managementRows as rows,readManagementView} from "./management-read";
import {applyManagementConfigAction} from "./management-actions";
type Administration = ManagementAdministration;
// Persisted provider IDs, actor markers and locks retain their original namespace.
// Reasons also participate in historical publication fingerprints; keep their wire format.
export function createModelManagementHandler(deps: { authorize: typeof biAuthorize; administration: () => Promise<Administration>; managed: () => Promise<boolean>; fetcher?: typeof fetch; mutationWaitMs?:number }) {
  return async (request: Request) => {
    const auth = await deps.authorize(request); if (auth instanceof Response) return auth;
    if (request.method !== "GET" && !sameSiteBiMutation(request)) return biJson({ error: "不允许跨站修改" }, 403);
    let staged = false;
    let lock: PoolClient | undefined, lockKey: string | undefined;
    let releaseMutationTurn:(()=>void)|undefined;
    try {
      const admin = await deps.administration();
      const snapshot = await admin.repo.current();
      if(request.method==="GET" && new URL(request.url).searchParams.get("view")==="video-capability-upgrade")
        return biJson({error:'旧能力升级操作已退出，请刷新后迁移执行绑定',code:'VIDEO_CAPABILITY_UPGRADE_RETIRED'},410);
      if(request.method==='GET'&&new URL(request.url).searchParams.get('view')==='video-execution-migration')return biJson(reviewVideoExecutionMigration(snapshot.config,snapshot.version));
      if(request.method==="GET" && new URL(request.url).searchParams.has("rowId")){
        const params=new URL(request.url).searchParams,rowId=identifier.parse(params.get("rowId")),feature=z.enum(FEATURE_IDS).parse(params.get("feature"));
        const row=rows(snapshot).find(r=>r.id===rowId);if(!row || !row.features.some(f=>f.id===feature))throw new ModelConfigError("MODEL_UNAVAILABLE","该模型未应用到此工具",400);
        const billing=await admin.billing.current();return biJson({version:snapshot.version,billingVersion:billing.version,grid:modelCreditGrid(billing,snapshot,row,feature)});
      }
      if (request.method === "GET") return biJson(await readManagementView(admin, snapshot, deps.managed));
      const body = input.parse(JSON.parse(await readBounded(new Response(request.body), 96000)));
      if(["video-capability-upgrade","video-execution-migration","create-models"].includes(body.action)&&!await deps.managed())
        throw new ModelConfigError("CONFIG_UNAVAILABLE","请先启用统一模型配置",409);
      if (body.action === "credential") {
        if (!!body.ciphertext === !!body.keyPlain || !/^mvp-[0-9a-f-]{36}$/i.test(body.providerId)) throw new ModelConfigError("INVALID_CREDENTIAL", "凭据参数无效");
        // Match the existing system settings' HTTP fallback, without retaining plaintext in operation drafts or browser storage.
        return biJson(body.ciphertext ? await admin.credentials.saveEncrypted({ providerId: body.providerId, ciphertext: body.ciphertext, actor: auth.actor }) : await admin.credentials.importPlain({ providerId: body.providerId, plain: body.keyPlain!, actor: auth.actor }));
      }
      if (body.action === "discover") {
        const p = snapshot.config.providers.find(p => p.id === body.providerId);
        if (!p) throw new ModelConfigError("PROVIDER_UNAVAILABLE", "上游来源不存在", 404);
        return biJson(await refreshProviderCatalog(admin.pool, p, admin.credentials, admin.trustedOrigins, deps.fetcher, body.force));
      }
      const publicationResponse=async(publication:ModelPublication)=>{
        let discovery;
        if(body.action==="connect"&&publication.phase==="applied"){
          const provider=(await admin.repo.current()).config.providers.find(p=>p.id===`mvp-${body.id}`);
          if(provider)discovery=await refreshProviderCatalog(admin.pool,provider,admin.credentials,admin.trustedOrigins,deps.fetcher)
            .then(r=>({status:r.status,metadataSaved:r.metadataSaved===true}),()=>({status:"error",metadataSaved:false}));
        }
        return biJson({publication,...(discovery?{discovery}:{})},publication.phase==="applied"?200:publication.phase==="failed"?422:202);
      };
      const assertReceiptOwner=async(publication:ModelPublication,actor:string)=>{
        const owner=(await admin.pool.query("SELECT actor FROM app_model_config_versions WHERE version=$1 AND operation_id=$2",[publication.version,body.id])).rows[0];
        if(owner?.actor!==actor)throw new ModelConfigError("OPERATION_CONFLICT","该操作编号已用于不同发布",409);
      };
      if(body.action!=="pricing"){
        // A finalized receipt is a read, not a mutation. Do not hold a pool
        // connection while acquiring another for its immutable identity lookup.
        // Concurrent reads must not fill the pool with advisory-lock waiters.
        let receipt;
        try{receipt=await admin.repo.publication(body.id);}catch(e){if(!(e instanceof ModelConfigError)||e.code!=="PUBLICATION_UNAVAILABLE")throw e;}
        staged=!!receipt;
        if(receipt?.phase==="applied"){
          staged=true;
          const actor=`${auth.actor.slice(0,150)}#mvp:${body.id}:${createHash("sha256").update(canonicalConfig(body)).digest("hex").slice(0,20)}`;
          await assertReceiptOwner(receipt,actor);return await publicationResponse(receipt);
        }
        // New deprecated operations must not create an operation draft. A
        // previously staged/ambiguous publication still owns its old receipt.
        if(body.action==='video-capability-upgrade'&&!receipt)throw new ModelConfigError('VIDEO_CAPABILITY_UPGRADE_RETIRED','旧能力升级操作已退出，请刷新后迁移执行绑定',410);
      }
      // Model publication already has one global pending version/CAS owner.
      // Serialize only this management mutation orchestration per actual pool;
      // reads and unrelated business transactions keep their existing concurrency.
      const deadline=Date.now()+(deps.mutationWaitMs??30000);
      releaseMutationTurn=await acquireManagementMutationTurn(admin.pool,request.signal,deadline);
      lockKey = `admin-mvp:${body.id}`;lock=await acquireManagementLock(admin.pool,lockKey,request.signal,deadline);
      if(body.action==="pricing"){
        const billing=await admin.billing.current();
        const actor=`${auth.actor.slice(0,180)}#mvp-price:${createHash("sha256").update(canonicalConfig(body)).digest("hex").slice(0,32)}`,reason=`MVP 积分售价 ${body.rowId}`;
        const previous=(await admin.pool.query("SELECT config,actor FROM app_billing_config_versions WHERE operation_id=$1",[body.id])).rows[0];staged=!!previous;
        if(previous && previous.actor!==actor)throw new BillingError("OPERATION_CONFLICT","该操作编号已用于不同积分设置",409);
        if(!previous && snapshot.version!==body.expectedVersion)throw new ModelConfigError("CONFIG_CONFLICT","模型配置已更新，请刷新后重新设置积分",409);
        const row=rows(snapshot).find(r=>r.id===body.rowId);if(!previous && !row)throw new ModelConfigError("MODEL_UNAVAILABLE","模型不存在，请刷新",409);
        if(!previous && !await deps.managed())throw new ModelConfigError("CONFIG_UNAVAILABLE","请先启用统一模型配置后设置模型积分",409);
        const config=previous?.config || editManagedModelCredits(billing,snapshot,row!,body.features,body.pricing);
        const published=await admin.billing.publish({id:body.id,expectedVersion:body.expectedBillingVersion,expectedModelVersion:body.expectedVersion,config,actor,reason});
        return biJson({publication:{id:body.id,version:published.version,phase:"applied"},billingVersion:published.version});
      }
      // Dedicated operation drafts preserve unfinished work in the full administration UI.
      const fingerprint = createHash("sha256").update(canonicalConfig(body)).digest("hex").slice(0, 20);
      const actor = `${auth.actor.slice(0, 150)}#mvp:${body.id}:${fingerprint}`;
      let previous;
      try { previous = await admin.repo.publication(body.id); } catch (e) { if (!(e instanceof ModelConfigError) || e.code !== "PUBLICATION_UNAVAILABLE") throw e; }
      staged = !!previous;
      if(previous?.phase==="applied"){
        // The dedicated draft revision advances after publish. Reconstructing
        // StageInput from that mutable revision changes its fingerprint. Bind
        // the immutable receipt to this actor + original management input instead.
        await assertReceiptOwner(previous,actor);
      }
      // Applied receipts do not rebuild StageInput from the advanced private
      // draft, but still pass through the original connect discovery projection.
      let publication = previous;
      if(previous?.phase!=="applied"){
      if (!previous && snapshot.version !== body.expectedVersion) throw new ModelConfigError("CONFIG_CONFLICT", "配置已被其他管理员更新，请刷新后重试", 409);
      let draft = await admin.repo.draft(actor);
      if (!previous && draft.revision === 1) {
        let config = await applyManagementConfigAction({ admin, snapshot, body, fetcher: deps.fetcher });
        config = validateModelConfig(config, { trustedOrigins: admin.trustedOrigins });
        compileRouterProjection({ version: snapshot.version + 1, digest: "", config }, await admin.billing.current(), { trustedOrigins: admin.trustedOrigins });
        draft = await admin.repo.saveDraft({ id: draft.id, expectedRevision: draft.revision, config, actor });
      }
      staged = true;
      publication = await admin.runtime.publish({ id: body.id, draftId: draft.id, expectedRevision: draft.revision, expectedVersion: body.expectedVersion, actor, reason: `MVP ${body.action === "create-models" ? `新增公开模型 ${body.entries.map(e=>e.publicId).join(",").slice(0,400)}` : body.action === "video-execution-migration" ? "迁移视频执行绑定" : body.action === "video-capability-upgrade" ? "更新已核对的视频能力" : body.action === "image-mapping" ? `图片参数映射 ${body.rowId}` : body.action === "video-parameters" ? `视频能力 ${body.rowId}` : body.action === "imagegen-parameters" ? `图像高级参数 ${body.rowId}` : body.action === "scope-compat" ? "回滚兼容：展开画布系统范围" : body.action === "order" ? "模型展示排序" : body.action === "channels" ? `供应通道 ${body.rowId}` : body.action === "resolutions" ? `分辨率选项 ${body.rowId}` : body.action === "parameters" ? `参数映射 ${body.rowId}` : body.action === "scope" ? `工具范围 ${body.rowId}` : body.action === "switch" ? `切换 ${body.rowId} → ${body.upstreamId}` : body.action === "identity" ? `公开身份 ${body.rowId} → ${body.publicId}` : body.action === "rename" ? `改名 ${body.rowId} → ${body.label}` : body.action === "connect" ? `接入来源 ${body.name}` : `添加模型 ${body.model}`}` });
      }
      if(!publication)throw new ModelConfigError("PUBLICATION_UNAVAILABLE","发布记录不存在",404);
      // Bounded, best-effort retention: each applied operation clears older applied operation drafts.
      if(publication.phase==="applied")await pruneAppliedOperationDrafts(admin.pool).catch(()=>0);
      return await publicationResponse(publication);
    } catch (e) {
      // A lock/permit timeout proves no rejection of this operation. Another
      // process may already own or stage it; keep its original retry identity.
      if(e instanceof ModelConfigError&&e.code==="PUBLICATION_LOCK_PENDING")return biJson({error:e.message,code:e.code,operationNotStaged:false},e.status);
      if(e instanceof BillingError)return biJson({error:e.message,code:e.code,operationNotStaged:["CONFIG_CONFLICT","INVALID_CONFIG","OPERATION_CONFLICT"].includes(e.code)},e.status);
      if (e instanceof ModelConfigError) return biJson({ error: e.message, code: e.code, operationNotStaged: !staged || ["CONFIG_CONFLICT", "DRAFT_CONFLICT", "PUBLICATION_PENDING"].includes(e.code) }, e.status);
      if (e instanceof z.ZodError || e instanceof SyntaxError) return biJson({ error: "参数无效，请检查填写内容", operationNotStaged: true }, 400);
      // An ambiguous transport failure must keep the operation ID for reconciliation.
      return biJson({ error: "操作结果待核对，请使用同一操作重试", operationNotStaged: false }, 503);
    } finally {
      if (lock) { try { await lock.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [lockKey]); lock.release(); } catch { lock.release(true); } }
      releaseMutationTurn?.();
    }
  };
}
export const modelManagementHandler = createModelManagementHandler({ authorize: biAuthorize, administration: getModelAdministration, managed: modelConfigurationEnabled });
