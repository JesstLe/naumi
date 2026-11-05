/** Media retrieval URL/name only; no player, React state or execution dependency. */
export function mediaDownloadHref(url:string,name='video.mp4'){
  return `/api/download?u=${encodeURIComponent(url)}&n=${encodeURIComponent(name.replace(/[^\w.\-]+/g,'_').slice(0,160)||'video.mp4')}`;
}
export function mediaDownloadName(url:string,fallback='video.mp4'){
  try{const name=decodeURIComponent(new URL(url,'http://media.local').pathname.split('/').pop()||'');return /\.[A-Za-z0-9]{1,8}$/.test(name)?name:fallback;}
  catch{return fallback;}
}
