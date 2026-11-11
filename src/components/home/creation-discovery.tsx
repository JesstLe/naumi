"use client";
import { useRef } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { useFeatureAccess } from "@/lib/feature-access/client";
import { toolBySlug } from "@/lib/tool-meta";
import { TemplateLibrary } from "@/components/templates/template-library";
import { CachedImage } from "@/components/cached-image";
import styles from "./creation-workbench.module.css";

const root="/demos/workbench-v2/";
const cards=[
  {slug:"batchshot",image:"suite-after.webp",label:"参考工作台"},
  {slug:"retouch",image:"retouch-before.webp",label:"产品精修"},
  {slug:"canvas",image:"image-after.webp",label:"创作画布"},
  {slug:"tryon",image:"tryon-after.webp",label:"服装上身"},
  {slug:"video",image:"suite-coffee-main.webp",label:"视频工作台"},
  {slug:"cutout",image:"cutout-after.webp",label:"AI 抠图"},
  {slug:"aplus",image:"suite-coffee-structure.webp",label:"A+ 详情页"},
  {slug:"studio3d",image:"packaging3d-after.webp",label:"3D 工作台"},
];
export function CreationDiscovery(){
  const {canPage}=useFeatureAccess(),rail=useRef<HTMLDivElement>(null);
  const visible=cards.filter(c=>canPage(c.slug==="canvas"?"/canvas":toolBySlug(c.slug)?.href||"/tools"));
  return <>
    <section className={styles.features} aria-label="创作工具">
      <div ref={rail} className={styles.featureScroll}>
        {canPage("/suite")&&<Link href="/suite" className={styles.featurePromo}><CachedImage src={root+"suite-coffee-scene.webp"} alt="商品套图示例"/><span>一键套图<ArrowUpRight/></span></Link>}
        {Array.from({length:Math.ceil(visible.length/2)},(_,i)=><div className={styles.featureColumn} key={i}>{visible.slice(i*2,i*2+2).map(c=><Link className={styles.featureCard} href={c.slug==="canvas"?"/canvas":toolBySlug(c.slug)?.href||"/tools"} key={c.slug}><CachedImage src={root+c.image} alt=""/><span>{c.label}</span><ArrowUpRight/></Link>)}</div>)}
      </div>
      <button type="button" className={styles.featureNext} aria-label="更多创作工具" onClick={()=>{const el=rail.current;if(el)el.scrollTo({left:el.scrollLeft>=el.scrollWidth-el.clientWidth-5?0:el.scrollLeft+340,behavior:"smooth"});}}><ChevronRight/></button>
    </section>
    {canPage("/templates")&&<section className={styles.discovery} id="templates" aria-label="模板灵感"><TemplateLibrary home/></section>}
  </>;
}
