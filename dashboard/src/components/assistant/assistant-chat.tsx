"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { money } from "@/components/shop-types";
import type {
  ClientChatMessage,
  CommerceResponse,
  SendMessageResponse,
} from "./assistant-types";

// --- helpers --------------------------------------------------------------

const PERSIAN_RANGE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const MERCHANT_ID = "default";
const CONVERSATION_KEY = "nest-assistant-conversation";
const USER_KEY = "nest-assistant-user";

function isPersian(text: string): boolean {
  return PERSIAN_RANGE.test(text);
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadExternalUserId(): string {
  if (typeof window === "undefined") return `web-${uuid()}`;
  try {
    const existing = sessionStorage.getItem(USER_KEY);
    if (existing) return existing;
    const id = `web-${uuid()}`;
    sessionStorage.setItem(USER_KEY, id);
    return id;
  } catch {
    return `web-${uuid()}`;
  }
}

type ProductCardLike = Extract<CommerceResponse, { kind: "product_carousel" }>["items"][number];

const AVAILABILITY_LABEL: Record<ProductCardLike["availability"], string> = {
  in_stock: "In stock / موجود",
  low_stock: "Low stock / کم موجود",
  out_of_stock: "Out of stock / ناموجود",
};

// --- reply rendering -------------------------------------------------------

function ProductCarousel({ items, intro, rtl }: { items: ProductCardLike[]; intro?: string; rtl: boolean }) {
  if (items.length === 0) {
    return (
      <p className="assistant-empty-carousel" dir={rtl ? "rtl" : "ltr"}>
        {rtl ? "کالایی مطابق با درخواست شما یافت نشد." : "No products matched your request."}
      </p>
    );
  }
  return (
    <div className="assistant-carousel" dir="ltr">
      {intro && <p className="assistant-carousel-intro">{intro}</p>}
      <ul className="assistant-carousel-list" role="list">
        {items.map((item) => (
          <li key={item.productId} className="assistant-product-card">
            {item.imageUrl ? (
              <Image
                className="assistant-product-image"
                src={item.imageUrl}
                alt={item.title}
                width={176}
                height={88}
                unoptimized
                loading="lazy"
              />
            ) : (
              <span className="assistant-product-image assistant-product-image-placeholder" aria-hidden="true" />
            )}
            <div className="assistant-product-body">
              <h4 className="assistant-product-title">
                <Link href={item.productUrl}>{item.title}</Link>
              </h4>
              <p className="assistant-product-price">{money(item.priceMinor, item.currency)}</p>
              <span className={`assistant-availability badge-${item.availability}`}>
                {AVAILABILITY_LABEL[item.availability]}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuickReplies({ options, onReply, rtl }: { options: { id: string; label: string }[]; onReply: (option: { id: string; label: string }) => void; rtl: boolean }) {
  return (
    <div className="assistant-quick-replies" dir={rtl ? "rtl" : "ltr"}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="assistant-quick-reply"
          onClick={() => onReply(option)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ReplyBody({ reply, onQuickReply, rtl }: { reply: CommerceResponse; onQuickReply: (option: { id: string; label: string }) => void; rtl: boolean }) {
  switch (reply.kind) {
    case "text":
      return <p className="assistant-bubble-text">{reply.text}</p>;
    case "product_carousel":
      return <ProductCarousel items={reply.items} intro={reply.intro} rtl={rtl} />;
    case "quick_replies":
      return (
        <>
          <p className="assistant-bubble-text">{reply.text}</p>
          <QuickReplies options={reply.options} onReply={onQuickReply} rtl={rtl} />
        </>
      );
    case "checkout_link":
      return (
        <p className="assistant-bubble-text">
          <Link href={reply.url} className="assistant-checkout-link" target="_blank" rel="noopener noreferrer">
            {reply.text}
          </Link>
        </p>
      );
    case "human_handoff":
      return (
        <div className="assistant-handoff" role="note">
          <span className="assistant-handoff-icon" aria-hidden="true">✦</span>
          <p>{reply.text}</p>
        </div>
      );
    default:
      return null;
  }
}

// Localized visible copy — accessible names stay English/stable for testability
const COPY = {
  sendLabel: "Send message",
  retryLabel: "Retry",
} as const;

// --- main component -------------------------------------------------------

export function AssistantChat() {
  const [messages, setMessages] = useState<ClientChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [externalUserId] = useState<string>(() => loadExternalUserId());
  const liveRegionRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // read-back region for the last assistant reply (aria-live polite)
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    // focus the input on mount for keyboard usability
    inputRef.current?.focus();
  }, []);

  // auto-scroll the viewport to the newest message
  useEffect(() => {
    const node = viewportRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, sending]);

  const rtl = useMemo(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) return isPersian(lastUser.text);
    return isPersian(input);
  }, [messages, input]);

  async function sendMessage(text: string, externalMessageId: string) {
    setSending(true);
    setError(null);
    try {
      const response = await api<SendMessageResponse>(
        "/conversations/messages",
        {
          method: "POST",
          headers: { "x-merchant-id": MERCHANT_ID },
          body: JSON.stringify({
            text,
            externalMessageId,
            externalUserId,
          }),
        },
      );
      setMessages((prev) => [
        ...prev,
        {
          id: response.messageId,
          role: "assistant",
          text: response.reply.kind === "text"
            ? response.reply.text
            : response.reply.kind === "quick_replies"
              ? response.reply.text
              : response.reply.kind === "checkout_link"
                ? response.reply.text
                : response.reply.kind === "human_handoff"
                  ? response.reply.text
                  : "",
          reply: response.reply,
        },
      ]);
      // persist conversation id for follow-ups (AC-02)
      try {
        sessionStorage.setItem(CONVERSATION_KEY, response.conversationId);
      } catch {
        // ignore sessionStorage failures
      }
      announceReply(response.reply);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Unable to send your message.";
      setError(message);
      setMessages((prev) =>
        prev.map((m) =>
          m.role === "user" && m.externalMessageId === externalMessageId
            ? { ...m, error: true }
            : m,
        ),
      );
    } finally {
      setSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function announceReply(reply: CommerceResponse) {
    switch (reply.kind) {
      case "text":
        setAnnouncement(reply.text);
        break;
      case "product_carousel":
        setAnnouncement(reply.intro ?? `${reply.items.length} products found`);
        break;
      case "quick_replies":
        setAnnouncement(reply.text);
        break;
      case "checkout_link":
        setAnnouncement(reply.text);
        break;
      case "human_handoff":
        setAnnouncement(reply.text);
        break;
    }
  }

  function retryMessage(target: ClientChatMessage) {
    if (!target.externalMessageId || !target.text) return;
    setError(null);
    // clear the error flag on the user bubble so it stops looking failed while we retry
    setMessages((prev) =>
      prev.map((m) =>
        m.externalMessageId === target.externalMessageId ? { ...m, error: false } : m,
      ),
    );
    void sendMessage(target.text, target.externalMessageId);
  }

  function submit() {
    const text = input.trim();
    if (!text || sending) return;
    const externalMessageId = uuid();
    const userBubble: ClientChatMessage = {
      id: `user-${externalMessageId}`,
      role: "user",
      text,
      externalMessageId,
      pending: true,
    };
    setMessages((prev) => [...prev, userBubble]);
    setInput("");
    void sendMessage(text, externalMessageId);
  }

  function handleQuickReply(option: { id: string; label: string }) {
    if (sending) return;
    const externalMessageId = uuid();
    const userBubble: ClientChatMessage = {
      id: `user-${externalMessageId}`,
      role: "user",
      text: option.label,
      externalMessageId,
      pending: true,
    };
    setMessages((prev) => [...prev, userBubble]);
    void sendMessage(option.label, externalMessageId);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  const empty = messages.length === 0;
  const lastFailedUserMessage = [...messages].reverse().find((m) => m.role === "user" && m.error);

  return (
    <main
      id="main-content"
      className={`assistant-shell${rtl ? " assistant-rtl" : ""}`}
      dir={rtl ? "rtl" : "ltr"}
      lang={rtl ? "fa" : "en"}
    >
      <header className="assistant-header">
        <p className="shop-kicker">{rtl ? "دستیار خرید" : "Shopping assistant"}</p>
        <h1>{rtl ? "دستیار خرید" : "Shopping assistant"}</h1>
        <p className="assistant-subtitle">
          {rtl
            ? "محصولات را با زبان طبیعی پیدا کنید. هر قیمت و موجودی توسط بک‌اند تأیید شده است."
            : "Find products in your own words. Every price and stock detail is verified by our backend."}
        </p>
      </header>

      <section
        ref={viewportRef}
        className="assistant-viewport"
        aria-label="Conversation"
      >
        {empty && !sending && (
          <div className="assistant-empty" role="status">
            <p className="assistant-empty-title">
              {rtl ? "سلام! چطور می‌تونم کمکتون کنم؟" : "Hello! How can I help you today?"}
            </p>
            <p className="assistant-empty-hint">
              {rtl
                ? "مثلاً: «کفش سفید سایز ۴۲» رو امتحان کنید."
                : "Try: \u201Cwhite runner size 42\u201D or any product question."}
            </p>
          </div>
        )}

        {messages.map((message) => (
          <article
            key={message.id}
            className={`assistant-bubble assistant-bubble-${message.role}${message.error ? " assistant-bubble-error" : ""}`}
            aria-label={message.role === "user" ? "Your message" : "Assistant reply"}
          >
            <div className="assistant-bubble-body">
              {message.role === "user"
                ? <p className="assistant-bubble-text">{message.text}</p>
                : message.reply
                  ? <ReplyBody reply={message.reply} onQuickReply={handleQuickReply} rtl={rtl} />
                  : <p className="assistant-bubble-text">{message.text}</p>}
            </div>
          </article>
        ))}

        {sending && (
          <div
            className="assistant-bubble assistant-bubble-assistant assistant-typing"
            role="status"
            aria-label="Assistant is typing"
          >
            <span className="assistant-typing-dot" aria-hidden="true" />
            <span className="assistant-typing-dot" aria-hidden="true" />
            <span className="assistant-typing-dot" aria-hidden="true" />
          </div>
        )}
      </section>

      <div
        ref={liveRegionRef}
        className="assistant-live"
        aria-live="polite"
        role="status"
        data-testid="assistant-live"
      >
        {announcement}
      </div>

      {error && lastFailedUserMessage && (
        <div className="assistant-error-bar" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="assistant-retry"
            aria-label={COPY.retryLabel}
            onClick={() => retryMessage(lastFailedUserMessage)}
          >
            {rtl ? "تلاش دوباره" : "Retry"}
          </button>
        </div>
      )}

      <form
        className="assistant-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={inputRef}
          className="assistant-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={rtl ? "پیام خود را بنویسید…" : "Type a message…"}
          aria-label="New message"
          rows={1}
          disabled={sending}
        />
        <button
          type="submit"
          className="assistant-send"
          disabled={sending || !input.trim()}
          aria-label={COPY.sendLabel}
        >
          {rtl ? "ارسال" : "Send"}
        </button>
      </form>
    </main>
  );
}