"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  ConversationFilter,
  FILTER_LABELS,
  HandoffRow,
  HANDOFF_STATUS_LABEL,
  OWNER_CHIP_LABEL,
  STATUS_CHIP_LABEL,
  ConversationInboxItem,
  ConversationStatus,
  ConversationOwner,
  filterBucket,
} from "./conversation-types";
import { ConversationDetail } from "./conversation-detail";

const MERCHANT_ID = "default";
const HANDOFFS_PATH = "/conversations/handoffs";

/** The list API returns handoff state rather than Conversation.status. A
 * resolved handoff was released back to AI; rejected rows are closed. */
function deriveConversationStatus(handoffStatus: HandoffRow["status"]): ConversationStatus {
  switch (handoffStatus) {
    case "REQUESTED":
      return "HANDOFF_REQUESTED";
    case "ACCEPTED":
      return "HUMAN_ACTIVE";
    case "RESOLVED":
      return "ACTIVE";
    default:
      return "CLOSED";
  }
}

function deriveOwner(handoffStatus: HandoffRow["status"]): ConversationOwner {
  return handoffStatus === "ACCEPTED" ? "HUMAN" : "AI";
}

function toInboxItem(row: HandoffRow): ConversationInboxItem {
  return {
    handoffId: row.id,
    conversationId: row.conversationId,
    reasonCode: row.reasonCode,
    status: row.status,
    conversationStatus: deriveConversationStatus(row.status),
    owner: deriveOwner(row.status),
    requestedAt: row.requestedAt,
    acceptedById: row.acceptedById,
    resolvedAt: row.resolvedAt,
    summary: row.summary,
  };
}

const FILTERS: ConversationFilter[] = [
  "ALL",
  "AI_ACTIVE",
  "HANDOFF_REQUESTED",
  "HUMAN_ACTIVE",
  "CLOSED",
];

const PAGE_SIZE = 10;

export function ConversationInbox({ permissions }: { permissions: string[] }) {
  const canTakeover = permissions.includes("conversations:takeover");
  const [items, setItems] = useState<ConversationInboxItem[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("ALL");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError("");
    return api<HandoffRow[]>(HANDOFFS_PATH, { headers: { "x-merchant-id": MERCHANT_ID } })
      .then((rows) => setItems(rows.map(toInboxItem)))
      .catch((reason: Error) => {
        setError(reason.message || "Unable to load conversations.");
        setItems(null);
      });
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; };
  }, [load]);

  const filtered = useMemo(() => {
    if (!items) return [];
    if (filter === "ALL") return items;
    return items.filter((item) => filterBucket(item.conversationStatus, item.owner) === filter);
  }, [items, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selected = useMemo(
    () => items?.find((item) => item.conversationId === selectedId) ?? null,
    [items, selectedId],
  );

  function handleFilterChange(next: ConversationFilter) {
    setFilter(next);
    setPage(1);
  }

  /** Optimistic accept: flip local item to HUMAN_ACTIVE immediately; roll back
   * on API error. Disable further actions on the same row while pending. */
  async function acceptHandoff(conversationId: string) {
    if (!canTakeover || pendingActionId) return;
    const snapshot = items;
    setPendingActionId(conversationId);
    setItems((current) =>
      (current ?? []).map((item) =>
        item.conversationId === conversationId
          ? { ...item, status: "ACCEPTED", conversationStatus: "HUMAN_ACTIVE", owner: "HUMAN" }
          : item,
      ),
    );
    try {
      await api(`${HANDOFFS_PATH.replace("handoffs", `${conversationId}/handoff/accept`)}`, {
        method: "POST",
        headers: { "x-merchant-id": MERCHANT_ID },
      });
      await load();
    } catch (reason) {
      setItems(snapshot);
      setError(reason instanceof Error ? reason.message : "Unable to accept the handoff.");
    } finally {
      setPendingActionId(null);
    }
  }

  /** Optimistic release: flip local item back to AI_ACTIVE; roll back on error. */
  async function releaseToAi(conversationId: string) {
    if (!canTakeover || pendingActionId) return;
    const snapshot = items;
    setPendingActionId(conversationId);
    setItems((current) =>
      (current ?? []).map((item) =>
        item.conversationId === conversationId
          ? { ...item, status: "RESOLVED", conversationStatus: "ACTIVE", owner: "AI" }
          : item,
      ),
    );
    try {
      await api(`${HANDOFFS_PATH.replace("handoffs", `${conversationId}/handoff/release`)}`, {
        method: "POST",
        headers: { "x-merchant-id": MERCHANT_ID },
      });
      await load();
    } catch (reason) {
      setItems(snapshot);
      setError(reason instanceof Error ? reason.message : "Unable to release the conversation.");
    } finally {
      setPendingActionId(null);
    }
  }

  if (items === null && !error) {
    return (
      <section className="shop-admin" aria-busy="true">
        <section className="content-card">
          <p className="eyebrow">Conversations</p>
          <h2>Loading conversations…</h2>
        </section>
      </section>
    );
  }

  if (error && items === null) {
    return (
      <section className="shop-admin">
        {error && <p className="notice error" role="alert">{error}</p>}
        <section className="content-card">
          <p className="eyebrow">Conversations</p>
          <h2>Something went wrong</h2>
          <p className="manager-note">{error}</p>
          <button className="admin-action" type="button" onClick={() => { setError(""); void load(); }}>
            Retry
          </button>
        </section>
      </section>
    );
  }

  return (
    <section className="shop-admin">
      {error && <p className="notice error" role="alert">{error}</p>}
      <section className="content-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Operator inbox</p>
            <h2>Conversations</h2>
          </div>
          <span className="status-dot">{items?.length ?? 0} total</span>
        </div>
        <div className="shop-filters" role="tablist" aria-label="Conversation status filter">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              className={filter === value ? "selected" : undefined}
              onClick={() => handleFilterChange(value)}
            >
              {FILTER_LABELS[value]}
            </button>
          ))}
        </div>
        {paged.length === 0 ? (
          <p className="manager-note" data-testid="inbox-empty">
            No conversations match this filter.
          </p>
        ) : (
          <div className="table-wrap" role="region" aria-label="Conversation handoffs" tabIndex={0}>
            <table className="data-table shop-table">
              <caption className="sr-only">Merchant conversation handoffs</caption>
              <thead>
                <tr>
                  <th scope="col">Conversation</th>
                  <th scope="col">Status</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Handoff</th>
                  <th scope="col">Requested</th>
                  <th scope="col">{""}</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((item) => (
                  <tr key={item.handoffId}>
                    <td>
                      <strong>{item.summary.intent || "Conversation"}</strong>
                      <small>{item.conversationId}</small>
                    </td>
                    <td>
                      <span className="event-badge created">
                        {STATUS_CHIP_LABEL[item.conversationStatus]}
                      </span>
                    </td>
                    <td>
                      <span className="event-badge login">
                        {OWNER_CHIP_LABEL[item.owner]}
                      </span>
                    </td>
                    <td>{HANDOFF_STATUS_LABEL[item.status]}</td>
                    <td>
                      <time dateTime={item.requestedAt}>
                        {new Date(item.requestedAt).toLocaleString("en-US")}
                      </time>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        type="button"
                        aria-label={`Open conversation ${item.conversationId}`}
                        onClick={() => setSelectedId(item.conversationId)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span>Page {safePage} of {totalPages}</span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        )}
      </section>
      {selected && (
        <ConversationDetail
          item={selected}
          permissions={permissions}
          pendingAction={pendingActionId === selected.conversationId}
          canTakeover={canTakeover}
          onAccept={acceptHandoff}
          onRelease={releaseToAi}
          onClose={() => setSelectedId(null)}
        />
      )}
    </section>
  );
}

type ConversationAccount = { permissions?: string[] };

/** Route-level client boundary: resolves the current user's permissions before
 * mounting the protected inbox. The server remains authoritative; this only
 * prevents an unauthorised navigation shell from attempting protected reads. */
export function ConversationInboxPage() {
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<ConversationAccount>("/auth/me")
      .then((account) => setPermissions(account.permissions ?? []))
      .catch((reason: Error) => setError(reason.message || "Unable to load conversation access."));
  }, []);

  if (error) {
    return <p className="notice error" role="alert">{error}</p>;
  }
  if (permissions === null) {
    return <section className="content-card" aria-busy="true"><p className="manager-note">Loading conversations…</p></section>;
  }
  if (!permissions.includes("conversations:read")) return null;
  return <ConversationInbox permissions={permissions} />;
}