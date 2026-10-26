import {VideoContractError} from "../contract";
import type {VideoWireProfile} from "../capability-schema";
import type {VideoWireContext,VideoWireRequest} from "./wire-contracts";
import {registeredVideoWireProfile} from "./wire-registry";
import {installVideoWireCodecs} from "./protocols";

// Compatibility exports are aliases, not parallel helper implementations.
export type {VideoWireContext,VideoWireRequest,VideoWireCodec} from "./wire-contracts";
export * from "./wire-helpers";
export {registerVideoWireProfile} from "./wire-registry";

function codec(profile:VideoWireProfile){installVideoWireCodecs();const value=registeredVideoWireProfile(profile);if(!value)throw new VideoContractError("VIDEO_PROFILE_UNAVAILABLE",`视频协议${profile}尚未配置`,["videoProfile"]);return value;}
export function buildVideoCreate(context:VideoWireContext):VideoWireRequest{
  const wire=codec(context.profile).create(context);
  return {...wire,path:context.provider.createPath||wire.path};
}
export function buildVideoPoll(context:VideoWireContext,id:string):VideoWireRequest{
  const wire=codec(context.profile).poll(context,id);
  return {...wire,path:context.provider.pollPath?.replaceAll("{id}",encodeURIComponent(id))||wire.path};
}
export function buildVideoCancel(context:VideoWireContext,id:string):VideoWireRequest|null{return codec(context.profile).cancel?.(context,id)||null;}
export function decodeVideoCreated(profile:VideoWireProfile,payload:unknown){return codec(profile).created(payload);}
export function decodeVideoPolled(profile:VideoWireProfile,payload:unknown,id?:string){return codec(profile).polled(payload,id);}
