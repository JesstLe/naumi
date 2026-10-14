export function isTopVideoDialog(root:HTMLElement|null){if(!root)return false;const fullscreen=document.fullscreenElement;if(fullscreen&&!fullscreen.contains(root))return false;
  const dialogs=Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]')).filter(dialog=>dialog.getClientRects().length>0).map((dialog,index)=>({dialog,index,z:Number.parseInt(getComputedStyle(dialog).zIndex,10)||0})).sort((a,b)=>a.z-b.z||a.index-b.index);return dialogs.at(-1)?.dialog===root;
}
