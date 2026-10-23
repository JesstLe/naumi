'use client';
import Link from 'next/link';
import { ArrowUpRight, Building2, Wallet } from 'lucide-react';
import { ProviderOps } from './provider-ops';
import styles from './supplier-balance-page.module.css';

export function SupplierBalancePage() {
  return <main className={styles.page}>
    <header className={styles.heading}><div><span>模型与供应商</span><h1>供应商余额</h1></div><Link href='/admin/model-management'>管理供应商<ArrowUpRight size={15} /></Link></header>
    <div className={styles.scope}><div><Wallet size={20} /><section><h2>平台共享采购账户</h2><p>上游余额供各企业共用，仅平台管理员可见。</p></section></div><div><Building2 size={20} /><section><h2>企业消费独立统计</h2><p>按创作归属及实际成员账户结算，不分摊上游余额。</p><Link href='/admin/tenants'>查看租户用量<ArrowUpRight size={14} /></Link></section></div></div>
    <ProviderOps showActivity={false} />
  </main>;
}
