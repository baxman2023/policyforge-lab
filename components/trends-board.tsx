"use client";

import { useState } from "react";
import Link from "next/link";
import { apiPath } from "@/lib/client-api";

type Trend = { id: string; channelId: string; channelName: string; score: number; status: string; headline: string; summary: string; suggestedAngle: string };
type ChannelOption = { id: string; name: string };

export function TrendsBoard({ initialTrends, channels }: { initialTrends: Trend[]; channels: ChannelOption[] }) {
  const [trends, setTrends] = useState(initialTrends);
  const [channelId, setChannelId] = useState(channels[0]?.id || "");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function action(body: object) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(apiPath("/api/trends"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string; trends?: Trend[]; projects?: unknown[]; selected?: number };
      if (!response.ok) throw new Error(payload.error || "Trend action failed.");
      if (payload.trends) setTrends(payload.trends.map((item) => ({ ...item, channelName: channels.find((channel) => channel.id === item.channelId)?.name || "Channel" })));
      setMessage(payload.projects ? `${payload.projects.length} production project(s) created.` : payload.selected ? `${payload.selected} trend(s) selected.` : "Trend scan complete.");
      if (!payload.trends) window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Trend action failed."); } finally { setBusy(false); }
  }

  return <>
    <div className="panel pad"><div className="inline-field-action"><select value={channelId} onChange={(event) => setChannelId(event.target.value)}>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select><button className="primary-button compact" disabled={busy || !channelId} onClick={() => void action({ action: "scan", channelId })}>Scan Trends</button></div><p>Results are deduplicated by underlying event and sorted from highest relevance to lowest.</p></div>
    {message ? <div className="app-message">{message}</div> : null}
    {selected.length ? <div className="panel pad"><button className="secondary-button compact" disabled={busy} onClick={() => void action({ action: "select", ids: selected })}>Select {selected.length}</button> <button className="primary-button compact" disabled={busy} onClick={() => void action({ action: "create-videos", ids: selected })}>Create Videos</button></div> : null}
    <div className="section-stack">{trends.map((trend) => <article className="panel pad" key={trend.id}><label><input type="checkbox" checked={selected.includes(trend.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, trend.id] : current.filter((id) => id !== trend.id))} /> Select</label><small>{trend.channelName} · {trend.score}/100 · {trend.status}</small><h2>{trend.headline}</h2><p>{trend.summary}</p><p><b>Angle:</b> {trend.suggestedAngle}</p><button className="secondary-button compact" disabled={busy} onClick={async () => { setBusy(true); const response = await fetch(apiPath("/api/seasons"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trendId: trend.id, createProjects: true }) }); const payload = await response.json() as { url?: string; error?: string }; setBusy(false); if (payload.url) window.location.href = payload.url; else setMessage(payload.error || "Could not develop season."); }}>Develop as Season</button></article>)}</div>
    {!trends.length ? <p>No trend scan has run yet.</p> : null}
    <Link href="/">Return to Video Ideas</Link>
  </>;
}
