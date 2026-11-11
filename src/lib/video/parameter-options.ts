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

/** Published, mode-scoped values only. Keep catalog order for existing defaults. */
export function videoDurations(cap:VideoModelDefinition & {sources?:Record<string,string>},mode?:VideoMode){
  return Array.from(new Set((videoParameterScope(cap,mode).durationResolutionMap||[]).flatMap(map=>map.durations)));
}

/** A slider must never fill gaps in a supplier's discrete duration declaration. */
export function videoDurationOptions(cap:VideoModelDefinition & {sources?:Record<string,string>},mode?:VideoMode){
  const durations=videoDurations(cap,mode);
  return {
    seconds:durations.filter(value=>Number.isInteger(value)&&value>0&&value<=3600).sort((a,b)=>a-b),
    automatic:cap.supportsAutoDuration===true&&durations.includes(-1),
  };
}

export function videoResolutions(cap:VideoModelDefinition, duration?:number, mode?:VideoMode) {
  return [...new Set((videoParameterScope(cap,mode).durationResolutionMap||[])
    .filter(map=>duration!==undefined&&map.durations.includes(duration)).flatMap(map=>map.resolutions))];
}
export function videoAspectRatios(cap:VideoModelDefinition,mode?:VideoMode,resolution?:string) {
  return videoParameterScope(cap,mode,resolution).aspectRatios||[];
}

/** Partial drafts must expose choices even before a duration is chosen.
 * Exact execution validation still requires a concrete supported combination. */
export function videoParameterChoices(cap:VideoModelDefinition, mode:VideoMode|undefined, selected:{durationSeconds?:number;resolution?:string}={}) {
  const durations=videoDurations(cap,mode).filter(duration=>duration>0||duration===-1&&cap.supportsAutoDuration===true);
  const resolutions=selected.durationSeconds===undefined
    ? [...new Set(durations.flatMap(duration=>videoResolutions(cap,duration,mode)))]
    : videoResolutions(cap,selected.durationSeconds,mode);
  const aspectRatios=selected.resolution||!resolutions.length
    ? videoAspectRatios(cap,mode,selected.resolution)
    : [...new Set(resolutions.flatMap(resolution=>videoAspectRatios(cap,mode,resolution)))];
  return {durations,resolutions,aspectRatios};
}
