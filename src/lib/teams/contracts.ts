export type Team = { id: string; name: string; owner_email: string; authorized_until: string; enabled: boolean; version: number };
export type TeamMember = { email: string; name: string; banned: boolean; account_expires_at: string | null; management_version: number; available: number; consumed: number; artworks: number };
export type TeamSnapshot = { team: Team | null; members: TeamMember[]; teams?: Team[] };
export type ContentSection = "artworks" | "tasks" | "conversations" | "ledger" | "audit";
export type ContentRow = Record<string, string | number | boolean | null>;
export type ContentPage = { rows: ContentRow[]; total: number; page: number; size: number };
