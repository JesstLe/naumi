import {registerVideoWireProfile} from "../wire";
import {arkCodec} from "./ark";
import {geminiCodec} from "./gemini";
import {minimaxCodec} from "./minimax";
import {kieCodec} from "./kie";
import {apimartCodec} from "./apimart";
import {openAICompatibleCodec} from "./openai-compatible";
import {TOKEN_DANCE_PROFILES,tokenDanceCodec} from "./tokendance";
import {TF_ROUTER_PROFILES,tfRouterCodec} from "./tfrouter";
import {COMPSHARE_PROFILES,compshareCodec} from "./compshare";
let installed=false;
export function installVideoWireCodecs(){
  if(installed)return;installed=true;
  for(const profile of ["openai-videos","grok2api","cogvideox3","agnes","agnes-v25"] as const)registerVideoWireProfile(profile,openAICompatibleCodec(profile));
  registerVideoWireProfile("ark",arkCodec);registerVideoWireProfile("gemini",geminiCodec);
  registerVideoWireProfile("minimax",minimaxCodec);registerVideoWireProfile("metaso",minimaxCodec);
  for(const profile of ["kie-generic","kie-kling","kie-kling-v26","kie-kling-omni-text","kie-kling-omni-image","kie-kling-omni-reference","kie-kling-omni-transform","kie-motion-control"] as const)registerVideoWireProfile(profile,kieCodec);
  for(const profile of ["apimart-generic","apimart-kling","apimart-kling-v26","apimart-kling-omni","apimart-motion-control"] as const)registerVideoWireProfile(profile,apimartCodec);
  for(const profile of TOKEN_DANCE_PROFILES)registerVideoWireProfile(profile,tokenDanceCodec(profile));
  for(const profile of TF_ROUTER_PROFILES)registerVideoWireProfile(profile,tfRouterCodec);
  for(const profile of COMPSHARE_PROFILES)registerVideoWireProfile(profile,compshareCodec(profile));
}
