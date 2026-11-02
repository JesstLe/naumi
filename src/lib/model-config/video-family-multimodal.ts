import declared from "./video-family-multimodal.json";
import type {VideoModelDefinition,VideoWireProfile} from "../video/capability-schema";

/** A new wire generation, never a reinterpretation of an accepted v2 task. */
export const MULTIMODAL_VIDEO_FAMILIES=declared.items.map(item=>({...item,
  definition:item.definition as VideoModelDefinition,profile:item.profile as VideoWireProfile}));
