import styles from '@/components/admin/theme.module.css';
/** Theme boundary only; each admin page retains its existing authentication. */
export default function AdminLayout({children}:{children:React.ReactNode}){return <div className={styles.theme}>{children}</div>;}
