import "server-only";
import {getPool} from "@/platform/db/pool";
import {checkReadClientSocket,withOwnedReportClient} from "@/platform/db/owned-read-client";
import {providerCapacityDetail} from "./capacity";
import {channelHealthSummary} from "./channel-scheduler";
import {modelTrustedOrigins} from "./environment";
import {readPublishedModelSnapshot} from "./published-repository";

/** Only observed state for an already published configuration. Reading never
 * boots Router, acquires a supplier lease, or initializes a configuration. */
export async function readChannelCapacity(signal:AbortSignal){
  return withOwnedReportClient(getPool(),async tx=>{
    await tx.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await tx.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='3s'"+checkReadClientSocket);
    const snapshot=await readPublishedModelSnapshot(tx,{trustedOrigins:modelTrustedOrigins()});
    if(!snapshot)throw Error("CONFIG_UNAVAILABLE");
    const providers=await providerCapacityDetail(tx,snapshot.config);
    const health=await channelHealthSummary(tx,snapshot.config);
    await tx.query("COMMIT");
    const byProvider=new Map(snapshot.config.providers.map(provider=>[provider.id,provider]));
    const channels=snapshot.config.upstreamModels.map(upstream=>{
      const observed=health[upstream.id],provider=byProvider.get(upstream.providerId);
      return {
        upstreamId:upstream.id,providerId:upstream.providerId,providerName:provider?.name||upstream.providerId,
        wireModel:upstream.model,enabled:provider?.enabled??false,state:observed?.state||"unobserved",
        failures:observed?.failures||0,retryAt:observed?.retryAt||null,lastStatus:observed?.lastStatus??null,
        failureKind:observed?.failureKind||null,
      };
    });
    return {configVersion:snapshot.version,generatedAt:new Date().toISOString(),providers,channels};
  },signal);
}
