import 'server-only';
import sharp from 'sharp';
import {privateMedia,storageKeyFromManagedUrl,readManagedObject} from '../storage';
import {canReadMedia} from '../media-assets';

export async function managedAgentReference(raw:string, origins:string[], email:string) {
  if(/[\u0000-\u0020\\]/.test(raw)||raw.startsWith('//'))throw new Error('参考图片地址无效');
  let canonical=raw;
  try {
    const url=new URL(raw);
    if(url.username||url.password||url.hash)throw new Error('参考图片地址无效');
    if(origins.includes(url.origin) && url.pathname.startsWith('/media/')) canonical=url.pathname;
  } catch(error) { if(!raw.startsWith('/'))throw error; }
  const key=storageKeyFromManagedUrl(canonical);
  if(!key)return null;
  if(privateMedia&&!await canReadMedia(key,email))throw new Error('素材不存在或无权访问');
  const object=await readManagedObject(canonical,12*1024*1024);
  const metadata=await sharp(object.bytes,{limitInputPixels:64*1024*1024}).metadata();
  const contentType=({png:'image/png',jpeg:'image/jpeg',webp:'image/webp'} as Record<string,string>)[metadata.format||''];
  if(!contentType)throw new Error('参考图片格式不支持');
  return {bytes:object.bytes,contentType};
}
