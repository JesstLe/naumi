import 'server-only';
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {FleetError} from './server';
export async function releaseSigningKey(){
  const file=process.env.FLEET_RELEASE_SIGNING_PRIVATE_KEY_FILE;
  if(!file)return process.env.FLEET_RELEASE_SIGNING_PRIVATE_KEY||'';
  try{
    if(!path.isAbsolute(file))throw Error('KEY_PATH');
    const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
    try{
      const stat=await handle.stat();
      if(!stat.isFile()||stat.size>4000||process.platform==='linux'&&((stat.uid!==0&&stat.uid!==process.getuid?.())||stat.mode&0o077))throw Error('KEY_MODE');
      const key=await handle.readFile('utf8');if(!key.includes('-----BEGIN PRIVATE KEY-----'))throw Error('KEY_FORMAT');return key;
    }finally{await handle.close();}
  }catch{throw new FleetError('发布签名文件未就绪',503);}
}
