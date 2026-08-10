"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

const MERCHANT_ID = "default";

type Channel = {
  id: string;
  label: string;
  configured: boolean;
  healthy: boolean;
  lastEventAt?: string | null;
  error?: string | null;
};

type ChannelAccount = { permissions?: string[] };

function lastEventLabel(lastEventAt: string) {
  return new Date(lastEventAt).toLocaleString("en-US");
}

export function ChannelStatus({ permissions }: { permissions: string[] }) {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError("");
    try {
      const response = await api<Channel[]>("/channels/status", {
        headers: { "x-merchant-id": MERCHANT_ID },
        signal,
      });
      if (!signal?.aborted) setChannels(response);
    } catch (reason) {
      if (!signal?.aborted) {
        setChannels(null);
        setError(reason instanceof Error ? reason.message : "Unable to load channels.");
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { void load(controller.signal); });
    return () => controller.abort();
  }, [load, requestId]);

  if (!permissions.includes("channels:read")) return null;

  if (channels === null && !error) {
    return <section className="shop-admin" aria-busy="true"><section className="content-card"><p className="eyebrow">Channels</p><h2>Loading channels…</h2></section></section>;
  }

  if (channels === null) {
    return (
      <section className="shop-admin">
        <section className="content-card">
          <p className="notice error" role="alert">{error}</p>
          <p className="eyebrow">Channels</p>
          <h2>Something went wrong</h2>
          <button className="admin-action" type="button" onClick={() => setRequestId((current) => current + 1)}>Retry</button>
        </section>
      </section>
    );
  }

  return (
    <section className="shop-admin">
      <section className="content-card">
        <div className="section-heading">
          <div><p className="eyebrow">Merchant channels</p><h2>Channel status</h2></div>
        </div>
        {channels.length === 0 ? (
          <p className="manager-note" data-testid="channels-empty">No channels are available.</p>
        ) : (
          <div className="shop-admin-grid" aria-label="Channel status">
            {channels.map((channel) => (
              <section className="content-card" key={channel.id}>
                <h3>{channel.label}</h3>
                <p><span className="event-badge created">{channel.configured ? "Configured" : "Not configured"}</span></p>
                <p><span className={channel.healthy ? "event-badge login" : "event-badge deleted"}>{channel.healthy ? "Healthy" : "Error"}</span></p>
                {channel.lastEventAt && <p className="manager-note">Last event: <time dateTime={channel.lastEventAt}>{lastEventLabel(channel.lastEventAt)}</time></p>}
                {channel.error && <p className="notice error" role="alert">{channel.error}</p>}
              </section>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

export function ChannelStatusPage() {
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<ChannelAccount>("/auth/me")
      .then((account) => setPermissions(account.permissions ?? []))
      .catch((reason: Error) => setError(reason.message || "Unable to load channel access."));
  }, []);

  if (error) return <p className="notice error" role="alert">{error}</p>;
  if (permissions === null) return <section className="content-card" aria-busy="true"><p className="manager-note">Loading channels…</p></section>;
  return <ChannelStatus permissions={permissions} />;
}
