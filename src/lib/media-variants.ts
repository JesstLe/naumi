import 'server-only';
import sharp from 'sharp';

export async function makeMediaVariants(bytes: Buffer) {
  const image = sharp(bytes, { limitInputPixels: 64_000_000, failOn: 'error' }).rotate();
  const decoded = await image.clone().raw().toBuffer({ resolveWithObject: true });
  const {width,height} = decoded.info;
  const base = () => sharp(decoded.data, {raw:decoded.info});
  const thumbnail = await base().resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).webp({quality:76}).toBuffer();
  const preview = await base().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:84}).toBuffer();
  return {width,height,thumbnail,preview};
}
