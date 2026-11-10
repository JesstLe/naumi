"use client";

/** Same-page client filters only. Read the live URL so consecutive controls
 * compose before React/router acknowledgements. Next's History integration
 * updates useSearchParams without rerunning an otherwise unchanged RSC page. */
export function replaceAdminQuery(values:Record<string,string>,clear:readonly string[]=[]){
  const url=new URL(window.location.href);
  for(const key of clear)url.searchParams.delete(key);
  for(const [key,value] of Object.entries(values))value?url.searchParams.set(key,value):url.searchParams.delete(key);
  if(url.href!==window.location.href)window.history.replaceState(null,"",url.pathname+url.search+url.hash);
}
