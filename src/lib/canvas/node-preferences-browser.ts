'use client';
import {canvasDocumentFetch,type CanvasDocumentScope} from './document-scope';
import type {NodePreferenceReadPorts} from './node-preferences';

/** Original read endpoint and personal demo key; shared-workspace demo data is
 * partitioned, never borrowed from the account's personal fallback. */
export function nodePreferenceBrowser(scope:CanvasDocumentScope,owner:string,notice:(message:string)=>void,failed:string):NodePreferenceReadPorts{
  const email=owner.toLowerCase(),key=`naumi:node-settings:${email}${scope.workspace==='personal'?'':':'+scope.workspace}`;
  return{
    async read(){
      const response=await canvasDocumentFetch(scope,`/api/canvas/node-settings?email=${encodeURIComponent(email)}`,{cache:'no-store'});
      const data=await response.json();if(!response.ok||typeof data?.persisted!=='boolean')throw Error(failed);
      return{persisted:data.persisted,settings:data.settings};
    },
    local:{read:()=>JSON.parse(localStorage.getItem(key)||'{}'),write:value=>localStorage.setItem(key,JSON.stringify(value))},notice,failed,
  };
}
