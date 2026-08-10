"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { DemandOutcomeFilter, DemandSummary, OUTCOME_FILTERS, TREND_LABELS } from "./demand-types";

const MERCHANT_ID = "default";
const PRESETS = [7, 30, 90] as const;

type DemandAccount = { permissions?: string[] };

type DateRange = { from: string; to: string };

function inputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function presetRange(days: number): DateRange {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(to.getUTCDate() - days + 1);
  return { from: inputDate(from), to: inputDate(to) };
}

function toIsoRange(range: DateRange) {
  return {
    from: `${range.from}T00:00:00.000Z`,
    to: `${range.to}T23:59:59.999Z`,
  };
}

function listOrSuppressed<T extends { count: number }>({
  items,
  testId,
  children,
}: {
  items: T[];
  testId: string;
  children: (item: T) => string;
}) {
  if (items.length === 0) return <p className="manager-note" data-testid={testId}>—</p>;
  return <ul className="manager-note" data-testid={testId}>{items.map((item, index) => <li key={`${children(item)}-${index}`}>{children(item)} ({item.count})</li>)}</ul>;
}

export function DemandDashboard({ permissions }: { permissions: string[] }) {
  const [preset, setPreset] = useState<number | "custom">(30);
  const [range, setRange] = useState<DateRange>(() => presetRange(30));
  const [outcome, setOutcome] = useState<DemandOutcomeFilter>("ALL");
  const [summary, setSummary] = useState<DemandSummary | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [requestId, setRequestId] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const selectedOutcome = OUTCOME_FILTERS.find((filter) => filter.value === outcome)?.apiValue;
    const selectedRange = toIsoRange(range);
    const query = new URLSearchParams({ from: selectedRange.from, to: selectedRange.to });
    if (selectedOutcome) query.set("outcome", selectedOutcome);

    setError("");
    setIsLoading(true);
    try {
      const response = await api<DemandSummary>(`/demand/summary?${query.toString()}`, {
        headers: { "x-merchant-id": MERCHANT_ID },
        signal,
      });
      if (!signal?.aborted) setSummary(response);
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "Unable to load demand.");
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [outcome, range]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { void load(controller.signal); });
    return () => controller.abort();
  }, [load, requestId]);

  function selectPreset(days: number) {
    setPreset(days);
    setRange(presetRange(days));
  }

  function changeCustomRange(field: keyof DateRange, value: string) {
    setPreset("custom");
    setRange((current) => ({ ...current, [field]: value }));
  }

  function retry() {
    setRequestId((current) => current + 1);
  }

  const trend = summary?.trend ? TREND_LABELS[summary.trend] : null;
  const hasDemand = (summary?.volume ?? 0) > 0;
  const selectedRangeLabel = useMemo(() => `${range.from} to ${range.to}`, [range]);

  if (!permissions.includes("demand:read")) return null;

  if (isLoading && summary === null) {
    return <section className="shop-admin" aria-busy="true"><section className="content-card"><p className="eyebrow">Demand</p><h2>Loading demand dashboard…</h2></section></section>;
  }

  if (error && summary === null) {
    return <section className="shop-admin"><section className="content-card"><p className="notice error" role="alert">{error}</p><p className="eyebrow">Demand</p><h2>Something went wrong</h2><button className="admin-action" type="button" onClick={retry}>Retry</button></section></section>;
  }

  return (
    <section className="shop-admin">
      {error && <div className="notice error" role="alert"><span>{error}</span><button className="text-button" type="button" onClick={retry}>Retry</button></div>}
      <section className="content-card">
        <div className="section-heading">
          <div><p className="eyebrow">Merchant demand</p><h2>Demand dashboard</h2></div>
          {isLoading && <span className="status-dot" role="status">Refreshing demand…</span>}
        </div>
        <div className="shop-filters" role="group" aria-label="Demand date range presets">
          {PRESETS.map((days) => <button key={days} type="button" className={preset === days ? "selected" : undefined} aria-pressed={preset === days} onClick={() => selectPreset(days)}>Last {days} days</button>)}
        </div>
        <div className="shop-form compact">
          <div>
            <label>From<input type="date" aria-label="Demand range from" value={range.from} max={range.to} onChange={(event) => changeCustomRange("from", event.target.value)} /></label>
            <label>To<input type="date" aria-label="Demand range to" value={range.to} min={range.from} onChange={(event) => changeCustomRange("to", event.target.value)} /></label>
          </div>
        </div>
        <div className="shop-filters" role="group" aria-label="Demand outcome filter">
          {OUTCOME_FILTERS.map((filter) => <button key={filter.value} type="button" className={outcome === filter.value ? "selected" : undefined} aria-pressed={outcome === filter.value} onClick={() => setOutcome(filter.value)}>{filter.label}</button>)}
        </div>
        <p className="manager-note">Showing {selectedRangeLabel}</p>
        {summary && <div className="metric-grid management-metrics" aria-label="Demand summary">
          <div className="metric-card"><span>Total request volume</span><strong data-testid="demand-volume">{summary.volume}</strong></div>
          <div className="metric-card"><span>Matched</span><strong>{summary.matched}</strong></div>
          <div className="metric-card"><span>Unmet</span><strong>{summary.unmet}</strong></div>
          <div className="metric-card"><span>Out of stock</span><strong>{summary.outOfStock}</strong></div>
          <div className="metric-card"><span>Price too high</span><strong>{summary.priceTooHigh}</strong></div>
        </div>}
      </section>

      {summary && !hasDemand && <section className="content-card" data-testid="demand-empty"><div className="section-heading"><div><p className="eyebrow">Demand</p><h2>No demand in this range</h2></div></div><p className="manager-note">Try a different date range or outcome.</p></section>}

      {summary && hasDemand && <>
        <section className="content-card">
          <div className="section-heading"><div><p className="eyebrow">Demand by category</p><h2>Requested categories</h2></div>{trend && <span className="status-dot" data-testid="demand-trend">Trend: {trend}</span>}</div>
          {summary.volumeByCategory.length === 0 ? <p className="manager-note">—</p> : <div className="table-wrap"><table className="data-table"><caption className="sr-only">Demand request volume by category</caption><thead><tr><th scope="col">Category</th><th scope="col">Requests</th></tr></thead><tbody>{summary.volumeByCategory.map((item, index) => <tr key={`${item.category ?? "uncategorized"}-${index}`}><td>{item.category ?? "Uncategorized"}</td><td>{item.count}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="content-card">
          <div className="section-heading"><div><p className="eyebrow">Threshold-qualified requests</p><h2>Top requested details</h2></div></div>
          <div className="shop-admin-grid">
            <section><h3>Attributes</h3>{listOrSuppressed({ items: summary.topAttributes, testId: "top-attributes", children: (item) => `${item.attribute}: ${item.value}` })}</section>
            <section><h3>Sizes</h3>{listOrSuppressed({ items: summary.topSizes, testId: "top-sizes", children: (item) => item.value })}</section>
            <section><h3>Colors</h3>{listOrSuppressed({ items: summary.topColors, testId: "top-colors", children: (item) => item.value })}</section>
          </div>
        </section>
      </>}
    </section>
  );
}

export function DemandDashboardPage() {
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<DemandAccount>("/auth/me")
      .then((account) => setPermissions(account.permissions ?? []))
      .catch((reason: Error) => setError(reason.message || "Unable to load demand access."));
  }, []);

  if (error) return <p className="notice error" role="alert">{error}</p>;
  if (permissions === null) return <section className="content-card" aria-busy="true"><p className="manager-note">Loading demand dashboard…</p></section>;
  return <DemandDashboard permissions={permissions} />;
}
