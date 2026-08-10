// Conversation inbox client types — mirror the B10 handoff endpoints and
// the B08 conversation history endpoint. The client renders ONLY what the API
// returns; it never computes status or owner transitions itself.

export type ConversationStatus =
  | "ACTIVE"
  | "HANDOFF_REQUESTED"
  | "HUMAN_ACTIVE"
  | "CLOSED";

export type ConversationOwner = "AI" | "HUMAN";

export type HandoffStatus = "REQUESTED" | "ACCEPTED" | "RESOLVED" | "REJECTED";

/** GET /api/conversations/handoffs row shape (from HandoffService.handoffsForMerchant select). */
export type HandoffRow = {
  id: string;
  conversationId: string;
  reasonCode: string;
  status: HandoffStatus;
  requestedAt: string;
  acceptedById: string | null;
  resolvedAt: string | null;
  summary: {
    intent: string;
    products: Array<{ id: string; name: string }>;
    unresolvedIssue: { reasonCode: string; agentNote?: string };
  };
};

/** GET /api/conversations/:conversationId/messages message row (OrchestratorService.history select). */
export type HistoryMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  type: string;
  text: string | null;
  intent: Record<string, unknown> | null;
  occurredAt: string;
  createdAt: string;
};

export type HistoryResponse = {
  conversationId: string;
  messages: HistoryMessage[];
};

/** Normalized inbox display item: a handoff decorated with its conversation status chip. */
export type ConversationInboxItem = {
  handoffId: string;
  conversationId: string;
  reasonCode: string;
  status: HandoffStatus;
  conversationStatus: ConversationStatus;
  owner: ConversationOwner;
  requestedAt: string;
  acceptedById: string | null;
  resolvedAt: string | null;
  summary: HandoffRow["summary"];
};

export type ConversationFilter = "ALL" | "AI_ACTIVE" | "HANDOFF_REQUESTED" | "HUMAN_ACTIVE" | "CLOSED";

export const FILTER_LABELS: Record<ConversationFilter, string> = {
  ALL: "All",
  AI_ACTIVE: "AI active",
  HANDOFF_REQUESTED: "Handoff requested",
  HUMAN_ACTIVE: "Human active",
  CLOSED: "Closed",
};

/** Map a handoff + conversation status pair to the inbox filter bucket. */
export function filterBucket(conversationStatus: ConversationStatus, owner: ConversationOwner): Exclude<ConversationFilter, "ALL"> {
  if (conversationStatus === "HANDOFF_REQUESTED") return "HANDOFF_REQUESTED";
  if (conversationStatus === "HUMAN_ACTIVE") return "HUMAN_ACTIVE";
  if (conversationStatus === "CLOSED") return "CLOSED";
  // ACTIVE
  return owner === "HUMAN" ? "HUMAN_ACTIVE" : "AI_ACTIVE";
}

export const STATUS_CHIP_LABEL: Record<ConversationStatus, string> = {
  ACTIVE: "Active",
  HANDOFF_REQUESTED: "Handoff requested",
  HUMAN_ACTIVE: "Human active",
  CLOSED: "Closed",
};

export const OWNER_CHIP_LABEL: Record<ConversationOwner, string> = {
  AI: "AI",
  HUMAN: "Human",
};

export const HANDOFF_STATUS_LABEL: Record<HandoffStatus, string> = {
  REQUESTED: "Requested",
  ACCEPTED: "Accepted",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
};