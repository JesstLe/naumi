import {imageCacheManifest} from '@/lib/browser-image-manifest';
export const runtime='nodejs',dynamic='force-dynamic';
export async function POST(request:Request){return imageCacheManifest(request,true);}
