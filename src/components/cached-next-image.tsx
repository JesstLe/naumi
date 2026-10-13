'use client';
import Image, { type ImageProps } from 'next/image';
import { CachedImage } from './cached-image';
import { imageCacheSource } from '@/lib/browser-image-cache';
export default function CachedNextImage(props:ImageProps){
  if(typeof props.src!=='string'||!imageCacheSource(props.src))return <Image {...props}/>;
  const {fill,priority,quality,unoptimized,loader,placeholder,blurDataURL,onLoadingComplete,...rest}=props;
  return <CachedImage {...rest} src={props.src} loading={priority?'eager':props.loading} style={fill?{position:'absolute',height:'100%',width:'100%',inset:0,...props.style}:props.style}/>;
}
