import type {VideoMode,VideoModelDefinition} from "./capability-schema";

/** Same frozen mode/spec restrictions drive both controls and submission. */
export function videoParameterScope<T extends VideoModelDefinition>(cap:T,mode?:VideoMode,resolution?:string):T {
  const scoped=mode?cap.modeParameters?.[mode]:undefined;
  const sources=(cap as T&{sources?:Record<string,string>}).sources;
  const rank=(key:string)=>({admin:3,vendor:2,adapter:1,unknown:0}[sources?.[key]||"unknown"]??0);
  // A vendor's conditional table must not override explicit administrator data,
  // including null and empty lists. Unresolved declarations share one authority.
  const preferMode=(key:"aspectRatios"|"durationResolutionMap")=>scoped?.[key]!==undefined&&rank("modeParameters")>=rank(key);
  const modeRatios=preferMode("aspectRatios"),ratios=modeRatios?scoped!.aspectRatios:cap.aspectRatios;
  const allowed=resolution&&rank("resolutionAspectRatios")>=rank(modeRatios?"modeParameters":"aspectRatios")?cap.resolutionAspectRatios?.[resolution]:undefined;
  return {...cap,durationResolutionMap:preferMode("durationResolutionMap")?scoped!.durationResolutionMap:cap.durationResolutionMap,
    aspectRatios:allowed?ratios?.filter(ratio=>allowed.includes(ratio)):ratios};
}
