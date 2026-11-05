import { resolveUserEmail } from "@/lib/admin-auth";
import { discoverTeamEntry } from "@/lib/teams/entry-server";
import { teamJson,teamFailure } from "@/lib/teams/access";
import { dbEnabled } from "@/platform/db/pool";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{
 const email=await resolveUserEmail(request);if(!email)return teamJson({error:"请先登录"},401);
 if(!dbEnabled)return teamJson({error:"数据库未配置"},503);
 return teamJson(await discoverTeamEntry(email));
}catch(error){return teamFailure(error);}}
