import declared from "./video-family-storyboard.json";
import type {VideoModelDefinition,VideoWireProfile} from "../video/capability-schema";

/** Exact, versioned storyboard contracts; prior profiles remain frozen. */
export const STORYBOARD_VIDEO_FAMILIES=declared.items.map(item=>({...item,
  definition:item.definition as VideoModelDefinition,profile:item.profile as VideoWireProfile,
  previousProfile:item.previousProfile as VideoWireProfile}));
