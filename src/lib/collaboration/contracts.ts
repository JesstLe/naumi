/** Public wire types for enterprise messaging and consent-bound canvas sharing.
 * No server imports. Runtime authorization belongs to the owning server module.
 * Member identities are normalized existing account emails, never auth credentials.
 */
export type CollaborationPresence = "online" | "away" | "offline";
export type CollaborationMember = {
  id: string; name: string; roleName: string; avatarUrl?: string;
  presence: CollaborationPresence;
};
export type CollaborationEnterprise = { id: string; name: string };
export type CollaborationBootstrap = {
  actorId: string; enterprises: CollaborationEnterprise[];
  enterpriseId: string | null; members: CollaborationMember[];
  conversations: CollaborationConversation[]; cursor: string | null;
  limits: { attachmentBytes: number; chunkBytes: number };
  /** Account/enterprise aggregate, independent of the first conversation page. */
  unreadTotal?: number;
  membersNextCursor?: string | null;
  conversationsNextCursor?: string | null;
};
export type CollaborationAttachment = {
  id: string; name: string; bytes: number; mime: string;
  downloadUrl: string; previewUrl?: string; availability: "ready" | "expired";
};
/** Markdown subset: emphasis, lists, links, emoji. Raw HTML is never rendered. */
export type CollaborationMessage = {
  id: string; conversationId: string; senderId: string; clientId: string;
  body: string; createdAt: string; withdrawnAt: string | null;
  replyTo: string | null; attachmentIds: string[];
  attachments: CollaborationAttachment[]; mentionIds: string[];
  shareId: string | null;
};
export type CollaborationConversation = {
  id: string; enterpriseId: string; kind: "direct" | "group";
  title: string; memberIds: string[]; ownerId: string;
  lastMessage: CollaborationMessage | null; unread: number;
  lastReadMessageId: string | null; pinned: boolean; muted: boolean;
  updatedAt: string;
};
export type CollaborationPage<T> = { items: T[]; nextCursor: string | null };
export type CollaborationConversationPage = CollaborationPage<CollaborationConversation> & { unreadTotal?: number };
/** A denied/left id is null, not a cached conversation with stale access. */
export type CollaborationConversationSnapshot = { conversation: CollaborationConversation | null; unreadTotal?: number };
export type CollaborationSend = {
  clientId: string; body: string; replyTo?: string;
  attachmentIds?: string[]; mentionIds?: string[]; shareId?: string;
};
export type CollaborationEvent = {
  id: string; type: "invalidate" | "reset";
  topics: Array<"conversations" | "messages" | "members" | "shares">;
  conversationId?: string;
};
export type CollaborationUpload = {
  id: string; name: string; bytes: number; chunkBytes: number;
  uploadedParts: number[]; expiresAt: string;
  attachment: CollaborationAttachment | null;
};
export type CanvasShareStatus = "offered" | "requested" | "approved" | "rejected" | "revoked";
export type CanvasShareSource = {
  projectKey: string; nodeIds?: string[]; kind: "artwork" | "workflow";
};
export type CanvasShare = {
  id: string; enterpriseId: string; authorId: string; requesterId: string;
  title: string; kind: "artwork" | "workflow"; status: CanvasShareStatus;
  createdAt: string; updatedAt: string; version: number;
  previewUrl: string | null; resultProjectKey: string | null;
};
export type CanvasShareCreate =
  | { action: "request"; operationId: string; authorId: string }
  | { action: "offer"; operationId: string; requesterId: string; source: CanvasShareSource };
export type CanvasShareChange = {
  action: "request" | "approve" | "reject" | "revoke";
  operationId: string; expectedVersion: number; source?: CanvasShareSource;
};
/** Root-mounted provider API: page entries never own the realtime/upload lifetime. */
export type CollaborationOpen = {
  memberId?: string; conversationId?: string;
  section?: "conversations" | "members" | "requests";
};
export type CollaborationShareIntent = CanvasShareSource & { title?: string };
