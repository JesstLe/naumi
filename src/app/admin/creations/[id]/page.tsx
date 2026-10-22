import {redirect} from 'next/navigation';
import {requireAdminPage} from '@/lib/admin-page';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {id}=await params;await requireAdminPage(`/admin/creations/${id}`);const q=new URLSearchParams(Object.entries(await searchParams).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));q.set('creationId',id);redirect(`/admin/creations?${q}`);
}
