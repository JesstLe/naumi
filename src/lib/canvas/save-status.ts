/** Read-only presentation of state owned by each existing document. */
export type CanvasSaveItem={id:string;kind:string;projectKey:string;title:string;
  state:"pending"|"saving"|"failed"|"conflict"|"unavailable"|"sync";message?:string;canDiscard?:boolean};
export const saveItemFailed=(item:CanvasSaveItem)=>["failed","conflict","unavailable","sync"].includes(item.state);
export function projectSaveItems(items:readonly CanvasSaveItem[],project:string|null){return items.filter(item=>item.projectKey===(project||"workspace"));}
export function saveFailureState(error:unknown):"failed"|"conflict"|"unavailable"{
  const value=error as {status?:number;code?:string}|undefined;
  return value?.status===404?"unavailable":value?.status===409?"conflict":"failed";
}
