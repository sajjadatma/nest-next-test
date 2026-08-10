"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  ConversationInboxItem,
  HistoryMessage,
  HistoryResponse,
  OWNER_CHIP_LABEL,
  STATUS_CHIP_LABEL,
} from "./conversation-types";

const MERCHANT_ID = "default";

/** Intent summary card: render only the attributes the API returned in the
 * handoff summary.intent and message.intent fields. Never invent attributes. */
function IntentCard({ summary }: { summary: ConversationInboxItem["summary"] }) {
  return (
    <section className="content-card" aria-labelledby="intent-card-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Operator summary</p>
          <h2 id="intent-card-title">AI summary &amp; intent</h2>
        </div>
      </div>
      <dl className="access-list">
        <div>
          <dt>Intent</dt>
          <dd>{summary.intent || "other"}</dd>
        </div>
        <div>
          <dt>Unresolved reason</dt>
          <dd>{summary.unresolvedIssue.reasonCode}</dd>
        </div>
        <div>
          <dt>Agent note</dt>
          <dd>{summary.unresolvedIssue.agentNote}</dd>
        </div>
      </dl>
      {summary.products.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table shop-table">
            <caption className="sr-only">Verified products mentioned</caption>
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">ID</th>
              </tr>
            </thead>
            <tbody>
              {summary.products.map((product) => (
                <tr key={product.id}>
                  <td><strong>{product.name}</strong></td>
                  <td><small>{product.id}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="manager-note">No verified products referenced in this conversation.</p>
      )}
    </section>
  );
}

/** Normalize a message intent JSON into compact attribute rows. Renders only
 * string/number keys present in the API intent payload. */
function intentAttributes(intent: HistoryMessage["intent"]): Array<{ key: string; value: string }> {
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) return [];
  const entries: Array<{ key: string; value: string }> = [];
  for (const [key, value] of Object.entries(intent)) {
    if (typeof value === "string") entries.push({ key, value });
    else if (typeof value === "number") entries.push({ key, value: String(value) });
    else if (typeof value === "boolean") entries.push({ key, value: value ? "yes" : "no" });
  }
  return entries;
}

export function ConversationDetail({
  item,
  permissions,
  pendingAction,
  canTakeover,
  onAccept,
  onRelease,
  onClose,
}: {
  item: ConversationInboxItem;
  permissions: string[];
  pendingAction: boolean;
  canTakeover: boolean;
  onAccept: (conversationId: string) => void;
  onRelease: (conversationId: string) => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<HistoryMessage[] | null>(null);
  const [error, setError] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  const loadHistory = useCallback(() => {
    setError("");
    return api<HistoryResponse>(`/conversations/${item.conversationId}/messages`, {
      headers: { "x-merchant-id": MERCHANT_ID },
    })
      .then((response) => setMessages(response.messages))
      .catch((reason: Error) => {
        setError(reason.message || "Unable to load conversation history.");
        setMessages([]);
      });
  }, [item.conversationId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void loadHistory(); });
    return () => { active = false; };
  }, [loadHistory]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isHandoffRequested = item.conversationStatus === "HANDOFF_REQUESTED";
  const isHumanActive = item.conversationStatus === "HUMAN_ACTIVE";
  const takeoverDisabled = !canTakeover || pendingAction;
  // permissions intentionally referenced to keep the prop meaningful for future
  // granular gating; takeover is the only action gated today.
  void permissions;

  return (
    <section className="admin-order-overlay" role="dialog" aria-modal="true" aria-labelledby="conversation-detail-title">
      <section className="admin-order-detail" aria-labelledby="conversation-detail-title">
        <header>
          <div>
            <p className="eyebrow">Conversation</p>
            <h2 id="conversation-detail-title">{item.conversationId}</h2>
          </div>
          <button type="button" ref={closeRef} aria-label="Close conversation detail" onClick={onClose}>
            ×
          </button>
        </header>
        <dl className="access-list">
          <div>
            <dt>Status</dt>
            <dd>
              <span className="event-badge created">{STATUS_CHIP_LABEL[item.conversationStatus]}</span>
            </dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>
              <span className="event-badge login">{OWNER_CHIP_LABEL[item.owner]}</span>
            </dd>
          </div>
          <div>
            <dt>Handoff status</dt>
            <dd>{item.status}</dd>
          </div>
          <div>
            <dt>Reason</dt>
            <dd>{item.reasonCode}</dd>
          </div>
        </dl>

        <IntentCard summary={item.summary} />

        <section className="content-card" aria-labelledby="messages-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Timeline</p>
              <h2 id="messages-title">Messages</h2>
            </div>
          </div>
          {error && <p className="notice error" role="alert">{error}</p>}
          {messages === null && !error ? (
            <p className="manager-note" aria-busy="true">Loading messages…</p>
          ) : messages && messages.length === 0 ? (
            <p className="manager-note">No messages recorded for this conversation.</p>
          ) : (
            <ol className="moderation-list" role="list">
              {(messages ?? []).map((message) => {
                const isInbound = message.direction === "INBOUND";
                const attrs = intentAttributes(message.intent);
                return (
                  <li key={message.id}>
                    <article>
                      <header>
                        <strong>{isInbound ? "Customer" : "Assistant"}</strong>
                        <small>
                          <time dateTime={message.occurredAt}>
                            {new Date(message.occurredAt).toLocaleString("en-US")}
                          </time>
                        </small>
                      </header>
                      <p>{message.text || <em>(no text)</em>}</p>
                      {attrs.length > 0 && (
                        <footer>
                          <small>
                            {attrs.map((attr) => `${attr.key}: ${attr.value}`).join(" · ")}
                          </small>
                        </footer>
                      )}
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {canTakeover ? (
          <section className="order-operations" aria-label="Handoff operations">
            {isHandoffRequested && (
              <button
                type="button"
                className="admin-action"
                disabled={takeoverDisabled}
                aria-label="Take over this conversation"
                onClick={() => onAccept(item.conversationId)}
              >
                {pendingAction ? "Taking over…" : "Take over"}
              </button>
            )}
            {isHumanActive && (
              <button
                type="button"
                className="admin-action"
                disabled={takeoverDisabled}
                aria-label="Release this conversation back to AI"
                onClick={() => onRelease(item.conversationId)}
              >
                {pendingAction ? "Releasing…" : "Release to AI"}
              </button>
            )}
            {!isHandoffRequested && !isHumanActive && (
              <p className="manager-note">This conversation is not available for takeover or release.</p>
            )}
          </section>
        ) : (
          <p className="manager-note" data-testid="takeover-disabled-note">
            Takeover permission (conversations:takeover) is required to accept or release handoffs.
          </p>
        )}
      </section>
    </section>
  );
}