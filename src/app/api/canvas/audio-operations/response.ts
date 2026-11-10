import {audioOperationFailure} from "@/lib/audio/operation-service";
export const audioHeaders={"cache-control":"private, no-store"};
export function audioFailure(error:unknown){const {status,...body}=audioOperationFailure(error);return Response.json(body,{status,headers:audioHeaders});}
