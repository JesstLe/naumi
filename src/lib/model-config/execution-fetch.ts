import "server-only";
import type {ModelExecutionScope} from "./context";
import type {ValidationOptions} from "./schema";
import {healthObservedFetch} from "../model-health/observe";
import {providerExecutionTransport} from "./execution-transport";
import {createChannelRoutingFetch} from "./channel-routing";
import {createStageRoutingFetch} from "./stage-routing-policy";

/** One composition point. Policy receives this factory explicitly; provider
 * adaptation does not import policy, SDK clients, or a mutable global registry. */
export function executionFetch(scope: ModelExecutionScope, options: ValidationOptions = {}): typeof fetch {
  return healthObservedFetch(scope, executionTransport(scope, options), options);
}
function executionTransport(scope:ModelExecutionScope,options:ValidationOptions):typeof fetch{
 if(scope.supplierRouting)return channelRoutingFetch(scope,options);
 if(scope.businessOption&&!scope.audited)return stageRoutingFetch(scope,options);
 return providerExecutionTransport(scope,options);
}
export function channelRoutingFetch(scope:ModelExecutionScope,options:ValidationOptions):typeof fetch{
 return createChannelRoutingFetch(scope,options,executionFetch);
}
export function stageRoutingFetch(scope:ModelExecutionScope,options:ValidationOptions):typeof fetch{
 return createStageRoutingFetch(scope,options,executionFetch);
}
