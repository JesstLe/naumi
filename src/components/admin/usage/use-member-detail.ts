"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import type {AdminUser,MemberArtwork,MemberDetail,UserActionPayload,UsersData} from "./contracts";
/** A selected member and its pending read live together. Closing/switching the
 * drawer invalidates that read; a late response cannot reopen or replace it. */
type MemberPatch=Partial<Pick<AdminUser,'banned'|'note'>>;
export function useMemberDetail(token:string|null,usersData:Pick<UsersData,"users">|null,patchMember:(email:string,patch:MemberPatch)=>void){
 const [detail,setDetail]=useState<MemberDetail|null>(null),[detailRow,setDetailRow]=useState<AdminUser|null>(null),[detailLoading,setDetailLoading]=useState(false),[noteDraft,setNoteDraft]=useState(""),[lightbox,setLightbox]=useState<{src:string;alt:string}|null>(null),[busy,setBusy]=useState(false),[msg,setMsg]=useState<{ok:boolean;text:string}|null>(null);
 const generation=useRef(0),pending=useRef<AbortController|null>(null),owner=useRef(token),mounted=useRef(true),actorEpoch=useRef(0);owner.current=token;
 const closeDetail=useCallback(()=>{generation.current++;pending.current?.abort();setDetail(null);setDetailRow(null);setDetailLoading(false);setLightbox(null);},[]);
 const invalidateMember=useCallback(()=>{mounted.current=false;generation.current++;pending.current?.abort();},[]);
 useEffect(()=>{mounted.current=true;actorEpoch.current++;closeDetail();setMsg(null);setBusy(false);return invalidateMember;},[token,closeDetail,invalidateMember]);
 async function openDetail(u:AdminUser){
  if(!token)return;const actor=token,serial=++generation.current;pending.current?.abort();const abort=new AbortController();pending.current=abort;
  setDetailRow(u);setNoteDraft(u.note??"");setDetailLoading(true);setDetail(null);setLightbox(null);
  try{const response=await fetch(`/api/admin/users?email=${encodeURIComponent(u.email)}`,{headers:{Authorization:`Bearer ${actor}`},signal:abort.signal});const data=await response.json();if(response.ok&&data.detail&&!abort.signal.aborted&&mounted.current&&owner.current===actor&&generation.current===serial)setDetail(data.detail as MemberDetail);}
  catch{/* Retain the original read failure behavior; pending identity still ends. */}
  finally{if(!abort.signal.aborted&&mounted.current&&owner.current===actor&&generation.current===serial)setDetailLoading(false);}
 }
  const memberBatches = useMemo(() => {
    if (!detail) return [];
    const map = new Map<string, MemberArtwork[]>();
    for (const a of detail.artworks) {
      const key = a.batchId || a.id.replace(/-\d+$/, "");
      const arr = map.get(key);
      if (arr) arr.push(a);
      else map.set(key, [a]);
    }
    return Array.from(map.values());
  }, [detail]);

  // 跟前端"哪些作品进画布"的规则一致:套图/多图批次,或多节点血缘树(同 group_id >1 张)
  // 才进只读画布;单张一次性生图不进画布(点标题只看大图)。
  const canvasGroupSizes = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of detail?.artworks ?? []) {
      const g = a.groupId || a.id;
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  }, [detail]);
  const batchEntersCanvas = (batch: MemberArtwork[]): boolean =>
    batch.length > 1 ||
    batch.some((a) => (canvasGroupSizes.get(a.groupId || a.id) ?? 0) > 1);


 useEffect(()=>{if(!detailRow||!usersData)return;const fresh=usersData.users.find(x=>x.email===detailRow.email);if(fresh&&(fresh.banned!==detailRow.banned||fresh.lastIp!==detailRow.lastIp||fresh.note!==detailRow.note))setDetailRow(fresh);},[usersData,detailRow]);
  async function userAction(payload: UserActionPayload) {
    if (!token) return;
    const actor=token,epoch=actorEpoch.current;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/users?view=command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "操作失败");
      if(!mounted.current||owner.current!==actor||actorEpoch.current!==epoch)return;
      const patch:MemberPatch|null=payload.action==='note'?{note:(payload.note??'').slice(0,1000)}
        :payload.action==='ban'?{banned:payload.banned===true}:null;
      if(payload.email&&patch){
        patchMember(payload.email,patch);
        setDetailRow(row=>row&&row.email===payload.email?{...row,...patch}:row);
      }
      setMsg({ ok: true, text: "已更新" });
    } catch (e) {
      if(mounted.current&&owner.current===actor&&actorEpoch.current===epoch)setMsg({ ok: false, text: e instanceof Error ? e.message : "操作失败" });
    } finally {
      if(mounted.current&&owner.current===actor&&actorEpoch.current===epoch)setBusy(false);
    }
  }

  function toggleBan(u: AdminUser) {
    if (
      !u.banned &&
      !window.confirm(
        `确认封禁 ${u.email}？该账号将无法继续生成图片。`
      )
    )
      return;
    void userAction({ action: "ban", email: u.email, banned: !u.banned });
  }


  function banRowIp(ip: string) {
    if (
      !window.confirm(
        `确认封禁 IP ${ip}？该 IP 将无法生成图片（注意：若与你当前 IP 相同会一并封禁你自己）。`
      )
    )
      return;
    void userAction({ action: "ban-ip", ip, reason: "管理员封禁" });
  }


 return {detail,detailRow,detailLoading,noteDraft,setNoteDraft,lightbox,setLightbox,busy,msg,openDetail,closeDetail,memberBatches,batchEntersCanvas,userAction,toggleBan,banRowIp};
}
