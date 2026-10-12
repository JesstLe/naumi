export type Team = { id: string; name: string; owner_email: string; authorized_until: string; enabled: boolean; version: number };
export type TeamMember = { email: string; name: string; banned: boolean; account_expires_at: string | null; management_version: number; available: number; consumed: number; artworks: number };
export type TeamSnapshot = { team: Team | null; members: TeamMember[]; teams?: Team[]; canManageTeams?: boolean };
export type ContentSection = "artworks" | "tasks" | "conversations" | "ledger" | "audit";
export type ContentRow = Record<string, string | number | boolean | null>;
export type ContentPage = { rows: ContentRow[]; total: number; page: number; size: number };

export type TeamAccessStatus = "ungranted" | "scheduled" | "active" | "paused" | "expired" | "revoked";
export type TeamAccessGrant = { email:string; scope:"owned"|"all"; starts_at:string; expires_at:string|null; enabled:boolean; revoked_at:string|null; version:number };
export type TeamAccessRow = { email:string; name:string; role:string; banned:boolean; account_expires_at:string|null; team_name:string|null; team_id:string|null; member_team_id:string|null; status:TeamAccessStatus } & Partial<TeamAccessGrant>;
export type TeamAccessList = { rows:TeamAccessRow[]; total:number; page:number; size:number };
export type TeamAccessEvent = { id:string; actor:string; target_email:string; action:string; created_at:string; changes:{ before:Partial<TeamAccessGrant>|null; after:Partial<TeamAccessGrant>|null } };
