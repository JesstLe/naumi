export type AdminUser = {
  email: string;
  name: string;
  plan: string;
  role: string;
  creditsTotal: number;
  creditsUsed: number;
  artworks: number;
  banned: boolean;
  lastIp: string | null;
  recent7: number;
  note: string;
};
export type Ledger = {
  id: string;
  email: string;
  delta: number;
  reason: string;
  kind?: string;
  expiresAt?: string | null;
  createdAt: string;
};
export type BannedIp = {
  ip: string;
  reason: string;
  createdAt: string;
};
export type UsersData = {
  stats: { users: number; artworks: number; remaining: number; used: number };
  users: AdminUser[];
  ledger: Ledger[];
  bannedIps: BannedIp[];
};
export type UsageData = {
  rangeDays: number;
  totals: { credits: number; operations: number; activeUsers: number };
  users: {
    email: string;
    name: string;
    role: string;
    credits: number;
    operations: number;
    balance: number;
    lastUsedAt: string | null;
  }[];
  daily: { date: string; credits: number; operations: number }[];
};
export type MemberArtwork = {
  id: string;
  title: string;
  category: string;
  prompt: string;
  status: string;
  image: string;
  gradient: string;
  createdAt: string;
  style?: string | null;
  ratio?: string | null;
  resolution?: string | null;
  source?: string | null;
  batchId?: string | null;
  parentId?: string | null;
  groupId?: string | null;
};

export type MemberDetail = {
  email: string;
  user: {
    name: string;
    email: string;
    plan: string;
    creditsTotal: number;
    creditsUsed: number;
  } | null;
  artworks: MemberArtwork[];
  ledger: Ledger[];
};

export type UserActionPayload = {
  action:
    | "role"
    | "adjust"
    | "ban"
    | "note"
    | "delete"
    | "ban-ip"
    | "unban-ip"
    | "create"
    | "reset-password";
  email?: string;
  role?: string;
  delta?: number;
  months?: number; // 赠送积分有效期(月);0=永久。仅 adjust 加分时用
  name?: string;
  password?: string;
  banned?: boolean;
  ip?: string;
  reason?: string;
  note?: string;
};

