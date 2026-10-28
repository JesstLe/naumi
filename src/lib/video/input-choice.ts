import type {OrderedInput} from "./references";

/** Named UI choices share one leaf contract; display categories never change ordered-input wire. */
export type VideoInputChoice={id:string;nodeId:string;kind:OrderedInput["kind"];title:string;value:string;thumbnail?:string;available:boolean;category?:"character";referenceArtworkIds?:readonly string[]};
