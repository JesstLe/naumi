import type {VideoProviderRuntimeConfig} from "./config";

/** Shared endpoint calculation; no transport, uploader, registry or credentials. */
export function videoWireEndpoint(config:Pick<VideoProviderRuntimeConfig,"baseUrl"|"videoProfile">,path:string){
  let base=config.baseUrl.replace(/\/+$/,"");
  if((config.videoProfile?.startsWith("tokendance-")||config.videoProfile==="compshare-h3")&&base.endsWith("/v1"))base=base.slice(0,-3);
  const version=path.match(/^\/(?:api\/)?v\d+(?:beta)?(?=\/)/)?.[0];
  return base+(version&&base.endsWith(version)?path.slice(version.length):path);
}
