import {redirect} from 'next/navigation';
import Link from 'next/link';
import {z} from 'zod';
import {requireAdminPage} from '@/lib/admin-page';
import {resolveCreationReference} from '@/lib/saas/creation-reference';
import {AdminCenterShell} from '@/components/admin/center-shell';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 await requireAdminPage('/admin/creations');const parsed=z.object({type:z.enum(['artwork','billing','model-call','image-job','video-task','canvas-task']),id:z.string().min(1).max(240),email:z.string().min(1).max(254)}).safeParse(await searchParams);
 if(parsed.success){const ref=await resolveCreationReference(parsed.data.type,parsed.data.id,parsed.data.email.toLowerCase());if(ref)redirect(ref);}
 return <AdminCenterShell active="creations"><section style={{padding:28}}><h1>创作关联未记录</h1><p style={{marginTop:12}}>此来源没有可靠的创作引用，未按时间或当前成员关系推断。</p><Link href="/admin/creations" style={{display:'inline-block',marginTop:20}}>返回创作记录</Link></section></AdminCenterShell>;
}
