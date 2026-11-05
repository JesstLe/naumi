import type {VideoGenerationRequest,VideoProviderCreateResult,VideoProviderPollResult} from "../types";
import type {VideoProviderRuntimeConfig} from "./config";
import type {VideoWireProfile} from "../capability-schema";

export type VideoWireContext={provider:VideoProviderRuntimeConfig;profile:VideoWireProfile;request:VideoGenerationRequest};
export type VideoWireRequest={path:string;method:"POST"|"GET"|"DELETE";body?:unknown;encoding:"json"|"multipart"|"none"};
export type VideoWireCodec={create:(context:VideoWireContext)=>VideoWireRequest;poll:(context:VideoWireContext,id:string)=>VideoWireRequest;
  created:(payload:unknown)=>VideoProviderCreateResult;polled:(payload:unknown,id?:string)=>VideoProviderPollResult;cancel?:(context:VideoWireContext,id:string)=>VideoWireRequest};
