import type {VideoWireProfile} from "../capability-schema";
import type {VideoWireCodec} from "./wire-contracts";

// Storage only. The existing protocols installer owns built-in composition.
const codecs=new Map<VideoWireProfile,VideoWireCodec>();
export function registerVideoWireProfile(profile:VideoWireProfile,codec:VideoWireCodec){
  if(codecs.has(profile))throw new Error(`Duplicate video wire profile ${profile}`);codecs.set(profile,codec);
}
export function registeredVideoWireProfile(profile:VideoWireProfile){return codecs.get(profile);}
