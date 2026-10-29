/** Keep known employee bookmarks useful without opening platform admin pages. */
export function enterpriseRequestUrl(requestUrl:string,host:string|null,forwardedProto:string|null){
  const url=new URL(requestUrl);
  if(host){
    const authority=new URL(`${url.protocol}//${host}`);
    url.hostname=authority.hostname;
    // URL.host does not clear an existing port when the new host omits it.
    url.port=authority.port;
  }
  if(forwardedProto==='https')url.protocol='https:';
  return url;
}

export function enterpriseAdminLocation(path:string,query:URLSearchParams){
  const p=new URLSearchParams();
  if(path==='/admin/health')p.set('view','health');
  if(path==='/admin/creations'||path==='/admin/center'){
    p.set('view','records');p.set('recordView',path==='/admin/center'&&query.get('section')==='artworks'?'artworks':query.get('creationId')?.startsWith('cr-')?'confirmed':'tasks');
    for(const key of ['from','to','status','q','user','page','creationId','assetPage','eventPage','childPage'])if(query.has(key))p.set(key,query.get(key)!);
    if(query.get('email')&&!p.has('user'))p.set('user',query.get('email')!);
  }
  return '/admin'+(p.size?'?'+p:'');
}
