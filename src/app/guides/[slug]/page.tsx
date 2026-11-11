import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { guides, guideJsonLd, NO_INDEX } from "@/lib/seo/catalog";
import { publicMetadata, publicSeoEnabled } from "@/lib/seo/server";
import { JsonLd } from "@/components/seo/json-ld";
import styles from "../guides.module.css";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return guides.some(g => g.slug === slug) ? publicMetadata(`/guides/${slug}`) : { robots: NO_INDEX };
}
export default async function GuidePage({ params }: Props) {
  if (!(await publicSeoEnabled())) notFound();
  const { slug } = await params;
  const guide = guides.find(g => g.slug === slug);
  if (!guide) notFound();
  return <div className={styles.surface}><article className={styles.article}>
    <JsonLd data={guideJsonLd(guide)} />
    <nav className={styles.breadcrumb} aria-label="面包屑"><Link href="/">Naumi</Link><span aria-hidden="true">/</span><Link href="/guides">使用指南</Link></nav>
    <header className={styles.header}><h1>{guide.title}</h1><p>{guide.description}</p><time dateTime={guide.modified}>更新于 {guide.modified}</time></header>
    <nav className={styles.contents} aria-label="本页目录">{guide.sections.map((section, i) => <a href={`#step-${i + 1}`} key={section.title}>{section.title}</a>)}</nav>
    {guide.sections.map((section, i) => <section className={styles.section} id={`step-${i + 1}`} key={section.title}><h2>{section.title}</h2>{section.body.map(body => <p key={body}>{body}</p>)}</section>)}
    <section className={styles.section} id="questions"><h2>常见问题</h2>{guide.questions.map(q => <div className={styles.question} key={q.question}><h3>{q.question}</h3><p>{q.answer}</p></div>)}</section>
    <div className={styles.actions}><Link className={styles.primary} href={guide.tool}>{guide.toolLabel}</Link><Link href="/guides">全部指南</Link></div>
    <nav className={styles.related} aria-label="相关指南">{guides.filter(g => g.slug !== guide.slug).map(g => <Link key={g.slug} href={`/guides/${g.slug}`}>{g.title}<span aria-hidden="true">↗</span></Link>)}</nav>
  </article></div>;
}
