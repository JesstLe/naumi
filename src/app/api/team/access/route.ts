import { resolveUserEmail } from "@/lib/admin-auth";
import { teamEntryAccess } from "@/lib/teams/grants";
import { teamJson,teamFailure } from "@/lib/teams/access";
import { dbEnabled } from "@/lib/db";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{
 const email=await resolveUserEmail(request);if(!email)return teamJson({error:"请先登录"},401);
 if(!dbEnabled)return teamJson({error:"数据库未配置"},503);
 const access=await teamEntryAccess(email);
 return teamJson({allowed:access.allowed,canManageTeams:access.admin,expiresAt:access.expiresAt});
}catch(error){return teamFailure(error);}}
