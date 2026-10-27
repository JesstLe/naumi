import type {CanvasVideoNode} from "../canvas/video-node-schema";

/** The editor and submission use the same saved node contract, not UI state. */
export type VideoNodeDraft=Pick<CanvasVideoNode,"title"|"config"|"inputs">&{expectedRevision:number};
