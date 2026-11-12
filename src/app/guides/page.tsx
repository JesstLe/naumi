import Link from "next/link";
import { notFound } from "next/navigation";
import { guides } from "@/lib/seo/catalog";
import { publicMetadata, publicSeoEnabled } from "@/lib/seo/server";
import styles from "./guides.module.css";

export async function generateMetadata() { return publicMetadata("/guides"); }

export default async function GuidesPage() {
  if (!(await publicSeoEnabled())) notFound();
  return <div data-guide-surface className={styles.surface}><div className={styles.container}>
    <nav className={styles.breadcrumb} aria-label="面包屑"><Link href="/">Naumi</Link><span aria-hidden="true">/</span><span>使用指南</span></nav>
    <header className={styles.header}><h1>AI 设计使用指南</h1></header>
    <div className={styles.grid}>{guides.map(guide => <Link className={styles.card} href={`/guides/${guide.slug}`} key={guide.slug}><h2>{guide.title}</h2><p>{guide.description}</p><span aria-hidden="true">↗</span></Link>)}</div>
    <section className={styles.facts}><h2>开始创作</h2><dl><div><dt>使用方式</dt><dd>在浏览器中打开 Naumi，上传参考图或输入需求。</dd></div><div><dt>生成条件</dt><dd>实际生成需要登录，功能与额度以账号当前状态为准。</dd></div><div><dt>结果检查</dt><dd>商品外观、包装文字与导出文件需要在发布前核对。</dd></div></dl><Link className={styles.primary} href="/">进入 Naumi</Link></section>
  </div></div>;
}
